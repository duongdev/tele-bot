import { logger } from "./logger";
import { probeVideo } from "./ffprobe";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import type { DownloadResult } from "./cobalt";

const TIKTOK_API_URL = "https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/";
const TIKTOK_PARAMS = new URLSearchParams({
  iid: "7318518857994389254",
  device_id: "7318517321748022792",
  channel: "googleplay",
  app_name: "musical_ly",
  version_code: "300904",
  device_platform: "android",
  device_type: "ASUS_Z01QD",
  version: "9",
});
const DOWNLOADS_DIR = "downloads";

async function resolveRedirect(url: string): Promise<string> {
  if (/(?:vm|vt|t)\.tiktok\.com/.test(url)) {
    const res = await fetch(url, { redirect: "follow" });
    return res.url;
  }
  return url;
}

function extractVideoId(url: string): string | null {
  const videoMatch = url.match(/\/video\/(\d+)/);
  if (videoMatch) return videoMatch[1];
  const photoMatch = url.match(/\/photo\/(\d+)/);
  if (photoMatch) return photoMatch[1];
  return null;
}

interface TikTokVideoData {
  id: string;
  videoUrl: string | null;
  imageUrls: string[];
}

async function fetchVideoData(url: string): Promise<TikTokVideoData | null> {
  const resolvedUrl = await resolveRedirect(url);
  const videoId = extractVideoId(resolvedUrl);
  if (!videoId) {
    logger.warn(`Could not extract TikTok video ID from: ${resolvedUrl}`);
    return null;
  }

  const params = new URLSearchParams(TIKTOK_PARAMS);
  params.set("aweme_id", videoId);
  const apiUrl = `${TIKTOK_API_URL}?${params}`;

  const response = await fetch(apiUrl, { method: "OPTIONS" });
  const body = await response.text();

  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    if (body.includes("ratelimit")) {
      logger.warn("TikTok API rate limited");
    }
    return null;
  }

  const aweme = data?.aweme_list?.find((a: any) => a.aweme_id === videoId);
  if (!aweme) {
    logger.warn(`TikTok video not found: ${videoId}`);
    return null;
  }

  // Slideshow
  if (aweme.image_post_info) {
    const imageUrls = aweme.image_post_info.images
      .map((img: any) => img.display_image?.url_list?.[1])
      .filter(Boolean);
    return { id: videoId, videoUrl: null, imageUrls };
  }

  // Video
  const video = aweme.video;
  const videoUrl =
    video?.play_addr?.url_list?.[0] ||
    video?.download_addr?.url_list?.[0] ||
    null;

  return { id: videoId, videoUrl, imageUrls: [] };
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const fileStream = createWriteStream(filePath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

/**
 * Download TikTok video/images using the Android API.
 * Fallback for when Cobalt fails (IP blocked etc).
 */
export async function downloadTikTok(url: string): Promise<DownloadResult[]> {
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  logger.info(`TikTok API downloading: ${url}`);
  const videoData = await fetchVideoData(url);
  if (!videoData) {
    throw new Error("TikTok API: could not fetch video data");
  }

  // Slideshow → download images
  if (videoData.imageUrls.length > 0) {
    const results: DownloadResult[] = [];
    for (const imageUrl of videoData.imageUrls.slice(0, 10)) {
      const filename = `${randomUUID()}.jpg`;
      const filePath = join(DOWNLOADS_DIR, filename);
      await downloadFile(imageUrl, filePath);
      results.push({ filePath, filename, isAudio: false });
    }
    return results;
  }

  // Video
  if (!videoData.videoUrl) {
    throw new Error("TikTok API: no video URL found");
  }

  const filename = `${randomUUID()}.mp4`;
  const filePath = join(DOWNLOADS_DIR, filename);
  await downloadFile(videoData.videoUrl, filePath);

  const fileSize = statSync(filePath).size;
  if (fileSize === 0) throw new Error("TikTok API: downloaded empty file");
  if (fileSize > 2000 * 1024 * 1024) {
    throw new Error(`File too large: ${(fileSize / (1024 * 1024)).toFixed(0)} MB`);
  }

  const videoMeta = await probeVideo(filePath);
  return [{ filePath, filename, isAudio: false, videoMeta }];
}
