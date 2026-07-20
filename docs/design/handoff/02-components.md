# 02 — Component Specifications

Each component spec has the same structure: **Anatomy** (what parts it has), **States** (every state with a screenshot description), **Props/data** (the JS data it reads), **Accessibility**, and **Anti-patterns** (what to NOT do).

Visual reference: see `references/02-main-screen-2026-06-15.png` for the chrome bar, task table, and bottom chat together. See `references/03-detail-overlay-2026-06-15.png` for the detail panel + toast stack. See `references/01-onboarding-2026-06-15.png` for the onboarding card.

---

## §1 — Chrome bar (top window chrome)

**DOM id:** no id; the chrome bar is a child of `#screen-main` and `#screen-settings`, both with class `chrome`.

### Anatomy

```
+----+--------------------------------+------------+------+
| •• |  Motrix AI                     |            | ☀  ⚙ |  <- 48px tall
+----+--------------------------------+------------+------+
```

| Zone   | Element                | What it shows                                                                                                         |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| left   | `.chrome-dots`         | 3 macOS-style window dots (red, yellow, green) — purely decorative on web, but signals "this is a desktop app window" |
| left   | `.chrome-logo`         | "Motrix" in primary blue + " AI" in fg, Inter 14px 600. Clickable, `title="Back to downloads"`, `onclick="goHome()"`  |
| center | (empty)                | Intentionally empty. Wordmark sits in `chrome-left`, the title context sits in the panel header below.                |
| right  | `.chrome-theme-toggle` | 28×28 button. Sun icon (light theme active) or moon icon (dark theme active). `title="Toggle theme"`.                 |
| right  | `.chrome-settings`     | 28×28 button. Gear icon. `title="Settings"`. Opens `#screen-settings`.                                                |

### States

| State                  | What changes                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| Default                | All buttons in `--fg-tertiary` (visible but quiet)                 |
| Hover (button)         | Color → `--fg`                                                     |
| Focus-visible (button) | Near-white 2px outline + 6px halo (see `01-design-system.md` §1.3) |
| Theme toggled          | Right theme button's icon swaps (sun ↔ moon)                       |
| Settings open          | `.chrome-settings` gets `aria-current="page"`, icon stays same     |
| Disabled               | (not applicable in current design)                                 |

### Behavior

- `chrome-logo` `onclick="goHome()"` returns user to main view from any nested screen (currently only main ↔ settings, but the function exists for future detail-from-settings flow)
- The 3 window dots are **decorative only** — clicking them does nothing (this is a web prototype, not a real desktop window)
- The chrome bar is **sticky** at `top: 0` with `z-index: 50` so it stays visible while the task table scrolls

### Anti-patterns

- ❌ Adding a search field in the chrome bar (it conflicts with the bottom chat as the input surface)
- ❌ Adding a back button next to the logo (inconsistent with the desktop-app mental model)
- ❌ Making the wordmark brand-color both halves ("Motrix AI" all blue) — the `Motrix` accent + `AI` neutral is the spec
- ❌ Using a different logo / wordmark on settings vs main (must be identical — the wordmark = the brand anchor)

---

## §2 — Bottom chat input

**DOM id:** `.bottom-chat` (wrapper), `.chatInput` (input field), `.chatSend` (send button), `.chatAttach` (attach button), `.bottom-chat-suggestions` (chip row).

### Anatomy

```
+------------------------------------------------------+
|  [📎 attach]  [text input............]  [↑ Send]    |  <- input row
+------------------------------------------------------+
|  [Download Ubuntu] [What is downloading?] [Pause all] [Show completed] [Add magnet URL]  |  <- chip row
+------------------------------------------------------+
```

Total height: 96 px. Two rows × 48 px each.

### Behavior

#### Input row

| Element       | Action             | Result                                                                                         |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `.chatInput`  | User types         | `toggleSendDisabled()` runs on each `input` event                                              |
| `.chatInput`  | User presses Enter | If `.chatSend` is enabled → `sendMessage()`                                                    |
| `.chatInput`  | Empty value        | `.chatSend` gets `:disabled` state, opacity 0.5, `pointer-events: none`                        |
| `.chatAttach` | Click              | `showChatToast("Attach a magnet or URL", { type: 'info' })` (placeholder; real attach in v0.2) |

#### Chip row

5 chips, each has an inline `<kbd>⌘N</kbd>` hint on the right.

| Index | Label                           | ⌘   | Action                |
| ----- | ------------------------------- | --- | --------------------- |
| 0     | "Download Ubuntu 24.04 LTS ISO" | ⌘1  | `sendQuickMessage(0)` |
| 1     | "What is downloading?"          | ⌘2  | `sendQuickMessage(1)` |
| 2     | "Pause all"                     | ⌘3  | `sendQuickMessage(2)` |
| 3     | "Show completed"                | ⌘4  | `sendQuickMessage(3)` |
| 4     | "Add magnet URL"                | ⌘5  | `sendQuickMessage(4)` |

Pressing ⌘1-5 anywhere on main (when not typing) triggers the corresponding chip.

#### Send flow (`sendMessage()`)

```
1. setSendingState(true)     # button: spinner + disabled + label "Sending…"
2. showChatToast({
     type: <derived from input text>,
     text: <input value or auto-pick>,
     thinkDelay: 700-1100ms random
   })
3. (toast appears above input with "Thinking…" + pulsing dot)
4. (700-1100ms later) toast transitions to "Done" with green check
5. setSendingState(false)    # button: arrow + enabled
6. input cleared
```

**Type derivation rules** (keyword routing):

- input contains `cancel` / `remove` / `delete` → `error`
- input contains `error` / `fail` / `hash` → `error`
- input contains `pause` / `stop` / `wait` → `info`
- everything else → `info`

### States

| Element      | State                  | Visual                                           |
| ------------ | ---------------------- | ------------------------------------------------ |
| `.chatInput` | Default                | border `--border`, bg `--surface`                |
| `.chatInput` | Focus-within           | border `--primary`, ring halo                    |
| `.chatInput` | Sending                | (no change; state is on send button)             |
| `.chatSend`  | Default                | primary blue fill, arrow icon                    |
| `.chatSend`  | Hover                  | bg `--primary-hover`                             |
| `.chatSend`  | Disabled (empty input) | opacity 0.5, `pointer-events: none`              |
| `.chatSend`  | Sending                | bg `--primary-muted`, spinner + "Sending…" label |
| `.chatChip`  | Default                | border `--border`, fg `--fg-secondary`           |
| `.chatChip`  | Hover                  | border `--fg`, bg `--surface-hover`              |
| `.chatChip`  | Active (pressed)       | transform: scale(0.97)                           |

### Accessibility

- Input has `placeholder="Type a magnet, URL, or command…"` (51 chars max)
- Send button has `type="button"`, `aria-label="Send message"`
- Attach button has `title="Attach a file"`, `aria-label="Attach a file"`
- Chip row is a `<div>` with `role="toolbar"` (semantic grouping of related actions)
- Each chip is a `<button>` with the kbd as visible text (not a separate element with `aria-hidden`)

### Anti-patterns

- ❌ Auto-focusing the input on page load (the user wants to see the task table first)
- ❌ Adding more than 5 chips (cognitive overload; use overflow menu if more needed)
- ❌ Replacing chips with autocomplete dropdown (the chip _is_ the example — its value is showing users what to type)
- ❌ Using a different color for active vs hovered chip (states should be subtle, not loud)

---

## §3 — Task table (8-column density table)

**DOM id:** `.task-table` (table), `#taskTableBody` (tbody), thead is unstyled.

### Column spec

| #   | Header      | Width | Content                                  | Truncation                    | Font                        |
| --- | ----------- | ----- | ---------------------------------------- | ----------------------------- | --------------------------- |
| 1   | NAME        | 26%   | `task.name`                              | ellipsis at 1 line            | Inter                       |
| 2   | SOURCE      | 18%   | `formatSource(task.source)`              | ellipsis at 1 line            | Inter                       |
| 3   | STATUS      | 8%    | Status pill (see below)                  | (no truncation)               | Inter 12px 500 UPPERCASE    |
| 4   | PROGRESS    | 18%   | Progress bar + percentage                | bar fills, % is right-aligned | Inter (text) + colored fill |
| 5   | SPEED       | 8%    | `task.speed` (or `·` if not downloading) | nowrap                        | JetBrains Mono              |
| 6   | SIZE        | 10%   | `task.size` / `task.total`               | nowrap                        | JetBrains Mono              |
| 7   | ETA         | 7%    | `task.eta` (or `—` if not applicable)    | nowrap                        | JetBrains Mono              |
| 8   | (no header) | 5%    | `.task-row-menu` (··· button)            | (always)                      | n/a                         |

Total: 100% of the available table width. **Column 8 has no visible header** — Linear/Vercel convention; hover-only actions don't get explicit column names.

### Row anatomy

```html
<tr data-task-id="N" style="--row-i: N">
  <td class="col-name">
    <svg class="task-type-icon" />
    <!-- lucide icon for task.type -->
    <span class="task-name-text">{name}</span>
  </td>
  <td class="col-source">{formatSource(source)}</td>
  <td class="col-status">
    <span class="status-pill {cls}">{LABEL}</span>
  </td>
  <td class="col-progress">
    <div class="task-progress">
      <div class="task-progress-fill {cls}" style="width: {progress}%" />
    </div>
    <span class="task-progress-pct">{progress}%</span>
  </td>
  <td class="col-speed">{speed or ·}</td>
  <td class="col-size">{size} / {total}</td>
  <td class="col-eta">{eta}</td>
  <td class="col-actions">
    <button class="task-row-menu" onclick="toggleRowMenu(event, '{id}')">⋯</button>
    <div class="task-row-dropdown" id="rowMenu-{id}">... menu items (see §6) ...</div>
  </td>
</tr>
```

### Status pill

| `task.status` | Pill label  | Pill class    | Pill color                           | Progress fill color                                  |
| ------------- | ----------- | ------------- | ------------------------------------ | ---------------------------------------------------- |
| `downloading` | DOWNLOADING | `downloading` | bg `--primary-muted`, fg `--primary` | `--primary` (with shimmer)                           |
| `paused`      | PAUSED      | `paused`      | bg `--warning-muted`, fg `--warning` | `--warning` (no shimmer)                             |
| `completed`   | COMPLETED   | `completed`   | bg `--accent-muted`, fg `--accent`   | `--accent` (no shimmer, no animation)                |
| `error`       | FAILED      | `error`       | bg `--error-muted`, fg `--error`     | `--error` (no fill, red bar at 0% if progress < 100) |

### States

| Row state     | Trigger                  | Visual                                                  |
| ------------- | ------------------------ | ------------------------------------------------------- |
| Default       | —                        | bg transparent, border-bottom `--border`                |
| Hover         | mouse over               | bg `--primary-subtle`                                   |
| Selected      | `selectedRowIndex === i` | bg `--primary-muted`, inset 2px left border `--primary` |
| Row flash     | Just clicked             | bg `--primary-muted`, scale 1.005 (180ms then back)     |
| ··· menu open | `.task-row-menu.open`    | (menu open below, see §6)                               |

### Density rule

- Row height: 56 px (8 + 40 + 8)
- All cells vertically centered
- All cells have 12px horizontal padding
- No zebra striping (hovers do the work)

### Filter tabs (above the table)

4 tabs, equal width, all on a single row. Currently active tab gets `--surface-elevated` bg + `--fg` text. Each tab has `aria-current="page"` when active.

| Tab       | Filter value | What it shows                    |
| --------- | ------------ | -------------------------------- |
| All       | `all`        | Every task (default)             |
| Active    | `active`     | status `downloading` OR `paused` |
| Paused    | `paused`     | status `paused` only             |
| Completed | `completed`  | status `completed` only          |

**`aria-current`:** all 4 tabs render with `aria-current="false"` initially; on click, `aria-current="page"` is set on the clicked tab and removed from siblings.

### Empty state (filter-aware)

When the filtered list is empty, show a different message based on which filter is active:

| Filter active | Heading                 | Sub-copy                                                       | CTA                                                                 |
| ------------- | ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `all`         | "No downloads yet"      | "Add a magnet link, HTTP URL, or YouTube link to get started." | "Try a sample task" → `completeOnboarding('Download Ubuntu 24.04')` |
| `active`      | "Nothing downloading"   | "All your downloads are paused or completed."                  | (no CTA)                                                            |
| `paused`      | "No paused downloads"   | "Pause a download to see it here."                             | (no CTA)                                                            |
| `completed`   | "Nothing completed yet" | "Downloads appear here once they finish."                      | (no CTA)                                                            |

### Keyboard navigation

- `j` or `↓` → next row (wraps to first after last)
- `k` or `↑` → previous row (wraps to last from first)
- `Enter` → open detail panel for selected row
- `m` → open ··· menu for selected row
- Selected row scrolls into view via `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`

### Anti-patterns

- ❌ Zebra striping (alternating bg colors) — modern minimal uses hover/select only
- ❌ Sortable column headers with arrows — out of scope for the prototype; if needed, plan separately
- ❌ Inline editing of cells (e.g., click to rename file) — keep as a v0.2 feature, do not introduce
- ❌ Column resizing handles — the 8-column widths are fixed; users can resize the window
- ❌ Making the table header "always visible" by lifting it out of the table — the spec uses `position: sticky` on `<thead>`, not a separate sticky element

---

## §4 — Detail panel (5-zone overlay)

**DOM id:** `#screen-detail` (overlay), `.detail-backdrop`, `.detail-panel`, internal zones have classes `.detail-header`, `.detail-stats`, `.detail-ring`, `.detail-section`, `.detail-actions`.

### Anatomy

```
+--------------------------------------------------+
|  HEADER (sticky, 64px)                           |
|  [icon] filename.ext                  [STATUS] ⋯ × |
|         5.7 GB · Document · HTTP                  |
+--------------------------------------------------+
|  STAT STRIP (4-col equal width)                  |
|  Downloaded  │  Speed  │  ETA  │  Seeders        |
|  4.8/5.7 GB  │ 24.6 MB/s│  38s  │   47           |
+--------------------------------------------------+
|  PROGRESS RING (centered, 120×120 SVG)           |
|         [84%]                                    |
|         Downloading · 38s remaining              |
+--------------------------------------------------+
|  SECTIONS (scrollable, 3 collapsible)            |
|  Files (1)  ▾                                    |
|  ▢ ubuntu-24.04-desktop-amd64.iso  5.7 GB       |
|                                                  |
|  Activity (5)  ▾                                 |
|  ● 14:23:05  Downloading · 84% complete          |
|  ● 14:22:30  Connecting to peers (47 seeders)    |
|  ● 14:22:10  Metadata received                   |
|  ● 14:21:45  Resolving magnet link               |
|  ● 14:21:30  Task created                        |
|                                                  |
|  Source info  ▸                                  |
+--------------------------------------------------+
|  FOOTER (sticky, 65px)                           |
|  [Resume]  [Pause]  [Cancel]  [⋯ Priority ▾]    |
+--------------------------------------------------+
```

### Sizing

| Property          | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Panel width       | 720 px                                                             |
| Panel height      | `min(88vh, 760px)`                                                 |
| Centered          | `align-items: center; justify-content: center` on `#screen-detail` |
| Header height     | 64 px                                                              |
| Stat strip height | 80 px                                                              |
| Ring area         | 120×120 SVG + caption                                              |
| Sections          | Flexible, `flex: 1`, `overflow-y: auto`, `padding-bottom: 48px`    |
| Footer height     | 65 px                                                              |

### Open/close motion

| Action | Trigger                        | Effect                                              |
| ------ | ------------------------------ | --------------------------------------------------- |
| Open   | Row click → `openDetail(id)`   | Row flash 180ms → `modalScaleIn` 400ms on panel     |
| Close  | Esc, click backdrop, click `×` | `modalScaleOut` 220ms on panel → `showView('main')` |

**Don't** try to animate the row "expanding into" the modal — it's a separate scale, not a FLIP transition. The 180ms row flash is the bridge.

### Header

| Zone  | Element               | Content                                                                               |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| left  | `.detail-icon`        | 40×40 rounded square, bg `--primary-muted`, fg `--primary`, type-specific lucide icon |
| left  | `.detail-name`        | `task.name`, Inter 17px 600, nowrap + ellipsis at 1 line                              |
| left  | `.detail-sub`         | "{size} · {type} · {source}", Inter 12px, `--fg-tertiary`                             |
| right | `.detail-status-chip` | Same status pill as in the row, but slightly larger                                   |
| right | `.detail-more-menu`   | 32×32 button (···), opens the more menu (§7)                                          |
| right | `.detail-close`       | 32×32 button (×), `title="Close (Esc)"`                                               |

The header has `border-bottom: 1px solid var(--border)` and `padding: 16px 24px`.

### Stat strip

4 equal-width columns, divided by 1px vertical `var(--border)` lines. Each column has:

- **Top:** uppercase label, Inter 11px 500, `--fg-tertiary`, 8px bottom margin
- **Bottom:** big number, Inter 24px 600, JetBrains Mono, `--fg`

| Column     | Label        | Value                               |
| ---------- | ------------ | ----------------------------------- |
| Downloaded | "DOWNLOADED" | `{task.size} / {task.total}` (mono) |
| Speed      | "SPEED"      | `{task.speed}` (mono)               |
| ETA        | "ETA"        | `{task.eta}` (mono)                 |
| Seeders    | "SEEDERS"    | `{task.seeders}` (mono)             |

The strip has `padding: 16px 24px` and `border-bottom: 1px solid var(--border)`.

### Progress ring (centered, SVG)

| Property             | Value                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SVG size             | 120×120                                                                                                                                          |
| Center               | (60, 60)                                                                                                                                         |
| Background ring      | r=48, stroke `--border`, stroke-width 4, no fill                                                                                                 |
| Foreground ring      | r=48, stroke `--primary` (downloading) / `--warning` (paused) / `--accent` (completed) / `--error` (error), stroke-width 4, stroke-linecap round |
| Foreground transform | `<g transform="rotate(-90 60 60)">` so it starts at 12 o'clock                                                                                   |
| Text                 | "84%" at (60, 60) `text-anchor="middle" dominant-baseline="central"`, Inter 26px 600, `--fg`                                                     |
| Caption              | "Downloading · 38s remaining", Inter 13px, `--fg-tertiary`, 8px below the ring                                                                   |

**Important:** the rotation must be on a `<g>` wrapper, not the SVG itself. Rotating the SVG would also rotate the text, making it sideways. This is a real bug from Round 4 — do not undo this fix.

### Sections (collapsible)

3 `<details>` elements, all with `<summary>` that shows: section title, count, chevron. The chevron is an SVG that rotates 180° on `[open]`.

| Section     | Default state | Count source           |
| ----------- | ------------- | ---------------------- |
| Files       | **open** (1)  | `task.files.length`    |
| Activity    | **open** (5)  | `task.timeline.length` |
| Source info | **closed**    | (no count)             |

**File rows:** left has a 14×14 checkbox (square, no border when checked), middle has the file name (mono, ellipsis), right has the file size (mono, nowrap).

**Timeline rows:** left has a 6px dot (color matches event `type`: `active` = primary, `completed` = accent, otherwise = `--fg-muted`), middle has the time (mono, 11px, `--fg-tertiary`) and text (Inter 13px, `--fg`).

The Source info section, when opened, shows a 2-column key-value grid:

| Key       | Value                                            |
| --------- | ------------------------------------------------ |
| Source    | `formatSource(task.source)`                      |
| Added     | (current time at task creation, formatted HH:MM) |
| Save path | `~/Downloads/Motrix/{task.name}`                 |
| Info hash | (40-char hex, ellipsis if not real)              |

### Footer (sticky)

3 main buttons + 1 dropdown:

| Button       | Class                                                 | Action                    | Visual              |
| ------------ | ----------------------------------------------------- | ------------------------- | ------------------- |
| Resume       | `btn btn-primary`                                     | `handleAction('resume')`  | Filled primary blue |
| Pause        | `btn btn-ghost`                                       | `handleAction('pause')`   | Outline only        |
| Cancel       | `btn btn-danger` (red border, red text, red hover bg) | `handleAction('cancel')`  | Outline red         |
| ⋯ Priority ▾ | `btn btn-ghost detail-more-trigger`                   | Opens `.detail-more-menu` | Outline only        |

All 4 buttons are 32 px tall, the 3 main ones are `flex: 1` (equal width), the 4th is `flex: 0` with auto width.

### Accessibility

- Detail panel: `role="dialog"`, `aria-labelledby="detailName"`, `aria-modal="true"`
- Esc closes (handled at document level; see `04-accessibility.md` §3)
- Backdrop click closes (handler on `.detail-backdrop`)
- Focus trap: when open, focus moves to close button; on close, focus returns to the row that opened it
- `<details>` elements are natively keyboard-accessible (Space/Enter toggle, focus on summary)

### Anti-patterns

- ❌ Animating the row "expanding" into the modal — the two-stage (row flash + modal scale) is the spec
- ❌ Making the stat strip into 4 separate cards (Linear-style) — we use a single row with dividers for density
- ❌ Putting the action buttons in the header (priority / more menu is the header's job)
- ❌ Making the activity timeline scroll inside its own container (it scrolls with the whole sections area)
- ❌ Showing the "Save path" as a real file path with a `realtime-fs` lookup (it's always `~/Downloads/Motrix/{name}` for the prototype)

---

## §5 — Toast stack (max 4 visible)

**DOM id:** `#chatToastStack` (container), individual toasts have no id (they're created and destroyed).

### Container

```css
#chatToastStack {
  position: absolute;
  bottom: 100px; /* above the 96px bottom-chat */
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column-reverse; /* newest on top of stack, oldest at bottom (which is closest to input) */
  align-items: center;
  gap: 8px;
  pointer-events: none; /* container itself is non-interactive */
  z-index: 200;
}
```

Wait — correction from Round 2: **`flex-direction: column-reverse`** is what makes the newest appear visually above older ones. New toasts are appended; column-reverse flips the visual order so the latest is always on top.

### Toast anatomy

```
+--------------------------------------+
|  [type icon avatar]  Toast title     |
|                       Toast body     |
|                                    ✕ |
+--------------------------------------+
```

Width: 380 px. Height: auto, ~64-80 px depending on body length.

### Toast type → visual

| Type             | Left accent strip | Avatar bg         | Avatar icon (Lucide) | "Done" status label |
| ---------------- | ----------------- | ----------------- | -------------------- | ------------------- |
| `info` (default) | `--primary`       | `--primary-muted` | info-circle          | "Done"              |
| `success`        | `--accent`        | `--accent-muted`  | check-circle         | "Completed"         |
| `error`          | `--error`         | `--error-muted`   | alert-triangle       | "Failed"            |

### Toast lifecycle

```
thinking: 700-1100ms  →  done: 2000ms (TOAST_LIFETIME)  →  dismiss 300ms fade
```

| Phase    | Duration                             | Visual                                                                                                                  |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Enter    | 220ms                                | fade-in + translateY(8px) → 0                                                                                           |
| Thinking | 700-1100ms                           | avatar dot pulses (1s infinite), status label "Thinking…"                                                               |
| Done     | 2000ms (or until manually dismissed) | status label changes to "Done" / "Completed" / "Failed", avatar icon swaps from info → check / alert, dot stops pulsing |
| Exit     | 300ms                                | fade-out + translateY(0) → -8px                                                                                         |

### Stack cap

`TOAST_STACK_MAX = 4`. When a 5th toast would push past this, the oldest "done" toast auto-prunes.

### Behavior

- Toasts never stack inside the input — they float above it
- User can click ✕ to dismiss immediately
- Multiple toasts can exist simultaneously (each is independent)
- The container is `pointer-events: none`, but individual toasts set `pointer-events: auto` on the close button
- A click on a toast's body does **not** dismiss it (only the ✕)

### Accessibility

- Container has `aria-live="polite"`, `aria-atomic="false"`
- Each toast has `role="status"`
- Close button has `aria-label="Dismiss notification"`

### Anti-patterns

- ❌ Anchoring toasts to the top-right (Windows-style) — this is a chat input surface, toasts anchor to it
- ❌ Auto-dismissing during "thinking" (premature; user needs to know AI is still working)
- ❌ Stacking toasts horizontally (no, vertical column-reverse above the input)
- ❌ Adding a progress bar to indicate auto-dismiss timing (visual noise)
- ❌ Making toasts draggable / pinnable (out of scope)

---

## §6 — Row menu (per-row ··· menu)

**DOM trigger:** `.task-row-menu` (button inside each task row, last column)
**DOM dropdown:** `.task-row-dropdown` (sibling of the trigger, same `<td>`)

### Trigger

```html
<button class="task-row-menu" title="Row actions" onclick="event.stopPropagation();toggleRowMenu(event, '{task.id}')">
  ⋯
</button>
```

| State                 | Visual                                     |
| --------------------- | ------------------------------------------ |
| Default               | opacity 0.7, color `--fg-muted`            |
| Hover (row or button) | opacity 1, color `--fg`                    |
| Open                  | bg `--surface-hover`, color `--fg`         |
| Focus-visible         | 2px outline + halo (same as other buttons) |

### Dropdown

```html
<div class="task-row-dropdown" id="rowMenu-{task.id}">
  <button class="task-row-dropdown-item" onclick="event.stopPropagation();rowAction('{id}', 'pause')">...</button>
  <!-- conditional Retry if status === 'error' -->
  <div class="task-row-dropdown-sep" />
  <button class="task-row-dropdown-item" onclick="...rowAction('{id}', 'copy-link')">Copy link</button>
  <button class="task-row-dropdown-item" onclick="...rowAction('{id}', 'reveal')">Reveal in folder</button>
  <div class="task-row-dropdown-sep" />
  <button class="task-row-dropdown-item danger" onclick="...rowAction('{id}', 'remove')">Remove</button>
</div>
```

### Menu items (4-6, status-dependent)

| Item             | Shown when                 | Action                                                         | Toast type |
| ---------------- | -------------------------- | -------------------------------------------------------------- | ---------- |
| Resume           | `status === 'paused'`      | sets `status='downloading'`, `speed='12.4 MB/s'`               | success    |
| Pause            | `status === 'downloading'` | sets `status='paused'`, `speed='0 B/s'`                        | info       |
| Retry            | `status === 'error'`       | sets `status='downloading'`, `speed='8.7 MB/s'`, `progress=12` | info       |
| (separator)      | —                          | —                                                              | —          |
| Copy link        | always                     | (placeholder — clipboard API in v0.2)                          | info       |
| Reveal in folder | always                     | (placeholder — Finder/Explorer call in v0.2)                   | info       |
| (separator)      | —                          | —                                                              | —          |
| Remove           | always                     | splices from `MOCK_TASKS`, re-renders                          | error      |

### Dropdown visual

| Property      | Value                                      |
| ------------- | ------------------------------------------ |
| Width         | 168 px (min)                               |
| Padding       | 4 px                                       |
| Background    | `--surface-elevated`                       |
| Border        | 1 px `--border`                            |
| Border-radius | `--radius-md` (12 px)                      |
| Shadow        | `--shadow-lg`                              |
| Position      | absolute, right-aligned to the ··· trigger |
| Animation     | 140 ms fade + 8px → 0 translateY           |

### Behavior

- Click the ··· → opens (and closes any other open row menu)
- Click outside (anywhere) → closes
- Click a menu item → runs the action, closes the menu, shows toast
- The 2 separators divide items into 3 logical groups: **action** / **info** / **danger**

### Accessibility

- The ··· trigger has `title="Row actions"` and `aria-haspopup="menu"`, `aria-expanded="false/true"`
- The dropdown has `role="menu"`
- Each item has `role="menuitem"`
- Arrow keys navigate between items (TODO — out of scope for v0.1, but spec the behavior)

### Anti-patterns

- ❌ Showing the dropdown on hover (only on click; hover-only menus are a desktop OS pattern, not web)
- ❌ Making menu items checkbox / radio (they're actions, not state toggles)
- ❌ Putting a submenu / sub-dropdown (no nested menus in the current design)
- ❌ Adding "Edit name" or "Edit source" (those are out-of-scope for v0.1)

---

## §7 — Detail more menu (header ··· menu)

**DOM trigger:** `.detail-more-menu` (button in detail header)
**DOM dropdown:** `.detail-more-dropdown` (positioned absolute, below the trigger)

### Trigger

Same as row menu, but 32×32 and inside the detail header.

### Dropdown

Same width and shape as row menu, but **different items** (since these are detail-level actions):

| Item              | Action                      | Toast type |
| ----------------- | --------------------------- | ---------- |
| Priority          | `handleAction('priority')`  | info       |
| Copy link         | `handleAction('copy-link')` | success    |
| Reveal in folder  | `handleAction('reveal')`    | success    |
| Remove from queue | `handleAction('remove')`    | error      |

### Behavior

- Click the ··· in detail header → opens the dropdown below
- Click outside → closes
- Click an item → runs the action, closes the dropdown, shows toast
- **Note:** the "Resume / Pause / Cancel" buttons in the footer are _not_ inside this menu — they are the primary actions and live in the footer for direct access. The more menu holds secondary actions.

### Accessibility

- Same as row menu, except `aria-controls="detailMoreDropdown"` on the trigger

### Anti-patterns

- ❌ Duplicating the footer's "Resume" / "Pause" / "Cancel" actions in this menu (they're already there)
- ❌ Putting "Open in browser" / "View source" here (those would be v0.2 features)

---

## §8 — Onboarding card (3-step wizard)

**DOM id:** `#screen-onboarding` (overlay), `.onboarding-card`, `.onboarding-step` (3 of them), `.onboarding-dots` (step indicators), `.onboarding-next`, `.onboarding-back`.

### Anatomy

```
+----------------------------------+
|                                  |
|  [56px primary blue logo]        |
|                                  |
|  Motrix AI                       |  <- H1
|                                  |
|  Task-first desktop download     |  <- sub
|  manager. Watch the queue, then  |
|  ask for more.                   |
|                                  |
|  • Natural language commands     |  <- 3 bullets
|  • No telemetry                  |
|  • Torrents, HTTP, YouTube       |
|                                  |
|  ● ○ ○                           |  <- 3 dots
|                                  |
|  [Get Started →]                 |  <- CTA
|                                  |
+----------------------------------+
```

### Steps

| Step       | Title           | Sub                                                                        | Bullets                                                                  | Primary CTA     |
| ---------- | --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------- |
| 0 (intro)  | "Motrix AI"     | "Task-first desktop download manager. Watch the queue, then ask for more." | "Natural language commands" / "No telemetry" / "Torrents, HTTP, YouTube" | "Get Started →" |
| 1 (theme)  | "Pick a theme"  | "Dark by default, light for daylight, system to follow your OS."           | (3 theme cards: Dark / Light / System)                                   | "Continue"      |
| 2 (sample) | "Try a command" | "Type a magnet, URL, or pick one below."                                   | (3 quick-action chips)                                                   | "Open Motrix"   |

### Theme cards (step 1)

3 cards in a row, 96px wide each. Each card is a button.

```html
<button class="theme-card" onclick="selectThemeCard(this, 'dark')">
  <div class="theme-card-preview theme-preview-dark">A</div>
  <!-- mini preview, dark bg + "A" -->
  <div class="theme-card-label">Dark</div>
</button>
```

Selected card gets `aria-checked="true"`, `--primary-muted` bg, and a 2px primary border.

### Quick-action chips (step 2)

3 chips (not 5 — fewer because the surface is a card, not the bottom chat bar). Each is a button.

```html
<button class="onboarding-chip" onclick="completeOnboarding('The.Weeknd.-.Dawn.FM.2025.mp3')">
  "The Weeknd — Dawn FM 2025"
</button>
```

### Card visual

| Property                  | Value                                                  |
| ------------------------- | ------------------------------------------------------ |
| Width                     | 480 px                                                 |
| Height                    | 600 px (variable)                                      |
| Padding                   | 48 px                                                  |
| Border-radius             | `--radius-md` (12 px)                                  |
| Background                | `--surface`                                            |
| Top accent stripe         | 3 px, linear-gradient(135deg, `--primary`, `--accent`) |
| Animation on step advance | `fadeSlideUp` 250ms                                    |

### Step transition

`nextOnboardingStep()`:

1. Set current step's `display: none`
2. Increment index, cap at 2
3. Set new step's `display: block`, trigger `fadeSlideUp`
4. Update step dots (active dot gets primary fill, others get border)

### Completion

`completeOnboarding(cmd)`:

1. Mark onboarding complete in `localStorage` (key: `motrix:onboarded`)
2. If `cmd` provided, call `sendQuickMessage(cmd)` (so the user sees AI activity immediately)
3. `showView('main')` with `modalScaleIn` 400ms

### Accessibility

- The card is `role="dialog"`, `aria-labelledby="onboardingH1"`, `aria-modal="true"`
- Step dots have `aria-current="step"` on the active dot
- The 3 theme cards form a `role="radiogroup"`, each card `role="radio"` with `aria-checked`
- Esc during onboarding does nothing (you can't skip onboarding)

### Anti-patterns

- ❌ Adding a 4th step (3 is enough for the spec)
- ❌ Making the onboarding skippable on a timer (user-controlled only)
- ❌ Putting login / sign-up in onboarding (the product is local-first for v0.1)
- ❌ Using a video / animated illustration (spec is intentionally text-driven for task-first framing)
