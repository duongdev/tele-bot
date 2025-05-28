import { Logger, TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import { input, password } from "@inquirer/prompts";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { downloadVideo } from "./tiktok";
import { unlinkSync } from "node:fs";

const MAX_DOWNLOAD_RETRIES = 10; // Maximum number of retries for downloading TikTok videos
const PROXY = process.env.PROXY!; // Default proxy host if not set in environment variables
const PROXY_HOST = PROXY.split(":")[0]!; // Extract proxy host from environment variable
const PROXY_PORT = +(PROXY.split(":")[1] || 1080); // Extract proxy port from environment variable, default to 1080

const stringSession = new StringSession(process.env.STRING_SESSION || "");
const apiId = +(process.env.API_ID || 0); // Convert to number
const apiHash = process.env.API_HASH || "";
const phone = "+84979477635";

const logger = new Logger(LogLevel.DEBUG);

(async () => {
  logger.info("Loading interactive example...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 10, // Number of retries for connection
    useWSS: false, // Important. Most proxies cannot use SSL.
    proxy: {
      ip: PROXY_HOST, // Proxy host (IP or hostname)
      port: PROXY_PORT, // Proxy port
      socksType: 5, // If used Socks you can choose 4 or 5.
      timeout: 2, // Timeout (in seconds) for connection,
    },
  });
  await client.start({
    phoneNumber: async () =>
      await input({ message: "Phone number:", default: phone }),
    password: async () => await password({ message: "Password:" }),
    phoneCode: async () => await input({ message: "Code:" }),
    onError: (err) => console.log(err),
  });
  logger.info("You should now be connected.");

  // await client.sendMessage("me", { message: "Hello!" });

  client.addEventHandler(handleMessage, new NewMessage({}));
})();

const WHITELIST_CHAT_IDS = [];

async function handleMessage(event: NewMessageEvent) {
  const message = event.message;
  const chatId = message.chatId;

  if (!chatId) {
    logger.error("Message does not have a chatId.");
    return;
  }

  logger.info(`New message from ${message.chatId}: ${message.text}`);

  if (message.text === "/chatid") {
    event._client?.sendMessage(message.chatId!, {
      message: `${message.chatId}`,
    });
  }

  // if (!WHITELIST_CHAT_IDS.includes(chatId.toJSNumber())) {
  //   logger.warn(`Chat ID ${chatId} is not whitelisted.`);
  //   return;
  // }

  // Download and send tiktok video if the message contains a TikTok link
  // https://vt.tiktok.com/ZSk12qr6C
  if (message.text?.includes("tiktok.com")) {
    let progressMessageId: number | undefined;
    try {
      const videoUrl = message.text.match(
        /(https?:\/\/(?:(vt|www)\.)?tiktok\.com\/[^\s]+)/g
      );
      if (!videoUrl) {
        logger.warn("No TikTok URL found in the message.");
        return;
      }

      logger.info(`Downloading TikTok video from URL: ${videoUrl[0]}`);

      if (videoUrl) {
        // Send a message to indicate the download is starting
        const progressMessage = await event._client?.sendMessage(
          message.chat!,
          {
            message: "Đang tải video TikTok...",
            replyTo: message.id,
          }
        );
        progressMessageId = progressMessage?.id;

        const videoPath = await downloadVideoFromTikTok(videoUrl[0]);

        let lastProgress = 0;
        await event._client?.sendFile(message.chat!, {
          file: videoPath,
          // caption: videoUrl[0],
          supportsStreaming: true,
          replyTo: message.id,
          progressCallback: async (progress) => {
            if (progress - lastProgress >= 0.1) {
              lastProgress = progress;
              if (progressMessageId) {
                await event._client?.editMessage(message.chat!, {
                  message: progressMessageId,
                  text: `Đang tải video TikTok... ${Math.round(
                    progress * 100
                  )}%`,
                });
              }
            }
          },
          workers: 4, // Number of workers to use for downloading
        });
        logger.info("TikTok video sent successfully.");

        try {
          // Delete video file after sending
          unlinkSync(videoPath);
        } catch (error) {
          logger.error(`Error deleting video file: ${error}`);
        }

        // Optionally, delete the progress message after the video is sent
        if (progressMessageId) {
          await event._client?.deleteMessages(
            message.chat!,
            [progressMessageId],
            { revoke: true }
          );
        }
      } else {
        logger.warn("No TikTok URL found in the message.");
      }
    } catch (error) {
      logger.error(`Error downloading TikTok video: ${error}`);
      if (progressMessageId) {
        await event._client?.deleteMessages(
          message.chat!,
          [progressMessageId],
          { revoke: true }
        );
      }
    }
  }

  // if (message.isPrivate) {
  //   logger.info(`New message from ${message.chatId}: ${message.text}`);
  //   event._client?.sendMessage(message.chatId!, {
  //     message: "Thanks for your message! I will get back to you soon.",
  //   });
  //   // You can reply to the message
  //   // await message.respond("Thanks for your message!");
  // } else {
  //   logger.info(`New message in group ${message.chatId}: ${message.text}`);
  // }
}

const downloadVideoFromTikTok = async (
  url: string,
  retries = MAX_DOWNLOAD_RETRIES
) => {
  try {
    return await downloadVideo(url);
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Download failed, retrying... (${10 - retries + 1}/10)`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before retrying
      return downloadVideoFromTikTok(url, retries - 1);
    } else {
      throw new Error("Failed to download TikTok video after retries.");
    }
  }
};
