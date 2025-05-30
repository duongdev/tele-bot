import { NewMessageEvent } from "telegram/events";
import { logger } from "../lib/logger";
import { Api, TelegramClient } from "telegram";
import { downloadVideo } from "../tiktok";
import { MessageIDLike } from "telegram/define";
import { unlinkSync } from "node:fs";
import uniq from "lodash/uniq";
import { sendMessageReaction } from "../lib/telegram";
import bigInt from "big-integer";

const MAX_RETRIES = 10;

export async function handleTikTokUrlMessage(event: NewMessageEvent) {
  try {
    const { text, chatId, client } = event.message;
    if (!text || !chatId) {
      logger.warn("Message does not contain text or chatId.");
      return;
    }

    if (!client) {
      logger.error("Telegram client is not available in the event.");
      return;
    }

    const tiktokUrls = extractTikTokUrl(text);
    if (tiktokUrls.length === 0) {
      return;
    }
    logger.info(`Found TikTok URLs: ${tiktokUrls.join(", ")}`);

    await Promise.all(
      tiktokUrls.map((url) =>
        sendVideoToChat({
          videoUrl: url,
          client,
          chatId: chatId,
          replyToMessage: event.message.id,
        })
      )
    );
  } catch (error) {
    logger.error(`Error handling TikTok URL message`);
    console.error(error);
  }
}

function extractTikTokUrl(message: string): string[] {
  const regex = /https?:\/\/(?:(vt|www)\.)?tiktok\.com\/[^\s]+/g;
  const matches = message.match(regex);
  return uniq(matches) || [];
}

async function sendVideoToChat(
  args: {
    videoUrl: string;
    client: TelegramClient;
    chatId: bigInt.BigInteger;
    replyToMessage?: MessageIDLike;
  },
  retries = MAX_RETRIES
) {
  const { videoUrl, client, chatId, replyToMessage } = args;
  let videoPath: string | null = null;
  try {
    console.log({ chatId, replyToMessage });
    await sendMessageReaction({
      client,
      chatId,
      messageId: +(replyToMessage?.toString() || 0),
      reactions: [
        new Api.ReactionCustomEmoji({
          documentId: bigInt("5406745015365943482"), // Custom emoji ID for "Downloading"
        }),
      ],
    });
    videoPath = await downloadVideoFromTikTok(videoUrl);
    if (!videoPath) {
      logger.error(`Failed to download video from TikTok URL: ${videoUrl}`);
      return;
    }
    await client.sendFile(chatId, {
      file: videoPath,
      replyTo: replyToMessage,
      supportsStreaming: true,
    });
    try {
      // Delete video file after sending
      unlinkSync(videoPath);
    } catch (error) {
      logger.error(`Error deleting video file: ${error}`);
    }

    await sendMessageReaction({
      client,
      chatId,
      messageId: +(replyToMessage?.toString() || 0),
      reactions: [
        new Api.ReactionCustomEmoji({
          documentId: bigInt("5206607081334906820"), // Custom emoji ID for "Done"
        }),
      ],
    });
  } catch (error) {
    logger.error(`Error sending video to chat`);
    console.error(error);

    // It probably failed because of invalid file chunk.
    // Try deleting the file and retrying.
    if (videoPath) {
      try {
        unlinkSync(videoPath);
      } catch (unlinkError) {
        logger.error(
          `Error deleting video file after send failure: ${unlinkError}`
        );
      }
    }

    if (retries > 0) {
      logger.warn(`Retrying to send video... (${MAX_RETRIES - retries + 1})`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before retrying
      return sendVideoToChat(args, retries - 1);
    } else {
      logger.error("Failed to send video after multiple attempts.");
      await sendMessageReaction({
        client,
        chatId,
        messageId: +(replyToMessage?.toString() || 0),
        reactions: [
          new Api.ReactionCustomEmoji({
            documentId: bigInt("5343968063970632884"), // Custom emoji ID for "Error"
          }),
        ],
      });
    }
  }
}

async function downloadVideoFromTikTok(url: string, retries = MAX_RETRIES) {
  try {
    return await downloadVideo(url, retries < MAX_RETRIES);
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Download failed, retrying... (${10 - retries + 1}/10)`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before retrying
      return downloadVideoFromTikTok(url, retries - 1);
    } else {
      throw new Error("Failed to download TikTok video after retries.");
    }
  }
}
