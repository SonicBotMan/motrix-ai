// commands/pause.ts — motrix-ai pause / resume / remove / pause-all / resume-all 命令

import type { Command } from 'commander'
import { createQueue } from '../helpers/queue.js'

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
    console.error('\n❌ 无法连接 aria2，请确认 aria2 已启动。')
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
    .argument('<gid>', '任务 GID')
    .description('暂停指定下载任务')
    .action(async (gid: string) => {
      const { queue, db, rpcUrl } = createQueue()
      try {
        await queue.pause(gid)
        console.log(`\n⏸  任务 ${gid} 已暂停`)
      } catch (err) {
        printCommandError(err, rpcUrl, `暂停 ${gid}`)
      } finally {
        db.close()
      }
    })

  // resume <gid>
  program
    .command('resume')
    .argument('<gid>', '任务 GID')
    .description('恢复指定下载任务')
    .action(async (gid: string) => {
      const { queue, db, rpcUrl } = createQueue()
      try {
        await queue.resume(gid)
        console.log(`\n▶  任务 ${gid} 已恢复`)
      } catch (err) {
        printCommandError(err, rpcUrl, `恢复 ${gid}`)
      } finally {
        db.close()
      }
    })

  // remove <gid>
  program
    .command('remove')
    .argument('<gid>', '任务 GID')
    .description('删除指定下载任务')
    .action(async (gid: string) => {
      const { queue, db, rpcUrl } = createQueue()
      try {
        await queue.remove(gid)
        console.log(`\n🗑  任务 ${gid} 已删除`)
      } catch (err) {
        printCommandError(err, rpcUrl, `删除 ${gid}`)
      } finally {
        db.close()
      }
    })

  // pause-all
  program
    .command('pause-all')
    .description('暂停所有下载任务')
    .action(async () => {
      const { queue, db, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const active = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending')
        for (const t of active) {
          await queue.pause(t.id)
        }
        console.log(`\n⏸  已暂停 ${active.length} 个任务`)
      } catch (err) {
        printCommandError(err, rpcUrl, '暂停所有任务')
      } finally {
        db.close()
      }
    })

  // resume-all
  program
    .command('resume-all')
    .description('恢复所有暂停的下载任务')
    .action(async () => {
      const { queue, db, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const paused = tasks.filter((t) => t.status === 'paused')
        for (const t of paused) {
          await queue.resume(t.id)
        }
        console.log(`\n▶  已恢复 ${paused.length} 个任务`)
      } catch (err) {
        printCommandError(err, rpcUrl, '恢复所有任务')
      } finally {
        db.close()
      }
    })
}
