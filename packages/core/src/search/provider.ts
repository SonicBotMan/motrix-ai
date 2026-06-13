// search/provider.ts — 搜索 Provider 抽象
// 对应 PRD §6.1 Search Providers 并发查询

import type { SearchResult, DownloadIntent } from "../types.js";
import { BtdigSearchProvider } from "./btdig.js";
import { MikanSearchProvider } from "./mikan.js";

export { BtdigSearchProvider } from "./btdig.js";
export { MikanSearchProvider } from "./mikan.js";
export { DuckDuckGoSearchProvider } from "./duckduckgo.js";

/** 搜索 Provider 接口 */
export interface SearchProvider {
  readonly name: string;
  search(keywords: string[], intent: DownloadIntent): Promise<SearchResult[]>;
}

/** 并发查询所有 Provider，合并结果 */
export async function searchAll(
  providers: SearchProvider[],
  intent: DownloadIntent
): Promise<SearchResult[]> {
  const results = await Promise.allSettled(
    providers.map((p) => p.search(intent.search_keywords, intent))
  );

  const all: SearchResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  return all.sort((a, b) => {
    // 优先 seeders 多的，其次 size 大的（避免假种子）
    const seedersDiff = b.seeders - a.seeders;
    if (seedersDiff !== 0) return seedersDiff;
    return b.size - a.size;
  });
}

// DuckDuckGoSearchProvider is now implemented in duckduckgo.js
// and re-exported above.
