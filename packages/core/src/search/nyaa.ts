// search/nyaa.ts — Nyaa.si torrent search provider
// Scrapes the nyaa.si HTML search results table (sorted by seeders) for magnet links

import type { SearchResult, DownloadIntent, Quality } from '../types.js'
import type { SearchProvider } from './provider.js'
import { createLogger } from '../logger.js'

const logger = createLogger('search:nyaa')

/** Default browser User-Agent for scraping requests */
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * Parse the nyaa.si results HTML table into {@link SearchResult} entries.
 *
 * nyaa.si renders each row as a `<tr class="...">` containing table cells
 * with the title links, a magnet icon, file size, seeders, and leechers.
 *
 * @param html - Raw HTML body from the nyaa.si search page
 * @returns Parsed search results (up to 10)
 */
export function parseNyaaHtml(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // Every result row has a class of default / success / danger.
  // Split on any <tr> that carries one of those classes.
  const rows = html.split(/<tr class="(?:default|success|danger)">/).slice(1)

  for (const row of rows.slice(0, 10)) {
    try {
      // The second <a> inside the comments-cell links text holds the title
      // Full title is in the non-category link — its title attribute is clean.
      const titleMatch = row.match(/<a[^>]*title="([^"]+)"[^>]*>/)
      if (!titleMatch) continue
      const title = titleMatch[1].trim()
      if (!title) continue

      // Magnet link
      const magnetMatch = row.match(/href="(magnet:\?[^"]+)"/)
      if (!magnetMatch) continue
      const magnet = magnetMatch[1].replace(/&amp;/g, '&')

      // Size — nyaa shows e.g. "1.4 GiB"
      const sizeMatch = row.match(/<td class="text-center">([\d.]+\s*[KMG]iB)\s*<\/td>/i)
      const size = sizeMatch ? parseNyaaSize(sizeMatch[1].trim()) : 0

      // Seeders & leechers — two numeric cells after size
      const numericCells = [...row.matchAll(/<td class="text-center">(\d+)<\/td>/g)]
      const seeders = numericCells.length > 0 ? parseInt(numericCells[0][1], 10) : 0
      const leechers = numericCells.length > 1 ? parseInt(numericCells[1][1], 10) : 0

      results.push({
        title,
        magnet,
        size,
        seeders,
        leechers,
        source: 'nyaa',
        quality: detectQuality(title),
      })
    } catch {
      continue
    }
  }

  return results
}

/** Detect video quality from a title string */
function detectQuality(title: string): Quality | undefined {
  const lower = title.toLowerCase()
  if (/2160p|4k|uhd/.test(lower)) return '4K'
  if (/1080[pi]/.test(lower)) return '1080p'
  if (/720[pi]/.test(lower)) return '720p'
  return undefined
}

/** Convert a nyaa.si size string (e.g. "1.4 GiB") to bytes */
export function parseNyaaSize(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(KiB|MiB|GiB|TiB|B)/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const multipliers: Record<string, number> = {
    B: 1,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
  }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

/**
 * Nyaa.si search provider.
 *
 * Queries the public nyaa.si search endpoint sorted by seeders descending
 * and parses the resulting HTML table for magnet links.
 */
export class NyaaSearchProvider implements SearchProvider {
  readonly name = 'nyaa'
  private readonly userAgent: string

  constructor(userAgent?: string) {
    this.userAgent = userAgent ?? DEFAULT_UA
  }

  /** @inheritdoc */
  async search(keywords: string[], _intent: DownloadIntent): Promise<SearchResult[]> {
    const query = keywords.join(' ')
    if (!query) return []

    const url = `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(query)}&s=seeders&o=desc`

    logger.debug(`fetching: ${url}`)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        logger.error(`HTTP ${response.status} from nyaa.si`)
        return []
      }

      const html = await response.text()
      return parseNyaaHtml(html)
    } catch (err) {
      logger.error(`search error: ${err instanceof Error ? err.message : err}`)
      return []
    }
  }
}
