// search/btdig.ts — Btdig torrent search provider
// Scrapes btdig.com HTML for torrent/magnet results

import type { SearchResult, DownloadIntent, Quality } from "../types.js";
import type { SearchProvider } from "./provider.js";
import { createLogger } from "../logger.js";

const logger = createLogger("search:btdig");

/** Parse human-readable size string to bytes */
export function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.trim().match(/^([\d.]+)\s*(TB|GB|MB|KB|B)?/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return 0;
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.floor(value * (multipliers[unit] ?? 1));
}

/** Extract quality hint from title string */
function detectQuality(title: string): Quality | undefined {
  const lower = title.toLowerCase();
  if (/4k|2160p|uhd/.test(lower)) return "4K";
  if (/1080[pi]/.test(lower)) return "1080p";
  if (/720[pi]/.test(lower)) return "720p";
  return undefined;
}

/** Simple rate limiter: tracks last request time per domain */
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

/** Scrape btdig.com search results HTML into SearchResult[] */
export function parseBtdigHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // Split on result containers
  const resultBlocks = html.split(/class="one_result"/);
  // First element is before the first result, skip it
  for (let i = 1; i < resultBlocks.length; i++) {
    const block = resultBlocks[i];
    try {
      // Extract title from torrent_name or first <a>
      let title = "";
      const titleMatch = block.match(/class="torrent_name"[^>]*>([\s\S]*?)<\/div>/);
      if (titleMatch) {
        // Strip inner HTML tags
        title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      }
      if (!title) {
        const anchorMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
        if (anchorMatch) {
          title = anchorMatch[1].replace(/<[^>]+>/g, "").trim();
        }
      }
      if (!title) continue;

      // Extract magnet link
      let magnet = "";
      const magnetMatch = block.match(/href="(magnet:\?[^"]+)"/);
      if (magnetMatch) {
        magnet = magnetMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
      }
      if (!magnet) continue;

      // Extract size
      let size = 0;
      const sizeMatch = block.match(/class="torrent_size"[^>]*>([\s\S]*?)<\/span>/);
      if (sizeMatch) {
        size = parseSizeToBytes(sizeMatch[1].trim());
      }

      // Extract seeders/leechers if available
      let seeders = 0;
      let leechers = 0;
      const seederMatch = block.match(/(\d+)\s*seed/i);
      if (seederMatch) seeders = parseInt(seederMatch[1], 10) || 0;
      const leecherMatch = block.match(/(\d+)\s*leech/i);
      if (leecherMatch) leechers = parseInt(leecherMatch[1], 10) || 0;

      results.push({
        title,
        magnet,
        size,
        seeders,
        leechers,
        source: "btdig",
        quality: detectQuality(title),
      });
    } catch {
      // Skip malformed results
      continue;
    }
  }
  return results;
}

export class BtdigSearchProvider implements SearchProvider {
  readonly name = "btdig";
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
      // MVP: first page only (p=0)
      const url = `https://btdig.com/search?q=${encodeURIComponent(query)}&p=0`;
      logger.debug(`fetching: ${url}`);

      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        logger.error(`HTTP ${response.status} for ${url}`);
        return [];
      }

      const html = await response.text();
      return parseBtdigHtml(html);
    } catch (err) {
      logger.error("search error:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}
