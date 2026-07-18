// commands/pause.ts — motrix-ai pause / resume / remove / pause-all / resume-all commands

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'

/** Create QueueManager instance from config */
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

/** Print aria2 connection failure hint, distinguishing connection errors from RPC errors (QA #6 fix) */
function printCommandError(err: unknown, rpcUrl: string, action: string): void {
  if (isConnectionError(err)) {
    console.error('\n❌ Cannot connect to aria2, please confirm aria2 is running.')
    console.error(`   Trying to connect: ${rpcUrl}`)
  } else {
    // aria2 accepted the request but returned a JSON-RPC error (e.g., GID already completed, task doesn't exist)
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ ${action} failed: ${detail}`)
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
        console.log(`\n⏸  Task ${gid}  paused`)
      } catch (err) {
        printCommandError(err, rpcUrl, `Pause ${gid}`)
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
        console.log(`\n▶  Task ${gid}  resumed`)
      } catch (err) {
        printCommandError(err, rpcUrl, `Resume ${gid}`)
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
        console.log(`\n🗑  Task ${gid}  removed`)
      } catch (err) {
        printCommandError(err, rpcUrl, `Remove ${gid}`)
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
        console.log(`\n⏸   Paused ${active.length} tasks`)
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
        console.log(`\n▶   Resumed ${paused.length} tasks`)
      } catch (err) {
        printCommandError(err, rpcUrl, 'Resume all tasks')
      }
    })
}
