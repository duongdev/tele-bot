import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { probeVideo, processThumbnail } from "./ffprobe";
import type { DownloadResult } from "./cobalt";

const execFileAsync = promisify(execFile);
const DOWNLOADS_DIR = "downloads";

export async function downloadWithYtDlp(url: string): Promise<DownloadResult> {
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const id = randomUUID();
  const outputTemplate = join(DOWNLOADS_DIR, `${id}.%(ext)s`);

  const args = [
    "-f", "bv*[height<=1080][vcodec~='^(avc|h264)']+ba/bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
  ];

  const proxy = process.env.PROXY;
  if (proxy) {
    args.push("--proxy", `socks5://${proxy}`);
  }

  args.push(url);

  logger.info(`yt-dlp downloading: ${url}`);
  await execFileAsync("yt-dlp", args, {
    timeout: 300_000, // 5 min
  });

  // Find output files (yt-dlp determines extensions)
  const allFiles = readdirSync(DOWNLOADS_DIR).filter((f) => f.startsWith(id));
  const thumbFile = allFiles.find((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const videoFile = allFiles.find((f) => f !== thumbFile);

  if (!videoFile) {
    throw new Error(`yt-dlp produced no output file for: ${url}`);
  }

  const filename = videoFile;
  const filePath = join(DOWNLOADS_DIR, filename);
  const fileSize = statSync(filePath).size;
  const fileSizeMB = fileSize / (1024 * 1024);
  logger.info(`yt-dlp downloaded: ${filePath} (${fileSizeMB.toFixed(1)} MB)`);

  if (fileSize === 0) {
    throw new Error(`yt-dlp downloaded empty file for: ${url}`);
  }

  if (fileSizeMB > 2000) {
    throw new Error(`File too large for Telegram: ${fileSizeMB.toFixed(0)} MB`);
  }

  const isAudio = /\.(mp3|ogg|wav|opus|m4a|flac|aac)$/i.test(filename);
  const videoMeta = isAudio ? undefined : await probeVideo(filePath);

  // Process yt-dlp's sidecar thumbnail for Telegram
  let thumbPath: string | undefined;
  if (thumbFile) {
    const rawThumbPath = join(DOWNLOADS_DIR, thumbFile);
    try {
      thumbPath = await processThumbnail(rawThumbPath);
      try { unlinkSync(rawThumbPath); } catch {}
    } catch (error) {
      logger.warn(`Failed to process yt-dlp thumbnail: ${error}`);
      try { unlinkSync(rawThumbPath); } catch {}
    }
  }

  return { filePath, filename, isAudio, videoMeta, thumbPath };
}
