// subtitle/subhd.ts — SubHD.tv subtitle search source
// Scrapes subhd.tv search results HTML

import type { SubtitleSource, SubtitleResult } from "./finder.js";
import { createLogger } from "../logger.js";

const logger = createLogger("subtitle:subhd");

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

/** Decode HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Parse subhd.tv search results HTML
 * The page structure typically has:
 * - .link a element with title and href
 * - Language indicator
 * - Download count or other metadata
 */
export function parseSubhdHtml(html: string, baseUrl: string): SubtitleResult[] {
  const results: SubtitleResult[] = [];

  // Strategy 1: Look for result link items with common class patterns
  // subhd.tv frequently changes its HTML structure, so we use multiple strategies

  // Try matching common result patterns:
  // <a href="/detail/xxxxx" class="...">Title</a>
  const linkPattern = /<a[^>]*href="\/(detail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const path = match[1];
    const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
    const title = decodeHtmlEntities(rawTitle);

    if (!title || title.length < 2) continue;

    // Skip navigation links
    if (/^(首页|搜索|登录|注册|关于|帮助|意见反馈)/.test(title)) continue;

    // Detect language from title or surrounding context
    const language = detectLanguage(title);

    // Build download URL — subhd detail page has download link
    const detailUrl = `${baseUrl}/${path}`;

    results.push({
      language,
      filename: `${title}.srt`,
      downloadUrl: detailUrl,
      source: "subhd",
    });

    // Limit results
    if (results.length >= 20) break;
  }

  return results;
}

/** Detect subtitle language from title/context */
function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  if (/简体|简中|chs|gb|中文/.test(lower)) return "zh-Hans";
  if (/繁体|繁中|cht|big5/.test(lower)) return "zh-Hant";
  if (/英文|english|eng/.test(lower)) return "en";
  if (/双语|双字|简英/.test(lower)) return "zh-Hans";
  if (/中英|chinese.?eng/.test(lower)) return "zh-Hans";
  // Default: assume Chinese for subhd since it's a Chinese subtitle site
  return "zh-Hans";
}

export class SubhdSource implements SubtitleSource {
  readonly name = "subhd";
  private readonly userAgent: string;
  private readonly baseUrl: string;

  constructor(userAgent?: string, baseUrl?: string) {
    this.userAgent =
      userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    this.baseUrl = baseUrl ?? "https://subhd.tv";
  }

  async search(title: string, year?: number, language?: string): Promise<SubtitleResult[]> {
    const query = year ? `${title} ${year}` : title;
    logger.debug(`searching: ${query}`);

    try {
      const url = `${this.baseUrl}/search/${encodeURIComponent(query)}`;

      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        logger.error(`HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      const results = parseSubhdHtml(html, this.baseUrl);

      // Filter by requested language if specified
      if (language) {
        return results.filter(
          (r) => r.language === language || r.language.startsWith(language.split("-")[0])
        );
      }

      return results;
    } catch (err) {
      logger.error("search error:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}
