import fetch, { Headers } from "node-fetch";
import { downloadMedia, getVideo } from "./lib/tiktok";
import chalk from "chalk";
import { createWriteStream, existsSync } from "node:fs";
import { getRedisClient } from "./lib/redis";
import { logger } from "./lib/logger";

export async function getVideoRedirectUrl(
  videoUrl: string
): Promise<string | null> {
  const redisClient = await getRedisClient();
  const redisKey = `tiktok:redirect:${videoUrl}`;
  const cachedUrl = await redisClient?.get(redisKey);

  if (cachedUrl) {
    logger.debug(`Cache hit for TikTok URL: ${videoUrl} -> ${cachedUrl}`);
    return cachedUrl;
  }

  if (
    videoUrl.includes("vm.tiktok.com") ||
    videoUrl.includes("vt.tiktok.com")
  ) {
    const res = await fetch(videoUrl, {
      redirect: "follow",
      follow: 10,
    });

    await redisClient?.set(redisKey, res.url, {
      EX: 60 * 60 * 24, // Cache for 24 hours
    });

    return res.url;
  }

  await redisClient?.set(redisKey, videoUrl, {
    EX: 60 * 60 * 24, // Cache for 24 hours
  });

  return videoUrl;
}

export async function getVideoData(videoUrl: string, useCache = true) {
  const redisClient = await getRedisClient();
  const redisKey = `tiktok:video-data:${videoUrl}`;
  const cachedData = await redisClient?.get(redisKey);
  if (cachedData && useCache) {
    logger.debug(
      `Cache hit for TikTok video data: ${videoUrl} -> ${cachedData}`
    );
    try {
      return JSON.parse(cachedData);
    } catch (error) {
      logger.error(`Error parsing cached TikTok video data: ${error}`);
    }
  }

  const videoData = await getVideo(videoUrl, false);

  await redisClient?.set(redisKey, JSON.stringify(videoData), {
    EX: 60 * 10, // Cache for 10 minutes
  });

  if (!videoData?.url) {
    throw new Error("Unable to retrieve video URL.");
  }

  if (videoData.images?.length) {
    console.warn(
      chalk.yellow("[!] This video is a slideshow. Skipping download.")
    );
    return null;
  }

  return videoData;
}

export async function downloadVideo(
  videoUrl: string,
  isRetrying = false
): Promise<string | null> {
  const redirectUrl = await getVideoRedirectUrl(videoUrl);
  if (!redirectUrl) {
    throw new Error("Invalid TikTok URL or unable to redirect.");
  }

  const videoData = await getVideoData(redirectUrl, !isRetrying);
  if (!videoData) {
    throw new Error("No video data found.");
  }

  const filePath = `downloads/${videoData.id}.mp4`;
  // await downloadMedia(videoData);

  // Skip if the video is a slideshow
  if (videoData.images && videoData.images.length > 0) {
    logger.warn(
      chalk.yellow("[!] This video is a slideshow. Skipping download.")
    );
    return null;
  }

  if (existsSync(filePath)) {
    console.debug(
      chalk.yellow(`[!] File '${filePath}' already exists. Skipping`)
    );
    return filePath;
  }

  const downloadFile = fetch(videoData.url);
  const file = createWriteStream(filePath);
  const response = await downloadFile;
  if (!response.ok) {
    throw new Error(
      `Failed to download video: ${response.status} ${response.statusText}`
    );
  }
  response.body?.pipe(file);
  await new Promise((resolve, reject) => {
    file.on("finish", () => resolve(filePath));
    file.on("error", (err) => {
      reject(new Error(`Error writing file: ${err.message}`));
    });
  });
  logger.info(`Video downloaded successfully: ${filePath}`);

  // // Wait for the download to complete
  // let retries = 10;
  // while (!existsSync(filePath) && retries > 0) {
  //   await new Promise((resolve) => setTimeout(resolve, 1000));
  //   retries--;
  // }

  // if (!existsSync(filePath)) {
  //   throw new Error("Video download failed or file not found.");
  // }

  return filePath;
}
