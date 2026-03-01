import { logger } from "./logger";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const COBALT_API_URL = process.env.COBALT_API_URL || "http://cobalt:9000";
const COBALT_API_KEY = process.env.COBALT_API_KEY || "";
const DOWNLOADS_DIR = "downloads";

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
  logger.info(`Cobalt response for ${url}: ${JSON.stringify(data)}`);
  return data;
}

// ---- Download ----

function isAudioFile(filename: string): boolean {
  return /\.(mp3|ogg|wav|opus|m4a|flac|aac)$/i.test(filename);
}

function extFromFilename(filename: string): string {
  const match = filename.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0] : ".mp4";
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

  logger.info(`Downloading from: ${downloadUrl}`);
  const response = await fetch(downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  logger.info(`Download response: ${response.status}, content-length: ${response.headers.get("content-length")}`);

  const fileStream = createWriteStream(filePath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  const fileSize = statSync(filePath).size;
  const fileSizeMB = fileSize / (1024 * 1024);
  logger.info(`Downloaded: ${filePath} (${fileSizeMB.toFixed(1)} MB)`);

  if (fileSize === 0) {
    throw new Error(`Downloaded file is empty: ${downloadUrl}`);
  }

  if (fileSizeMB > 2000) {
    throw new Error(`File too large for Telegram: ${fileSizeMB.toFixed(0)} MB`);
  }

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
    const ext = extFromFilename(cobaltResponse.filename);
    const result = await downloadFromUrl(cobaltResponse.url, `${randomUUID()}${ext}`);
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
