// commands/ask.ts — motrix-ai ask command
// Corresponds to PRD §5.1 Should Have: NL → Search → Enqueue

import type { Command } from 'commander'
import {
  IntentParser,
  KeywordGenerator,
  ResultEvaluator,
  Aria2Client,
  QueueManager,
  DuckDuckGoSearchProvider,
  MikanSearchProvider,
  NyaaSearchProvider,
  BtdigSearchProvider,
  searchAll,
  loadConfig,
} from '@motrix-ai/core'

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
    .command('ask')
    .argument('<query>', 'Describe what you want to download in natural language')
    .description('Describe download needs in natural language, AI automatically searches and enqueues')
    .addHelpText('after', '\nExample:\n  $ motrix-ai ask "Download The Wandering Earth 2 4K with subtitles"')
    .action(async (query: string) => {
      const config = loadConfig()
      console.log(`\n🤖 Analyzing: "${query}"\n`)

      // 1. NL intent parsing
      const parser = new IntentParser({ baseUrl: config.ai.base_url })
      let intent
      try {
        intent = await parser.parse(query)
      } catch (err) {
        console.error(`❌ Intent parsing failed: ${(err as Error).message}`)
        console.error(
          '   Please check if the AI service is running properly, or adjust your description and try again.',
        )
        return
      }

      console.log(`📋 Intent analysis result:`)
      console.log(`   Title: ${intent.title}`)
      console.log(`   Year: ${intent.year ?? 'Unknown'}`)
      console.log(`   Quality: ${intent.quality}`)
      console.log(`   Subtitle needed: ${intent.need_subtitle ? 'Yes' : 'No'}`)
      console.log(`   Search keywords: ${intent.search_keywords.join(', ')}`)
      console.log(`   Resource type: ${intent.resource_type}\n`)

      // 2. Keyword expansion
      const keywordGen = new KeywordGenerator()
      const keywords = keywordGen.generate(intent)
      // Use only the top 3 most specific keywords for search (avoid overly long queries)
      const topKeywords = keywords.slice(0, 3)
      intent.search_keywords = topKeywords

      // 3. Concurrent search
      console.log('🔍 Searching for resources...')
      const providers = [
        new BtdigSearchProvider(),
        new MikanSearchProvider(),
        new NyaaSearchProvider(),
        new DuckDuckGoSearchProvider(),
      ]

      let results
      try {
        results = await searchAll(providers, intent)
      } catch (err) {
        console.error(`❌ Search failed: ${(err as Error).message}`)
        return
      }

      console.log(`   Found ${results.length} candidates\n`)

      if (results.length === 0) {
        console.log('⚠️ No matching resources found.')
        console.log('   Suggestions:')
        console.log('   - Try more general keywords')
        console.log('   - Lower quality requirements')
        console.log('   - Search with English title')
        return
      }

      // 4. Evaluate and select best result
      const evaluator = new ResultEvaluator()
      const best = evaluator.pickBest(results, intent)

      if (!best) {
        console.log('⚠️ Could not determine best match.')
        return
      }

      console.log(`🏆 Best match:`)
      console.log(`   Title: ${best.title}`)
      console.log(`   Size: ${(best.size / 1_000_000_000).toFixed(2)} GB`)
      console.log(`   Seeders: ${best.seeders} | Leechers: ${best.leechers}`)
      console.log(`   Source: ${best.source}`)
      console.log(`   Quality: ${best.quality ?? 'Unknown'}\n`)

      // 5. Enqueue
      console.log('📥 Adding to download queue...')
      try {
        const aria2 = new Aria2Client({ rpcUrl: config.aria2.rpc_url, rpcSecret: config.aria2.rpc_secret })
        const queue = new QueueManager(aria2)
        const task = await queue.add(best.magnet, query, { dir: config.downloads.base_dir })
        console.log(`\n✅ Added to queue!`)
        console.log(`   Task ID: ${task.id}`)
        console.log(`   Status: ${task.status}`)
      } catch {
        console.error('\n❌ Cannot connect to aria2, please confirm aria2 is running.')
        console.error(`   Trying to connect: ${config.aria2.rpc_url}`)
        console.error("   Use 'motrix-ai config set aria2.rpc_url <url>' to modify the connection address.")
      }
    })
}
