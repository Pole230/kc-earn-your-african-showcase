import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";
import fs from "fs/promises";
import path from "path";

// Worker modules (to be implemented separately)
import * as thumbnail from "./worker-modules/thumbnail";
import * as transcoder from "./worker-modules/transcoder";
import * as aiScoring from "./worker-modules/aiScoring";
import * as recommendation from "./worker-modules/recommendation";

// Environment config
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 5);
const TEMP_DIR = process.env.WORKER_TEMP_DIR ?? "/tmp/kc-worker";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Strong types
type VideoRow = {
  id: string;
  user_id: string;
  video_path: string | null;
  thumbnail_path?: string | null;
  preview_path?: string | null;
  hls_path?: string | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  ai_score?: number | null;
  status: string;
};

type VideoJob = {
  id: string;
  video_id: string;
  status: string;
  retry_count?: number | null;
  last_error?: string | null;
  created_at?: string;
};

// Utility helpers
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runFFprobe(filePath: string) {
  // Requires ffprobe in PATH
  return new Promise<{ duration: number; width: number; height: number; fps: number; bitrate: number }>((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,bit_rate,avg_frame_rate",
      "-show_format",
      "-print_format",
      "json",
      filePath,
    ];
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error("ffprobe failed: " + err));
      }
      try {
        const json = JSON.parse(out);
        const format = json.format || {};
        const stream = (json.streams && json.streams[0]) || {};
        const duration = Number(format.duration ?? 0);
        const width = Number(stream.width ?? 0);
        const height = Number(stream.height ?? 0);
        const bitrate = Number(stream.bit_rate ?? format.bit_rate ?? 0);
        // frame rate may come as '30000/1001'
        let fps = 0;
        if (stream.avg_frame_rate) {
          const parts = String(stream.avg_frame_rate).split("/");
          if (parts.length === 2) fps = Number(parts[0]) / Number(parts[1]);
        }
        resolve({ duration, width, height, fps, bitrate });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function downloadStorage(bucket: string, key: string, destPath: string) {
  // download using supabase storage
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error || !data) throw error || new Error("Empty download");
  // data is a ReadableStream or Blob depending on runtime. Convert to buffer safely.
  // In node environment, data is a Buffer-like Body.
  const arrayBuffer = await (data as any).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(destPath, buffer);
  return destPath;
}

async function uploadToStorage(bucket: string, key: string, data: Buffer | Uint8Array, contentType?: string) {
  // Supabase upload expects a file object or Uint8Array in server
  const res = await supabase.storage.from(bucket).upload(key, data, { contentType, upsert: true });
  if (res.error) throw res.error;
  return res.data;
}

let running = true;

process.on("SIGINT", async () => {
  console.info("SIGINT received, shutting down worker...");
  running = false;
});
process.on("SIGTERM", async () => {
  console.info("SIGTERM received, shutting down worker...");
  running = false;
});

async function lockJob(jobId: string) {
  // atomically set status=processing only if pending
  const { data, error } = await supabase
    .from<VideoJob>("video_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function markJobCompleted(jobId: string) {
  await supabase.from("video_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId);
}

async function markJobFailed(jobId: string, errMessage: string, retryCount: number) {
  const status = retryCount >= MAX_RETRIES ? "failed" : "pending";
  await supabase
    .from("video_jobs")
    .update({ status, last_error: errMessage, retry_count: retryCount, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function processJob(job: VideoJob) {
  const jobId = job.id;
  console.info(`Processing job ${jobId} for video ${job.video_id}`);

  // attempt to lock
  try {
    const locked = await lockJob(jobId);
    if (!locked) {
      console.info(`Job ${jobId} was locked by another worker`);
      return;
    }
  } catch (e) {
    console.error(`Failed to lock job ${jobId}`, e);
    return;
  }

  // fetch video row
  let video: VideoRow | null = null;
  try {
    const { data, error } = await supabase.from<VideoRow>("videos").select("*").eq("id", job.video_id).limit(1).single();
    if (error) throw error;
    video = data;
    if (!video) throw new Error("Video row not found");
  } catch (e) {
    console.error(`Failed fetching video ${job.video_id}`, e);
    await markJobFailed(jobId, String(e instanceof Error ? e.message : e), (job.retry_count ?? 0) + 1);
    return;
  }

  // idempotency: if video.status is already published and job retry_count==0, mark job completed
  if (video.status === "published") {
    console.info(`Video ${video.id} already published; marking job ${jobId} completed`);
    await markJobCompleted(jobId);
    return;
  }

  await ensureTempDir();
  const localVideoPath = path.join(TEMP_DIR, `${video.id}.input`);

  try {
    // download
    if (!video.video_path) throw new Error("No video_path in video row");
    await downloadStorage("videos-private", video.video_path, localVideoPath);

    // extract metadata
    const meta = await runFFprobe(localVideoPath);
    console.info(`Probed metadata for ${video.id}:`, meta);

    // run thumbnail generation (module)
    const thumbBuf = await thumbnail.generateThumbnail(localVideoPath, { width: 640 });
    const previewBuf = await transcoder.createPreview(localVideoPath, { duration: Math.min(15, Math.floor(meta.duration)) });

    // create HLS (transcoder module returns playlist + segments map)
    const hlsResult = await transcoder.createHLS(localVideoPath, { resolutions: [360, 720] });

    // ai scoring
    const aiScore = await aiScoring.scoreVideo(video.id, {
      views_count: video.views_count ?? 0,
      // placeholder numbers; real scoring will combine historic aggregates
      likes_count: (video as any).likes_count ?? 0,
      comments_count: (video as any).comments_count ?? 0,
      shares_count: (video as any).shares_count ?? 0,
      watch_time: (video as any).watch_time ?? 0,
      completion_rate: (video as any).completion_rate ?? 0,
    });

    // upload assets
    const thumbPath = `thumbnails/${video.id}.jpg`;
    await uploadToStorage("video-thumbnails", thumbPath, thumbBuf, "image/jpeg");

    const previewPath = `previews/${video.id}.mp4`;
    await uploadToStorage("videos-public", previewPath, previewBuf, "video/mp4");

    const hlsBase = `hls/${video.id}`;
    // upload playlist
    await uploadToStorage("videos-public", `${hlsBase}/index.m3u8`, Buffer.from(hlsResult.playlist), "application/vnd.apple.mpegurl");
    // upload segments
    for (const seg of hlsResult.segments) {
      await uploadToStorage("videos-public", `${hlsBase}/${seg.name}`, Buffer.from(seg.data), "video/MP2T");
    }

    // update videos table
    await supabase.from("videos").update({
      status: "published",
      thumbnail_path: thumbPath,
      preview_path: previewPath,
      hls_path: `${hlsBase}/index.m3u8`,
      duration_seconds: Math.round(meta.duration) || null,
      width: meta.width || null,
      height: meta.height || null,
      ai_score: aiScore ?? null,
      processed_at: new Date().toISOString(),
    }).eq("id", video.id);

    // recommendation engine update (non-blocking)
    try {
      await recommendation.updateRecommendationsForVideo(video.id);
    } catch (e) {
      console.warn("recommendation update failed (non-fatal)", e);
    }

    // mark job completed
    await markJobCompleted(jobId);
    console.info(`Job ${jobId} completed for video ${video.id}`);
  } catch (err) {
    console.error(`Processing failed for job ${jobId}`, err);
    const retryCount = (job.retry_count ?? 0) + 1;
    await markJobFailed(jobId, String(err instanceof Error ? err.message : err), retryCount);
    // if retryCount exceeded, set videos.status=failed
    if (retryCount >= MAX_RETRIES) {
      await supabase.from("videos").update({ status: "failed" }).eq("id", video.id);
    }
  } finally {
    // cleanup local file
    try { await fs.rm(localVideoPath); } catch (e) {}
  }
}

async function pollLoop() {
  console.info("Worker started, polling for jobs every", POLL_INTERVAL_MS, "ms");
  while (running) {
    try {
      // fetch one pending job ordered by created_at
      const { data: jobs, error } = await supabase
        .from<VideoJob>("video_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      if (!jobs || jobs.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      const job = jobs[0];
      // process job
      await processJob(job);
    } catch (e) {
      console.error("Worker loop error", e);
      // backoff a bit on unexpected failure
      await sleep(Math.max(POLL_INTERVAL_MS, 2000));
    }
  }
  console.info("Worker shutting down gracefully");
}

// bootstrap
(async () => {
  await ensureTempDir();
  pollLoop();
})();
