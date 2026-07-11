// pipeline/post-processor.ts — 下载后处理管线
// 对应 PRD §6.4–6.6 字幕 → 重命名 → 归类 → 归档

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { AppConfig, DownloadIntent, ResourceType, SubtitleEntry, Task } from '../types.js'
import type { SubtitleFinder } from '../subtitle/finder.js'
import type { FileRenamer } from '../file/renamer.js'
import type { FileOrganizer } from '../file/organizer.js'
import type { TemplateEngine } from '../file/templates.js'
import type { ArchiveSync } from '../archive/sync.js'
import { createLogger } from '../logger.js'

const logger = createLogger('post-processor')

/** PostProcessor 所需的依赖集合（依赖注入） */
export interface PostProcessorDeps {
  subtitleFinder: SubtitleFinder
  fileRenamer: FileRenamer
  fileOrganizer: FileOrganizer
  templateEngine: TemplateEngine
  archiveSync: ArchiveSync
}

/** 视频文件扩展名集合 */
const VIDEO_EXTS = new Set(['mkv', 'mp4', 'avi', 'ts', 'mov'])

/**
 * 下载后处理管线。
 *
 * 按顺序执行：字幕发现 → 模板重命名 → 文件归类 → 归档同步，
 * 返回带有字幕信息的更新后的 Task。
 *
 * 任何子步骤失败（字幕未找到、重命名冲突、归档不可达等）不会中断
 * 后续步骤——仅记录警告，管线继续处理剩余文件。
 */
export class PostProcessor {
  private config: AppConfig
  private deps: PostProcessorDeps

  /**
   * @param config 应用配置
   * @param deps   管线各步骤所需的依赖实例
   */
  constructor(config: AppConfig, deps: PostProcessorDeps) {
    this.config = config
    this.deps = deps
  }

  /**
   * 对已完成的下载任务执行完整后处理管线。
   *
   * 流程：
   * 1. **字幕发现** — 若 `intent.need_subtitle` 为 `true`，为首个视频文件查找字幕。
   * 2. **重命名** — 使用模板引擎将文件名规范化。
   * 3. **归类** — 移动到正确的目标目录。
   * 4. **归档** — 若归档已启用，同步到 NAS。
   * 5. 返回更新后的 Task（包含 subtitle 信息与最终文件路径）。
   *
   * @param task 已完成（或部分完成）的下载任务
   * @returns 更新后的 Task
   */
  async process(task: Task): Promise<Task> {
    const resourceType = task.intent?.resource_type ?? 'other'

    // ── Step 1: 字幕发现 ──────────────────────────────────────
    let subtitle: SubtitleEntry | null = null
    if (task.intent?.need_subtitle) {
      const video = this.findVideoFile(task.files)
      if (video) {
        const subtitleDir = this.config.subtitles.subtitle_dir ?? path.dirname(video.path)
        subtitle = await this.findSubtitle(video.name, this.config.subtitles.preferred_languages, subtitleDir)
      }
    }

    // ── Step 2–4: 对每个文件执行 重命名 → 归类 → 归档 ────────
    const updatedFiles = task.files.map((f) => ({ ...f }))

    for (const file of updatedFiles) {
      let currentPath = file.path

      // Step 2: 模板重命名
      if (task.intent) {
        currentPath = await this.renameFile(currentPath, task.intent)
      }

      // Step 3: 归类移动
      if (task.intent) {
        currentPath = await this.organizeFile(currentPath, task.intent, this.config)
      }

      // Step 4: 归档同步
      if (this.config.archive.enabled) {
        await this.archiveFile(currentPath, resourceType)
      }

      file.path = currentPath
    }

    // ── Step 5: 返回更新后的 Task ─────────────────────────────
    return {
      ...task,
      files: updatedFiles,
      ...(subtitle ? { subtitle } : {}),
    }
  }

  /**
   * 查找并下载字幕。
   *
   * 委托 {@link SubtitleFinder.findBest} 按偏好语言顺序搜索，
   * 任一来源抛出异常时捕获并返回 `null`。
   *
   * @param filename  视频文件名
   * @param languages 偏好语言列表（如 `["zh-Hans", "en"]`）
   * @returns 字幕条目；未找到返回 `null`
   */
  private async findSubtitle(
    filename: string,
    languages: string[],
    subtitleDir: string,
  ): Promise<SubtitleEntry | null> {
    let entry: SubtitleEntry | null
    try {
      entry = await this.deps.subtitleFinder.findBest(filename, languages)
    } catch (err) {
      logger.warn(`字幕查找失败: ${filename} — ${String(err)}`)
      return null
    }

    if (!entry) return null

    try {
      await fs.mkdir(subtitleDir, { recursive: true })
      const destPath = path.join(subtitleDir, entry.path)
      let buffer: Buffer

      if (entry.downloadUrl.startsWith('data:')) {
        const base64 = entry.downloadUrl.split(',')[1] ?? ''
        buffer = Buffer.from(base64, 'base64')
      } else {
        const response = await fetch(entry.downloadUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        buffer = Buffer.from(await response.arrayBuffer())
      }

      await fs.writeFile(destPath, buffer)
      entry.path = destPath
    } catch (err) {
      logger.warn(`字幕下载失败: ${entry.path} — ${String(err)}`)
    }

    return entry
  }

  /**
   * 使用模板引擎对文件进行重命名。
   *
   * 从 intent 提取变量（title / year / quality / ext），通过
   * {@link TemplateEngine.renderPath} 渲染目标路径，取最后一段作为新文件名，
   * 在文件所在目录内原地重命名（不跨目录移动）。
   *
   * @param filePath 当前文件路径
   * @param intent   下载意图
   * @returns 重命名后的路径；渲染结果为空或重命名失败时返回原路径
   */
  private async renameFile(filePath: string, intent: DownloadIntent): Promise<string> {
    const dir = path.dirname(filePath)
    const originalName = path.basename(filePath)
    const ext = this.extractExt(originalName)

    const vars: Record<string, string> = {
      title: intent.title,
      year: intent.year?.toString() ?? '',
      quality: intent.quality ?? '',
      ext,
      filename: originalName,
    }

    const rendered = this.deps.templateEngine.renderPath(intent.resource_type, vars)
    // 取模板渲染结果的最后一段作为新文件名（目录结构由 organize 步骤处理）
    const segments = rendered.split('/').filter((s) => s.length > 0)
    const newName = segments.length > 0 ? segments[segments.length - 1] : originalName

    if (newName === originalName) {
      return filePath
    }

    const newPath = path.join(dir, newName)
    try {
      await fs.rename(filePath, newPath)
      return newPath
    } catch (err) {
      logger.warn(`重命名失败: ${filePath} — ${String(err)}`)
      return filePath
    }
  }

  /**
   * 将文件归类移动到正确的目标目录。
   *
   * 委托 {@link FileOrganizer.organize}，根据资源类型与配置解析目标目录，
   * 递归创建目录并处理同名冲突。
   *
   * @param filePath 当前文件路径
   * @param intent   下载意图
   * @param config   应用配置
   * @returns 移动后的最终路径；移动失败时返回原路径
   */
  private async organizeFile(filePath: string, intent: DownloadIntent, config: AppConfig): Promise<string> {
    try {
      return await this.deps.fileOrganizer.organize(filePath, intent, config)
    } catch (err) {
      logger.warn(`归类失败: ${filePath} — ${String(err)}`)
      return filePath
    }
  }

  /**
   * 将文件同步到归档目标（NAS）。
   *
   * 委托 {@link ArchiveSync.syncFile}；同步失败时仅记录警告，不阻断管线。
   *
   * @param filePath     文件路径
   * @param resourceType 资源类型
   */
  private async archiveFile(filePath: string, resourceType: ResourceType): Promise<void> {
    try {
      await this.deps.archiveSync.syncFile(filePath, resourceType)
    } catch (err) {
      logger.warn(`归档失败: ${filePath} — ${String(err)}`)
    }
  }

  /**
   * 从文件列表中查找第一个视频文件。
   *
   * @param files 文件列表
   * @returns 第一个视频文件条目；无视频文件返回 `undefined`
   */
  private findVideoFile(files: Task['files']): Task['files'][number] | undefined {
    return files.find((f) => VIDEO_EXTS.has(this.extractExt(f.name)))
  }

  /**
   * 提取文件扩展名（不含点，小写）；无扩展名返回 `"bin"`。
   *
   * @param filename 文件名
   * @returns 扩展名
   */
  private extractExt(filename: string): string {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()!.toLowerCase() : 'bin'
  }
}
