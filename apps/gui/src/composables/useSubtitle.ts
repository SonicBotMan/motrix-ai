// src/composables/useSubtitle.ts
// Subtitle search composable — searches OpenSubtitles for movie/TV subtitles

import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface SubtitleResult {
  id: string
  language: string
  languageCode: string
  fileName: string
  downloadUrl: string
  format: 'srt' | 'ass' | 'sub'
  rating: number
  downloadCount: number
  source: string
  fps?: number
  uploadDate?: string
}

// ---- Settings ----

const SETTINGS_KEY = 'motrix-ai:opensubtitles-api-key'

function getApiKey(): string {
  return localStorage.getItem(SETTINGS_KEY) || ''
}

export function setApiKey(key: string): void {
  if (key) {
    localStorage.setItem(SETTINGS_KEY, key)
  } else {
    localStorage.removeItem(SETTINGS_KEY)
  }
}

export function hasApiKey(): boolean {
  return !!getApiKey()
}

// ---- Rate Limiter (max 5 requests/second for authenticated) ----

class RateLimiter {
  private queue: Array<() => void> = []
  private timestamps: number[] = []
  private readonly maxPerSecond = 5

  async acquire(): Promise<void> {
    const now = Date.now()
    // Remove timestamps older than 1 second
    this.timestamps = this.timestamps.filter(t => now - t < 1000)

    if (this.timestamps.length < this.maxPerSecond) {
      this.timestamps.push(now)
      return
    }

    // Need to wait until we can make a request
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.timestamps.push(Date.now())
        resolve()
      })
      this.processQueue()
    })
  }

  private processQueue(): void {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < 1000)

    while (this.queue.length > 0 && this.timestamps.length < this.maxPerSecond) {
      const next = this.queue.shift()!
      next()
    }

    if (this.queue.length > 0) {
      // Schedule next check after the oldest timestamp expires
      const oldestInWindow = this.timestamps[0] || now
      const waitMs = 1000 - (now - oldestInWindow) + 10
      setTimeout(() => this.processQueue(), Math.max(waitMs, 50))
    }
  }
}

const rateLimiter = new RateLimiter()

// ---- Search Cache (5 min TTL) ----

interface CacheEntry {
  results: SubtitleResult[]
  timestamp: number
}

const searchCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(query: string, languages: string[]): string {
  return `${query.toLowerCase().trim()}|${languages.slice().sort().join(',')}`
}

function getCachedResults(query: string, languages: string[]): SubtitleResult[] | null {
  const key = getCacheKey(query, languages)
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key)
    return null
  }
  return entry.results
}

function setCachedResults(query: string, languages: string[], results: SubtitleResult[]): void {
  const key = getCacheKey(query, languages)
  searchCache.set(key, { results, timestamp: Date.now() })
}

// ---- OpenSubtitles API (via Tauri proxy) ----

/** Language name mapping for display */
const LANGUAGE_NAMES: Record<string, string> = {
  zh: '简体中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  'pt-BR': 'Português (BR)',
  it: 'Italiano',
  ru: 'Русский',
  ar: 'العربية',
  th: 'ไทย',
  vi: 'Tiếng Việt',
}

/** Detect subtitle format from filename */
function detectFormat(fileName: string): 'srt' | 'ass' | 'sub' {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass'
  if (lower.endsWith('.sub') || lower.endsWith('.idx')) return 'sub'
  return 'srt' // default, covers .srt and anything else
}

/**
 * Search OpenSubtitles for subtitles matching the query.
 * Uses Tauri command to avoid CORS issues.
 */
async function searchOpenSubtitles(
  query: string,
  languages: string[] = ['zh', 'en'],
): Promise<SubtitleResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error(
      'OpenSubtitles API key not configured. Please set your API key in Settings.',
    )
  }

  await rateLimiter.acquire()

  const langParam = languages.join(',')
  const response = await invoke<Record<string, unknown>>('opensubtitles_search', {
    apiKey,
    query,
    languages: langParam,
  })

  // Parse OpenSubtitles response format
  const data = response as Record<string, unknown>
  const rawData = data['data']
  if (!rawData || !Array.isArray(rawData)) {
    console.warn('Unexpected OpenSubtitles response format:', data)
    return []
  }

  const results: SubtitleResult[] = []

  for (const item of rawData as Record<string, unknown>[]) {
    try {
      const attributes = item['attributes'] as Record<string, unknown> | undefined
      if (!attributes) continue

      const _featureDetails = (attributes['feature_details'] as Record<string, unknown>) || {}
      const files = attributes['files'] as Array<Record<string, unknown>> | undefined
      if (!files || files.length === 0) continue

      const file = files[0]
      const fileId = String(file['file_id'] || item['id'] || '')
      const fileName = String(file['file_name'] || 'subtitle.srt')
      const langCode = String(attributes['language'] || 'en')

      results.push({
        id: fileId,
        language: LANGUAGE_NAMES[langCode] || langCode,
        languageCode: langCode,
        fileName,
        downloadUrl: '', // Will be obtained via download API
        format: detectFormat(fileName),
        rating: Number(attributes['ratings'] ?? 0),
        downloadCount: Number(attributes['download_count'] ?? 0),
        source: 'opensubtitles',
        fps: attributes['fps'] ? Number(attributes['fps']) : undefined,
        uploadDate: attributes['upload_date']
          ? String(attributes['upload_date']).split(' ')[0]
          : undefined,
      })
    } catch (parseErr) {
      console.warn('Failed to parse subtitle result:', parseErr, item)
    }
  }

  return results
}

// ---- Composable ----

export function useSubtitle() {
  const subtitleResults = ref<SubtitleResult[]>([])
  const searching = ref(false)
  const downloading = ref(false)
  const selectedLanguage = ref<string>('zh')
  const selectedLanguages = ref<string[]>(['zh', 'en'])
  const autoSearch = ref(true) // Auto-search when download completes
  const error = ref<string | null>(null)

  const apiKeyConfigured = computed(() => hasApiKey())

  /**
   * Search for subtitles matching the given title.
   */
  const searchSubtitles = async (
    title: string,
    languages?: string[],
  ): Promise<void> => {
    searching.value = true
    error.value = null
    subtitleResults.value = []

    try {
      if (!hasApiKey()) {
        error.value =
          'OpenSubtitles API key not configured. Please add your API key in Settings (opensubtitles.com/api).'
        return
      }

      const langs = languages || selectedLanguages.value

      // Check cache first
      const cached = getCachedResults(title, langs)
      if (cached) {
        subtitleResults.value = cached
        return
      }

      const results = await searchOpenSubtitles(title, langs)

      // Sort by rating and download count
      results.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating
        return b.downloadCount - a.downloadCount
      })

      // Cache the results
      setCachedResults(title, langs, results)

      subtitleResults.value = results
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('Subtitle search failed:', e)
      error.value = message
      subtitleResults.value = []
    } finally {
      searching.value = false
    }
  }

  /**
   * Download a specific subtitle and save it alongside the video.
   * Uses OpenSubtitles download API via Tauri command.
   */
  const downloadSubtitleFile = async (
    subtitle: SubtitleResult,
    videoPath: string,
  ): Promise<string | null> => {
    downloading.value = true

    try {
      const apiKey = getApiKey()
      if (!apiKey) {
        throw new Error('OpenSubtitles API key not configured.')
      }

      // Get the directory of the video file
      const lastSep = Math.max(videoPath.lastIndexOf('/'), videoPath.lastIndexOf('\\'))
      const videoDir = videoPath.substring(0, lastSep)
      const subtitlePath = `${videoDir}/${subtitle.fileName}`

      // Use OpenSubtitles download API to get the subtitle file
      await rateLimiter.acquire()

      const responseStr = await invoke<string>('opensubtitles_download', {
        apiKey,
        subtitleId: subtitle.id,
        fileName: subtitle.fileName,
      })

      const response = JSON.parse(responseStr) as {
        file_name: string
        content_base64: string
      }

      // Decode base64 and save via Tauri file command
      const contentBytes = Uint8Array.from(atob(response.content_base64), c =>
        c.charCodeAt(0),
      )

      const savedPath = await invoke<string>('save_file', {
        path: subtitlePath,
        content: Array.from(contentBytes),
      })

      return savedPath
    } catch (e) {
      console.error('Subtitle download failed:', e)
      error.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      downloading.value = false
    }
  }

  /**
   * Get the best subtitle for a given language.
   */
  const getBestSubtitle = (language?: string): SubtitleResult | null => {
    const lang = language || selectedLanguage.value
    const filtered = subtitleResults.value.filter(s =>
      s.languageCode.startsWith(lang),
    )
    if (filtered.length === 0) return null
    return filtered[0] // Already sorted by rating
  }

  /**
   * Clear search results and error.
   */
  const clearResults = () => {
    subtitleResults.value = []
    error.value = null
  }

  return {
    subtitleResults,
    searching,
    downloading,
    selectedLanguage,
    selectedLanguages,
    autoSearch,
    error,
    apiKeyConfigured,
    searchSubtitles,
    downloadSubtitleFile,
    getBestSubtitle,
    clearResults,
    setApiKey,
    hasApiKey,
  }
}
