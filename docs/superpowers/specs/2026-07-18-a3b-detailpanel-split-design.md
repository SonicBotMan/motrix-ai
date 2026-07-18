# A3b — DetailPanel Split (ProgressRing + PeerList + DetailFooter)

**Date:** 2026-07-18
**Status:** Design — Pending Implementation
**Parent:** A3 (giant component split) → A3b slice
**Verified against:** `main` @ `07238f7` (post-A3a)

## Problem

DetailPanel.vue is 1087 lines (script 265 + template 258 + styles ~564). Mixes modal lifecycle, status mapping, SVG progress ring computeds, peer polling async lifecycle, stat strip rendering, and action button logic.

## Scope

### In scope — 3 new files, 1 modified

| File                                                  | Action                   | Responsibility                                                              |
| ----------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `apps/gui/src/components/task/DetailProgressRing.vue` | **New** (~130 lines)     | SVG circular progress ring + ringColor/ringDashoffset/ringCaption computeds |
| `apps/gui/src/components/task/DetailPeerList.vue`     | **New** (~120 lines)     | Peer polling lifecycle (setInterval 3s) + peer list display                 |
| `apps/gui/src/components/task/DetailFooter.vue`       | **New** (~90 lines)      | Status-aware action buttons (Pause/Resume/Retry/Priority)                   |
| `apps/gui/src/components/task/DetailPanel.vue`        | **Modify** (1087 → ~750) | Modal container + header + stat strip + files/timeline sections             |

### Out of scope

- Header extraction (more-menu has outside-click state management coupled to panel lifecycle)
- Files/Timeline collapsible sections extraction (short templates, toggleFile is proxy emit)
- Stat strip extraction (mostly static display; PeerList extraction handles the dynamic part)
- New unit tests (repo has no component-rendering test infrastructure)
- Dead CSS cleanup (pre-existing orphaned styles in other components)

## Design

### DetailProgressRing.vue

**Props:** `task: Task | null`
**Emits:** none
**Internal:** `ringColor`, `ringDashoffset`, `RING_CIRC` constant, `ringCaption` computeds

Moves from DetailPanel script lines 133-172 (3 computeds + 1 constant) and template lines 395-429 (SVG ring). Pure display — no lifecycle, no side effects.

### DetailPeerList.vue

**Props:** `gid?: string`
**Emits:** none
**Internal:** `peers` ref, `peerPollTimer`, `fetchPeers()` async, watch on `gid` (start/stop 3s interval), `onUnmounted` cleanup, `formatPeerSpeed()` helper

Moves from DetailPanel script lines 66-111 (peers state + polling logic) and template lines 379-390 (peer stat-cell + peer-list-section). Self-contained async lifecycle.

### DetailFooter.vue

**Props:** `status: TaskStatus`
**Emits:** `pause`, `resume`, `retry`, `priority`
**Internal:** `isPaused` computed (status === 'paused')

Moves from DetailPanel template lines 490-519 (footer with status-conditional buttons). Simple delegation — DetailPanel passes `task.status` down, receives action emits, re-emits to parent.

### DetailPanel.vue after refactor

**Keeps:**

- Modal lifecycle (show/close/Esc/requestClose 220ms animate)
- Status mapping (`statusInfo` computed)
- More-menu state (showMoreMenu, outside-click)
- Header template (icon, filename, subLine, status chip, more-menu, close)
- Stat strip (Size/Speed/Upload/ETA/Seeders/GID — minus Peers)
- Files/Sources/Timeline collapsible sections
- Error banner

**Delegates:**

- `<DetailProgressRing :task="task" />` replaces zone 3
- `<DetailPeerList :gid="task.gid" />` replaces peer stat-cell + peer-list-section
- `<DetailFooter :status="task.status" @pause="..." @resume="..." @retry="..." @priority="..." />` replaces zone 5

## Verification Gates

| Check                         | Expected                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| `pnpm typecheck` (5 packages) | 0 errors                                                     |
| `pnpm test`                   | 702 pass (no regression)                                     |
| `pnpm lint`                   | 0 errors, 0 warnings                                         |
| DetailPanel line count        | < 850                                                        |
| 3 new files exist             | DetailProgressRing.vue, DetailPeerList.vue, DetailFooter.vue |

## Execution

Single PR, 4 commits: spec/plan doc + 3 component extractions (one commit per component, each independently verifiable via typecheck).

Branch: `refactor/a3b-detailpanel-split`
