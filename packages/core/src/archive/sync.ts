// archive/sync.ts — 归档同步到 NAS
// 对应 PRD §6.6 归档与备份

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import type { AppConfig, ArchiveTarget, ResourceType } from '../types.js'
import { createLogger } from '../logger.js'

const logger = createLogger('archive')

const execAsync = promisify(exec)

/** 单文件同步结果 */
export interface SyncResult {
  target: ArchiveTarget
  remotePath: string
}

/**
 * 归档同步管理器。
 *
 * 负责将下载完成的文件通过 rsync 同步到远程归档目标（如 NAS），
 * 支持按资源类型匹配归档目标，并测试连接连通性。
 *
 * 假定使用 SSH 密钥认证，rsync 命令中不包含明文密码。
 */
export class ArchiveSync {
  private config: AppConfig

  /**
   * @param config 应用配置（读取 archive.enabled 与 archive.targets）
   */
  constructor(config: AppConfig) {
    this.config = config
  }

  /**
   * 将单个文件同步到匹配的归档目标。
   *
   * 根据资源类型在已配置的 targets 中查找匹配项（target.match.resource_type
   * 未设置时视为通配），找到后通过 `rsync -avz --progress` 上传。
   *
   * @param filePath     源文件本地路径
   * @param resourceType 资源类型，用于匹配归档目标
   * @returns 成功时返回 `{ target, remotePath }`；未启用或无匹配目标时返回 `null`
   *
   * @example
   *   const result = await sync.syncFile("/downloads/Movies/a.mkv", "movie")
   *   // => { target: {...}, remotePath: "/volume1/movies/a.mkv" }
   */
  async syncFile(filePath: string, resourceType: ResourceType): Promise<SyncResult | null> {
    if (!this.config.archive.enabled) return null

    const target = this.findTarget(resourceType)
    if (!target) return null

    const fileName = path.basename(filePath)
    const remotePath = `${target.path.replace(/\/$/, '')}/${fileName}`

    const cmd = this.buildRsyncCommand(filePath, target)
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 })

    return { target, remotePath }
  }

  /**
   * 测试与归档目标的连接连通性。
   *
   * 使用 `rsync --dry-run --list-only` 执行空跑，不实际传输文件，
   * 仅验证 SSH 认证与远程路径是否可达。
   *
   * @param target 归档目标
   * @returns 连通返回 `true`，否则返回 `false`
   */
  async testConnection(target: ArchiveTarget): Promise<boolean> {
    try {
      const dest = `${target.host}:${target.path.replace(/\/$/, '')}/`
      const cmd = `rsync --dry-run --list-only ${this.escape(dest)}`
      await execAsync(cmd, { timeout: 15000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * 将多个文件批量同步到匹配的归档目标。
   *
   * 逐文件调用 {@link syncFile}；若某文件同步失败，记录警告后继续处理后续文件。
   *
   * @param files        源文件本地路径列表
   * @param resourceType 资源类型
   */
  async syncAll(files: string[], resourceType: ResourceType): Promise<void> {
    if (!this.config.archive.enabled) return

    for (const file of files) {
      try {
        await this.syncFile(file, resourceType)
      } catch (err) {
        // 单文件失败不影响后续文件同步
        logger.warn(`同步失败: ${file} — ${String(err)}`)
      }
    }
  }

  /**
   * 构建 rsync 命令字符串。
   *
   * 格式：`rsync -avz --progress <source> user@host:path/`
   * 使用 SSH 密钥认证（host 字段格式为 `user@host`，不含明文密码）。
   *
   * @param source 源文件本地路径
   * @param target 归档目标
   * @returns 完整的 rsync 命令字符串
   */
  private buildRsyncCommand(source: string, target: ArchiveTarget): string {
    const dest = `${target.host}:${target.path.replace(/\/$/, '')}/`
    return `rsync -avz --progress ${this.escape(source)} ${this.escape(dest)}`
  }

  /**
   * 根据资源类型查找匹配的归档目标。
   *
   * `target.match.resource_type` 未设置时视为通配，匹配任意资源类型；
   * 否则要求精确匹配。
   *
   * @param resourceType 资源类型
   * @returns 第一个匹配的目标；无匹配返回 `undefined`
   */
  private findTarget(resourceType: ResourceType): ArchiveTarget | undefined {
    return this.config.archive.targets.find((t) => !t.match.resource_type || t.match.resource_type === resourceType)
  }

  /**
   * 对路径或主机串进行 shell 转义，防止注入。
   * 仅含安全字符时直接返回，否则以单引号包裹并转义内部单引号。
   *
   * @param value 待转义的字符串
   * @returns 转义后的字符串
   */
  private escape(value: string): string {
    if (/^[A-Za-z0-9@._:/~-]+$/.test(value)) {
      return value
    }
    return `'${value.replace(/'/g, "'\\''")}'`
  }
}
