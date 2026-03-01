import { getRedisClient } from "./redis";
import { logger } from "./logger";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const COBALT_API_URL = process.env.COBALT_API_URL || "http://cobalt:9000";
const COBALT_API_KEY = process.env.COBALT_API_KEY || "";
const DOWNLOADS_DIR = "downloads";
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ---- Types ----

interface CobaltTunnelResponse {
  status: "tunnel" | "redirect";
  url: string;
  filename: string;
}

interface CobaltPickerItem {
  type: "photo" | "video" | "gif";
  url: string;
  thumb?: string;
}

interface CobaltPickerResponse {
  status: "picker";
  audio?: string;
  audioFilename?: string;
  picker: CobaltPickerItem[];
}

interface CobaltErrorResponse {
  status: "error";
  error: { code: string; context?: { service?: string; limit?: number } };
}

type CobaltResponse =
  | CobaltTunnelResponse
  | CobaltPickerResponse
  | CobaltErrorResponse;

export interface DownloadResult {
  filePath: string;
  filename: string;
  isAudio: boolean;
}

// ---- API ----

export async function fetchCobalt(url: string): Promise<CobaltResponse> {
  const redisClient = await getRedisClient();
  const cacheKey = `cobalt:response:${createHash("sha256").update(url).digest("hex")}`;

  const cached = await redisClient?.get(cacheKey);
  if (cached) {
    logger.debug(`Cobalt cache hit for: ${url}`);
    try {
      return JSON.parse(cached);
    } catch {
      // ignore bad cache
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (COBALT_API_KEY) {
    headers["Authorization"] = `Api-Key ${COBALT_API_KEY}`;
  }

  const response = await fetch(`${COBALT_API_URL.replace(/\/$/, "")}/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      videoQuality: "1080",
      audioFormat: "mp3",
      filenameStyle: "pretty",
    }),
  });

  const data = (await response.json()) as CobaltResponse;

  if (data.status !== "error") {
    await redisClient?.set(cacheKey, JSON.stringify(data), {
      EX: CACHE_TTL_SECONDS,
    });
  }

  return data;
}

// ---- Download ----

function isAudioFile(filename: string): boolean {
  return /\.(mp3|ogg|wav|opus|m4a|flac|aac)$/i.test(filename);
}

async function downloadFromUrl(
  downloadUrl: string,
  filename?: string
): Promise<DownloadResult> {
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const safeName = filename || `${randomUUID()}.mp4`;
  const filePath = join(DOWNLOADS_DIR, safeName);

  const response = await fetch(downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const fileStream = createWriteStream(filePath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  logger.info(`Downloaded: ${filePath}`);
  return {
    filePath,
    filename: safeName,
    isAudio: isAudioFile(safeName),
  };
}

/**
 * Call Cobalt API and download the result.
 * Returns an array (picker responses yield multiple files).
 */
export async function downloadMedia(url: string): Promise<DownloadResult[]> {
  const cobaltResponse = await fetchCobalt(url);

  if (cobaltResponse.status === "error") {
    throw new Error(
      `Cobalt error: ${cobaltResponse.error.code}${cobaltResponse.error.context?.service ? ` (${cobaltResponse.error.context.service})` : ""}`
    );
  }

  if (cobaltResponse.status === "tunnel" || cobaltResponse.status === "redirect") {
    const result = await downloadFromUrl(cobaltResponse.url, cobaltResponse.filename);
    return [result];
  }

  if (cobaltResponse.status === "picker") {
    const items = cobaltResponse.picker.slice(0, 10); // Telegram album limit
    const results: DownloadResult[] = [];
    for (const item of items) {
      const ext = item.type === "photo" ? ".jpg" : ".mp4";
      const filename = `${randomUUID()}${ext}`;
      const result = await downloadFromUrl(item.url, filename);
      results.push(result);
    }
    return results;
  }

  throw new Error(`Unexpected Cobalt response status: ${(cobaltResponse as any).status}`);
}
