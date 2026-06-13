// commands/config.ts — motrix-ai config / config set / config reset 命令

import type { Command } from "commander"
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "@motrix-ai/core"
import type { AppConfig } from "@motrix-ai/core"

/**
 * 使用点号路径（如 "ai.model"）从嵌套对象中读取值。
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split(".")
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * 使用点号路径（如 "ai.model"）在嵌套对象中设置值，返回新对象。
 */
function setNestedValue<T>(obj: T, path: string, value: string): T {
  const keys = path.split(".")
  const result = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || typeof current[key] !== "object") {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  const lastKey = keys[keys.length - 1]

  // 尝试解析 value 为合适的类型
  let parsedValue: unknown = value
  if (value === "true") parsedValue = true
  else if (value === "false") parsedValue = false
  else if (/^-?\d+$/.test(value)) parsedValue = Number(value)
  else if (/^-?\d+\.\d+$/.test(value)) parsedValue = Number(value)

  current[lastKey] = parsedValue
  return result as T
}

/**
 * Register the `config` command group on the program.
 *
 * Subcommands:
 * - `config`          — show current configuration as JSON
 * - `config set <key> <value>` — set a value using dot notation (e.g. ai.model)
 * - `config reset`     — reset configuration to defaults
 *
 * @param program - The commander program instance
 */
export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("查看和管理配置")
    .action(() => {
      const config = loadConfig()
      console.log("⚙️ 当前配置:\n")
      console.log(JSON.stringify(config, null, 2))
    })

  configCmd
    .command("set")
    .argument("<key>", "配置键（点号分隔，如 ai.model、downloads.base_dir）")
    .argument("<value>", "配置值")
    .description("设置配置项（支持点号路径）")
    .action((key: string, value: string) => {
      const config = loadConfig()

      // 验证 key 是否存在
      const existing = getNestedValue(config, key)
      if (existing === undefined) {
        console.error(`❌ 未知的配置项: ${key}`)
        console.error("   使用 'motrix-ai config' 查看所有可用配置项。")
        return
      }

      const updated = setNestedValue(config, key, value)
      saveConfig(updated)
      console.log(`\n✅ 已设置 ${key} = ${value}`)
      console.log("   配置已保存。")
    })

  configCmd
    .command("reset")
    .description("重置配置为默认值")
    .action(() => {
      saveConfig({ ...DEFAULT_CONFIG } as AppConfig)
      console.log("\n✅ 配置已重置为默认值。")
    })
}
