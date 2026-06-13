// search/mikan.ts — Mikan Project anime search provider
// Parses mikanani.me RSS feed for anime torrent results

import type { SearchResult, DownloadIntent, Quality } from "../types.js";
import type { SearchProvider } from "./provider.js";
import { createLogger } from "../logger.js";

const logger = createLogger("search:mikan");

/** Parse RSS XML string into SearchResult[] */
export function parseMikanRss(xml: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Split on <item> blocks
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];

  for (const item of items) {
    try {
      // Extract title
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
        ?? item.match(/<title>([\s\S]*?)<\/title>/);
      if (!titleMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1].trim());
      if (!title) continue;

      // Try magnet link first from <link>, fallback to enclosure
      let magnet = "";

      // Check for magnet in <link>
      const linkMatch = item.match(/<link><!\[CDATA\[(magnet:\?[^\]]*?)\]\]><\/link>/)
        ?? item.match(/<link>(magnet:\?[^\s<]*?)<\/link>/);
      if (linkMatch) {
        magnet = decodeHtmlEntities(linkMatch[1].trim());
      }

      // If no magnet, try <enclosure> for torrent URL
      if (!magnet) {
        const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]+\.torrent[^"]*)"/);
        if (enclosureMatch) {
          // Store torrent URL as magnet placeholder — the caller can handle conversion
          magnet = decodeHtmlEntities(enclosureMatch[1].trim());
        }
      }

      // Also check for magnet in description or other fields
      if (!magnet) {
        const descMagnetMatch = item.match(/(magnet:\?[^\s<"']+)/);
        if (descMagnetMatch) {
          magnet = descMagnetMatch[1];
        }
      }

      if (!magnet) continue;

      // Extract size from enclosure length attribute
      let size = 0;
      const sizeAttrMatch = item.match(/length="(\d+)"/);
      if (sizeAttrMatch) {
        size = parseInt(sizeAttrMatch[1], 10) || 0;
      }

      // Extract quality from title
      const quality = detectAnimeQuality(title);

      // Extract seeders from description if present
      let seeders = 0;
      const seederMatch = item.match(/(\d+)\s*seeders?/i);
      if (seederMatch) seeders = parseInt(seederMatch[1], 10);

      results.push({
        title,
        magnet,
        size,
        seeders,
        leechers: 0,
        source: "mikan",
        quality,
      });
    } catch {
      continue;
    }
  }

  return results;
}

/** Detect quality from anime title */
function detectAnimeQuality(title: string): Quality | undefined {
  const lower = title.toLowerCase();
  if (/4k|2160p/.test(lower)) return "4K";
  if (/1080[pi]/.test(lower)) return "1080p";
  if (/720[pi]/.test(lower)) return "720p";
  return undefined;
}

/** Decode common HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Parse anime title to extract metadata.
 * Common format: [SubGroup] Anime Title - XX [1080p].mkv
 */
export function parseAnimeTitle(title: string): {
  subgroup?: string;
  animeTitle?: string;
  episode?: string;
  quality?: string;
} {
  const result: { subgroup?: string; animeTitle?: string; episode?: string; quality?: string } = {};

  // Extract subgroup: [XXX]
  const subgroupMatch = title.match(/\[([^\]]+)\]/);
  if (subgroupMatch) {
    result.subgroup = subgroupMatch[1];
  }

  // Extract quality: 1080p, 720p, 4K etc.
  const qualityMatch = title.match(/\b(4K|2160p|1080[pi]|720[pi])\b/i);
  if (qualityMatch) {
    result.quality = qualityMatch[1];
  }

  // Extract episode number
  const epMatch = title.match(/\b(?:EP?|第)\s*(\d{1,4})(?:\s*(?:END|Fin|完))?/i)
    ?? title.match(/\[\s*(\d{1,4})\s*(?:v\d)?\s*(?:END|Fin|完)?\s*\]/)
    ?? title.match(/\bS\d{1,2}E(\d{1,3})\b/i);
  if (epMatch) {
    result.episode = epMatch[1];
  }

  // Extract anime title: strip brackets and known patterns
  const animeTitle = title
    .replace(/\[[^\]]*\]/g, "") // Remove [subgroup] [quality] etc.
    .replace(/\b(1080[pi]|720[pi]|4K|2160p)\b/gi, "")
    .replace(/\b(EP?\s*\d+|第\d+[话集]|S\d+E\d+)\b/gi, "")
    .replace(/\b(BluRay|WEB-DL|WEBRip|HDRip|HDTV|REMUX)\b/gi, "")
    .replace(/\b(x264|x265|HEVC|AVC|H\.?264|H\.?265|AAC|FLAC|AC3)\b/gi, "")
    .replace(/\.(mkv|mp4|avi|ts)$/i, "")
    .replace(/\s*[-–—]\s*$/, "")
    .replace(/[._]+/g, " ")
    .trim();

  if (animeTitle) {
    result.animeTitle = animeTitle;
  }

  return result;
}

/** Rate limiter */
const lastRequestTime = new Map<string, number>();
const RATE_LIMIT_MS = 1000;

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const domain = new URL(url).hostname;
  const last = lastRequestTime.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime.set(domain, Date.now());
  return fetch(url, init);
}

export class MikanSearchProvider implements SearchProvider {
  readonly name = "mikan";
  private readonly userAgent: string;

  constructor(userAgent?: string) {
    this.userAgent =
      userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
  }

  async search(keywords: string[], _intent: DownloadIntent): Promise<SearchResult[]> {
    const query = keywords.join(" ");
    if (!query) return [];

    try {
      const url = `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(query)}`;
      logger.debug(`fetching: ${url}`);

      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        logger.error(`HTTP ${response.status} for ${url}`);
        return [];
      }

      const xml = await response.text();
      return parseMikanRss(xml);
    } catch (err) {
      logger.error("search error:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}
