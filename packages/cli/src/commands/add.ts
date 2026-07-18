// commands/add.ts — motrix-ai add command
// Directly add URL/magnet/.torrent to download queue

import type { Command } from 'commander'
import { Aria2Client, QueueManager, loadConfig } from '@motrix-ai/core'
import { existsSync, readFileSync, statSync } from 'fs'

/** Check if input is a magnet link */
function isMagnet(input: string): boolean {
  return input.startsWith('magnet:')
}

/** Check if input is an HTTP/HTTPS URL */
function isHttpUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://')
}

/** Check if input is a local .torrent file path */
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
    .argument('<url-or-magnet>', 'Download URL (HTTP/HTTPS URL, magnet link, or .torrent file path)')
    .option('--name <name>', 'Custom task name')
    .description('Add download URL directly to queue')
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
          // .torrent file → aria2.addTorrent
          console.log(`   Type: .torrent file`)
          console.log(`   Path: ${input}`)
          const torrentStat = statSync(input)
          if (torrentStat.size > 5 * 1024 * 1024) {
            console.error(`❌ .torrent file too large: ${(torrentStat.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`)
            return
          }
          const torrentBase64 = readFileSync(input).toString('base64')
          const gid = await aria2.addTorrent(torrentBase64, {
            dir: config.downloads.base_dir,
          })
          task = await queue.getStatus(gid)
        } else if (isMagnet(input)) {
          // Magnet link
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
          console.error('   - .torrent file path: /path/to/file.torrent')
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
        console.error(`   Trying to connect: ${config.aria2.rpc_url}`)
      }
    })
}
