// subtitle/finder.ts — 字幕搜索与下载
// 对应 PRD §6.4 字幕发现与匹配

import type { SubtitleEntry } from "../types.js";

export { ShooterSource } from "./shooter.js";
export { SubhdSource } from "./subhd.js";

export interface SubtitleSource {
  readonly name: string;
  search(title: string, year?: number, language?: string): Promise<SubtitleResult[]>;
}

export interface SubtitleResult {
  language: string;
  filename: string;
  downloadUrl: string;
  source: string;
}

export class SubtitleFinder {
  private sources: SubtitleSource[];

  constructor(sources: SubtitleSource[]) {
    this.sources = sources;
  }

  /**
   * 从文件名提取标题信息并搜索字幕
   * @returns 最佳匹配的字幕，无匹配返回 null
   */
  async findBest(filename: string, preferredLanguages: string[] = ["zh-Hans", "en"]): Promise<SubtitleEntry | null> {
    const { title, year } = this.parseFilename(filename);

    for (const lang of preferredLanguages) {
      for (const source of this.sources) {
        try {
          const results = await source.search(title, year, lang);
          if (results.length > 0) {
            const best = results[0];
            return {
              language: best.language,
              path: best.filename,
              source: best.source,
            };
          }
        } catch {
          // 单源失败不影响其他源
          continue;
        }
      }
    }
    return null;
  }

  private parseFilename(filename: string): { title: string; year?: number } {
    // 简单提取：去掉扩展名和常见的质量/编码标识
    const clean = filename
      .replace(/\.(mkv|mp4|avi|ts|mov)$/i, "")
      .replace(/\.(4K|1080p|720p|2160p|BluRay|WEB-DL|HDRip|REMUX)/gi, "")
      .replace(/\[(.*?)\]/g, "")
      .replace(/\((.*?)\)/g, (match) => {
        const year = match.slice(1, -1);
        if (/^\d{4}$/.test(year)) return ` ${year} `;
        return " ";
      })
      .trim();

    const yearMatch = filename.match(/(?:^|\D)(\d{4})(?:\D|$)/);
    return {
      title: clean.replace(/\s+/g, " ").trim(),
      year: yearMatch ? Number(yearMatch[1]) : undefined,
    };
  }
}
