// ai/intent-parser.ts — 自然语言意图解析
// 对应 PRD §6.1 NL→结构化意图
// 已验证：OpenCode SDK JSON Schema 结构化输出

import type { DownloadIntent } from "../types.js";

interface IntentParserOptions {
  baseUrl?: string; // OpenCode server URL，默认 http://127.0.0.1:4096
}

/** JSON Schema for structured output */
const INTENT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "资源标题（电影名、软件名等）" },
    year: { type: "number", description: "年份（如果有）" },
    quality: { type: "string", enum: ["4K", "1080p", "720p", "other"], description: "清晰度" },
    need_subtitle: { type: "boolean", description: "是否需要字幕" },
    search_keywords: { type: "array", items: { type: "string" }, description: "搜索关键词列表" },
    resource_type: { type: "string", enum: ["movie", "tv", "software", "music", "other"], description: "资源类型" },
  },
  required: ["title", "search_keywords", "resource_type"],
} as const;

export class IntentParser {
  private client: any = null;
  private sessionId: string | null = null;
  private baseUrl: string;

  constructor(options: IntentParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:4096";
  }

  private async ensureClient() {
    if (this.client) return;
    const { createOpencodeClient } = await import("@opencode-ai/sdk");
    this.client = createOpencodeClient({ baseUrl: this.baseUrl });
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    await this.ensureClient();
    const res = await this.client.session.create();
    this.sessionId = res.data!.id as string;
    return this.sessionId;
  }

  /**
   * 将自然语言解析为结构化意图
   * @example
   *   const intent = await parser.parse("下流浪地球 2 4K 字幕版");
   *   // { title: "流浪地球 2", year: 2023, quality: "4K", need_subtitle: true, ... }
   */
  async parse(input: string): Promise<DownloadIntent> {
    await this.ensureClient();
    const sessionId = await this.ensureSession();

    const result = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{
          type: "text",
          text: `分析用户的下载意图，返回结构化 JSON。

用户输入：「${input}」`,
        }],
        format: {
          type: "json_schema",
          schema: INTENT_SCHEMA,
          retryCount: 2,
        },
      },
    });

    const structured = (result.data as any)?.info?.structured;
    if (!structured?.title || !structured?.search_keywords) {
      throw new Error(
        `意图解析失败: ${JSON.stringify((result.data as any)?.info?.error ?? "unknown error")}`
      );
    }

    return {
      title: structured.title,
      year: structured.year,
      quality: structured.quality ?? "other",
      need_subtitle: structured.need_subtitle ?? false,
      search_keywords: structured.search_keywords,
      resource_type: structured.resource_type ?? "other",
    };
  }
}
