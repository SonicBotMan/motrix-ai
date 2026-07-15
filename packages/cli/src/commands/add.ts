// commands/add.ts — motrix-ai add 命令
// 直接添加 URL/磁力/.torrent 到下载队列

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'
import { existsSync, readFileSync, statSync } from 'fs'

/** 判断输入是否为磁力链接 */
function isMagnet(input: string): boolean {
  return input.startsWith('magnet:')
}

/** 判断输入是否为 HTTP/HTTPS URL */
function isHttpUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://')
}

/** 判断输入是否为本地 .torrent 文件路径 */
function isTorrentFile(input: string): boolean {
  return (input.endsWith('.torrent') || /\.(torrent)$/i.test(input)) && existsSync(input)
}

/**
 * Register the `add` command on the program.
 *
 * Adds a direct URL, magnet link, or .torrent file path to the
 * download queue via aria2.
 *
 * @param program - The commander program instance
 */
export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .argument('<url-or-magnet>', '下载链接（HTTP/HTTPS URL、磁力链接或 .torrent 文件路径）')
    .option('--name <name>', '自定义任务名称')
    .description('直接添加下载链接到队列')
    .action(async (input: string, options: { name?: string }) => {
      const config = loadConfig()
      console.log(`\n
📥 Adding task...\n`)

      try {
        const aria2 = new Aria2Client({
          rpcUrl: config.aria2.rpc_url,
          rpcSecret: config.aria2.rpc_secret,
        })
        const queue = new QueueManager(aria2)

        let task

        if (isTorrentFile(input)) {
          // .torrent 文件 → aria2.addTorrent
          console.log(`   Type: .torrent file`)
          console.log(`   Path: ${input}`)
          const torrentStat = statSync(input)
          if (torrentStat.size > 5 * 1024 * 1024) {
            console.error(`❌ .torrent 文件过大: ${(torrentStat.size / 1024 / 1024).toFixed(1)}MB (最大 5MB)`)
            return
          }
          const torrentBase64 = readFileSync(input).toString('base64')
          const gid = await aria2.addTorrent(torrentBase64, {
            dir: config.downloads.base_dir,
          })
          task = await queue.getStatus(gid)
        } else if (isMagnet(input)) {
          // 磁力链接
          console.log(`   Type: Magnet link`)
          const label = options.name ?? input.slice(0, 60)
          task = await queue.add(input, label, { dir: config.downloads.base_dir })
        } else if (isHttpUrl(input)) {
          // HTTP/HTTPS URL
          console.log(`   Type: HTTP URL`)
          const label = options.name ?? input
          task = await queue.add(input, label, { dir: config.downloads.base_dir })
        } else {
          console.error(`❌ Unrecognized input type: ${input}`)
          console.error('   Supported formats:')
          console.error('   - Magnet: magnet:?xt=urn:btih:...')
          console.error('   - HTTP/HTTPS URL: https://example.com/file.zip')
          console.error('   - .torrent 文件Path: /path/to/file.torrent')
          return
        }

        if (options.name) {
          console.log(`   Name: ${options.name}`)
        }

        console.log(`\n✅ Added to queue!`)
        console.log(`   Task ID: ${task.id}`)
        console.log(`   Status: ${task.status}`)
      } catch (err) {
        console.error('\n❌ Failed to add task: ' + (err instanceof Error ? err.message : String(err)))
        console.error(`   尝试连接: ${config.aria2.rpc_url}`)
      }
    })
}
