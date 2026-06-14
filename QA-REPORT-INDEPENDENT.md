# INDEPENDENT QA REPORT — Motrix AI v1.0.0 (post-fix)

**Date:** 2026-06-15
**Commit:** 5b4d573 — "fix(gui): P0+P1+P2 — all QA audit findings resolved"
**Auditor:** Independent QA (fresh audit, no prior report read)

---

## Build status

| Check | Result | Evidence |
|-------|--------|----------|
| Git commit | `5b4d573` | `fix(gui): P0+P1+P2 — all QA audit findings resolved` |
| Frontend build (`pnpm build`) | **PASS** | `4 successful, 4 total` in 6.4s |
| Rust build (`cargo tauri build`) | **PASS** | `Finished release profile [optimized]` → `.app` + `.dmg` |
| App launches | **YES** | PID 35305 (`Contents/MacOS/app`) |
| aria2 RPC | **PARTIAL** | `getVersion` succeeded initially (v1.37.0); CLI `add` succeeded; but subsequent RPC calls **timeout** — aria2c becomes unresponsive after processing downloads |

---

## P0 verification

### 1. [PASS] Row menu position
**Evidence:**
- `TaskFirstView.vue:286` — `menuPosition.value = { x: event.clientX, y: event.clientY }`
- `TaskFirstView.vue:614-615` — `:x="menuPosition.x"` `:y="menuPosition.y"` passed to `<RowMenu>`
- `RowMenu.vue:28-38` — `menuLeft = props.x + 'px'`, `menuTop = (props.y + 4) + 'px'`
- Position now uses real mouse coordinates, not hardcoded `0,4`.

### 2. [PARTIAL] Paperclip dialog
**What works:**
- `TaskFirstView.vue:236` — `openDialog({ multiple: false, filters: [{ name: 'Torrent', extensions: ['torrent'] }] })` from `@tauri-apps/plugin-dialog`
- `capabilities/default.json` — `"dialog:default"` and `"fs:default"` permissions present ✅
- OS file dialog opens correctly.

**What's broken:**
- `TaskFirstView.vue:253` — `invoke<string>('add_torrent_file', { path: selected })` — **this Rust command does NOT exist**.
- `lib.rs:72-96` — the `invoke_handler![]` macro has no `add_torrent_file` entry.
- `grep -r "fn add_torrent" src-tauri/src/` → 0 results.
- **Impact:** User can select a `.torrent` file in the dialog, but the add operation fails with an error toast.

### 3. [PASS] DetailPanel listeners wired up
**Evidence:**
- `TaskFirstView.vue:604-606`:
  ```
  @open-location="openLocation"
  @copy-source="handleCopySource"
  @toggle-file="onToggleFile"
  ```
- `DetailPanel.vue:159-163` — `onMoreAction('copySource')` emits `copySource`; `onMoreAction('openLocation')` emits `openLocation`
- Both Copy source and Open file location menu items are present and functional at the event level.

### 4. [FAIL] openLocation actually opens OS file manager
**Evidence:**
- `show_in_folder` Rust command **exists and is registered** (`lib.rs:84`, `fs.rs:302`) ✅
- `fs.rs:303-306` — `let p = PathBuf::from(&path); if !p.exists() { return Err(...) }`
- `TaskFirstView.vue:368` — passes `const folder = '~/Downloads/Motrix AI'`
- **Bug:** Rust's `PathBuf` does **not** expand `~`. The literal path `~/Downloads/Motrix AI` resolves to `<cwd>/~/Downloads/Motrix AI`, which does not exist.
- `p.exists()` returns `false` → function returns `Err("File not found: ~/Downloads/Motrix AI")`.
- `TaskFirstView.vue:377-385` — catch block fires, shows info toast: `"Reveal in folder: ~/Downloads/Motrix AI/..."`.
- **Finder NEVER opens.** The function always falls through to the toast fallback.
- Verified: `test -d '~/'` → "Literal ~ does NOT exist" on the system.
- Additional issue: even with a correct path, `open -R` is designed to reveal a specific **file**, but the code passes a **folder** path.

---

## P1 verification

### 1. [PASS] No more hardcoded tasks
**Evidence:**
- Router default route `/` → `TaskFirstView.vue` (`router/index.ts:9`)
- `TaskFirstView.vue:39` — `const tasks = computed(() => tasksStore.tasks)` (Pinia store, aria2-backed)
- `stores/tasks.ts:120-125` — `tasks` computed returns aria2-mapped tasks when connected, local fallback otherwise
- `mock/tasks.ts` still exists with `MOCK_TASKS` but is **NOT imported** by `TaskFirstView.vue` or `stores/tasks.ts`
- `useTaskAdapter.ts:84` still falls back to `MOCK_TASKS` but is not used by the active view

### 2. [PASS] Pause/Resume/Retry/Delete call aria2 RPC
**Evidence (all in `stores/tasks.ts`):**
- `pauseTask:230-235` — `await aria2.pause(task.gid)` ✅
- `resumeTask:253-258` — `await aria2.unpause(task.gid)` ✅
- `retryTask:282-286` — `await aria2.remove(task.gid)` + `await aria2.addUri(task.source)` ✅
- `removeTask:214-218` — `await aria2.remove(task.gid)` ✅
- All check `task.gid && aria2.connected.value` with local fallback ✅

### 3. [PASS] File checkboxes interactive
**Evidence:**
- `DetailPanel.vue:366-372` — `<input type="checkbox" class="file-check" :checked="f.checked !== false" @change="emit('toggleFile', i)">`
- `TaskFirstView.vue:606` — `@toggle-file="onToggleFile"`
- `TaskFirstView.vue:422-428` — `onToggleFile` shows a toast confirming the toggle
- `DetailPanel.vue:831` — `.file-check { cursor: pointer; }`

### 4. [PARTIAL] Quick action chips work
| Chip | Action | Result |
|------|--------|--------|
| 0 — Download Ubuntu 24.04 | `handleSendMessage('Download Ubuntu 24.04 LTS ISO')` → NL intent parse | ✅ |
| 1 — What is downloading? | `activeFilter = 'active'` + toast | ✅ |
| 2 — Pause all | `invoke('pause_all')` | **❌ FAIL — command not registered** |
| 3 — Show completed | `activeFilter = 'completed'` + toast | ✅ |
| 4 — Add magnet URL | hint toast | ✅ |

**Chip 2 detail:** `TaskFirstView.vue:221` calls `invoke('pause_all')`. No `pause_all` function exists in the Rust source (`grep -r "fn pause_all" src-tauri/src/` → 0 results) and it is not registered in `lib.rs:72-96`. The catch block shows an error toast: `"Pause all failed: ..."`. The store already has `aria2.pauseAll()` available but it is not used.

---

## P2 verification

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | No em-dash in user-visible copy | **PASS** | i18n strings (`useSettings.ts`): zero em-dashes. Toast messages, button labels, headings: zero em-dashes. Em-dashes in CSS comments only (`BottomChat.vue:319`) — allowed per HANDOFF §2.2. Minor: `—` used as placeholder for missing data values (ETA, speed) in `TaskTable.vue:281`, `DetailPanel.vue:103,315,319`, `stores/tasks.ts:79,81`. These are data placeholders, not copy, but are technically user-visible. |
| 2 | No emoji in i18n strings | **PASS** | `useSettings.ts`: zero emoji characters. |
| 3 | Size column shows downloaded/total | **PASS** | `TaskTable.vue:278` — `{{ task.size }} / {{ task.total }}`. `stores/tasks.ts:80` — `${completed} MB / ${total} MB`. |
| 4 | Filter tabs show Paused (not Failed) | **PASS** | `TaskTable.vue:55` — `{ label: 'Paused', value: 'paused' }`. |
| 5 | Filter tabs role=tablist/tab | **PASS** | `TaskTable.vue:199` — `role="tablist"`. `TaskTable.vue:206` — `role="tab"` + `:aria-selected`. |
| 6 | Progress ring role=progressbar | **PASS** | `DetailPanel.vue:326-330` — `role="progressbar"` + `aria-valuenow/min/max/valuetext`. |
| 7 | SVGs have aria-hidden | **PASS** | 27/29 SVGs in `components/` have `aria-hidden="true"`. Missing: ToastStack close button SVG (`:88`) and DetailPanel detail-icon SVG (`:221`, but parent `<div aria-hidden="true">` covers it). The originally targeted SVGs are fixed. |
| 8 | BottomChat has focus-visible | **PASS** | `.chip:focus-visible` (`:173`), `.chat-attach:focus-visible` (`:224`), `.chat-send:focus-visible` (`:281`). |
| 9 | ChromeBar shows 'AI' wordmark | **PASS** | `ChromeBar.vue:61-62` — `<span class="logo-motrix">Motrix</span> <span class="logo-ai">AI</span>`. |
| 10 | Type icon stroke-width is 2.5 | **PASS** | `TaskTable.vue:243` — `stroke-width="2.5"`. |
| 11 | _deriveToastTypeLegacy removed | **PASS** | `grep -r "_deriveToastTypeLegacy"` → 0 results across entire repo. |
| 12 | BottomChat 96px tokenized | **PASS** | `BottomChat.vue:113` — `height: var(--bottom-chat-height, 96px);`. |
| 13 | Column widths balanced | **PASS** | `TaskTable.vue:392-399` — 28% + 16% + 8% + 17% + 8% + 11% + 7% + 5% = 100%. |

---

## NEW issues found

### NEW-1. [P0] `pause_all` Rust command missing
**File:** `TaskFirstView.vue:221`
**Detail:** `invoke('pause_all')` calls a Rust command that does not exist. Not defined in any `.rs` file, not registered in `lib.rs`. The "Pause all" quick action chip always fails with an error toast. The store already has `aria2.pauseAll()` — should call `tasksStore` or add a Rust command.

### NEW-2. [P0] `add_torrent_file` Rust command missing
**File:** `TaskFirstView.vue:253`
**Detail:** `invoke<string>('add_torrent_file', { path: selected })` calls a Rust command that does not exist. The paperclip button opens the OS file dialog (that works), but selecting a `.torrent` file always produces an error toast. Need to either implement this Rust command or route through the store's `addTask` path.

### NEW-3. [P0] `show_in_folder` receives unexpanded tilde path
**File:** `TaskFirstView.vue:368`
**Detail:** Passes `'~/Downloads/Motrix AI'` as literal string. Rust `PathBuf` does not expand `~`. `p.exists()` returns `false` → `show_in_folder` always errors → catch block fires → only a toast is shown, Finder never opens. Fix: resolve the home directory in Rust (`dirs::home_dir()`) or expand in the frontend before calling invoke. Additionally, `open -R` on macOS expects a file path, not a folder — should pass the actual file path from `task.filePath`.

### NEW-4. [P1] aria2 RPC becomes unresponsive after CLI add
**Detail:** After adding a download via CLI, the aria2c process continues running but stops responding to HTTP RPC requests (verified: `getVersion`, `getGlobalStat`, `tellActive` all timeout). The port remains open (`nc -z` succeeds) but no HTTP response is returned. This could cause the GUI to show stale task data or lose its aria2 connection. Possible cause: aria2c thread starvation or RPC socket issue.

### NEW-5. [P2] ToastStack close button SVG missing aria-hidden
**File:** `ToastStack.vue:88`
**Detail:** The close button SVG doesn't have `aria-hidden="true"`. The button itself has `aria-label="Dismiss notification"`, so the SVG should be hidden from screen readers.

---

## Final verdict

### **NOT READY**

**Blockers (3 new P0 bugs):**

1. **`pause_all` command missing** — "Pause all" chip is non-functional.
2. **`add_torrent_file` command missing** — Torrent file attachment is non-functional (dialog opens but add fails).
3. **`show_in_folder` tilde path bug** — "Open file location" never opens Finder; always falls through to toast.

**P0 original items status:** 1 PASS, 1 PARTIAL (dialog opens but torrent add fails), 1 PASS, 1 FAIL.

**P1 original items status:** 3 PASS, 1 PARTIAL (Pause all chip broken).

**P2 items:** 13/13 PASS (with minor caveats on em-dash placeholders and 2 SVGs missing aria-hidden).

**Root cause pattern:** Three Rust commands are invoked from the frontend that don't exist in the Rust backend. The fixes added the `invoke()` calls but never implemented the corresponding Rust commands or registered them in `lib.rs`. The `show_in_folder` command exists but receives a path that can never resolve. These are integration gaps between the Vue frontend and the Tauri Rust backend.
