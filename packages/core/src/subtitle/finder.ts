// subtitle/finder.ts — 字幕搜索与下载
// 对应 PRD §6.4 字幕发现与匹配

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { SubtitleEntry } from '../types.js'
import { FileRenamer } from '../file/renamer.js'
import { createLogger } from '../logger.js'

export { ShooterSource } from './shooter.js'
export { SubhdSource } from './subhd.js'

const logger = createLogger('subtitle:finder')

export interface SubtitleSource {
  readonly name: string
  search(_title: string, _year?: number, _language?: string): Promise<SubtitleResult[]>
}

export interface SubtitleResult {
  language: string
  filename: string
  downloadUrl: string
  source: string
}

export class SubtitleFinder {
  private sources: SubtitleSource[]
  private renamer = new FileRenamer()

  constructor(sources: SubtitleSource[]) {
    this.sources = sources
  }

  /**
   * 从文件名提取标题信息并搜索字幕；若提供 `videoPath`，将字幕写入磁盘。
   * @returns 最佳匹配的字幕，无匹配返回 null
   */
  async findBest(
    filename: string,
    preferredLanguages: string[] = ['zh-Hans', 'en'],
    videoPath?: string,
  ): Promise<SubtitleEntry | null> {
    const { title, year } = this.parseFilename(filename)

    for (const lang of preferredLanguages) {
      for (const source of this.sources) {
        try {
          const results = await source.search(title, year, lang)
          if (results.length > 0) {
            const best = results[0]
            const writtenPath = videoPath ? await this.downloadSubtitle(best, videoPath) : null
            return {
              language: best.language,
              path: writtenPath ?? best.filename,
              source: best.source,
            }
          }
        } catch (err) {
          logger.warn(`${source.name} failed: ${String(err)}`)
          continue
        }
      }
    }
    return null
  }

  /**
   * Fetch/decode `downloadUrl` and write beside the video.
   * Supports `data:` URLs (Shooter) and http(s) URLs.
   */
  private async downloadSubtitle(result: SubtitleResult, videoPath: string): Promise<string | null> {
    try {
      const bytes = await this.fetchBytes(result.downloadUrl)
      if (!bytes || bytes.byteLength === 0) return null

      const dest = this.renamer.generateSubtitlePath(videoPath, result.language)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, Buffer.from(bytes))
      return dest
    } catch (err) {
      logger.warn(`subtitle download failed (${result.source}): ${String(err)}`)
      return null
    }
  }

  private async fetchBytes(downloadUrl: string): Promise<Uint8Array | null> {
    if (downloadUrl.startsWith('data:')) {
      const comma = downloadUrl.indexOf(',')
      if (comma < 0) return null
      const meta = downloadUrl.slice(5, comma)
      const data = downloadUrl.slice(comma + 1)
      if (meta.includes(';base64')) {
        return Uint8Array.from(Buffer.from(data, 'base64'))
      }
      return Uint8Array.from(Buffer.from(decodeURIComponent(data), 'utf8'))
    }

    if (!/^https?:\/\//i.test(downloadUrl)) {
      logger.warn(`unsupported subtitle URL scheme: ${downloadUrl.slice(0, 32)}`)
      return null
    }

    const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }

  private parseFilename(filename: string): { title: string; year?: number } {
    const clean = filename
      .replace(/\.(mkv|mp4|avi|ts|mov)$/i, '')
      .replace(/\.(4K|1080p|720p|2160p|BluRay|WEB-DL|HDRip|REMUX)/gi, '')
      .replace(/\[(.*?)\]/g, '')
      .replace(/\((.*?)\)/g, (match) => {
        const year = match.slice(1, -1)
        if (/^\d{4}$/.test(year)) return ` ${year} `
        return ' '
      })
      .trim()

    const yearMatch = filename.match(/(?:^|\D)(\d{4})(?:\D|$)/)
    return {
      title: clean.replace(/\s+/g, ' ').trim(),
      year: yearMatch ? Number(yearMatch[1]) : undefined,
    }
  }
}
