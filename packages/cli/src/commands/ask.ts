// commands/ask.ts — motrix-ai ask 命令
// 对应 PRD §5.1 Should Have: NL → 搜索 → 入队

import type { Command } from "commander"
import {
  IntentParser,
  KeywordGenerator,
  ResultEvaluator,
  Aria2Client,
  QueueManager,
  DuckDuckGoSearchProvider,
  MikanSearchProvider,
  BtdigSearchProvider,
  searchAll,
  loadConfig,
} from "@motrix-ai/core"

/**
 * Register the `ask` command on the program.
 *
 * Parses a natural-language query into a structured intent, generates
 * search keywords, queries all search providers concurrently, evaluates
 * results, picks the best match, and enqueues it via aria2.
 *
 * @param program - The commander program instance
 */
export function registerAskCommand(program: Command): void {
  program
    .command("ask")
    .argument("<query>", "自然语言描述你想要下载的内容")
    .description("用自然语言描述下载需求，AI 自动搜索并入队")
    .action(async (query: string) => {
      const config = loadConfig()
      console.log(`\n🤖 正在分析: "${query}"\n`)

      // 1. NL 意图解析
      const parser = new IntentParser({ baseUrl: config.ai.base_url })
      let intent
      try {
        intent = await parser.parse(query)
      } catch (err) {
        console.error(`❌ 意图解析失败: ${(err as Error).message}`)
        console.error("   请检查 AI 服务是否正常运行，或调整描述后重试。")
        return
      }

      console.log(`📋 意图解析结果:`)
      console.log(`   标题: ${intent.title}`)
      console.log(`   年份: ${intent.year ?? "未知"}`)
      console.log(`   清晰度: ${intent.quality}`)
      console.log(`   需要字幕: ${intent.need_subtitle ? "是" : "否"}`)
      console.log(`   搜索关键词: ${intent.search_keywords.join(", ")}`)
      console.log(`   资源类型: ${intent.resource_type}\n`)

      // 2. 关键词扩展
      const keywordGen = new KeywordGenerator()
      const keywords = keywordGen.generate(intent)
      // Use only the top 3 most specific keywords for search (avoid overly long queries)
      const topKeywords = keywords.slice(0, 3)
      intent.search_keywords = topKeywords

      // 3. 并发搜索
      console.log("🔍 搜索资源中...")
      const providers = [
        new BtdigSearchProvider(),
        new MikanSearchProvider(),
        new DuckDuckGoSearchProvider(),
      ]

      let results
      try {
        results = await searchAll(providers, intent)
      } catch (err) {
        console.error(`❌ 搜索失败: ${(err as Error).message}`)
        return
      }

      console.log(`   找到 ${results.length} 个候选结果\n`)

      if (results.length === 0) {
        console.log("⚠️ 没有找到匹配的资源。")
        console.log("   建议：")
        console.log("   - 尝试更通用的关键词")
        console.log("   - 降低清晰度要求")
        console.log("   - 使用英文标题搜索")
        return
      }

      // 4. 评估并选择最佳结果
      const evaluator = new ResultEvaluator()
      const best = evaluator.pickBest(results, intent)

      if (!best) {
        console.log("⚠️ 无法确定最佳匹配结果。")
        return
      }

      console.log(`🏆 最佳匹配:`)
      console.log(`   标题: ${best.title}`)
      console.log(`   大小: ${(best.size / 1_000_000_000).toFixed(2)} GB`)
      console.log(`   做种: ${best.seeders} | 吸血: ${best.leechers}`)
      console.log(`   来源: ${best.source}`)
      console.log(`   质量: ${best.quality ?? "未知"}\n`)

      // 5. 入队
      console.log("📥 正在加入下载队列...")
      try {
        const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url })
        const queue = new QueueManager(aria2)
        const task = await queue.add(best.magnet, query)
        console.log(`\n✅ 已入队！`)
        console.log(`   任务 ID: ${task.id}`)
        console.log(`   状态: ${task.status}`)
      } catch {
        console.error("\n❌ 无法连接 aria2，请确认 aria2 已启动。")
        console.error(`   尝试连接: ${config.aria2.rpc_url}`)
        console.error("   可使用 'motrix-ai config set aria2.rpc_url <url>' 修改连接地址。")
      }
    })
}
