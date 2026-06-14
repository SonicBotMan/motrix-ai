/**
 * MOCK_TASKS — the 14-task dataset shipped with the prototype.
 *
 * This array is the single hardcoded-data boundary: every UI component reads
 * from it (via the `useTaskAdapter` composable) until live aria2 data is wired
 * up in v0.2. The density and variety across statuses / types is intentional
 * and required for the visual baseline screenshots.
 *
 * @see docs/design/handoff/05-mock-data.md — full schema and sourcing spec
 */

import type { DesignTask } from '../composables/useTaskAdapter'

export const MOCK_TASKS: DesignTask[] = [
  // ── 1 — downloading, document ──────────────────────────────────────────
  {
    id: 1,
    name: 'ubuntu-24.04-desktop-amd64.iso',
    source: 'releases.ubuntu.com',
    type: 'document',
    status: 'downloading',
    progress: 84,
    speed: '24.6 MB/s',
    size: '4.8 GB',
    total: '5.7 GB',
    eta: '38s',
    connections: 12,
    seeders: 47,
    leechers: 3,
    files: [
      { name: 'ubuntu-24.04-desktop-amd64.iso', size: '5.7 GB', checked: false },
    ],
    timeline: [
      { time: '14:23:01', text: 'Download started', type: 'active' },
      { time: '14:23:05', text: 'Connected to 12 peers', type: 'active' },
      { time: '14:23:10', text: '84% complete', type: 'active' },
    ],
  },

  // ── 2 — downloading, audio ─────────────────────────────────────────────
  {
    id: 2,
    name: 'The.Weeknd.-.Dawn.FM.2025.mp3',
    source: 'qobuz.com',
    type: 'audio',
    status: 'downloading',
    progress: 62,
    speed: '8.2 MB/s',
    size: '142 MB',
    total: '228 MB',
    eta: '11s',
    connections: 4,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'The.Weeknd.-.Dawn.FM.2025.mp3', size: '228 MB', checked: false },
    ],
    timeline: [
      { time: '14:22:15', text: 'Download started', type: 'active' },
      { time: '14:22:20', text: 'Connected to 4 mirrors', type: 'active' },
      { time: '14:22:30', text: '62% complete', type: 'active' },
    ],
  },

  // ── 3 — queued (downloading w/ 0%, document) ───────────────────────────
  {
    id: 3,
    name: 'debian-12.10.0-amd64-netinst.iso',
    source: 'cdimage.debian.org',
    type: 'document',
    status: 'downloading',
    progress: 0,
    speed: '·',
    size: '0 B',
    total: '870 MB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'debian-12.10.0-amd64-netinst.iso', size: '870 MB', checked: false },
    ],
    timeline: [
      { time: '14:20:00', text: 'Queued for download', type: 'active' },
      { time: '14:20:01', text: 'Waiting for slot', type: 'active' },
    ],
  },

  // ── 4 — paused, document ───────────────────────────────────────────────
  {
    id: 4,
    name: 'archlinux-2025.05.01-x86_64.iso',
    source: 'archlinux.org',
    type: 'document',
    status: 'paused',
    progress: 45,
    speed: '0 B/s',
    size: '360 MB',
    total: '798 MB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'archlinux-2025.05.01-x86_64.iso', size: '798 MB', checked: false },
    ],
    timeline: [
      { time: '14:15:00', text: 'Download started', type: 'active' },
      { time: '14:15:30', text: '45% complete', type: 'active' },
      { time: '14:16:00', text: 'Paused by user', type: 'active' },
    ],
  },

  // ── 5 — downloading, archive ───────────────────────────────────────────
  {
    id: 5,
    name: 'code-visual-studio-code-linux-x64.deb',
    source: 'code.visualstudio.com',
    type: 'archive',
    status: 'downloading',
    progress: 28,
    speed: '9.8 MB/s',
    size: '25 MB',
    total: '89 MB',
    eta: '7s',
    connections: 6,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'code-visual-studio-code-linux-x64.deb', size: '89 MB', checked: false },
    ],
    timeline: [
      { time: '14:22:45', text: 'Download started', type: 'active' },
      { time: '14:22:50', text: 'Connected to 6 mirrors', type: 'active' },
      { time: '14:23:00', text: '28% complete', type: 'active' },
    ],
  },

  // ── 6 — completed, video ───────────────────────────────────────────────
  {
    id: 6,
    name: 'big-buck-bunny-1080p.mp4',
    source: 'archive.org',
    type: 'video',
    status: 'completed',
    progress: 100,
    speed: '·',
    size: '2.4 GB',
    total: '2.4 GB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'big-buck-bunny-1080p.mp4', size: '2.4 GB', checked: true },
    ],
    timeline: [
      { time: '14:10:00', text: 'Download started', type: 'active' },
      { time: '14:10:30', text: 'Connected to archive.org', type: 'active' },
      { time: '14:12:00', text: 'Download completed', type: 'completed' },
      { time: '14:12:01', text: 'Hash verified', type: 'completed' },
    ],
  },

  // ── 7 — downloading, torrent ───────────────────────────────────────────
  {
    id: 7,
    name: 'magnet:?xt=urn:btih:b7b0fbab…',
    source: 'magnet: b7b0fbab…6455',
    type: 'torrent',
    status: 'downloading',
    progress: 12,
    speed: '4.8 MB/s',
    size: '156 MB',
    total: '1.3 GB',
    eta: '6m',
    connections: 23,
    seeders: 18,
    leechers: 5,
    files: [
      { name: 'ubuntu-24.04-torrent-pack', size: '1.3 GB', checked: false },
    ],
    timeline: [
      { time: '14:18:00', text: 'Magnet resolved', type: 'active' },
      { time: '14:18:10', text: 'Connected to 23 peers (18 seeders)', type: 'active' },
      { time: '14:18:30', text: 'Metadata received', type: 'active' },
      { time: '14:20:00', text: '12% complete', type: 'active' },
    ],
  },

  // ── 8 — paused, archive ────────────────────────────────────────────────
  {
    id: 8,
    name: 'macOS-Sonoma-14.5-installer.app',
    source: 'swcdn.apple.com',
    type: 'archive',
    status: 'paused',
    progress: 73,
    speed: '0 B/s',
    size: '9.2 GB',
    total: '12.6 GB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'macOS-Sonoma-14.5-installer.app', size: '12.6 GB', checked: false },
    ],
    timeline: [
      { time: '14:00:00', text: 'Download started', type: 'active' },
      { time: '14:05:00', text: '73% complete', type: 'active' },
      { time: '14:06:00', text: 'Paused by user', type: 'active' },
    ],
  },

  // ── 9 — downloading, document ──────────────────────────────────────────
  {
    id: 9,
    name: 'openSUSE-Leap-15.6-DVD-x86_64.iso',
    source: 'download.opensuse.org',
    type: 'document',
    status: 'downloading',
    progress: 18,
    speed: '18.2 MB/s',
    size: '850 MB',
    total: '4.7 GB',
    eta: '4m 18s',
    connections: 16,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'openSUSE-Leap-15.6-DVD-x86_64.iso', size: '4.7 GB', checked: false },
    ],
    timeline: [
      { time: '14:21:00', text: 'Download started', type: 'active' },
      { time: '14:21:05', text: 'Connected to 16 mirrors', type: 'active' },
      { time: '14:21:30', text: '18% complete', type: 'active' },
    ],
  },

  // ── 10 — downloading, document ─────────────────────────────────────────
  {
    id: 10,
    name: 'Fedora-Workstation-Live-x86_64-40.iso',
    source: 'download.fedoraproject.org',
    type: 'document',
    status: 'downloading',
    progress: 91,
    speed: '12.4 MB/s',
    size: '1.8 GB',
    total: '1.9 GB',
    eta: '14s',
    connections: 14,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'Fedora-Workstation-Live-x86_64-40.iso', size: '1.9 GB', checked: false },
    ],
    timeline: [
      { time: '14:20:00', text: 'Download started', type: 'active' },
      { time: '14:20:05', text: 'Connected to 14 mirrors', type: 'active' },
      { time: '14:22:30', text: '91% complete', type: 'active' },
    ],
  },

  // ── 11 — downloading, archive ──────────────────────────────────────────
  {
    id: 11,
    name: 'blender-4.2.0-linux-x64.tar.xz',
    source: 'mirror.blender.org',
    type: 'archive',
    status: 'downloading',
    progress: 6,
    speed: '6.2 MB/s',
    size: '88 MB',
    total: '1.4 GB',
    eta: '3m 52s',
    connections: 8,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'blender-4.2.0-linux-x64.tar.xz', size: '1.4 GB', checked: false },
    ],
    timeline: [
      { time: '14:22:00', text: 'Download started', type: 'active' },
      { time: '14:22:05', text: 'Connected to 8 mirrors', type: 'active' },
      { time: '14:22:30', text: '6% complete', type: 'active' },
    ],
  },

  // ── 12 — error, archive ────────────────────────────────────────────────
  {
    id: 12,
    name: 'rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz',
    source: 'static.rust-lang.org',
    type: 'archive',
    status: 'error',
    progress: 34,
    speed: '0 B/s',
    size: '22 MB',
    total: '67 MB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz', size: '67 MB', checked: false },
    ],
    timeline: [
      { time: '14:15:00', text: 'Download started', type: 'active' },
      { time: '14:15:30', text: '34% complete', type: 'active' },
      { time: '14:16:00', text: 'Connection reset by peer', type: 'error' },
      { time: '14:16:05', text: 'Max retries exceeded', type: 'error' },
    ],
  },

  // ── 13 — error, archive ────────────────────────────────────────────────
  {
    id: 13,
    name: 'Docker-Desktop-4.30.0-x86_64.AppImage',
    source: 'desktop.docker.com',
    type: 'archive',
    status: 'error',
    progress: 0,
    speed: '0 B/s',
    size: '0 B',
    total: '1.2 GB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'Docker-Desktop-4.30.0-x86_64.AppImage', size: '1.2 GB', checked: false },
    ],
    timeline: [
      { time: '14:19:00', text: 'Download started', type: 'active' },
      { time: '14:19:01', text: 'DNS resolution failed', type: 'error' },
      { time: '14:19:02', text: 'Host unreachable', type: 'error' },
    ],
  },

  // ── 14 — paused, document ──────────────────────────────────────────────
  {
    id: 14,
    name: 'kali-linux-2024.2-installer-amd64.iso',
    source: 'cdimage.kali.org',
    type: 'document',
    status: 'paused',
    progress: 0,
    speed: '0 B/s',
    size: '0 B',
    total: '4.1 GB',
    eta: '—',
    connections: 0,
    seeders: 0,
    leechers: 0,
    files: [
      { name: 'kali-linux-2024.2-installer-amd64.iso', size: '4.1 GB', checked: false },
    ],
    timeline: [
      { time: '14:17:00', text: 'Download started', type: 'active' },
      { time: '14:17:05', text: 'Paused by user', type: 'active' },
    ],
  },
]
