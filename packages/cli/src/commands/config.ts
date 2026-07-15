// commands/config.ts — motrix-ai config / config set / config reset command

import type { Command } from 'commander'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '@motrix-ai/core'
import type { AppConfig } from '@motrix-ai/core'

/**
 * Read a value from a nested object using dot notation (e.g. "ai.model").
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Set a value in a nested object using dot notation, returns a new object.
 */
function setNestedValue<T>(obj: T, path: string, value: string): T {
  const keys = path.split('.')
  const result = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  const lastKey = keys[keys.length - 1]

  // Try to parse value to appropriate type
  let parsedValue: unknown = value
  if (value === 'true') parsedValue = true
  else if (value === 'false') parsedValue = false
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
    .command('config')
    .description('View and manage configuration')
    .action(() => {
      const config = loadConfig()
      console.log('⚙️ Current configuration:\n')
      console.log(JSON.stringify(config, null, 2))
    })

  configCmd
    .command('set')
    .argument('<key>', 'Config key(dot-separated, e.g. ai.model, downloads.base_dir)')
    .argument('<value>', 'Config value')
    .description('Set a config value(supports dot notation)')
    .action((key: string, value: string) => {
      const config = loadConfig()

      const existing = getNestedValue(config, key)
      if (existing === undefined) {
        console.error(`❌ Unknown config key: ${key}`)
        console.error("   Use 'motrix-ai config' to see all available keys.")
        process.exit(1)
      }

      const expectedType = typeof existing
      if (expectedType === 'boolean' && value !== 'true' && value !== 'false') {
        console.error(`❌ Type error: ${key} expects boolean (true/false), got "${value}"`)
        process.exit(1)
      }
      if (expectedType === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) {
        console.error(`❌ Type error: ${key} expects number, got "${value}"`)
        process.exit(1)
      }

      const updated = setNestedValue(config, key, value)
      saveConfig(updated)
      console.log(`\n✅ Set ${key} = ${value}`)
      console.log('   Configuration saved.')
    })

  configCmd
    .command('reset')
    .description('Reset config to defaults')
    .action(() => {
      saveConfig({ ...DEFAULT_CONFIG } as AppConfig)
      console.log('\n✅ Configuration reset to defaults.')
    })
}
