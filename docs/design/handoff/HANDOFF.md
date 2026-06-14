# Motrix AI — Design & Implementation Handoff

**Project:** Motrix AI — Premium desktop download manager (Task-First)
**Repository:** `SonicBotMan/motrix-ai`
**Design source:** `index.html` (single-file prototype, ~141 KB, 3521 lines)
**Visual baselines:** `references/01-onboarding-2026-06-15.png` · `02-main-screen-2026-06-15.png` · `03-detail-overlay-2026-06-15.png` (3840×2160, retina)
**Author:** Design Director (Orion)
**Date locked:** 2026-06-15
**Audience:** Backend/frontend engineers, PM, QA, future designers

---

## 0. How to use this document

Read this main file top-to-bottom on first pickup. Then keep `01-design-system.md` open as a permanent reference while writing code. Sub-specs (`02..06`) are read on demand by area.

| If you are... | Start with... |
|---|---|
| Implementing the visual layer | §3 Architecture → `01-design-system.md` → `02-components.md` |
| Wiring the chat / toast system | `02-components.md` §6 (Toast stack) + `03-motion.md` §4 |
| Building the keyboard shortcuts | `04-accessibility.md` §3 |
| Mocking demo data | `05-mock-data.md` |
| Reviewing PRs for design quality | `06-anti-ai-slop.md` (the binding checklist) |
| Debugging a visual regression | `CHANGELOG.md` (look up which round introduced/removed the element) |

---

## 1. Product one-liner

> **A task-first desktop download manager where the task queue is the hero and the AI chat is the input bar.**

The product is **not** a chat-first assistant. The download table occupies ~80% of the main view. The AI chat input sits at the bottom 20% — like the search bar in VS Code or the URL bar in a browser. Chat replies surface as a toast stack above the input, not as a sidebar.

This is a **deliberate inversion** of the original spec's "chat-first" stance. The inversion was made in Round 2 after measuring that power users want to *see their queue*, not converse with it. The decision is final and lives in §2.1.

---

## 2. Locked design decisions (do not re-litigate)

These are decisions that were debated, decided, and shipped. Do not propose alternatives in PR review without raising an ADR first.

### 2.1 Task-first, not chat-first

| Aspect | Decision |
|---|---|
| Main view layout | Task table 80% / bottom chat 20% |
| AI reply surface | Toast stack above chat input (auto-dismiss in 2s) |
| Onboarding step 0 copy | Reads "task-first download manager" — not "chat-first" |
| Detail panel entry | Click row → row flash (180ms) → modal scale-in |
| Empty state | Filter-aware copy (NOT a generic "No downloads yet") |

**Rationale:** Power users (the target audience) want to scan state at a glance. Chat as primary input is a marketing-friendly framing that loses to qBittorrent / Linear density on actual utility.

### 2.2 Visual direction — Modern minimal, not cozy/editorial

| Dimension | Locked value |
|---|---|
| Aesthetic family | Linear × Raycast × qBittorrent density |
| NOT this | Notion softness, Apple beige, editorial magazine, brutalist |
| Default theme | Dark (`#0A0A0B` canvas) |
| Color stance | One restrained primary accent (`#3B82F6`) + one success accent (`#10B981`) |
| Typography pairing | Inter (UI) + JetBrains Mono (numerics, hashes, sizes, ETA) |
| Information density | High — task table is the hero, not a teaser |
| Decoration budget | One decisive flourish per screen, never three |
| Gradient policy | None on backgrounds. One 3px top accent stripe on the onboarding card is the only gradient in the file. |
| Emoji policy | Zero. All icons are inline SVG (Lucide-style, stroke 2.5). |
| Em-dash policy | Zero in user-visible copy. (Em-dash in CSS/HTML comments is fine.) |
| AI-slop stance | See `06-anti-ai-slop.md` — 22 rules, every one with a reason. |

### 2.3 Spec-internal contradictions (resolved)

The original spec said "chat-first", but the implementation plan and prototype already moved to task-first. The conflict was resolved by **deferring to the implementation** because the plan was the more recent and tested direction. Anyone reading the spec alone will see "chat-first" — call this out in onboarding handoff so they don't undo it.

### 2.4 What is *not* in this prototype

| Missing | Why | Where it should land |
|---|---|---|
| Real Rust/Tauri backend | Frontend-only prototype | Tauri command-bridge in v0.2 |
| Real BitTorrent / HTTP / YouTube logic | Mock data only | Backend service layer |
| Real system theme detection | Manual toggle only | `window.matchMedia('(prefers-color-scheme: dark)')` in v0.2 |
| Internationalization beyond UI strings | Strings are English-only | i18n setup is a separate epic |

---

## 3. Architecture (4 screens)

The entire app is a single HTML file. There is no router. There are 4 `<section class="screen">` elements; exactly one has `.active` at a time. The `showView(name)` function (line 2691) is the only screen-switching primitive.

### 3.1 Screen inventory

| Screen | `id` | When active | What it owns |
|---|---|---|---|
| Onboarding | `screen-onboarding` | First visit only (gated by `localStorage`) | 3-step flow: intro → theme → quick action |
| Main | `screen-main` | Default after onboarding | Task table (top 80%) + bottom chat input (bottom 20%) + chrome bar |
| Detail | `screen-detail` | When a task row is clicked | Sticky header / 4-col stat strip / progress ring / collapsible sections / sticky footer actions |
| Settings | `screen-settings` | When settings icon clicked | 7-tab form: General / Appearance / AI / Storage / Network / Notifications / About |

**Visual baseline screenshots are the single source of truth for layout** — when in doubt, look at the PNGs first, then read the spec, then the CSS.

### 3.2 Layout grid (1080p reference)

| Region | Pixel | Notes |
|---|---|---|
| Window | 1920 × 1080 | Test at this; verify at 1366×768 and 1280×720 |
| Chrome bar | 48 px tall | `var(--chrome-height)` |
| Task table | `100vh - 48 - 96` (≈ 936 px) | Header + scroll body |
| Bottom chat | 96 px tall | Input row + chip row above |
| Detail panel | 720 × min(88vh, 760px) | Centered horizontally + vertically in viewport |
| Onboarding card | 480 × 600 | Centered |

### 3.3 Data flow

```
MOCK_TASKS (array)
  ↓ renderTasks(filter)
  ↓  <tr data-task-id="N"> cells
  ↓  --row-i set inline for stagger
  ↓
DOM (#taskTableBody)
  ↓ click on row
  ↓ openDetail(id)  (180ms row-flash → showView('detail'))
  ↓ openDetail fills #detailPanel
```

```
User input (chat bar or chip)
  ↓ sendMessage()
  ↓ setSendingState(true) → button disabled, spinner
  ↓ showChatToast({type, text})  (thinking → done in 700-1100ms)
  ↓ auto-dismiss after TOAST_LIFETIME (2s)
```

---

## 4. The 8 components

Every visible element in the prototype is one of these 8 components. New work should extend an existing component, not add a new pattern.

| # | Component | Reference | See |
|---|---|---|---|
| 1 | **Chrome bar** (top window chrome) | 48px tall, sticky top | `02-components.md` §1 |
| 2 | **Bottom chat input** (with quick-action chips) | 96px tall, sticky bottom of main view | `02-components.md` §2 |
| 3 | **Task table** (8-column density table) | Main view, ~80% height | `02-components.md` §3 |
| 4 | **Detail panel** (5-zone overlay) | Modal, centered | `02-components.md` §4 |
| 5 | **Toast stack** (max 4 visible, type-colored) | Above bottom chat | `02-components.md` §5 |
| 6 | **Row menu** (per-row ··· menu with 4 items) | Inside each task row | `02-components.md` §6 |
| 7 | **Detail more menu** (header ··· menu) | Detail panel header right | `02-components.md` §7 |
| 8 | **Onboarding card** (3-step wizard) | Splash-style | `02-components.md` §8 |

---

## 5. The 5 motion primitives

`03-motion.md` documents the full motion system. Summary:

| # | Keyframe | Where used | Duration | Trigger |
|---|---|---|---|---|
| 1 | `fadeSlideUp` | Onboarding step transitions | 250ms | Step advance |
| 2 | `shimmer` | Progress bar fill (only while downloading) | 2s infinite | Always during download |
| 3 | `spin` | Send button spinner | 700ms infinite | While sending |
| 4 | `pulse` | Status dot (live indicator) | 1.5s infinite | Status is `downloading` |
| 5 | `modalScaleIn` / `modalScaleOut` | Detail panel open/close | 400ms / 220ms | Row click / Esc |
| 6 | `rowReveal` | Task table filter switch | 220ms × 6 stagger = 388ms | Filter tab change |

**Single motion language:** every transition uses `cubic-bezier(0.2, 0.8, 0.2, 1)` spring-out. **Single easing function. Do not add new easings.**

`prefers-reduced-motion: reduce` is fully handled — animations drop to 0.01ms, infinite loops stop, transitions compress to 100ms. **Test in reduced-motion mode before shipping any new animation.**

---

## 6. Accessibility commitments

WCAG 2.1 AA is the floor. Specific commitments:

| Commit | Where | Test |
|---|---|---|
| Focus visible on every interactive element | `--focus-ring` token | Tab through main; verify ring is near-white, 2px, 3px offset |
| All status / state changes announced | `aria-live="polite"` on toast stack | Trigger any toast; verify screen reader announces |
| Filter / settings tabs expose active state | `aria-current="page"` on active tab | Tab to filter bar; verify SR reads "current" |
| All keyboard shortcuts documented | `04-accessibility.md` §3 | Try ⌘1-5, Esc, j/k, Enter, m on main |
| No motion triggers vestibular issues | `prefers-reduced-motion` block | Toggle OS reduced-motion; verify animations stop |
| Contrast ≥ 4.5:1 for text | All fg/bg pairs | Run an automated checker (axe DevTools) |
| 44×44 px minimum hit target on mobile | All icon-only buttons (mobile breakpoint) | Resize to 390px; verify thumb can hit all buttons |

---

## 7. Mock data contract

See `05-mock-data.md` for the full schema. Quick reference:

```
MOCK_TASKS = [
  {
    id: 1,                                     // int, unique, dense
    name: 'ubuntu-24.04-desktop-amd64.iso',   // string, the visible filename
    source: 'releases.ubuntu.com',             // string, formatted via formatSource()
    type: 'document',                          // video | document | audio | archive | torrent
    status: 'downloading',                     // downloading | paused | completed | error
    progress: 84,                              // 0-100 int
    speed: '24.6 MB/s',                        // human-readable, "0 B/s" when paused
    size: '4.8 GB',                            // downloaded amount (not total)
    total: '5.7 GB',                           // total
    eta: '38s',                                // human-readable
    connections: 12,                           // int
    seeders: 47,                               // int
    leechers: 3,                               // int
    files: [{name, size, checked}],            // array, length ≥ 1
    timeline: [{time, text, type}]             // 3-6 entries, newest first
  },
  ...
]
```

**The prototype ships 14 tasks spanning all 4 statuses and all 5 types.** Do not shrink to 2-3 "demo" tasks; the visual baseline screenshots depend on the density.

---

## 8. Anti-AI-slop binding checklist

See `06-anti-ai-slop.md` for the full 22 rules. This is the **binding quality bar for PR review.** Any PR that introduces one of these patterns gets a "do not merge" comment, no exceptions.

The top 5 most-committed violations to watch for:

1. **Adding emoji** (✨ 🚀 🎯) — every spec is emoji-free
2. **Inter / Roboto as a display face** (Inter is fine for body; display needs a distinctive alternative — currently using Inter for both is a known spec lock)
3. **Rounded card with a left coloured border accent** — Linear's cliché; we use sticky footers + dividers instead
4. **Invented metrics without sources** — every stat in mock data has a source field
5. **"Feature One / Feature Two" placeholder copy** — copy must be specific or honest placeholder (e.g. "—")

---

## 9. Quality gates (do not ship without)

- ✅ **Static self-check passes:** no emoji, no `onClick` (camelCase — only `onclick`), no `alert()`, no em-dash in user-visible copy, no dead code
- ✅ **`node --check` passes** on the inline `<script>` block
- ✅ **Reduced-motion test passes:** toggle OS reduced-motion, verify animations stop / compress
- ✅ **Tab-through test:** keyboard can reach every interactive element with visible focus ring
- ✅ **Three real-product screenshots render** at 1920×1080, matching the PNG baselines
- ✅ **5-dimension self-critique** scores ≥ 4/5 on each (philosophy / hierarchy / execution / specificity / restraint)

---

## 10. Version log (changelog)

See `CHANGELOG.md` for the per-round history. Current state is **Round 6** (imagegen-frontend-web → formatSource + 14-task density fix).

| Round | Theme | Net delta |
|---|---|---|
| 1 | creative-director (decisions: task-first / toast / Debian) | 6 emoji → 0; chip & chrome cleanups; toast system |
| 2 | detail overlay redesign + entry/exit motion | detail panel 5-zone layout; row flash + scale-in |
| 3 | toast types + row ··· menus + detail content density | 3-type toast; row menu; detail content reorg |
| 4 | detail panel polish (orientation fix, layout fix, button size) | progress ring rotation fix; button 38→28px; 4-tier radius |
| 5 | impeccable-design-polish (a11y + states) | focus ring token, prefers-reduced-motion, role="tab" + aria-current |
| 6 | design-taste-frontend (anti-AI-slop) + emilkowalski-motion + imagegen-frontend-web | em-dash 27→0, focus-ring unification, rowReveal stagger, formatSource + 14 tasks |

---

## Appendix A — File layout

```
motrix-ai-gui/
├── index.html                                 # the prototype (3521 lines, 141 KB)
├── references/
│   ├── 01-onboarding-2026-06-15.png           # 3840×2160, 97 KB
│   ├── 02-main-screen-2026-06-15.png          # 3840×2160, 234 KB
│   └── 03-detail-overlay-2026-06-15.png       # 3840×2160, 178 KB
├── docs/
│   ├── superpowers/
│   │   ├── plans/2026-06-12-motrix-ai.md      # original impl plan
│   │   └── specs/2026-06-12-motrix-ai-design.md  # original spec
│   └── handoff/                                # this directory
│       ├── HANDOFF.md                          # this file
│       ├── 01-design-system.md
│       ├── 02-components.md
│       ├── 03-motion.md
│       ├── 04-accessibility.md
│       ├── 05-mock-data.md
│       ├── 06-anti-ai-slop.md
│       └── CHANGELOG.md
└── plugin-source/                              # Open Design plugin provenance
    └── motrix-ai-implementation-plan-{a,b}/
        ├── SKILL.md
        ├── open-design.json
        └── references/
```

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **Sticky header** | Header that stays at the top of its scroll container while the body scrolls. Used on the detail panel header & footer. |
| **Filter-aware empty state** | The "no results" message changes copy based on which filter is active (e.g., "No completed downloads" not "No downloads yet"). |
| **Task-first** | Main view is dominated by the task queue (80% of vertical space); chat input is a 20% strip at the bottom. Opposite of "chat-first". |
| **Row flash** | 180ms primary-blue border + scale(1.005) on a task row the moment it is clicked, before the detail panel opens. Anchors the user's attention to *which* row they just clicked. |
| **Stagger reveal** | On filter switch, table rows fade in one after another with 28ms gaps. Capped at 6 rows of stagger. Stripped in reduced-motion. |
| **Toast stack** | Multiple toasts stack column-reverse in the bottom-right of main view, max 4 visible. Oldest gets auto-pruned. |
