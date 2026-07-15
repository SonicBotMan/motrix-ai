// commands/pause.ts — motrix-ai pause / resume / remove / pause-all / resume-all 命令

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'

/** 从 config 创建 QueueManager 实例 */
function createQueue() {
  const config = loadConfig()
  const aria2 = new Aria2Client({
    rpcUrl: config.aria2.rpc_url,
    rpcSecret: config.aria2.rpc_secret,
  })
  return { queue: new QueueManager(aria2), rpcUrl: config.aria2.rpc_url }
}

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('network') ||
    msg.includes('connect') ||
    msg.includes('rpc error: aria2 rpc error') // HTTP layer failed entirely
  )
}

/** 打印 aria2 连接失败提示，区分连接错误和 RPC 错误（QA #6 修复） */
function printCommandError(err: unknown, rpcUrl: string, action: string): void {
  if (isConnectionError(err)) {
    console.error('\n❌ Cannot connect to aria2，请确认 aria2 已启动。')
    console.error(`   尝试连接: ${rpcUrl}`)
  } else {
    // aria2 接受了请求但返回了 JSON-RPC 错误（例如 GID 已完成、任务不存在）
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ ${action}失败: ${detail}`)
  }
}

/**
 * Register pause / resume / remove / pause-all / resume-all commands.
 *
 * @param program - The commander program instance
 */
export function registerPauseCommand(program: Command): void {
  // pause <gid>
  program
    .command('pause')
    .argument('<gid>', 'Task GID')
    .description('Pause a download task')
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.pause(gid)
        console.log(`\n⏸  任务 ${gid}  paused`)
      } catch (err) {
        printCommandError(err, rpcUrl, `暂停 ${gid}`)
      }
    })

  // resume <gid>
  program
    .command('resume')
    .argument('<gid>', 'Task GID')
    .description('Resume a download task')
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.resume(gid)
        console.log(`\n▶  任务 ${gid}  resumed`)
      } catch (err) {
        printCommandError(err, rpcUrl, `恢复 ${gid}`)
      }
    })

  // remove <gid>
  program
    .command('remove')
    .argument('<gid>', 'Task GID')
    .description('Remove a download task')
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.remove(gid)
        console.log(`\n🗑  任务 ${gid}  removed`)
      } catch (err) {
        printCommandError(err, rpcUrl, `删除 ${gid}`)
      }
    })

  // pause-all
  program
    .command('pause-all')
    .description('Pause all downloads')
    .action(async () => {
      const { queue, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const active = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending')
        for (const t of active) {
          await queue.pause(t.id)
        }
        console.log(`\n⏸   paused ${active.length} 个任务`)
      } catch (err) {
        printCommandError(err, rpcUrl, 'Pause all tasks')
      }
    })

  // resume-all
  program
    .command('resume-all')
    .description('Resume all paused downloads')
    .action(async () => {
      const { queue, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const paused = tasks.filter((t) => t.status === 'paused')
        for (const t of paused) {
          await queue.resume(t.id)
        }
        console.log(`\n▶   resumed ${paused.length} 个任务`)
      } catch (err) {
        printCommandError(err, rpcUrl, 'Resume all tasks')
      }
    })
}
