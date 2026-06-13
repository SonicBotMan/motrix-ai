// src/composables/useSearch.ts
// Search composable — fetches torrent resources from Btdig, Mikan, 1337x, Nyaa, and TorrentGalaxy via Tauri proxy

import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface SearchResult {
  title: string
  magnet: string
  size: number
  seeders: number
  leechers: number
  source: string
  quality?: '4K' | '1080p' | '720p' | 'other'
}

interface DownloadIntent {
  title: string
  year?: number | null
  quality: '4K' | '1080p' | '720p' | 'other'
  need_subtitle: boolean
  search_keywords: string[]
  resource_type: 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
  raw_input?: string
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  source: string
}

// ---- Helpers ----

/** Format bytes to human-readable size */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ---- Search via Tauri Proxy ----

/**
 * Search using Tauri backend proxy (avoids CORS issues).
 */
async function searchViaProxy(query: string, source: string): Promise<SearchResult[]> {
  try {
    const response = await invoke<SearchResponse>('search_proxy', {
      query,
      source,
      page: 0,
    })
    return response.results
  } catch (e) {
    console.error(`Search via ${source} failed:`, e)
    return []
  }
}

// ---- Composable ----

export function useSearch() {
  const searchResults = ref<SearchResult[]>([])
  const searching = ref(false)

  /**
   * Search all providers for resources matching the given intent.
   * Results are merged, deduplicated, and sorted.
   */
  const searchResources = async (intent: DownloadIntent): Promise<void> => {
    searching.value = true
    searchResults.value = []

    try {
      // Use primary search keyword (the cleaned title)
      const query = intent.search_keywords[0] || intent.title

      // Determine which sources to query based on resource type
      // Anime queries benefit from nyaa and mikan; general queries use all
      const sources: string[] = ['btdig', '1337x', 'torrentgalaxy']

      // Always include mikan (general-purpose RSS)
      sources.push('mikan')

      // Include nyaa for anime or as a general supplement
      if (intent.resource_type === 'anime') {
        // nyaa first for anime
        sources.unshift('nyaa')
      } else {
        sources.push('nyaa')
      }

      // Run all providers in parallel via Tauri proxy
      const settled = await Promise.allSettled(
        sources.map((source) => searchViaProxy(query, source))
      )

      // Collect results per source for logging
      const perSource: Record<string, SearchResult[]> = {}
      sources.forEach((source, i) => {
        const result = settled[i]
        perSource[source] = result.status === 'fulfilled' ? result.value : []
      })

      const totalFound = Object.entries(perSource)
        .map(([k, v]) => `${v.length} from ${k}`)
        .join(', ')
      console.log(`Search results: ${totalFound}`)

      // Merge all results (preserving source order)
      const allSources = [...perSource.btdig, ...perSource['1337x'], ...perSource.nyaa, ...perSource.torrentgalaxy, ...perSource.mikan]

      // Deduplicate by magnet hash
      const seen = new Set<string>()
      const all: SearchResult[] = []

      for (const r of allSources) {
        // Extract btih from magnet URI for dedup
        const hashMatch = r.magnet.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i)
        const hash = hashMatch ? hashMatch[1].toLowerCase() : r.magnet

        if (!seen.has(hash)) {
          seen.add(hash)
          all.push(r)
        }
      }

      // Sort: seeders desc, then size desc
      all.sort((a, b) => {
        if (b.seeders !== a.seeders) return b.seeders - a.seeders
        return b.size - a.size
      })

      searchResults.value = all
    } catch (e) {
      console.error('Search failed:', e)
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }

  return {
    searchResults,
    searching,
    searchResources,
  }
}
