/**
 * Config migration system for backward-compatible config upgrades.
 * Ensures old config files are automatically migrated to the current schema.
 */

/** Current schema version */
export const SCHEMA_VERSION = 2

/**
 * A single migration step that transforms config from one version to another.
 */
export interface Migration {
  from: number
  to: number
  migrate: (config: Record<string, unknown>) => Record<string, unknown>
}

/**
 * Ordered list of migrations. Each migration runs if the config's
 * schemaVersion is less than the migration's `to` version.
 */
export const migrations: Migration[] = [
  {
    from: 0,
    to: 1,
    migrate: (config) => {
      // Ensure schemaVersion exists
      config.schemaVersion = 1
      // Ensure all required sections exist
      config.ai = config.ai ?? {}
      config.aria2 = config.aria2 ?? {}
      config.downloads = config.downloads ?? {}
      config.schedule = config.schedule ?? {}
      config.disk = config.disk ?? {}
      config.subtitles = config.subtitles ?? {}
      config.archive = config.archive ?? {}
      return config
    },
  },
  {
    from: 1,
    to: 2,
    migrate: (config) => {
      config.ui = config.ui ?? { theme: 'dark', language: 'en', log_level: 'info' }
      const subtitles = config.subtitles as Record<string, unknown> | undefined
      if (subtitles) {
        subtitles.subtitle_dir = subtitles.subtitle_dir ?? ''
        subtitles.opensubtitles_api_key = subtitles.opensubtitles_api_key ?? ''
        subtitles.auto_search = subtitles.auto_search ?? true
      }
      config.schemaVersion = 2
      return config
    },
  },
]

/**
 * Run all applicable migrations on a raw config object.
 * Migrations are applied in order until the config reaches SCHEMA_VERSION.
 *
 * @param raw - The raw parsed config (may have any schemaVersion or none)
 * @returns The migrated config with schemaVersion set to SCHEMA_VERSION
 */
export function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  let version = (raw.schemaVersion as number) ?? 0
  if (version < SCHEMA_VERSION) {
    for (const m of migrations) {
      if (m.from >= version) {
        raw = m.migrate(raw)
        version = m.to
      }
    }
  }
  return raw
}
