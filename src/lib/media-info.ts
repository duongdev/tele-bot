import { logger } from "./logger";

interface MediaInfo {
  title?: string;
  description?: string;
  author?: string;
}

/**
 * Best-effort fetch of media metadata using yt-dlp --dump-json.
 * Never throws — returns empty object on failure.
 */
export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--no-playlist",
      url,
    ], { timeout: 15_000 });

    const data = JSON.parse(stdout);
    return {
      title: data.title || data.fulltitle || undefined,
      description: data.description?.substring(0, 500) || undefined,
      author: data.uploader || data.channel || data.creator || undefined,
    };
  } catch (err) {
    logger.debug(`fetchMediaInfo failed (non-critical): ${err}`);
    return {};
  }
}

/**
 * Build a Telegram caption from media info.
 * Returns undefined if no useful info available.
 */
export function buildCaption(info: MediaInfo, url: string): string | undefined {
  const parts: string[] = [];

  if (info.title) {
    parts.push(info.title);
  }

  if (info.author) {
    parts.push(`— ${info.author}`);
  }

  if (parts.length === 0) return undefined;

  // Telegram caption limit is 1024 chars
  const caption = parts.join("\n");
  return caption.length > 1024 ? caption.substring(0, 1021) + "..." : caption;
}
