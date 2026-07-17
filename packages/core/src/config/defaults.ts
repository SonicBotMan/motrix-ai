// config/defaults.ts — Default application configuration.
//
// Browser-safe: contains NO Node.js API imports. Paths use `~/` prefix;
// consumers expand via platform-specific homeDir():
//   - Node (CLI/MCP): expandTilde() in loader.ts uses os.homedir()
//   - GUI (Tauri): inherits `~/` form; Rust side expands at use sites
//     (configured_download_dir in mod.rs:103-111 already handles this)
//
// This is the SINGLE SOURCE OF TRUTH for default values. loader.ts and
// the GUI both derive from this file.

import type { AppConfig } from '../types.js'

export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'opencode',
    model: 'opencode/deepseek-v4-flash-free',
  },
  aria2: {
    rpc_url: 'http://127.0.0.1:6800/jsonrpc',
  },
  network: {
    http_proxy: '',
    https_proxy: '',
    ftp_proxy: '',
    no_proxy: '',
  },
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    movie_dir: '~/Downloads/Motrix AI/Movies',
    software_dir: '~/Downloads/Motrix AI/Software',
    other_dir: '~/Downloads/Motrix AI/Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      {
        name: 'Night Full Speed',
        time_start: '23:00',
        time_end: '07:00',
        speed_limit: 0,
        max_concurrent: 5,
        enabled: true,
      },
      {
        name: 'Daytime Throttle',
        time_start: '07:00',
        time_end: '18:00',
        speed_limit: 5_000_000,
        max_concurrent: 2,
        enabled: true,
      },
      {
        name: 'Evening Moderate',
        time_start: '18:00',
        time_end: '23:00',
        speed_limit: 10_000_000,
        max_concurrent: 3,
        enabled: true,
      },
    ],
  },
  disk: {
    enabled: true,
    thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 },
  },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: {
    enabled: false,
    targets: [],
  },
  nas: {
    enabled: false,
    host: '192.168.1.100',
    port: '22',
    username: '',
    moviePath: '/volume1/Media/Movies',
    softwarePath: '/volume1/Software',
    musicPath: '/volume1/Music',
  },
  ui: {
    theme: 'dark',
    language: 'en',
    log_level: 'info',
  },
}
