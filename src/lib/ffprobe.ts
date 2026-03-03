import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import type { VideoMeta } from "./cobalt";

const execFileAsync = promisify(execFile);
const DOWNLOADS_DIR = "downloads";

export async function probeVideo(filePath: string): Promise<VideoMeta | undefined> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
    const duration = Math.round(parseFloat(data.format?.duration || "0"));

    if (videoStream) {
      const meta = {
        width: videoStream.width,
        height: videoStream.height,
        duration,
      };
      logger.info(`Video meta: ${meta.width}x${meta.height}, ${meta.duration}s`);
      return meta;
    }
  } catch (error) {
    logger.warn(`ffprobe failed: ${error}`);
  }
  return undefined;
}

/**
 * Convert/resize any image to a Telegram-compliant thumbnail.
 * Returns path to a new JPEG file (max 320x320), or undefined on failure.
 */
export async function processThumbnail(imagePath: string): Promise<string | undefined> {
  const outputPath = join(dirname(imagePath), `${randomUUID()}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-i", imagePath,
      "-vf", "scale=320:320:force_original_aspect_ratio=decrease",
      "-q:v", "5",
      "-y",
      outputPath,
    ]);

    if (!existsSync(outputPath)) {
      return undefined;
    }

    logger.info(`Processed thumbnail: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.warn(`Thumbnail processing failed: ${error}`);
    try { unlinkSync(outputPath); } catch {}
    return undefined;
  }
}

/**
 * Download a thumbnail image from a URL and process it for Telegram.
 * Returns path to the processed JPEG, or undefined on failure.
 */
export async function downloadThumbnail(thumbUrl: string): Promise<string | undefined> {
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const rawPath = join(DOWNLOADS_DIR, `${randomUUID()}_thumb_raw`);
  try {
    const response = await fetch(thumbUrl);
    if (!response.ok || !response.body) {
      logger.warn(`Thumbnail download failed: ${response.status}`);
      return undefined;
    }

    const fileStream = createWriteStream(rawPath);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);

    const processed = await processThumbnail(rawPath);
    try { unlinkSync(rawPath); } catch {}
    return processed;
  } catch (error) {
    logger.warn(`Thumbnail download failed: ${error}`);
    try { unlinkSync(rawPath); } catch {}
    return undefined;
  }
}

/**
 * Extract a frame from a video file and produce a Telegram-compliant thumbnail.
 * Tries 1s first, falls back to 0s for very short videos.
 */
export async function generateThumbnail(videoPath: string): Promise<string | undefined> {
  for (const timestamp of ["00:00:01", "00:00:00"]) {
    const thumbPath = join(dirname(videoPath), `${randomUUID()}.jpg`);
    try {
      await execFileAsync("ffmpeg", [
        "-i", videoPath,
        "-ss", timestamp,
        "-frames:v", "1",
        "-vf", "scale=320:320:force_original_aspect_ratio=decrease",
        "-q:v", "5",
        "-y",
        thumbPath,
      ]);

      if (existsSync(thumbPath)) {
        logger.info(`Generated thumbnail at ${timestamp}: ${thumbPath}`);
        return thumbPath;
      }
    } catch (error) {
      logger.warn(`Thumbnail generation failed at ${timestamp}: ${error}`);
      try { unlinkSync(thumbPath); } catch {}
    }
  }
  return undefined;
}
