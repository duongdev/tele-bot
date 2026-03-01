import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./logger";
import type { VideoMeta } from "./cobalt";

const execFileAsync = promisify(execFile);

export async function probeVideo(filePath: string): Promise<VideoMeta | undefined> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
    const duration = Math.round(parseFloat(data.format?.duration || "0"));

    if (videoStream) {
      const meta = {
        width: videoStream.width,
        height: videoStream.height,
        duration,
      };
      logger.info(`Video meta: ${meta.width}x${meta.height}, ${meta.duration}s`);
      return meta;
    }
  } catch (error) {
    logger.warn(`ffprobe failed: ${error}`);
  }
  return undefined;
}
