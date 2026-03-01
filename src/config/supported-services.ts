export interface ServiceConfig {
  name: string;
  patterns: RegExp[];
}

const ALL_SERVICES: ServiceConfig[] = [
  {
    name: "tiktok",
    patterns: [
      /https?:\/\/(?:(?:vt|vm|www)\.)?tiktok\.com\/[^\s]+/g,
    ],
  },
  {
    name: "instagram",
    patterns: [
      /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|stories)\/[^\s]+/g,
    ],
  },
  {
    name: "twitter",
    patterns: [
      /https?:\/\/(?:(?:www|mobile)\.)?(?:twitter\.com|x\.com)\/[^\s]*\/status\/[^\s]+/g,
    ],
  },
  {
    name: "youtube",
    patterns: [
      /https?:\/\/(?:www\.)?youtube\.com\/(?:watch|shorts|clip)\b[^\s]*/g,
      /https?:\/\/youtu\.be\/[^\s]+/g,
      /https?:\/\/music\.youtube\.com\/watch[^\s]*/g,
    ],
  },
];

function getEnabledServices(): ServiceConfig[] {
  const env = process.env.SUPPORTED_SERVICES;
  if (!env) return ALL_SERVICES;

  const enabled = new Set(env.split(",").map((s) => s.trim().toLowerCase()));
  return ALL_SERVICES.filter((s) => enabled.has(s.name));
}

/**
 * Extract all supported media URLs from a text message.
 * Returns deduplicated URLs.
 */
export function extractMediaUrls(text: string): string[] {
  const services = getEnabledServices();
  const urls = new Set<string>();
  for (const service of services) {
    for (const pattern of service.patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        urls.add(match[0]);
      }
    }
  }
  return [...urls];
}
