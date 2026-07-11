// commands/add.ts — motrix-ai add 命令
// 直接添加 URL/磁力/.torrent 到下载队列

import type { Command } from 'commander'
import { Aria2Client } from '@motrix-ai/core'
import { existsSync, readFileSync } from 'fs'
import { createQueue } from '../helpers/queue.js'

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
      const { config, queue, db, rpcUrl } = createQueue()
      console.log(`\n📥 正在添加任务...\n`)

      try {
        let task

        if (isTorrentFile(input)) {
          console.log(`   类型: .torrent 文件`)
          console.log(`   路径: ${input}`)
          const aria2 = new Aria2Client({
            rpcUrl: config.aria2.rpc_url,
            rpcSecret: config.aria2.rpc_secret,
          })
          const torrentBase64 = readFileSync(input).toString('base64')
          const gid = await aria2.addTorrent(torrentBase64, {
            dir: config.downloads.base_dir,
          })
          const label = options.name ?? input
          task = await queue.getStatus(gid)
          task = { ...task, source_query: label, uri: task.uri || input }
          db.update(task.id, { source_query: label, uri: task.uri })
        } else if (isMagnet(input)) {
          console.log(`   类型: 磁力链接`)
          const label = options.name ?? input.slice(0, 60)
          task = await queue.add(input, label, { dir: config.downloads.base_dir })
        } else if (isHttpUrl(input)) {
          console.log(`   类型: HTTP 链接`)
          const label = options.name ?? input
          task = await queue.add(input, label, { dir: config.downloads.base_dir })
        } else {
          console.error(`❌ 无法识别的输入类型: ${input}`)
          console.error('   支持的格式：')
          console.error('   - 磁力链接: magnet:?xt=urn:btih:...')
          console.error('   - HTTP/HTTPS URL: https://example.com/file.zip')
          console.error('   - .torrent 文件路径: /path/to/file.torrent')
          return
        }

        if (options.name) {
          console.log(`   名称: ${options.name}`)
        }

        console.log(`\n✅ 已加入队列！`)
        console.log(`   任务 ID: ${task.id}`)
        console.log(`   状态: ${task.status}`)
      } catch {
        console.error('\n❌ 添加任务失败，请确认 aria2 已启动。')
        console.error(`   尝试连接: ${rpcUrl}`)
      } finally {
        db.close()
      }
    })
}
