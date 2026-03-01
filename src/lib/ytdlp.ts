import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
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
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
  ];

  const proxy = process.env.PROXY;
  if (proxy) {
    args.push("--proxy", `socks5://${proxy}`);
  }

  args.push(url);

  logger.info(`yt-dlp downloading: ${url}`);
  const { stdout, stderr } = await execFileAsync("yt-dlp", args, {
    timeout: 300_000, // 5 min
  });
  if (stderr) {
    logger.warn(`yt-dlp stderr: ${stderr}`);
  }

  // Find the output file (yt-dlp determines the extension)
  const files = readdirSync(DOWNLOADS_DIR).filter((f) => f.startsWith(id));
  if (files.length === 0) {
    throw new Error(`yt-dlp produced no output file for: ${url}`);
  }

  const filename = files[0];
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

  return { filePath, filename, isAudio };
}
