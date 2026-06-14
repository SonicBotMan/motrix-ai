# CHANGELOG

Per-round history of design changes. Each entry includes: **Date · Round name · Skill/workflow that drove it · What changed · Why · Files affected · Verification done**.

This file is the audit trail. When you need to understand *why* a design decision was made, find the round below.

---

## Round 6 — 2026-06-15 — Image asset baseline + formatSource + density fix

**Driven by:** `@imagegen-frontend-web` workflow + Round 5 followup

**What changed:**

1. **3 product screenshots** rendered via Playwright at 1920×1080 (retina @2x = 3840×2160):
   - `references/01-onboarding-2026-06-15.png` (97 KB)
   - `references/02-main-screen-2026-06-15.png` (234 KB)
   - `references/03-detail-overlay-2026-06-15.png` (178 KB)
2. **`formatSource()` function** added (line 3070 of `index.html`) to abbreviate magnet URIs and trim long URLs for display in the task table.
3. **MOCK_TASKS density** increased from 6 → 14 tasks. New tasks span 4 statuses (downloading/paused/completed/error) and 5 types (video/document/audio/archive/torrent).
4. **One `status: 'failed'` corrected to `status: 'error'`** so it renders through the existing `statusMap` (otherwise it would display the literal string `failed` with no color).

**Why:**

- Screenshots are the single source of truth for layout. The 3 PNGs are the visual baseline that all future work must match.
- Magnet URIs are 100+ characters; without `formatSource`, they were truncated to ellipsis and the user couldn't see the hash.
- 6 tasks left ~660 px of empty space in the main view at 1080p, which broke the visual density promise of the design.

**Files affected:** `index.html` (3519 lines, 141 KB); 3 new files in `references/`

**Verification:** 4-dim vision review on each screenshot (philosophy / hierarchy / execution / specificity / restraint) — all scores ≥ 4/5. Browser measurement: 14 rows, 4 statuses visible, column widths 26/18/8/18/8/10/7/5.

---

## Round 5 — 2026-06-15 — Focus ring unification + button states

**Driven by:** `@impeccable-design-polish` workflow (after user explicit request: "加 :focus-visible 全局 outline ring 统一 token")

**What changed:**

1. **`--focus-ring` and `--focus-ring-soft` tokens** added in both dark and light theme palettes.
2. **All 8 focusable selectors** now reference the token (no hardcoded `var(--primary)` outlines anywhere).
3. **`.btn:focus-visible` enhanced** with `outline-offset: 3px` and `box-shadow: 6px spread` halo.
4. **Dark-mode ring color changed** from `oklch(82% 0.10 255)` (light blue) to `oklch(92% 0.005 255)` (near-white) — solves the perceptual fusion problem when ring sits next to a primary-blue button.
5. **Light-mode ring color** stays `oklch(45% 0.15 255)` (mid-blue).

**Why:**

- A11y commitment: WCAG 2.4.13 (Focus Appearance, AAA) requires 2px+ outline with ≥ 3:1 contrast. The previous primary-blue outline hit 3.4:1 — passing but perceptually weak against primary buttons.
- Near-white in dark mode gives 15.8:1 contrast against `--bg` and 3.4:1 against `--primary` button bg, which is the strongest possible choice.

**Files affected:** `index.html` (~10 lines of CSS for tokens + selectors)

**Verification:** Keyboard Tab navigation triggers `:focus-visible` on every interactive element. `getComputedStyle` confirmed `outline: 2px solid oklch(0.92 0.005 255)` and `outline-offset: 3px` and `box-shadow: 0 0 0 6px oklch(0.92 0.005 255 / 0.22)`.

---

## Round 4 — 2026-06-15 — Detail panel polish (orientation, layout, button size)

**Driven by:** `@creative-director` workflow (after user feedback: "detail panel 里的信息都积压在一块了，你自己好好看看。另外下载的百分比也朝向不对")

**What changed:**

1. **Progress ring orientation fix** — `transform: rotate(-90deg)` moved from the SVG to a `<g>` wrapper. Text inside the SVG no longer rotates.
2. **Detail panel layout reorganization** — 5 distinct zones: sticky header / 4-column stat strip / centered progress ring / collapsible sections / sticky footer. Each zone has its own border and padding.
3. **Panel centering** — added `align-items: center; justify-content: center` to `#screen-detail.active`. Panel was previously anchored to top-left.
4. **Button size reduction** — 4 footer buttons (Resume/Pause/Cancel/Priority) reduced from 38px → 28px height. Font-size 13 → 11.
5. **Priority moved to ··· menu** — Footer now has 3 main buttons (Resume/Pause/Cancel). Priority is in the `·..` more menu in the detail header.
6. **Detail body bottom padding** — 12px → 48px to prevent the last section from being clipped by the sticky footer.

**Why:**

- The progress ring text was rendering sideways (a real bug from a previous round where `transform: rotate(-90deg)` was applied to the whole SVG).
- Detail panel content was crammed into a single `.detail-body` with 16px gaps, making it hard to scan.
- 4 large buttons at 38px each = "form-style" UI, not "tool-style" UI. Power users want compact.

**Files affected:** `index.html` (~140 lines: detail HTML rewrite + CSS reorganization + new 4-zone layout + button size reduction)

**Verification:** Browser measurement confirmed `offsetHeight` of buttons = 32 → 28, panel = 720×585, panel centered (top=24, bottom=609 in 633px viewport). Vision review confirmed 4/5 hierarchy, 4/5 execution.

---

## Round 3 — 2026-06-15 — Toast types + row ··· menu + detail content density

**Driven by:** `@creative-director` workflow (after user explicit request: "1)Toast 加类型 2)Detail overlay 加点击行表的高亮反馈 3)优化任务点击后的面板内的展示")

**What changed:**

1. **Toast type system** — 3 types: `info` (primary blue), `success` (accent green), `error` (error red). Each has its own left accent strip, avatar bg, Lucide icon, and "done" status label.
2. **Type-aware sendMessage routing** — input text is keyword-matched to determine toast type: "cancel/remove/delete" → error, "error/fail/hash" → error, "pause/stop" → info, default → info.
3. **Row ··· menu** — replaced 3 status-specific inline buttons (Resume/Pause/Retry) with a single `···` button that opens a dropdown with 4-6 items (status-dependent). Hover-only visibility (opacity 0.7 default, 1 on row hover).
4. **Detail panel entry animation** — 2-step: row flash (180ms primary-muted bg + scale 1.005) → modal scale-in (400ms).
5. **Detail panel content reorg** — 4-column metric strip (Downloaded/Speed/Seeders/Connections), disk usage bar in the hero, Files/Activity as native `<details>` collapsibles.
6. **Source/Added/Save path/Info hash** moved to a bottom metadata grid.

**Why:**

- All toasts looking the same meant the user couldn't tell "your action succeeded" from "your action failed" at a glance.
- Inline buttons in each row were making the table feel cramped.
- Detail panel info was hidden behind a wall of progress stats; the metadata grid is more scannable.

**Files affected:** `index.html` (~200 lines: toast CSS + JS, row menu CSS + JS, detail CSS + HTML)

**Verification:** `node --check` passed on 32KB inline script. Browser measurement: 6 rows × 1 ··· button each, dropdown 168×144px, items 4 per dropdown (status-dependent).

---

## Round 2 — 2026-06-14 — Detail overlay redesign + entry/exit motion

**Driven by:** `@creative-director` workflow (initial prototype, after user locked the 3 design decisions: task-first, toast, Debian mock)

**What changed:**

1. **Detail panel layout** — moved from a single `.detail-body` to a 5-zone structure: header, 4-column stat strip, centered progress ring, collapsible sections, sticky footer actions.
2. **Entry animation** — `modalScaleIn` 400ms spring-out (scale 0.95 → 1, translateY 10px → 0, opacity 0 → 1).
3. **Exit animation** — `modalScaleOut` 220ms (scale 1 → 0.96, translateY 0 → 6px, opacity 1 → 0). Listens for `transitionend` to clean up.
4. **Backdrop fade** — `.detail-backdrop` opacity 0 → 1 on open, 1 → 0 on close.
5. **Esc / backdrop / × all close** — unified exit path through `closeDetail()`.

**Why:**

- The original detail panel had no entry/exit motion, which made the modal feel "hard-mounted."
- Power users press Esc reflexively; the close paths needed to be unified.
- Asymmetric durations (in 400 / out 220) feel "settle in" vs "settle back."

**Files affected:** `index.html` (~150 lines: detail HTML, CSS, JS)

**Verification:** Manual test of all 3 close paths (Esc, backdrop click, × button). All trigger the same `modalScaleOut` animation.

---

## Round 1 — 2026-06-12 — Initial prototype (creative-director decisions)

**Driven by:** `@creative-director` workflow (first session on this project)

**What changed:**

1. **3 design decisions locked** (via `<question-form>`):
   - Task-first (NOT chat-first) — 80% table / 20% bottom chat
   - Bottom chat reply → toast (NOT sidebar)
   - Mock data conflict resolved: replace task 3 (Debian not Ubuntu)
2. **Removed all emoji** from onboarding chips, chrome status, bottom chat chips, detail actions, Clear button (×), timeline checkmark
3. **Removed 27 em-dashes** from user-visible copy (kept in comments / em-dash as data placeholder)
4. **Removed `MOCK_MESSAGES` + `renderMessages()` + `#chatMessages` dead code** (orphaned by toast migration)
5. **Main screen chrome cleanup** — removed duplicate "Settings" button from `chrome-center`
6. **Settings page chrome** — added "SETTINGS" muted uppercase page title in `chrome-center`, restored "Motrix AI" wordmark on the left
7. **`onClick` (camelCase) → `onclick`** consistency fix in accent swatch
8. **Removed `alert()` calls** (replaced by toast system)
9. **Removed floating glow blob** on `.onboarding-logo` (the `box-shadow: 0 8px 24px rgba(59,130,246,0.25)`)

**Why:**

- The spec and implementation were misaligned (spec chat-first, impl task-first). Locked task-first.
- Toast was the right reply surface (not a sidebar) for a task-first product.
- Emoji, em-dash, glow blobs, alert() — all anti-AI-slop cleanups (see `06-anti-ai-slop.md`).

**Files affected:** `index.html` (started at 89 KB, after Round 1 = 89 KB, no net change because content was replaced not added)

**Verification:** `node --check` passed. Python static self-check: emoji=0, onClick=0, alert()=0, em-dash in user-visible=0, dead code=0.

---

## Visual baseline history

| Date | Round | Screenshots |
|---|---|---|
| 2026-06-12 | Round 1 | (no screenshots — text-based review) |
| 2026-06-14 | Round 2 | (rendered manually, not saved) |
| 2026-06-15 | Round 6 | `01-onboarding-2026-06-15.png` / `02-main-screen-2026-06-15.png` / `03-detail-overlay-2026-06-15.png` (the canonical baselines) |

When a future round changes a screen, re-render and rename. Old PNGs are kept for at least 2 rounds for diff.

---

## What did NOT change (and why)

These are decisions that were considered and explicitly rejected in some round. Documenting them prevents re-litigation.

| Considered | Rejected | Why |
|---|---|---|
| Card with left blue border accent | ❌ | Anti-AI-slop (Rule 12) |
| Decorative blob in background | ❌ | Anti-AI-slop (Rule 13) |
| "Trusted by 500+ teams" logo wall | ❌ | Anti-AI-slop (Rule 16); we don't have real customers |
| Inter as display face | ⚠️ partial | Acknowledged compromise in `01-design-system.md` §2.2 |
| Emoji icons | ❌ | Anti-AI-slop (Rule 1) |
| Chat-first main view | ❌ | Locked as task-first in Round 1 |
| Sidebar AI chat | ❌ | Toast stack is the reply surface (Round 1) |
| Real-time download progress via polling | ⚠️ deferred | v0.2 task (SSE/WebSocket) |
| Internationalization beyond English | ⚠️ deferred | Separate epic |
| Dark mode only (no light mode) | ❌ | Light mode is in the prototype via `data-theme="light"`, even though dark is default |
