#!/usr/bin/env node
/**
 * probe-providers.mjs — 活体站点探测：用与 Rust search.rs 相同的 URL 模板和正则，
 * 抓取真实页面并验证解析结果，输出 provider 可用性矩阵。
 *
 * 用法:
 *   node scripts/probe-providers.mjs                  # 直连
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_OPTIONS=--experimental-network-inspection \
 *     node --experimental-network-inspection scripts/probe-providers.mjs   # 走代理
 *
 * 退出码: 0 = 至少一个 provider 可用; 1 = 全部不可用; 2 = 全网络错误
 *
 * ⚠️ 正则与 apps/gui/src-tauri/src/commands/search.rs 保持同步。
 * 站点改版导致 MISS 时，先改 search.rs，再同步这里。
 *
 * 零 npm 依赖（仅 Node ≥22 内置 fetch）。
 */

import { execFile } from 'node:child_process'

const AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const PROXY = process.env.PROBE_PROXY || ''

// ── 与 search.rs 完全一致的 URL 模板 ──
const URLS = {
  btdig: (q) => `https://btdig.com/search?q=${encodeURIComponent(q)}&p=0`,
  mikan: (q) => `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(q)}`,
  '1337x': (q) => `https://1337x.to/search/${encodeURIComponent(q)}/all/last-seeders/`,
  nyaa: (q) => `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}&s=seeders&o=desc`,
  torrentgalaxy: (q) =>
    `https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(q)}&sort=seeders&order=desc`,
}

// ── 与 search.rs 相同的关键正则（最小判定集：页面结构可达且能数出 ≥1 条结果即"可用"）──
const PARSERS = {
  btdig: {
    probe: /class="torrent_name"/,
    count: (h) => (h.match(/class="torrent_name"/g) || []).length,
    note: 'HTML 搜索页（反爬页则 MISS）',
  },
  mikan: {
    probe: /<item>/,
    count: (h) => (h.match(/<item>/g) || []).length,
    note: 'RSS 搜索（动漫源）',
  },
  '1337x': {
    probe: /<tr[^>]*class="(default|success|danger)"/,
    count: (h) => (h.match(/<a[^>]*href="\/torrent\/[^"]+"/g) || []).length,
    note: 'HTML 搜索页（Cloudflare 则 MISS）',
  },
  nyaa: {
    probe: /<tr[^>]*class="(?:default|success|danger)"/,
    count: (h) => (h.match(/magnet:\?/g) || []).length,
    note: 'HTML 搜索页',
  },
  torrentgalaxy: {
    probe: /tgxtable|class="tgrow"/,
    count: (h) => (h.match(/\/torrent\/\d+/g) || []).length,
    note: 'HTML 搜索页（JS 渲染可能性高）',
  },
}

const QUERIES = { generic: 'ubuntu', anime: '回答' }

async function fetchPage(url) {
  const args = ['-sS', '-L', '--max-time', '20', '-A', AGENT, '-H', 'Accept-Language: en-US,en;q=0.5']
  if (PROXY) args.push('-x', PROXY)
  args.push(url)
  const { stdout } = await new Promise((resolve) =>
    execFile('curl', args, { maxBuffer: 16 * 1024 * 1024, timeout: 25000 }, (err, out) =>
      resolve(err ? { stdout: '' } : { stdout: out })
    ),
  )
  if (!stdout) throw new Error('EMPTY_RESPONSE')
  return stdout
}

async function probeSource(name, query) {
  const p = PARSERS[name]
  try {
    const body = await fetchPage(URLS[name](query))
    if (body.length < 200) return { ok: false, why: `响应异常小 (${body.length}B)` }
    if (!p.probe.test(body)) return { ok: false, why: '页面可达但结构不匹配（改版或反爬页）', bytes: body.length }
    return { ok: true, results: p.count(body), why: '', bytes: body.length }
  } catch (e) {
    const code = e.code || /ETIMEDOUT|EMPTY/.test(String(e.message)) ? 'ETIMEDOUT' : e.message
    return { ok: false, why: `网络错误: ${code}` }
  }
}

const t0 = Date.now()
const rows = []
for (const [label, q] of Object.entries(QUERIES)) {
  for (const name of Object.keys(URLS)) {
    rows.push({ query: label, name, ...(await probeSource(name, q)) })
  }
}

console.log(`\n=== Provider 活体探测（${new Date().toISOString().slice(0, 10)}${PROXY ? ` via ${PROXY}` : ' 直连'}）===`)
console.log('provider         query   status   results  detail')
for (const r of rows) {
  console.log(
    `${r.name.padEnd(17)} ${r.query.padEnd(8)} ${r.ok ? 'OK ' : 'DEAD'}   ${String(r.results ?? '-').padStart(8)}  ${r.why || PARSERS[r.name].note}`,
  )
}
console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const anyOk = rows.some((r) => r.ok)
const allNetFail = rows.every((r) => /网络错误/.test(r.why))
process.exit(allNetFail ? 2 : anyOk ? 0 : 1)
