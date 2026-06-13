#!/usr/bin/env node
// cli/src/index.ts — motrix-ai CLI 入口
// 对应 PRD §5.1 Should Have: CLI 模式

import { Command } from "commander";
import { IntentParser, Aria2Client, QueueManager, loadConfig } from "@motrix-ai/core";

const program = new Command();

program
  .name("motrix-ai")
  .description("AI-native download manager — describe what you want, AI handles the rest")
  .version("0.0.0");

program
  .command("ask")
  .argument("<query>", "自然语言描述你想要下载的内容")
  .description("用自然语言描述下载需求，AI 自动搜索并入队")
  .action(async (query: string) => {
    const config = loadConfig();
    console.log(`\n🤖 正在分析: "${query}"\n`);

    // 1. NL 意图解析
    const parser = new IntentParser({ baseUrl: config.ai.base_url });
    const intent = await parser.parse(query);
    console.log(`📋 意图解析结果:`);
    console.log(`   标题: ${intent.title}`);
    console.log(`   年份: ${intent.year ?? "未知"}`);
    console.log(`   清晰度: ${intent.quality}`);
    console.log(`   需要字幕: ${intent.need_subtitle ? "是" : "否"}`);
    console.log(`   搜索关键词: ${intent.search_keywords.join(", ")}`);
    console.log(`   资源类型: ${intent.resource_type}\n`);

    // 2. 搜索（后续实现）
    console.log("🔍 搜索资源中... (search providers 待实现)");

    // 3. 入队（需要 aria2 运行中）
    // const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url });
    // const queue = new QueueManager(aria2);
    // const task = await queue.add(magnet, query);
    // console.log(`✅ 已入队: ${task.id}`);

    console.log("\n⚡ PoC 阶段：意图解析已验证，搜索和入队待集成。");
  });

program
  .command("list")
  .description("查看当前下载队列")
  .action(async () => {
    const config = loadConfig();
    console.log("📥 当前任务列表:\n");

    try {
      const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url });
      const queue = new QueueManager(aria2);
      const tasks = await queue.listAll();

      if (tasks.length === 0) {
        console.log("  (空) 没有下载任务");
        return;
      }

      for (const t of tasks) {
        const statusIcon = { downloading: "▶", paused: "⏸", completed: "✅", failed: "❌", pending: "⏳" }[t.status] ?? "❓";
        const speed = t.status === "downloading" ? ` | ↓${(t.speed.down / 1_000_000).toFixed(1)} MB/s` : "";
        console.log(`  ${statusIcon} ${t.source_query || t.id} | ${t.progress}%${speed}`);
      }
    } catch {
      console.log("  ⚠️ 无法连接 aria2，请确认 aria2 已启动。");
      console.log(`  尝试连接: ${config.aria2.rpc_url}`);
    }
  });

program
  .command("config")
  .description("查看当前配置")
  .action(() => {
    const config = loadConfig();
    console.log("⚙️ 当前配置:\n");
    console.log(JSON.stringify(config, null, 2));
  });

program.parse();
