// commands/list.ts — motrix-ai list 命令
// 查看下载队列，支持按状态过滤

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'
import type { TaskStatus } from '@motrix-ai/core'

/** 状态图标映射 */
const STATUS_ICONS: Record<TaskStatus, string> = {
  downloading: '▶',
  paused: '⏸',
  completed: '✅',
  failed: '❌',
  pending: '⏳',
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Register the `list` command on the program.
 *
 * Lists all download tasks from aria2, optionally filtered by status.
 * Displays a pretty table with status icon, name, progress, and speed.
 *
 * @param program - The commander program instance
 */
export function registerListCommand(program: Command): void {
  const VALID_STATUSES: TaskStatus[] = ['downloading', 'paused', 'completed', 'failed', 'pending']

  program
    .command('list')
    .option('--status <status>', '按状态过滤: downloading/paused/completed/failed/pending')
    .description('查看当前下载队列')
    .action(async (options: { status?: TaskStatus }) => {
      // 验证 --status 值
      if (options.status && !VALID_STATUSES.includes(options.status)) {
        console.error(`❌ 无效的状态值: ${options.status}`)
        console.error(`   有效值: ${VALID_STATUSES.join('/')}`)
        process.exit(1)
      }

      const config = loadConfig()
      console.log('\n📥 当前任务列表:\n')

      try {
        const aria2 = new Aria2Client({
          rpcUrl: config.aria2.rpc_url,
          rpcSecret: config.aria2.rpc_secret,
        })
        const queue = new QueueManager(aria2)
        let tasks = await queue.listAll()

        // 按状态过滤
        if (options.status) {
          tasks = tasks.filter((t) => t.status === options.status)
        }

        if (tasks.length === 0) {
          const hint = options.status ? `没有状态为 "${options.status}" 的任务` : '没有下载任务'
          console.log(`  (空) ${hint}`)
          return
        }

        for (const t of tasks) {
          const icon = STATUS_ICONS[t.status] ?? '❓'
          const name = t.source_query || t.id
          const speed = t.status === 'downloading' && t.speed.down > 0 ? ` | ↓${formatSize(t.speed.down)}/s` : ''
          console.log(`  ${icon} ${name} | ${t.progress}%${speed}`)
        }

        console.log(`\n  共 ${tasks.length} 个任务`)
      } catch {
        console.log('  ⚠️ 无法连接 aria2，请确认 aria2 已启动。')
        console.log(`  尝试连接: ${config.aria2.rpc_url}`)
      }
    })
}
