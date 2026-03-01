export interface ServiceConfig {
  name: string;
  patterns: RegExp[];
}

const ALL_SERVICES: ServiceConfig[] = [
  {
    name: "tiktok",
    patterns: [
      /https?:\/\/(?:(?:vt|vm|m|t|pro|www)\.)?tiktok\.com\/[^\s]+/g,
    ],
  },
  {
    name: "instagram",
    patterns: [
      /https?:\/\/(?:www\.)?(?:instagram\.com|ddinstagram\.com)\/(?:p|tv|reel|reels|stories|share)\/[^\s]+/g,
    ],
  },
  {
    name: "twitter",
    patterns: [
      /https?:\/\/(?:(?:www|mobile)\.)?(?:twitter\.com|x\.com|vxtwitter\.com|fixvx\.com)\/[^\s]*\/status\/[^\s]+/g,
    ],
  },
  {
    name: "youtube",
    patterns: [
      /https?:\/\/(?:(?:www|m)\.)?youtube\.com\/(?:watch|shorts|clip|embed|v)\b[^\s]*/g,
      /https?:\/\/youtu\.be\/[^\s]+/g,
      /https?:\/\/music\.youtube\.com\/watch[^\s]*/g,
    ],
  },
  {
    name: "facebook",
    patterns: [
      /https?:\/\/(?:(?:www|web|m)\.)?facebook\.com\/[^\s]*(?:videos|reel|watch|share)\/[^\s]+/g,
      /https?:\/\/fb\.watch\/[^\s]+/g,
    ],
  },
  {
    name: "reddit",
    patterns: [
      /https?:\/\/(?:[\w-]+\.)?reddit\.com\/(?:r\/[^\s]+\/comments|comments|r\/[^\s]+\/s|video)\/[^\s]+/g,
    ],
  },
  {
    name: "twitch",
    patterns: [
      /https?:\/\/(?:(?:www|clips|m)\.)?twitch\.tv\/[^\s]+\/clip\/[^\s]+/g,
      /https?:\/\/clips\.twitch\.tv\/[^\s]+/g,
    ],
  },
  {
    name: "vimeo",
    patterns: [
      /https?:\/\/(?:(?:www|player)\.)?vimeo\.com\/(?:\d+|video\/\d+|channels\/[^\s]+\/\d+|groups\/[^\s]+\/videos\/\d+)[^\s]*/g,
    ],
  },
  {
    name: "snapchat",
    patterns: [
      /https?:\/\/(?:(?:www|t|story)\.)?snapchat\.com\/[^\s]+/g,
    ],
  },
  {
    name: "soundcloud",
    patterns: [
      /https?:\/\/(?:(?:www|on|m)\.)?soundcloud\.com\/[^\s]+\/[^\s]+/g,
    ],
  },
  {
    name: "tumblr",
    patterns: [
      /https?:\/\/(?:www\.)?tumblr\.com\/[^\s]+/g,
      /https?:\/\/[\w-]+\.tumblr\.com\/post\/[^\s]+/g,
    ],
  },
  {
    name: "bilibili",
    patterns: [
      /https?:\/\/(?:(?:www|m)\.)?bilibili\.com\/video\/[^\s]+/g,
    ],
  },
  {
    name: "bluesky",
    patterns: [
      /https?:\/\/bsky\.app\/profile\/[^\s]+\/post\/[^\s]+/g,
    ],
  },
  {
    name: "dailymotion",
    patterns: [
      /https?:\/\/(?:www\.)?dailymotion\.com\/video\/[^\s]+/g,
    ],
  },
  {
    name: "loom",
    patterns: [
      /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/[^\s]+/g,
    ],
  },
  {
    name: "ok",
    patterns: [
      /https?:\/\/(?:www\.)?ok\.ru\/(?:video|videoembed)\/[^\s]+/g,
    ],
  },
  {
    name: "pinterest",
    patterns: [
      /https?:\/\/(?:[\w-]+\.)?pinterest\.(?:com|co\.uk|ca|fr|de|es|it|jp|kr|au)\/pin\/[^\s]+/g,
    ],
  },
  {
    name: "newgrounds",
    patterns: [
      /https?:\/\/(?:www\.)?newgrounds\.com\/(?:portal\/view|audio\/listen)\/[^\s]+/g,
    ],
  },
  {
    name: "rutube",
    patterns: [
      /https?:\/\/(?:www\.)?rutube\.ru\/(?:video|play\/embed|shorts|yappy)\/[^\s]+/g,
    ],
  },
  {
    name: "vk",
    patterns: [
      /https?:\/\/(?:(?:www|m)\.)?(?:vk\.com|vkvideo\.ru|vk\.ru)\/(?:video|clip|clips|videos)[^\s]*/g,
    ],
  },
  {
    name: "xiaohongshu",
    patterns: [
      /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s]+/g,
    ],
  },
  {
    name: "streamable",
    patterns: [
      /https?:\/\/(?:www\.)?streamable\.com\/[^\s]+/g,
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
