# 05 — Mock Data Contract

The prototype runs entirely on a hard-coded `MOCK_TASKS` array. This file is the **schema and sourcing spec** for that array, plus the rules for replacing it with real data in v0.2.

---

## 1. Task schema

```typescript
type Task = {
  id: number;                              // int, unique, dense (1, 2, 3...)
  name: string;                            // visible filename
  source: string;                          // host or magnet URI, formatted via formatSource()
  type: 'video' | 'document' | 'audio' | 'archive' | 'torrent';
  status: 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;                        // 0-100, integer
  speed: string;                           // human-readable, e.g. '24.6 MB/s', '0 B/s' when paused
  size: string;                            // downloaded amount, e.g. '4.8 GB'
  total: string;                           // total size, e.g. '5.7 GB'
  eta: string;                             // human-readable, e.g. '38s', or '—' if not applicable
  connections: number;                     // int, current peer count
  seeders: number;                         // int, available seeders (for torrents)
  leechers: number;                        // int, available leechers (for torrents)
  files: Array<{                           // ≥ 1 entries
    name: string;
    size: string;                          // human-readable
    checked: boolean;                      // true if hash-verified
  }>;
  timeline: Array<{                        // 3-6 entries, newest first
    time: string;                          // HH:MM:SS format
    text: string;                          // human-readable
    type: 'active' | 'completed' | string;  // determines dot color
  }>;
};
```

### 1.1 Field constraints

| Field | Constraint | Validation |
|---|---|---|
| `id` | unique, dense, positive int | `1, 2, 3, ..., N` |
| `name` | non-empty, ≤ 64 chars | truncate with ellipsis in UI |
| `source` | valid URL or magnet URI | runs through `formatSource()` for display |
| `type` | one of 5 enum values | falls back to a generic icon if unknown |
| `status` | one of 4 enum values | falls back to literal text + no color if unknown |
| `progress` | 0-100 int | 100 only when status is `completed` |
| `speed` | `'<num> <unit>/s'` format | `0 B/s` when paused, `·` (middle dot) when not downloading |
| `size` | downloaded amount | should be ≤ total |
| `total` | total size | never changes for a task |
| `eta` | `'<num><unit>'` format or `—` | `—` (em-dash is OK here, not in user-visible copy — this is a data field rendered to a cell) |
| `files` | ≥ 1 entry | empty array is a bug |
| `timeline` | 3-6 entries | new entries prepended on state changes |

### 1.2 Status → visual mapping (the binding truth)

| `status` value | Pill label | Pill bg | Pill fg | Progress fill | Shimmer? |
|---|---|---|---|---|---|
| `downloading` | `Downloading` | `--primary-muted` | `--primary` | `--primary` (linear-gradient) | yes |
| `paused` | `Paused` | `--warning-muted` | `--warning` | `--warning` | no |
| `completed` | `Completed` | `--accent-muted` | `--accent` | `--accent` (no animation) | no |
| `error` | `Failed` | `--error-muted` | `--error` | `--error` (no fill if progress < 100) | no |

This mapping is defined in `renderTasks` (line 3130 of `index.html`) as the `statusMap` object. **Do not** hardcode these in components — always read from the map.

### 1.3 Type → icon mapping

| `type` value | Lucide icon (24×24, stroke 2) |
|---|---|
| `video` | `<polygon points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2"/>` |
| `document` | `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>` |
| `audio` | `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>` |
| `archive` | `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>` |
| `torrent` | `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>` |

Defined in `TYPE_ICONS` (line 3060). When a new type is added, add both the icon and an entry to this constant.

---

## 2. The 14 shipped tasks (current state)

The prototype ships with **14 tasks** spanning all 4 statuses and all 5 types. This density is intentional — the visual baseline screenshots (`references/*.png`) depend on it.

| id | name | source | type | status | progress | speed | size / total | eta |
|---|---|---|---|---|---|---|---|---|
| 1 | ubuntu-24.04-desktop-amd64.iso | releases.ubuntu.com | document | downloading | 84% | 24.6 MB/s | 4.8 / 5.7 GB | 38s |
| 2 | The.Weeknd.-.Dawn.FM.2025.mp3 | qobuz.com | audio | downloading | 62% | 8.2 MB/s | 142 / 228 MB | 11s |
| 3 | debian-12.10.0-amd64-netinst.iso | cdimage.debian.org | document | queued* | 0% | · | 0 / 870 MB | — |
| 4 | archlinux-2025.05.01-x86_64.iso | archlinux.org | document | paused | 45% | 0 B/s | 360 / 798 MB | — |
| 5 | code-visual-studio-code-linux-x64.deb | code.visualstudio.com | archive | downloading | 28% | 9.8 MB/s | 25 / 89 MB | 7s |
| 6 | big-buck-bunny-1080p.mp4 | archive.org | video | completed | 100% | · | 2.4 / 2.4 GB | — |
| 7 | magnet:?xt=urn:btih:b7b0fbab... | magnet | torrent | downloading | 12% | 4.8 MB/s | 156 / 1.3 GB | 6m |
| 8 | macOS-Sonoma-14.5-installer.app | swcdn.apple.com | archive | paused | 73% | 0 B/s | 9.2 / 12.6 GB | — |
| 9 | openSUSE-Leap-15.6-DVD-x86_64.iso | download.opensuse.org | document | downloading | 18% | 18.2 MB/s | 850 / 4.7 GB | 4m 18s |
| 10 | Fedora-Workstation-Live-x86_64-40.iso | download.fedoraproject.org | document | downloading | 91% | 12.4 MB/s | 1.8 / 1.9 GB | 14s |
| 11 | blender-4.2.0-linux-x64.tar.xz | mirror.blender.org | archive | downloading | 6% | 6.2 MB/s | 88 / 1.4 GB | 3m 52s |
| 12 | rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz | static.rust-lang.org | archive | error | 34% | 0 B/s | 22 / 67 MB | — |
| 13 | Docker-Desktop-4.30.0-x86_64.AppImage | desktop.docker.com | archive | error | 0% | 0 B/s | 0 / 1.2 GB | — |
| 14 | kali-linux-2024.2-installer-amd64.iso | cdimage.kali.org | document | paused | 0% | 0 B/s | 0 / 4.1 GB | — |

\* "queued" is an internal state — `downloading` with `progress: 0` and `speed: '·'`. The display logic collapses this into a row with empty progress bar and `·` for speed.

**Density requirement:** at any one time, the table should show a mix of:
- ≥ 5 `downloading` rows (to show real-time activity)
- ≥ 1 `paused` row (to show the pause visual)
- ≥ 1 `completed` row (to show the completed state)
- ≥ 1 `error` row (to show the error state, esp. the red status pill)

If a PR removes a status to "simplify," it's a regression — the density is required for the visual baseline.

---

## 3. `formatSource()` spec

```js
function formatSource(src) {
  if (!src) return '';
  if (src.startsWith('magnet:')) {
    // Extract xt param hash if present
    const m = src.match(/urn:btih:([a-fA-F0-9]{40})/);
    if (m) return `magnet: ${m[1].slice(0, 8)}…${m[1].slice(-4)}`;
    // Abbreviated placeholder like "magnet:?xt=urn:btih:..."
    if (/urn:btih:\.\.\.+/i.test(src)) return 'magnet: btih hash';
    return src.length > 32 ? 'magnet: link' : src;
  }
  // Plain URL — keep host + 1 path segment if any
  try {
    const u = new URL(src);
    const firstSegment = u.pathname.split('/').filter(Boolean)[0] || '';
    return firstSegment ? `${u.hostname}/${firstSegment}` : u.hostname;
  } catch (_) {
    return src;
  }
}
```

### 3.1 Examples

| Input | Output | Note |
|---|---|---|
| `'releases.ubuntu.com'` | `'releases.ubuntu.com'` | bare host, no path |
| `'releases.ubuntu.com/24.04'` | `'releases.ubuntu.com/24.04'` | host + first segment |
| `'releases.ubuntu.com/24.04/ubuntu-24.04.iso'` | `'releases.ubuntu.com/24.04'` | truncates to first segment |
| `'magnet:?xt=urn:btih:b7b0fbab74a85d4ac170662c645982a862826455&dn=ubuntu'` | `'magnet: b7b0fbab…6455'` | hash extracted, abbreviated |
| `'magnet:?xt=urn:btih:...'` | `'magnet: btih hash'` | placeholder pattern |
| `'magnet:?xt=urn:btih:custom-short'` | `'magnet: link'` | falls through to length-based truncation |
| `'not a url'` | `'not a url'` | URL parse fails, returns as-is |
| `''` | `''` | empty input |

### 3.2 The `…` character (U+2026, horizontal ellipsis)

Used in `formatSource` output to abbreviate the magnet hash. **This is one of the few places ellipsis is appropriate in the prototype** — it's a true data-truncation marker, not decorative.

### 3.3 When to extend

If you need to display:
- A tracker URL → add a `formatTracker()` function
- A YouTube URL → add a `formatYouTube()` function (e.g., `youtube.com › watch`)
- A torrent file name → it's already in `task.name`, no need

Don't add more branches to `formatSource`; the function's job is "URL → display string" and it does that cleanly.

---

## 4. Timeline event types

| `type` value | Dot color | When used |
|---|---|---|
| `active` | `--primary` (blue) | The most recent in-progress event |
| `completed` | `--accent` (green) | Successfully completed events |
| anything else | `--fg-muted` (gray) | Failed, info, or unknown events |

The `active` and `completed` strings are special; anything else falls through to the muted default. This means we can introduce new event types without updating the renderer — they just won't have a custom color (which is fine for v0.1).

---

## 5. Replacing mock data with real data (v0.2 plan)

The transition to real data is a single boundary: the `MOCK_TASKS` array. Everything downstream (`renderTasks`, `openDetail`, `rowAction`, `handleAction`) reads from it. To wire up real data:

1. **Delete `MOCK_TASKS`.** It's the only hardcoded data.
2. **Add a `getTasks()` async function** that returns the same shape, populated from the Tauri command bridge.
3. **Update `renderTasks(filter)`** to be async and `await getTasks()`.
4. **Add WebSocket or polling** for real-time updates (every task needs `progress`, `speed`, `eta` refreshed).

The schema is the contract. If the backend returns objects matching the TypeScript type in §1, no other code needs to change.

### 5.1 What the real backend will need to populate

| Field | Source |
|---|---|
| `name` | Filename from the source URI (last path segment, or `dn=` param for magnet) |
| `source` | Original URI |
| `type` | Inferred from extension or `Content-Type` header |
| `status` | Internal state machine: queued → downloading → (paused) → completed / error |
| `progress` | `(bytes_downloaded / total_bytes) * 100` |
| `speed` | Rolling 5-second average of bytes/sec, formatted |
| `size` | `bytes_downloaded`, formatted |
| `total` | `total_bytes`, formatted |
| `eta` | `(total - downloaded) / speed`, formatted |
| `connections` | Active peer/connection count |
| `seeders` / `leechers` | Tracker-reported counts (torrents only) |
| `files` | Initialized on task creation, updated as each file completes |
| `timeline` | Prepended on every state transition |

### 5.2 Real-time update strategy

For v0.2, use **server-sent events (SSE)** or **WebSocket** to push task updates. The mock data refreshes 0 times; real data should refresh every 1-2 seconds for active downloads. Don't poll — push.

The frontend update path: SSE message → `updateTask(id, partialFields)` → `renderTasks(currentFilter)` (or surgical update if performance demands).

---

## 6. Sanity checks (run before any PR that changes mock data)

1. **All 4 statuses present** in the rendered table (when filter is `all`)
2. **All 5 types present** across the 14 tasks
3. **No two tasks have the same `id`**
4. **No two tasks have the same `name`**
5. **Speed is `0 B/s` for non-downloading tasks, never a non-zero number**
6. **ETA is `—` (em-dash) for non-downloading tasks**
7. **Progress is 0-100, integer**
8. **Every task has ≥ 1 file in `files`**
9. **Every task has 3-6 timeline events**
10. **Total visual density:** table shows 8+ rows when filter is `all` (otherwise the visual baselines are wrong)
