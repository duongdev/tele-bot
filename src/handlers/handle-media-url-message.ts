import { NewMessageEvent } from "telegram/events";
import { Api, TelegramClient } from "telegram";
import { MessageIDLike } from "telegram/define";
import { unlinkSync } from "node:fs";
import bigInt from "big-integer";
import { logger } from "../lib/logger";
import { sendMessageReaction } from "../lib/telegram";
import { downloadMedia, DownloadResult } from "../lib/cobalt";
import { downloadWithYtDlp } from "../lib/ytdlp";
import { downloadTikTok } from "../lib/tiktok-api";
import { generateThumbnail } from "../lib/ffprobe";
import { extractMediaUrls } from "../config/supported-services";
import { fetchMediaInfo, buildCaption } from "../lib/media-info";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

const REACTION_DOWNLOADING = bigInt("5406745015365943482");
const REACTION_DONE = bigInt("5206607081334906820");
const REACTION_ERROR = bigInt("5343968063970632884");

function isTikTokUrl(url: string): boolean {
  return /(?:tiktok\.com)/.test(url);
}

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
}

/**
 * Download media with platform-specific handlers and universal yt-dlp fallback.
 * Priority: platform-specific -> Cobalt -> yt-dlp (last resort)
 */
async function downloadByPlatform(url: string): Promise<DownloadResult[]> {
  // YouTube: yt-dlp only (best support)
  if (isYouTubeUrl(url)) {
    return [await downloadWithYtDlp(url)];
  }

  // TikTok: Android API -> Cobalt -> yt-dlp
  if (isTikTokUrl(url)) {
    try {
      return await downloadTikTok(url);
    } catch (err) {
      logger.warn(`TikTok API failed: ${err}`);
    }
  }

  // All other platforms (+ TikTok fallback): Cobalt -> yt-dlp
  try {
    return await downloadMedia(url);
  } catch (err) {
    logger.warn(`Cobalt failed, trying yt-dlp fallback: ${err}`);
  }

  // Last resort: yt-dlp (supports many platforms)
  return [await downloadWithYtDlp(url)];
}

export async function handleMediaUrlMessage(event: NewMessageEvent) {
  try {
    const { text, chatId, client } = event.message;
    if (!text || !chatId || !client) return;

    // Skip bot conversations (but not Saved Messages)
    const chat = await event.message.getChat();
    if (chat instanceof Api.User && chat.bot) return;

    const mediaUrls = extractMediaUrls(text);
    if (mediaUrls.length === 0) return;

    logger.info(`Found media URLs: ${mediaUrls.join(", ")}`);

    await Promise.all(
      mediaUrls.map((url) =>
        sendMediaToChat({
          url,
          client,
          chatId,
          replyToMessage: event.message.id,
        })
      )
    );
  } catch (error) {
    logger.error("Error handling media URL message");
    console.error(error);
  }
}

async function sendMediaToChat(
  args: {
    url: string;
    client: TelegramClient;
    chatId: bigInt.BigInteger;
    replyToMessage?: MessageIDLike;
  },
  retries = MAX_RETRIES
) {
  const { url, client, chatId, replyToMessage } = args;
  const isFirstAttempt = retries === MAX_RETRIES;
  const downloadedFiles: string[] = [];

  try {
    if (isFirstAttempt) {
      await setReaction(client, chatId, replyToMessage, REACTION_DOWNLOADING);
    }

    // Fetch media info (caption) and download in parallel
    // Media info is best-effort — never blocks or fails the download
    const [results, mediaInfo] = await Promise.all([
      downloadByPlatform(url),
      fetchMediaInfo(url).catch(() => ({})),
    ]);

    const caption = buildCaption(mediaInfo, url);

    downloadedFiles.push(...results.map((r) => r.filePath));
    for (const r of results) {
      if (r.thumbPath) downloadedFiles.push(r.thumbPath);
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const sendOpts: any = {
        file: r.filePath,
        replyTo: i === 0 ? replyToMessage : undefined,
        supportsStreaming: !r.isAudio,
      };

      // Add caption to first item only
      if (i === 0 && caption) {
        sendOpts.caption = caption;
      }

      if (r.videoMeta) {
        sendOpts.attributes = [
          new Api.DocumentAttributeVideo({
            w: r.videoMeta.width,
            h: r.videoMeta.height,
            duration: r.videoMeta.duration,
            supportsStreaming: true,
          }),
        ];
        const thumbPath = r.thumbPath ?? (await generateThumbnail(r.filePath));
        if (thumbPath) {
          sendOpts.thumb = thumbPath;
          if (!r.thumbPath) {
            downloadedFiles.push(thumbPath);
          }
        }
      }
      await client.sendFile(chatId, sendOpts);
    }

    cleanupFiles(downloadedFiles);
    await setReaction(client, chatId, replyToMessage, REACTION_DONE);
  } catch (error) {
    logger.error(`Error processing media URL: ${url}`);
    console.error(error);

    cleanupFiles(downloadedFiles);

    if (retries > 0) {
      logger.warn(`Retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      await delay(RETRY_DELAY_MS);
      return sendMediaToChat(args, retries - 1);
    }

    await setReaction(client, chatId, replyToMessage, REACTION_ERROR);
  }
}

function cleanupFiles(filePaths: string[]) {
  for (const fp of filePaths) {
    try {
      unlinkSync(fp);
    } catch {
      // file may not exist
    }
  }
}

async function setReaction(
  client: TelegramClient,
  chatId: bigInt.BigInteger,
  messageId: MessageIDLike | undefined,
  emojiId: bigInt.BigInteger
) {
  if (!messageId) return;
  try {
    await sendMessageReaction({
      client,
      chatId,
      messageId: +(messageId.toString()),
      reactions: [new Api.ReactionCustomEmoji({ documentId: emojiId })],
    });
  } catch (error) {
    logger.warn(`Failed to set reaction: ${error}`);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
