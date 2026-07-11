// mcp-server/src/index.ts — MCP Server
// 对应 PRD §7.2 模块划分：MCP Server（对外暴露）

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  IntentParser,
  Aria2Client,
  QueueManager,
  ResultEvaluator,
  searchAll,
  BtdigSearchProvider,
  MikanSearchProvider,
  DuckDuckGoSearchProvider,
  SubtitleFinder,
  ShooterSource,
  SubhdSource,
  FileRenamer,
  loadConfig,
} from '@motrix-ai/core'

const config = loadConfig()
const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url, rpcSecret: config.aria2.rpc_secret })
const queue = new QueueManager(aria2)
const intentParser = new IntentParser({ baseUrl: config.ai.base_url })

const server = new McpServer({
  name: 'motrix-ai',
  version: '0.1.0',
  description: 'AI-native download manager MCP server',
})

/**
 * Tool 1: download_natural_language
 * Parse a natural-language request, search all providers, and enqueue the best result.
 */
server.tool(
  'download_natural_language',
  'Download content using natural language description',
  { query: z.string().describe("Natural language download request, e.g. 'download Wandering Earth 2 4K'") },
  async ({ query }) => {
    try {
      const intent = await intentParser.parse(query)
      const providers = [new BtdigSearchProvider(), new MikanSearchProvider(), new DuckDuckGoSearchProvider()]
      const results = await searchAll(providers, intent)

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No resources found for the given query' }],
          isError: true,
        }
      }

      const evaluator = new ResultEvaluator()
      const best = evaluator.pickBest(results, intent)
      if (!best) {
        return { content: [{ type: 'text', text: 'No suitable resource found after ranking' }], isError: true }
      }
      const task = await queue.add(best.magnet, query, { dir: config.downloads.base_dir })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                task_id: task.id,
                title: best.title,
                size: best.size,
                seeders: best.seeders,
                leechers: best.leechers,
                source: best.source,
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Tool 2: download_url
 * Add an HTTP/FTP/magnet/torrent URL directly to the download queue.
 */
server.tool(
  'download_url',
  'Download from URL or magnet link',
  { url: z.string().describe('URL or magnet link (HTTP/FTP/magnet/torrent)') },
  async ({ url }) => {
    try {
      const task = await queue.add(url, url, { dir: config.downloads.base_dir })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, task_id: task.id, status: task.status }, null, 2),
          },
        ],
      }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Tool 3: queue_list
 * List all tasks in the download queue (active, waiting, and stopped).
 */
server.tool('queue_list', 'List all download tasks', {}, async () => {
  try {
    const tasks = await queue.listAll()
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            tasks.map((t) => ({
              id: t.id,
              name: t.source_query,
              status: t.status,
              progress: t.progress,
              speed_down: t.speed.down,
            })),
            null,
            2,
          ),
        },
      ],
    }
  } catch (e: unknown) {
    return {
      content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
      isError: true,
    }
  }
})

/**
 * Tool 4: queue_pause
 * Pause a specific download task by its GID/task ID.
 */
server.tool(
  'queue_pause',
  'Pause a download task',
  { task_id: z.string().describe('Task GID to pause') },
  async ({ task_id }) => {
    try {
      await queue.pause(task_id)
      return { content: [{ type: 'text', text: `Task ${task_id} paused` }] }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Tool 5: queue_resume
 * Resume a previously paused download task.
 */
server.tool(
  'queue_resume',
  'Resume a paused download task',
  { task_id: z.string().describe('Task GID to resume') },
  async ({ task_id }) => {
    try {
      await queue.resume(task_id)
      return { content: [{ type: 'text', text: `Task ${task_id} resumed` }] }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Tool 6: search_subtitle
 * Search for the best matching subtitle for a video filename across subtitle sources.
 */
server.tool(
  'search_subtitle',
  'Search for subtitles for a video',
  { filename: z.string().describe('Video filename to find subtitles for') },
  async ({ filename }) => {
    try {
      const finder = new SubtitleFinder([new ShooterSource(), new SubhdSource()])
      const result = await finder.findBest(filename)
      return {
        content: [
          {
            type: 'text',
            text: result ? JSON.stringify(result, null, 2) : 'No subtitles found',
          },
        ],
      }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Tool 7: file_rename
 * Generate a renamed file path based on the configured template and content metadata.
 */
server.tool(
  'file_rename',
  'Get renamed file path based on template',
  {
    filename: z.string().describe('Original filename'),
    title: z.string().optional().describe('Content title'),
    year: z.number().optional().describe('Release year'),
    quality: z.string().optional().describe('Quality (4K, 1080p, etc.)'),
    resource_type: z.string().optional().describe('Resource type (movie, tv, software, music, anime, other)'),
  },
  async ({ filename, title, year, quality, resource_type }) => {
    try {
      const renamer = new FileRenamer()
      const result = renamer.generatePath({
        title: title || filename,
        year,
        quality: (quality as never) || 'other',
        resource_type: (resource_type as never) || 'other',
        original_filename: filename,
      })
      return { content: [{ type: 'text', text: result }] }
    } catch (e: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

/**
 * Start the MCP server on stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Motrix AI MCP Server running on stdio')
}

main().catch((e) => {
  console.error('Failed to start MCP server:', e)
  process.exit(1)
})
