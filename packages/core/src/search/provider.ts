// search/provider.ts — 搜索 Provider 抽象
// 对应 PRD §6.1 Search Providers 并发查询

import type { SearchResult, DownloadIntent } from '../types.js'
import { createLogger } from '../logger.js'

export { BtdigSearchProvider } from './btdig.js'
export { MikanSearchProvider } from './mikan.js'
export { NyaaSearchProvider } from './nyaa.js'
export { DuckDuckGoSearchProvider } from './duckduckgo.js'

const logger = createLogger('search:aggregator')

/** 搜索 Provider 接口 */
export interface SearchProvider {
  readonly name: string
  search(_keywords: string[], _intent: DownloadIntent): Promise<SearchResult[]>
}

/** 并发查询所有 Provider，合并结果 */
export async function searchAll(providers: SearchProvider[], intent: DownloadIntent): Promise<SearchResult[]> {
  const results = await Promise.allSettled(providers.map((p) => p.search(intent.search_keywords, intent)))

  const all: SearchResult[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const name = providers[i]?.name ?? `provider-${i}`
    if (r.status === 'fulfilled') {
      all.push(...r.value)
    } else {
      logger.warn(`${name} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
    }
  }

  return all.sort((a, b) => {
    // 优先 seeders 多的，其次 size 大的（避免假种子）
    const seedersDiff = b.seeders - a.seeders
    if (seedersDiff !== 0) return seedersDiff
    return b.size - a.size
  })
}

// DuckDuckGoSearchProvider is now implemented in duckduckgo.js
// and re-exported above.
