// commands/pause.ts — motrix-ai pause / resume / remove / pause-all / resume-all 命令

import type { Command } from "commander"
import { Aria2Client, QueueManager, loadConfig } from "@motrix-ai/core"

/** 从 config 创建 QueueManager 实例 */
function createQueue() {
  const config = loadConfig()
  const aria2 = new Aria2Client({
    rpcUrl: config.aria2.rpc_url,
    rpcSecret: config.aria2.rpc_secret,
  })
  return { queue: new QueueManager(aria2), rpcUrl: config.aria2.rpc_url }
}

/** 打印 aria2 连接失败提示 */
function printConnectionError(rpcUrl: string): void {
  console.error("\n❌ 无法连接 aria2，请确认 aria2 已启动。")
  console.error(`   尝试连接: ${rpcUrl}`)
}

/**
 * Register pause / resume / remove / pause-all / resume-all commands.
 *
 * @param program - The commander program instance
 */
export function registerPauseCommand(program: Command): void {
  // pause <gid>
  program
    .command("pause")
    .argument("<gid>", "任务 GID")
    .description("暂停指定下载任务")
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.pause(gid)
        console.log(`\n⏸  任务 ${gid} 已暂停`)
      } catch {
        printConnectionError(rpcUrl)
      }
    })

  // resume <gid>
  program
    .command("resume")
    .argument("<gid>", "任务 GID")
    .description("恢复指定下载任务")
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.resume(gid)
        console.log(`\n▶  任务 ${gid} 已恢复`)
      } catch {
        printConnectionError(rpcUrl)
      }
    })

  // remove <gid>
  program
    .command("remove")
    .argument("<gid>", "任务 GID")
    .description("删除指定下载任务")
    .action(async (gid: string) => {
      const { queue, rpcUrl } = createQueue()
      try {
        await queue.remove(gid)
        console.log(`\n🗑  任务 ${gid} 已删除`)
      } catch {
        printConnectionError(rpcUrl)
      }
    })

  // pause-all
  program
    .command("pause-all")
    .description("暂停所有下载任务")
    .action(async () => {
      const { queue, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const active = tasks.filter(
          (t) => t.status === "downloading" || t.status === "pending",
        )
        for (const t of active) {
          await queue.pause(t.id)
        }
        console.log(`\n⏸  已暂停 ${active.length} 个任务`)
      } catch {
        printConnectionError(rpcUrl)
      }
    })

  // resume-all
  program
    .command("resume-all")
    .description("恢复所有暂停的下载任务")
    .action(async () => {
      const { queue, rpcUrl } = createQueue()
      try {
        const tasks = await queue.listAll()
        const paused = tasks.filter((t) => t.status === "paused")
        for (const t of paused) {
          await queue.resume(t.id)
        }
        console.log(`\n▶  已恢复 ${paused.length} 个任务`)
      } catch {
        printConnectionError(rpcUrl)
      }
    })
}
