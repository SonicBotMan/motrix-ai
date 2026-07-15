// ai/intent-parser.ts — 自然语言意图解析
// 对应 PRD §6.1 NL→结构化意图
// 已验证：OpenCode SDK JSON Schema 结构化输出

import type { DownloadIntent, Quality, ResourceType } from '../types.js'

interface IntentParserOptions {
  baseUrl?: string // OpenCode server URL，默认 http://127.0.0.1:4096
}

/** JSON Schema for structured output */
const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '资源标题（电影名、软件名等）' },
    year: { type: 'number', description: '年份（如果有）' },
    quality: { type: 'string', enum: ['4K', '1080p', '720p', 'other'], description: '清晰度' },
    need_subtitle: { type: 'boolean', description: '是否需要字幕' },
    search_keywords: { type: 'array', items: { type: 'string' }, description: '搜索关键词列表' },
    resource_type: {
      type: 'string',
      enum: ['movie', 'tv', 'software', 'music', 'anime', 'other'],
      description: '资源类型',
    },
  },
  required: ['title', 'search_keywords', 'resource_type'],
} as const

export class IntentParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK client has complex union types
  private client: any = null
  private sessionId: string | null = null
  private baseUrl: string

  constructor(options: IntentParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:4096'
  }

  private async ensureClient() {
    if (this.client) return
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    this.client = createOpencodeClient({ baseUrl: this.baseUrl })
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    await this.ensureClient()
    const res = await this.client!.session.create()
    this.sessionId = res.data!.id as string
    return this.sessionId
  }

  /** 内置启发式解析（不依赖 OpenCode，用于 fallback） */
  private parseHeuristic(input: string): DownloadIntent {
    const clean = input
      .replace(/^(下[载个]?|下载|给我[下找]|搜[索找]?|download|get|find)\s*/i, '')
      .replace(/(最新版|最新|免费版|破解版|绿色版|官方版|中文版|英文版|正式版)/gi, '')
      .trim()

    // 质量检测
    let quality: DownloadIntent['quality'] = 'other'
    if (/4k|2160p|uhd/i.test(clean)) quality = '4K'
    else if (/1080[pi]/i.test(clean)) quality = '1080p'
    else if (/720[pi]/i.test(clean)) quality = '720p'

    // 字幕检测
    const need_subtitle = /字幕|subtitle|sub/i.test(clean)

    // 资源类型检测
    let resource_type: DownloadIntent['resource_type'] = 'other'
    if (/动漫|anime|番剧|新番|OVA|OAD/i.test(clean)) {
      resource_type = 'anime'
    } else if (/\.(mkv|mp4|avi|ts|mov)|电影|movie|film|剧|tv|番/i.test(clean)) {
      resource_type = /剧|tv|season|S\d/i.test(clean) ? 'tv' : 'movie'
    } else if (/\.(exe|dmg|deb|rpm|app)|软件|software|tool|installer/i.test(clean)) {
      resource_type = 'software'
    } else if (/\.(mp3|flac|wav)|音乐|music|album|专辑/i.test(clean)) {
      resource_type = 'music'
    }

    // 标题提取：去除质量/字幕/类型关键词后取主干
    const title =
      clean
        .replace(/(4k|2160p|uhd|1080[pi]|720[pi])/gi, '')
        .replace(/(字幕|subtitle|sub)/gi, '')
        .replace(/(bluray|web-dl|hdrip|remux|dvdrip)/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || input

    // 年份检测
    const yearMatch = clean.match(/(?:^|\D)(\d{4})(?:\D|$)/)
    const year = yearMatch ? Number(yearMatch[1]) : undefined

    // 搜索关键词：原始输入 + 提取的标题
    const keywords = [title]
    if (quality !== 'other') keywords.push(`${title} ${quality}`)
    if (resource_type === 'movie') keywords.push(`${title} movie torrent`)
    if (year) keywords.push(`${title} ${year}`)

    return {
      title,
      year,
      quality,
      need_subtitle,
      search_keywords: [...new Set(keywords)],
      resource_type,
    }
  }

  /**
   * 将自然语言解析为结构化意图
   * @example
   *   const intent = await parser.parse("下流浪地球 2 4K 字幕版");
   *   // { title: "流浪地球 2", year: 2023, quality: "4K", need_subtitle: true, ... }
   */
  async parse(input: string): Promise<DownloadIntent> {
    try {
      await this.ensureClient()
      const sessionId = await this.ensureSession()

      const result = await this.client!.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: 'text',
              text: `分析用户的下载意图，返回结构化 JSON。

用户输入：「${input}」`,
            },
          ],
          format: {
            type: 'json_schema',
            schema: INTENT_SCHEMA,
            retryCount: 2,
          },
        },
      })

      interface StructuredResult {
        title: string
        year?: number
        quality?: Quality
        need_subtitle?: boolean
        search_keywords: string[]
        resource_type?: ResourceType
      }

      const data = result.data as Record<string, unknown> | undefined
      const info = data?.['info'] as Record<string, unknown> | undefined
      const structured = info?.['structured'] as StructuredResult | undefined
      if (!structured?.title || !structured?.search_keywords) {
        // OpenCode 返回无效结果，使用启发式解析
        return this.parseHeuristic(input)
      }

      return {
        title: structured.title,
        year: structured.year,
        quality: structured.quality ?? 'other',
        need_subtitle: structured.need_subtitle ?? false,
        search_keywords: structured.search_keywords,
        resource_type: structured.resource_type ?? 'other',
      }
    } catch {
      console.warn('[intent-parser] OpenCode unavailable, falling back to heuristic')
      // OpenCode 不可用,使用内置启发式解析. Error logged above.
      return this.parseHeuristic(input)
    }
  }
}
