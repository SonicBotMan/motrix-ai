// ai/keyword-generator.ts — Multi-language keyword generation for search
// Expands a DownloadIntent into diverse keyword sets to maximize coverage
// across Btdig, Mikan, DuckDuckGo and other providers.

import type { DownloadIntent, Quality } from '../types.js'

/** Quality terms mapped to common torrent-release descriptors. */
const QUALITY_TERMS: Record<Exclude<Quality, 'other'>, string[]> = {
  '4K': ['4K', '2160p', 'UHD'],
  '1080p': ['1080p', 'FHD'],
  '720p': ['720p', 'HD'],
}

/** English-language search modifiers appended to broaden torrent coverage. */
const ENGLISH_MODIFIERS = ['magnet', 'torrent', 'download']

/**
 * Generates expanded, multi-language search keywords from a parsed
 * DownloadIntent.  Produces keyword sets tailored to each resource type
 * so that different providers (which index different content pools) all
 * receive queries they can answer.
 */
export class KeywordGenerator {
  /**
   * Generate deduplicated keyword variants from a download intent.
   *
   * @param intent - The parsed download intent containing title, type and metadata
   * @returns Deduplicated array of keyword strings, ordered from most specific to broadest
   *
   * @example
   * ```ts
   * const gen = new KeywordGenerator();
   * gen.generate({
   *   title: "流浪地球2",
   *   year: 2023,
   *   quality: "4K",
   *   need_subtitle: false,
   *   search_keywords: [],
   *   resource_type: "movie",
   * });
   * // ["流浪地球2", "流浪地球2 movie", "流浪地球2 2023", "流浪地球2 2023 4K", ...]
   * ```
   */
  generate(intent: DownloadIntent): string[] {
    const keywords = new Set<string>()
    const { title, resource_type, year, quality } = intent

    const cleanTitle = title?.trim()
    if (!cleanTitle) return []

    // --- Base: raw title and title + type ---
    keywords.add(cleanTitle)
    keywords.add(`${cleanTitle} ${resource_type}`)

    switch (resource_type) {
      case 'movie':
        this.addMovieKeywords(keywords, cleanTitle, year, quality)
        break
      case 'tv':
        this.addTvKeywords(keywords, cleanTitle, year, quality)
        break
      case 'anime':
        this.addAnimeKeywords(keywords, cleanTitle, year, quality)
        break
      case 'software':
        this.addSoftwareKeywords(keywords, cleanTitle)
        break
      case 'music':
        this.addMusicKeywords(keywords, cleanTitle)
        break
      default:
        this.addGenericKeywords(keywords, cleanTitle)
        break
    }

    // Always include keywords already provided by the NL intent parser
    for (const kw of intent.search_keywords) {
      const trimmed = kw?.trim()
      if (trimmed) keywords.add(trimmed)
    }

    return [...keywords].filter((k) => k.length > 0)
  }

  /**
   * Movie-specific keyword variants.
   * Adds year, quality, format descriptors and bilingual search terms.
   */
  private addMovieKeywords(keywords: Set<string>, title: string, year?: number, quality?: Quality): void {
    // Year context
    if (year) {
      keywords.add(`${title} ${year}`)
      keywords.add(`${title} ${year} movie`)
    }

    // Quality context
    if (quality && quality !== 'other') {
      keywords.add(`${title} ${quality}`)
      if (year) keywords.add(`${title} ${year} ${quality}`)
      // Expand to common release-format descriptors for this quality
      for (const term of QUALITY_TERMS[quality]) {
        keywords.add(`${title} ${term}`)
      }
    }

    // Movie-specific modifiers (English + Chinese)
    keywords.add(`${title} movie`)
    keywords.add(`${title} 电影`)
    keywords.add(`${title} BluRay`)
    keywords.add(`${title} WEB-DL`)

    // English broad-search modifiers for torrent indexers
    for (const mod of ENGLISH_MODIFIERS) {
      keywords.add(`${title} ${mod}`)
    }

    // Combined: title + year + quality (most specific query)
    const parts = [title]
    if (year) parts.push(String(year))
    if (quality && quality !== 'other') parts.push(quality)
    const combined = parts.join(' ')
    keywords.add(combined)
    keywords.add(`${combined} movie`)
  }

  /**
   * TV show keyword variants.
   * Adds season/episode and bilingual search terms.
   */
  private addTvKeywords(keywords: Set<string>, title: string, year?: number, quality?: Quality): void {
    keywords.add(`${title} tv`)
    keywords.add(`${title} 剧集`)
    keywords.add(`${title} complete`)
    keywords.add(`${title} season`)
    keywords.add(`${title} S01`)

    if (year) {
      keywords.add(`${title} ${year}`)
    }

    if (quality && quality !== 'other') {
      keywords.add(`${title} ${quality}`)
    }

    for (const mod of ENGLISH_MODIFIERS) {
      keywords.add(`${title} ${mod}`)
    }
  }

  /**
   * Anime keyword variants.
   * Adds anime-specific search modifiers, fansub indicators, and bilingual terms.
   */
  private addAnimeKeywords(keywords: Set<string>, title: string, year?: number, quality?: Quality): void {
    keywords.add(`${title} anime`)
    keywords.add(`${title} 动漫`)
    keywords.add(`${title} 番剧`)
    keywords.add(`${title} BD`)
    keywords.add(`${title} season`)

    if (year) {
      keywords.add(`${title} ${year}`)
    }

    if (quality && quality !== 'other') {
      keywords.add(`${title} ${quality}`)
    }

    for (const mod of ENGLISH_MODIFIERS) {
      keywords.add(`${title} ${mod}`)
    }
  }

  /**
   * Software keyword variants.
   * Adds "download" modifier and extracts/uses version info if present in title.
   */
  private addSoftwareKeywords(keywords: Set<string>, title: string): void {
    keywords.add(`${title} download`)
    keywords.add(`${title} 下载`)
    keywords.add(`${title} software`)
    keywords.add(`${title} crack`)
    keywords.add(`${title} portable`)

    // Extract version pattern from title if present (e.g. "Photoshop 25.0")
    const versionMatch = title.match(/\b(v?\d+(?:\.\d+)+)\b/i)
    if (versionMatch) {
      const version = versionMatch[1]
      keywords.add(`${title} ${version}`)
      keywords.add(`${title.replace(version, '').trim()} ${version} download`)
    }

    for (const mod of ENGLISH_MODIFIERS) {
      keywords.add(`${title} ${mod}`)
    }
  }

  /**
   * Music keyword variants.
   * Adds "album", "artist", "flac" and bilingual search terms.
   */
  private addMusicKeywords(keywords: Set<string>, title: string): void {
    keywords.add(`${title} album`)
    keywords.add(`${title} 专辑`)
    keywords.add(`${title} FLAC`)
    keywords.add(`${title} MP3`)
    keywords.add(`${title} discography`)

    // Try to separate artist and album if title contains " - " separator
    const separatorIdx = title.indexOf(' - ')
    if (separatorIdx > 0) {
      const artist = title.substring(0, separatorIdx).trim()
      const album = title.substring(separatorIdx + 3).trim()
      if (artist) keywords.add(`${artist} discography`)
      if (album) keywords.add(`${album} album`)
    }

    keywords.add(`${title} download`)
    keywords.add(`${title} torrent`)
  }

  /**
   * Generic fallback keywords for "other" resource types.
   */
  private addGenericKeywords(keywords: Set<string>, title: string): void {
    for (const mod of ENGLISH_MODIFIERS) {
      keywords.add(`${title} ${mod}`)
    }
    keywords.add(`${title} 下载`)
  }
}
