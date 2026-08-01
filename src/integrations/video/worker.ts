import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";

// Video processing worker
// - Downloads a video from the 'videos' bucket using a signed URL
// - Generates a thumbnail using `ffmpeg` (external dependency)
// - Uploads the thumbnail to the 'thumbnails' bucket
// - Marks the video status as `published` on success
//
// This file exports two functions:
//  - processVideo(videoId) -> uses a Supabase service-role client from env
//  - processVideoWithClient(supabaseClient, videoId) -> testable/injectable

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — worker will not run without these.");
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : (null as unknown as SupabaseClient);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function downloadSignedUrlToFile(signedUrl: string, destPath: string) {
  // Use global fetch — Node 18+ provides it. Cast to any to avoid TS lib mismatch in some environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (globalThis as any).fetch(signedUrl);
  if (!res.ok) throw new Error(`failed to fetch signed url: ${res.status}`);
  const fileStream = fs.createWriteStream(destPath);
  return new Promise<void>((resolve, reject) => {
    const reader = res.body;
    if (!reader) return reject(new Error("No response body"));
    // Node stream piping
    // @ts-ignore
    reader.pipe(fileStream);
    reader.on("error", reject);
    fileStream.on("finish", () => resolve());
    fileStream.on("error", reject);
  });
}

async function runFfmpegThumb(inputPath: string, outputPath: string) {
  // Extract a frame at 1 second (if available). Create a fairly high-quality jpg.
  return new Promise<void>((resolve, reject) => {
    const args = ["-y", "-i", inputPath, "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", outputPath];
    const cp = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    cp.stdout?.on("data", (d) => (stdout += String(d)));
    cp.stderr?.on("data", (d) => (stderr += String(d)));

    cp.on("error", (err) => reject(err));
    cp.on("close", (code) => {
      if (code === 0) return resolve();
      const err = new Error(`ffmpeg exited with code=${code}: ${stderr.slice(0, 200)}`);
      reject(err);
    });
  });
}

export async function processVideoWithClient(supabaseClient: SupabaseClient, videoId: string) {
  if (!supabaseClient) throw new Error("supabaseClient is required");

  // Fetch video record
  const { data: videoRow, error: fetchError } = await supabaseClient
    .from("videos")
    .select("id, user_id, video_path, thumbnail_path, status, title, duration_seconds")
    .eq("id", videoId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!videoRow) throw new Error(`video ${videoId} not found`);
  if (videoRow.status === "published") {
    // already done
    return;
  }

  const videoPath = videoRow.video_path as string;
  const userId = videoRow.user_id as string;

  // Create temp file paths
  const tmp = await fsPromises.mkdtemp(path.join(os.tmpdir(), "kc-vid-"));
  const inputFile = path.join(tmp, path.basename(videoPath));
  const thumbFile = path.join(tmp, "thumb.jpg");

  try {
    // Create a signed URL (short lived) and download
    const { data: urlData, error: signedError } = await supabaseClient.storage
      .from("videos")
      .createSignedUrl(videoPath, 60 * 60); // 1 hour
    if (signedError) throw signedError as Error;
    if (!urlData || !(urlData as any).signedUrl) throw new Error("Failed to create signed url for video");

    const signedUrl = (urlData as any).signedUrl as string;

    await downloadSignedUrlToFile(signedUrl, inputFile);

    // Run ffmpeg to extract thumbnail
    try {
      await runFfmpegThumb(inputFile, thumbFile);
    } catch (ffErr) {
      console.error("ffmpeg thumbnail generation failed:", ffErr);
      // continue without thumbnail
    }

    // Upload thumbnail if it exists
    let thumbnailPath: string | null = null;
    try {
      const exists = fs.existsSync(thumbFile);
      if (exists) {
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        thumbnailPath = `${userId}/${stamp}.jpg`;
        const fileStream = fs.createReadStream(thumbFile) as unknown as File;
        const { error: uploadErr } = await supabaseClient.storage
          .from("thumbnails")
          // @ts-ignore - supabase-js accepts Readable stream in Node
          .upload(thumbnailPath, fileStream, { contentType: "image/jpeg", upsert: false });
        if (uploadErr) {
          console.error("thumbnail upload failed", uploadErr);
          thumbnailPath = null;
        }
      }
    } catch (err) {
      console.error("thumbnail handling failed", err);
      thumbnailPath = null;
    }

    // Update the video record to published (and set thumbnail path if available)
    const updatePayload: Record<string, unknown> = { status: "published" };
    if (thumbnailPath) updatePayload.thumbnail_path = thumbnailPath;

    const { error: updateErr } = await supabaseClient.from("videos").update(updatePayload).eq("id", videoId);
    if (updateErr) throw updateErr as Error;
  } catch (err) {
    console.error("processing failed for video", videoId, err);
    // Mark video as removed to avoid repeated failing attempts; in a real system you'd mark an error state
    try {
      await supabaseClient.from("videos").update({ status: "removed" }).eq("id", videoId);
    } catch (uErr) {
      console.error("failed to mark video as removed", uErr);
    }
    throw err;
  } finally {
    // Cleanup temp files
    try {
      await fsPromises.rm(tmp, { recursive: true, force: true });
    } catch (cleanupErr) {
      // ignore
    }
  }
}

export async function processVideo(videoId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }
  if (!supabaseAdmin) throw new Error("supabase admin client could not be initialized");
  return processVideoWithClient(supabaseAdmin, videoId);
}

export async function pollLoop() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }
  if (!supabaseAdmin) throw new Error("supabase admin client could not be initialized");

  console.log("starting poll loop for processing videos...");
  while (true) {
    try {
      // Fetch a small batch of videos that are still processing
      const { data: rows, error } = await supabaseAdmin
        .from("videos")
        .select("id")
        .eq("status", "processing")
        .limit(5)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("failed to fetch processing videos", error);
      } else if (rows && rows.length > 0) {
        for (const r of rows) {
          try {
            // @ts-ignore - id exists
            await processVideoWithClient(supabaseAdmin, r.id as string);
          } catch (err) {
            console.error(`failed to process ${r.id}`, err);
          }
          // brief pause between videos
          await sleep(600);
        }
      }
    } catch (err) {
      console.error("poll loop error", err);
    }

    // Wait before next poll
    await sleep(5000);
  }
}
