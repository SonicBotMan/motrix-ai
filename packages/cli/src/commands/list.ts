// commands/list.ts — motrix-ai list command
// View download queue, support filtering by status

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'
import type { TaskStatus } from '@motrix-ai/core'

/** Status icon mapping */
const STATUS_ICONS: Record<TaskStatus, string> = {
  downloading: '▶',
  paused: '⏸',
  completed: '✅',
  failed: '❌',
  pending: '⏳',
}

/** Format file size */
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
    .option('--status <status>', 'Filter by status: downloading/paused/completed/failed/pending')
    .description('List current download queue')
    .action(async (options: { status?: TaskStatus }) => {
      // Validate --status value
      if (options.status && !VALID_STATUSES.includes(options.status)) {
        console.error(`❌ Invalid status: ${options.status}`)
        console.error(`   Valid values: ${VALID_STATUSES.join('/')}`)
        process.exit(1)
      }

      const config = loadConfig()
      console.log('\n📥 Current task list:\n')

      try {
        const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url, rpcSecret: config.aria2.rpc_secret })
        const queue = new QueueManager(aria2)
        let tasks = await queue.listAll()

        // Filter by status
        if (options.status) {
          tasks = tasks.filter((t) => t.status === options.status)
        }

        if (tasks.length === 0) {
          const hint = options.status ? `No matching tasks` : 'No download tasks'
          console.log(`  (empty) ${hint}`)
          return
        }

        for (const t of tasks) {
          const icon = STATUS_ICONS[t.status] ?? '❓'
          const name = t.source_query || t.id
          const speed = t.status === 'downloading' && t.speed.down > 0 ? ` | ↓${formatSize(t.speed.down)}/s` : ''
          console.log(`  ${icon} ${name} | ${t.progress}%${speed}`)
        }

        console.log(`\n  Total: ${tasks.length} tasks`)
      } catch (_err) {
        console.log('  ⚠️ Cannot connect to aria2, please confirm aria2 is running.')
        console.log(`  Connecting to: ${config.aria2.rpc_url}`)
      }
    })
}
