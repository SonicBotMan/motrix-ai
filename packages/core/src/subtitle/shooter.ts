// subtitle/shooter.ts — Shooter.cn & ASSRT subtitle source
// shooter.cn may be unreliable; ASSRT needs API token.
// For MVP: try shooter, fallback to empty results gracefully.

import type { SubtitleSource, SubtitleResult } from './finder.js'
import { createLogger } from '../logger.js'

const logger = createLogger('subtitle:shooter')

/** Rate limiter */
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
 * Parse shooter.cn API JSON response
 * Response format: [{ Desc: "", Files: [{ f: "filename", d: ["delay", "base64content"] }] }]
 */
function parseShooterResponse(
  data: Array<{
    Desc?: string
    Files?: Array<{ f: string; d: string[] }>
  }>,
  language: string,
): SubtitleResult[] {
  const results: SubtitleResult[] = []

  for (const item of data) {
    if (!item.Files?.length) continue
    for (const file of item.Files) {
      if (!file.f) continue
      // The download URL for shooter is reconstructed from the file data
      // Since shooter returns base64-encoded subtitle content directly,
      // we use a data: URL approach for the MVP
      const content = file.d?.[1] // base64 content
      if (!content) continue

      results.push({
        language,
        filename: file.f,
        downloadUrl: `data:application/octet-stream;base64,${content}`,
        source: 'shooter',
      })
    }
  }

  return results
}

export class ShooterSource implements SubtitleSource {
  readonly name = 'shooter'
  private readonly userAgent: string

  constructor(userAgent?: string) {
    this.userAgent =
      userAgent ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  }

  async search(title: string, year?: number, language?: string): Promise<SubtitleResult[]> {
    const lang = language ?? 'chn'
    const query = year ? `${title} ${year}` : title

    logger.debug(`searching: ${query}`)

    try {
      // Try shooter.cn API with filename-based search
      // The API expects filehash but also accepts pathinfo for filename search
      const formData = new URLSearchParams()
      formData.set('format', 'json')
      formData.set('pathinfo', `${query}.mkv`)
      formData.set('lang', lang)

      const response = await rateLimitedFetch('https://www.shooter.cn/api/subapi.php', {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        logger.warn(`HTTP ${response.status}, returning empty`)
        return []
      }

      const data = await response.json()
      if (!Array.isArray(data)) {
        logger.warn('unexpected response format')
        return []
      }

      return parseShooterResponse(data, lang)
    } catch (err) {
      // shooter.cn is known to be unreliable — fail silently
      logger.warn('request failed (expected):', err instanceof Error ? err.message : err)
      return []
    }
  }
}
