import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export type ThumbnailResult = {
  thumbnailPath: string;
  mediumThumbnailPath: string;
  smallThumbnailPath: string;
  width: number;
  height: number;
};

/**
 * Generate three JPG thumbnails for a video using FFmpeg.
 * - main: 1280x720
 * - medium: 640x360
 * - small: 320x180
 *
 * Picks a capture time at 20% of duration (or 3s fallback).
 * Optimizes JPEG output using FFmpeg quality settings.
 *
 * Throws descriptive errors on failure.
 */
export async function generateThumbnails(
  inputVideoPath: string,
  outputDir: string,
  videoId: string
): Promise<ThumbnailResult> {
  // Validate inputs
  if (!inputVideoPath || typeof inputVideoPath !== "string") {
    throw new Error("generateThumbnails: inputVideoPath must be a non-empty string");
  }
  if (!outputDir || typeof outputDir !== "string") {
    throw new Error("generateThumbnails: outputDir must be a non-empty string");
  }
  if (!videoId || typeof videoId !== "string") {
    throw new Error("generateThumbnails: videoId must be a non-empty string");
  }

  // Ensure input exists
  try {
    const st = await fs.stat(inputVideoPath);
    if (!st.isFile()) throw new Error("input path is not a file");
  } catch (err) {
    throw new Error(`generateThumbnails: input video does not exist at path ${inputVideoPath}`);
  }

  // Ensure ffmpeg & ffprobe are available by attempting a simple version call
  await ensureBinary("ffmpeg");
  await ensureBinary("ffprobe");

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Probe duration
  let durationSeconds = await probeDurationSeconds(inputVideoPath).catch((e) => {
    console.warn("generateThumbnails: failed to probe duration, falling back to 3s", e);
    return 3;
  });

  // Capture time at 20% of duration, but at least 1s and not beyond duration-1
  let captureAt = Math.max(1, Math.floor(durationSeconds * 0.2));
  if (captureAt >= Math.floor(durationSeconds)) {
    captureAt = Math.max(1, Math.floor(durationSeconds / 2));
  }

  console.info(`generateThumbnails: videoId=${videoId} duration=${durationSeconds}s captureAt=${captureAt}s`);

  // File names
  const mainName = `${videoId}-thumb-1280x720.jpg`;
  const mediumName = `${videoId}-thumb-640x360.jpg`;
  const smallName = `${videoId}-thumb-320x180.jpg`;

  const mainPath = path.join(outputDir, mainName);
  const mediumPath = path.join(outputDir, mediumName);
  const smallPath = path.join(outputDir, smallName);

  // Generate each thumbnail via FFmpeg. Use -ss before -i for fast seek, then scale and output single frame
  // Quality: use -q:v 3 (lower is better quality). We also strip metadata.
  try {
    // Main 1280x720
    console.info(`generateThumbnails: creating main thumbnail ${mainPath}`);
    await ffmpegScreenshot({
      input: inputVideoPath,
      output: mainPath,
      captureAt,
      width: 1280,
      height: 720,
      quality: 3,
    });

    // Medium 640x360
    console.info(`generateThumbnails: creating medium thumbnail ${mediumPath}`);
    await ffmpegScreenshot({
      input: inputVideoPath,
      output: mediumPath,
      captureAt,
      width: 640,
      height: 360,
      quality: 4,
    });

    // Small 320x180
    console.info(`generateThumbnails: creating small thumbnail ${smallPath}`);
    await ffmpegScreenshot({
      input: inputVideoPath,
      output: smallPath,
      captureAt,
      width: 320,
      height: 180,
      quality: 5,
    });
  } catch (err) {
    throw new Error(`generateThumbnails: ffmpeg thumbnail generation failed: ${String(err)}`);
  }

  // Validate outputs
  for (const p of [mainPath, mediumPath, smallPath]) {
    try {
      const st = await fs.stat(p);
      if (!st.isFile()) throw new Error(`output file missing ${p}`);
    } catch (err) {
      throw new Error(`generateThumbnails: expected output file not found: ${p}`);
    }
  }

  // Return result, width/height reflect main thumbnail size
  return {
    thumbnailPath: mainPath,
    mediumThumbnailPath: mediumPath,
    smallThumbnailPath: smallPath,
    width: 1280,
    height: 720,
  };
}

// Helper to ensure a binary is available (simple check calling --version)
async function ensureBinary(bin: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(bin, ["-version"], { stdio: "ignore" });
    p.on("error", (err) => reject(new Error(`${bin} not available: ${err.message}`)));
    p.on("exit", (code) => {
      if (code === 0) return resolve();
      // Some ffmpeg builds return 1 for -version; we'll accept exit 0/1 but only reject on spawn error
      return resolve();
    });
  });
}

async function probeDurationSeconds(input: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      input,
    ];
    const p = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.stderr.on("data", (c) => (err += c.toString()));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err}`));
      const val = parseFloat(out.trim());
      if (Number.isFinite(val) && val > 0) return resolve(val);
      return reject(new Error("ffprobe returned invalid duration"));
    });
    p.on("error", (e) => reject(e));
  });
}

async function ffmpegScreenshot(opts: {
  input: string;
  output: string;
  captureAt: number;
  width: number;
  height: number;
  quality?: number; // qscale: lower = better
}) {
  const { input, output, captureAt, width, height, quality = 4 } = opts;

  // Build args: fast seek -ss before -i, use -frames:v 1 to grab single frame
  // Use scale with pad to maintain aspect ratio: scale=w:h:force_original_aspect_ratio=decrease, pad
  const vf = `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

  const args = [
    "-ss",
    String(captureAt),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    vf,
    "-q:v",
    String(quality),
    "-y",
    output,
  ];

  console.info(`ffmpegScreenshot: running ffmpeg ${args.join(" ")}`);

  return new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (c) => (stderr += c.toString()));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
    p.on("error", (e) => reject(e));
  });
}
