// search/duckduckgo.ts — DuckDuckGo HTML torrent search provider
// Scrapes DuckDuckGo's HTML endpoint for torrent / magnet results.

import type { SearchResult, DownloadIntent, Quality } from '../types.js'
import type { SearchProvider } from './provider.js'
import { createLogger } from '../logger.js'

const logger = createLogger('search:duckduckgo')

/** Parse human-readable size string to bytes */
function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0
  const match = sizeStr.trim().match(/^([\d.]+)\s*(TB|GB|MB|KB|B)?/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  if (isNaN(value)) return 0
  const unit = (match[2] ?? 'B').toUpperCase()
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

/** Extract quality hint from title string */
function detectQuality(title: string): Quality | undefined {
  const lower = title.toLowerCase()
  if (/4k|2160p|uhd/.test(lower)) return '4K'
  if (/1080[pi]/.test(lower)) return '1080p'
  if (/720[pi]/.test(lower)) return '720p'
  return undefined
}

/** Decode common HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Decode a DuckDuckGo redirect URL (uddg=...) back to the original target.
 * Returns the decoded URL or the input unchanged if it is not a DDG redirect.
 */
function decodeDdgRedirect(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return href
    }
  }
  return href
}

/** Simple rate limiter: tracks last request time per domain */
const lastRequestTime = new Map<string, number>()
const RATE_LIMIT_MS = 1000

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const domain = new URL(url).hostname
  const last = lastRequestTime.get(domain) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed))
  }
  lastRequestTime.set(domain, Date.now())
  return fetch(url, init)
}

/**
 * Scrape DuckDuckGo HTML search results into SearchResult[].
 *
 * Scans for magnet links across the page, then attempts to pair each
 * magnet with the nearest result title.  Falls back to constructing
 * placeholder results from magnet links found in snippets or raw HTML.
 *
 * @param html - Raw HTML body from https://duckduckgo.com/html/?q=...
 * @returns Parsed search results, possibly empty
 */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // --- Collect all magnet links found anywhere in the HTML ---
  const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'\s<>]*/g
  const rawMagnets = html.match(magnetRegex) ?? []
  const magnets = rawMagnets.map((m) => decodeHtmlEntities(m.replace(/&amp;/g, '&')))
  const seenMagnets = new Set<string>()

  // --- Parse result blocks for titles ---
  // DDG HTML wraps each result in a container with class "result "
  // and the clickable title link has class "result__a"
  const titleBlocks = html.split(/class="result__a"/)
  const titles: string[] = []
  for (let i = 1; i < titleBlocks.length; i++) {
    // Text after the link opening tag, up to </a>
    const titleMatch = titleBlocks[i].match(/>([^<]*)<\/a>/)
    if (titleMatch) {
      const title = decodeHtmlEntities(titleMatch[1].trim())
      if (title) titles.push(title)
    }
  }

  // --- Extract snippet text for size hints ---
  const snippetBlocks = html.split(/class="result__snippet"/)
  const snippets: string[] = []
  for (let i = 1; i < snippetBlocks.length; i++) {
    const textMatch = snippetBlocks[i].match(/>([\s\S]*?)<\/a>/)
    if (textMatch) {
      const text = textMatch[1].replace(/<[^>]+>/g, '').trim()
      snippets.push(text)
    }
  }

  // --- Pair magnets with titles by position ---
  // Strategy: for each unique magnet, try to find an associated title
  // from the nearest preceding result block.
  if (magnets.length > 0) {
    for (let idx = 0; idx < magnets.length; idx++) {
      const magnet = magnets[idx]

      // Deduplicate by info-hash portion
      const hashMatch = magnet.match(/btih:([a-zA-Z0-9]+)/)
      if (hashMatch && seenMagnets.has(hashMatch[1])) continue
      if (hashMatch) seenMagnets.add(hashMatch[1])

      // Try to extract display name from magnet "dn=" parameter
      let title = ''
      const dnMatch = magnet.match(/[?&]dn=([^&]+)/)
      if (dnMatch) {
        title = decodeURIComponent(dnMatch[1].replace(/\+/g, ' '))
      }

      // Fallback: use the corresponding result title if available
      if (!title && idx < titles.length) {
        title = titles[idx]
      }
      if (!title && titles.length > 0) {
        title = titles[Math.min(idx, titles.length - 1)]
      }
      if (!title) continue

      // Try to extract size from associated snippet
      let size = 0
      const snippetIdx = Math.min(idx, snippets.length - 1)
      if (snippetIdx >= 0 && snippets[snippetIdx]) {
        const sizeMatch = snippets[snippetIdx].match(/([\d.]+)\s*(TB|GB|MB|KB|B)/i)
        if (sizeMatch) {
          size = parseSizeToBytes(`${sizeMatch[1]} ${sizeMatch[2]}`)
        }
      }

      // Also try to extract seeders from snippet
      let seeders = 0
      if (snippetIdx >= 0 && snippets[snippetIdx]) {
        const seederMatch = snippets[snippetIdx].match(/(\d+)\s*(?:seeders?|seeds?|peers?)/i)
        if (seederMatch) seeders = parseInt(seederMatch[1], 10) || 0
      }

      results.push({
        title,
        magnet,
        size,
        seeders,
        leechers: 0,
        source: 'duckduckgo',
        quality: detectQuality(title),
      })
    }
    return results
  }

  // --- Fallback: no direct magnets found ---
  // Extract result URLs and look for torrent-related links we can report
  const hrefBlocks = html.split(/class="result__a"/)
  for (let i = 1; i < hrefBlocks.length; i++) {
    const hrefMatch = hrefBlocks[i].match(/href="([^"]+)"/)
    const titleMatch = hrefBlocks[i].match(/>([^<]*)<\/a>/)
    if (!hrefMatch || !titleMatch) continue

    const rawUrl = hrefMatch[1]
    const actualUrl = decodeDdgRedirect(rawUrl)
    const title = decodeHtmlEntities(titleMatch[1].trim())
    if (!title) continue

    // Only include results from known torrent-related domains
    const lowerUrl = actualUrl.toLowerCase()
    if (/torrent|magnet|btih|piratebay|1337x|rarbg|nyaa|limetorrents|torrentgalaxy|eztv/i.test(lowerUrl)) {
      // Check if the URL itself contains a magnet link
      if (actualUrl.startsWith('magnet:')) {
        results.push({
          title,
          magnet: decodeHtmlEntities(actualUrl),
          size: 0,
          seeders: 0,
          leechers: 0,
          source: 'duckduckgo',
          quality: detectQuality(title),
        })
      }
    }
  }

  return results
}

/**
 * DuckDuckGo BT search provider.
 *
 * Queries the DuckDuckGo HTML endpoint with torrent-appended keywords
 * and scrapes the results for magnet links.  Serves as a general-purpose
 * fallback that can surface torrents from sites not covered by Btdig/Mikan.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo'
  private readonly userAgent: string

  constructor(userAgent?: string) {
    this.userAgent =
      userAgent ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  }

  async search(keywords: string[], intent: DownloadIntent): Promise<SearchResult[]> {
    const query = keywords.join(' ')
    if (!query) return []

    // Append resource-specific search modifiers for better torrent coverage
    const searchModifiers = this.getSearchModifiers(intent.resource_type)
    const enhancedQuery = `${query} ${searchModifiers}`.trim()

    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(enhancedQuery)}`
      logger.debug(`fetching: ${url}`)

      const response = await rateLimitedFetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        logger.error(`HTTP ${response.status} for ${url}`)
        return []
      }

      const html = await response.text()
      return parseDuckDuckGoHtml(html)
    } catch (err) {
      logger.error('search error:', err instanceof Error ? err.message : err)
      return []
    }
  }

  /**
   * Resource-type-specific search modifiers appended to the query
   * to bias DuckDuckGo toward torrent-friendly results.
   */
  private getSearchModifiers(resourceType: DownloadIntent['resource_type']): string {
    switch (resourceType) {
      case 'movie':
      case 'tv':
        return 'torrent magnet'
      case 'software':
        return 'torrent download'
      case 'music':
        return 'torrent FLAC'
      default:
        return 'torrent'
    }
  }
}
