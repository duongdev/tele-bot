import { NewMessageEvent } from "telegram/events";
import { Api, TelegramClient } from "telegram";
import { MessageIDLike } from "telegram/define";
import { unlinkSync } from "node:fs";
import bigInt from "big-integer";
import { logger } from "../lib/logger";
import { sendMessageReaction } from "../lib/telegram";
import { downloadMedia, DownloadResult } from "../lib/cobalt";
import { downloadWithYtDlp } from "../lib/ytdlp";
import { extractMediaUrls } from "../config/supported-services";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const REACTION_DOWNLOADING = bigInt("5406745015365943482");
const REACTION_DONE = bigInt("5206607081334906820");
const REACTION_ERROR = bigInt("5343968063970632884");

export async function handleMediaUrlMessage(event: NewMessageEvent) {
  try {
    const { text, chatId, client } = event.message;
    if (!text || !chatId || !client) return;

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

    const isYouTube = /(?:youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
    const results = isYouTube
      ? [await downloadWithYtDlp(url)]
      : await downloadMedia(url);
    downloadedFiles.push(...results.map((r) => r.filePath));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const sendOpts: any = {
        file: r.filePath,
        replyTo: i === 0 ? replyToMessage : undefined,
        supportsStreaming: !r.isAudio,
      };
      if (r.videoMeta) {
        sendOpts.attributes = [
          new Api.DocumentAttributeVideo({
            w: r.videoMeta.width,
            h: r.videoMeta.height,
            duration: r.videoMeta.duration,
            supportsStreaming: true,
          }),
        ];
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
