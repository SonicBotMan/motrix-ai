// mcp-server/src/index.ts — MCP Server
// 对应 PRD §7.2 模块划分：MCP Server（对外暴露）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IntentParser, Aria2Client, QueueManager, loadConfig } from "@motrix-ai/core";

const config = loadConfig();
const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url });
const queue = new QueueManager(aria2);
const intentParser = new IntentParser();

const server = new McpServer({
  name: "motrix-ai",
  version: "0.0.0",
  description: "AI-native download manager MCP server",
});

// Tool: 自然语言下载
server.tool(
  "download_natural_language",
  "用自然语言描述下载需求，AI 自动搜索并入队",
  { query: z.string().describe("自然语言描述，如'下流浪地球2 4K字幕版'") },
  async ({ query }) => {
    const intent = await intentParser.parse(query);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ intent, status: "parsed", next: "search_and_queue" }, null, 2),
      }],
    };
  }
);

// Tool: URL 直接下载
server.tool(
  "download_url",
  "添加一个 HTTP/磁力/BT URL 到下载队列",
  { url: z.string().describe("下载链接 (HTTP/FTP/magnet/torrent)") },
  async ({ url }) => {
    try {
      const task = await queue.add(url);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, task_id: task.id, status: task.status }, null, 2),
        }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// Tool: 任务列表
server.tool(
  "queue_list",
  "查看当前下载队列状态",
  {},
  async () => {
    try {
      const tasks = await queue.listAll();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(tasks.map(t => ({
            id: t.id,
            name: t.source_query,
            status: t.status,
            progress: t.progress,
            speed_down: t.speed.down,
          })), null, 2),
        }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
