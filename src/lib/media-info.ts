import { logger } from "./logger";

export interface MediaInfo {
  title?: string;
  description?: string;
  author?: string;
  platform?: string;
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
      platform: data.extractor_key || data.extractor || undefined,
    };
  } catch (err) {
    logger.debug(`fetchMediaInfo failed (non-critical): ${err}`);
    return {};
  }
}

/**
 * Build a Telegram caption from media info.
 * Uses description for social media (Instagram, TikTok, Twitter)
 * where title is generic ("Video by username").
 * Returns undefined if no useful info available.
 */
export function buildCaption(info: MediaInfo, url: string): string | undefined {
  const parts: string[] = [];

  // Social platforms: prefer description over title (title is often generic)
  const socialPlatforms = ["Instagram", "TikTok", "Twitter"];
  const isSocial = socialPlatforms.some(
    (p) => info.platform?.toLowerCase().includes(p.toLowerCase())
  );

  if (isSocial && info.description) {
    // Use description, strip excessive hashtags at the end
    let desc = info.description.trim();
    // Keep first line or up to 300 chars of description
    const firstLine = desc.split("\n")[0];
    if (firstLine.length > 10) {
      desc = firstLine;
    }
    if (desc.length > 300) {
      desc = desc.substring(0, 297) + "...";
    }
    parts.push(desc);
  } else if (info.title) {
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
