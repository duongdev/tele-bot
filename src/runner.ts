import { NewMessage, NewMessageEvent } from "telegram/events";
import { startTelegramClient } from "./lib/telegram";
import { handleMediaUrlMessage } from "./handlers/handle-media-url-message";
import { config } from "@dotenvx/dotenvx";

(async () => {
  config();
  console.log("[tele-bot] Starting v2 (cobalt integration)");
  const client = await startTelegramClient();

  // Add event handler for new messages
  client.addEventHandler(handleMessage, new NewMessage({}));
})();

async function handleMessage(event: NewMessageEvent) {
  await Promise.all([handleMediaUrlMessage(event)]);
}
