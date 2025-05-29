import { input, password } from "@inquirer/prompts";
import { TelegramClient } from "telegram";
import { logger } from "./logger";
import { StringSession } from "telegram/sessions";

export async function startTelegramClient() {
  // Verify environment variables
  const { PROXY, API_ID, API_HASH, STRING_SESSION = "" } = process.env;
  if (!(API_ID && API_HASH)) {
    throw new Error(
      "Missing required environment variables: API_ID and API_HASH"
    );
  }

  let proxy: { ip: string; port: number } | undefined = undefined;
  if (PROXY) {
    const [host, portStr] = PROXY.split(":");
    const port = parseInt(portStr, 10);
    if (host && !isNaN(port)) {
      proxy = { ip: host, port: port };
    } else {
      throw new Error("Invalid PROXY format. Expected 'host:port'.");
    }
  }

  const client = new TelegramClient(
    new StringSession(STRING_SESSION),
    +API_ID!,
    API_HASH!,
    {
      connectionRetries: 10, // Number of retries for connection
      useWSS: false, // Important. Most proxies cannot use SSL.
      proxy: proxy
        ? {
            ip: proxy.ip,
            port: proxy.port,
            socksType: 5, // If used Socks you can choose 4 or 5.
            timeout: 2, // Timeout (in seconds) for connection,
          }
        : undefined,
    }
  );

  await client.start({
    phoneNumber: async () => await input({ message: "Phone number:" }),
    password: async () => await password({ message: "Password:" }),
    phoneCode: async () => await input({ message: "Code:" }),
    onError: (err) =>
      logger.error(`Error during Telegram client start: ${err.message}`),
  });

  logger.info("Telegram client started successfully.");
  return client;
}
