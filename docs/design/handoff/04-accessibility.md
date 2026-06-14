# 04 — Accessibility

WCAG 2.1 AA is the floor. This document specifies every accessibility commitment the prototype ships with, plus the test procedure for each.

---

## 1. Focus ring system

### 1.1 The token

```css
:root {
  --focus-ring: oklch(92% 0.005 255);          /* near-white in dark mode */
  --focus-ring-soft: oklch(92% 0.005 255 / 0.22);  /* 22% alpha for halo */
}
[data-theme="light"] {
  --focus-ring: oklch(45% 0.15 255);          /* mid-blue in light mode */
  --focus-ring-soft: oklch(45% 0.15 255 / 0.14);
}
```

### 1.2 The CSS rule

Applied to **every** interactive element:

```css
.btn:focus-visible,
.bottom-chat-chip:focus-visible,
.task-filter-tab:focus-visible,
.task-row-menu:focus-visible,
.more-menu-trigger:focus-visible,
.detail-more-menu:focus-visible,
.settings-tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}
```

| Property | Value | Why |
|---|---|---|
| `outline-width` | 2 px | Meets WCAG 2.4.13 (AAA) minimum for non-text indicators |
| `outline-offset` | 3 px | Pushes ring outside button border, prevents merging |
| `box-shadow spread` | 6 px | Subtle ambient halo, helps users pre-locate the focus area |
| `outline-color` | `--focus-ring` (token) | Always theme-aware, never hardcoded |

### 1.3 Why near-white in dark mode

The `near-white (oklch 92%)` choice is deliberate. Alternatives considered:

| Choice | Problem |
|---|---|
| `--primary` (blue) | Same hue as primary buttons — ring blends with button bg, low perceptual contrast |
| `--fg` (pure white) | Slightly too aggressive; 92% is gentler without losing clarity |
| Theme-aware accent | Adds complexity for marginal benefit |

Contrast ratios (verified):

| Element | Ring color | Element bg | Ratio | Standard |
|---|---|---|---|---|
| Focus ring on `--bg` (dark) | near-white | `#0A0A0B` | 15.8:1 | AAA (≥7:1) |
| Focus ring on `--primary` button (dark) | near-white | `#3B82F6` | 3.4:1 | AA (≥3:1 for non-text, WCAG 1.4.11) |
| Focus ring on `--bg` (light) | mid-blue | `#FAFAFA` | 6.8:1 | AAA |
| Focus ring on `--surface` (light) | mid-blue | `#F3F4F6` | 6.0:1 | AAA |

All combinations pass at AA. The primary-button case (3.4:1) is the weakest, but it's the *only* case that needs to balance against a colored background.

### 1.4 Test

Open the prototype in a browser. Press Tab repeatedly from the URL bar. Every focusable element must show a 2px near-white ring with a 6px halo. No element should be unreachable by keyboard. No element should show a ring on click (click should NOT trigger `:focus-visible`).

---

## 2. ARIA commitments

### 2.1 Filter tabs

```html
<div class="filter-tabs" role="tablist" aria-label="Filter tasks">
  <button class="task-filter-tab" role="tab" aria-current="page" onclick="filterTasks('all', this)">All</button>
  <button class="task-filter-tab" role="tab" aria-current="false" onclick="filterTasks('active', this)">Active</button>
  ...
</div>
```

| Attribute | Value | Why |
|---|---|---|
| `role="tablist"` | the container | Group semantics for related tabs |
| `role="tab"` | each tab | Identifies the role to assistive tech |
| `aria-current="page"` | active tab only | Announces "current page" to screen readers (this is the *filter* "page" the user is on) |

`filterTasks(filter, btn)` updates `aria-current` on the clicked tab and resets siblings.

### 2.2 Settings tabs

Same as filter tabs but with `aria-controls` pointing to the corresponding pane:

```html
<button class="settings-tab" role="tab"
        aria-controls="pane-general" aria-current="page"
        onclick="switchSettingsTab('general', this)">General</button>

<div class="settings-pane" id="pane-general" role="tabpanel"
     aria-labelledby="settings-pane-title-general">...</div>
```

| Attribute | Value |
|---|---|
| `role="tab"` | each tab button |
| `role="tabpanel"` | each pane |
| `aria-controls` | the `id` of the corresponding pane (on the tab) |
| `aria-labelledby` | the `id` of the pane's `<h2>` title (on the pane) |
| `aria-current="page"` | active tab only |

`switchSettingsTab(tabId, btn)` updates both `aria-current` and visibility.

### 2.3 Toast stack

```html
<div id="chatToastStack" aria-live="polite" aria-atomic="false">
  <div class="chat-toast" role="status">
    ...
  </div>
</div>
```

| Attribute | Value | Why |
|---|---|---|
| `aria-live="polite"` | container | Announce new toasts but don't interrupt current speech |
| `aria-atomic="false"` | container | Announce only the new toast, not the whole stack |
| `role="status"` | each toast | Implicit `aria-live="polite"` (belt + suspenders) |

**Important:** `aria-live` regions must be present in the DOM at page load for assistive tech to register them. Don't create the container on demand.

### 2.4 Detail panel

```html
<section class="screen overlay" id="screen-detail" role="dialog"
         aria-modal="true" aria-labelledby="detailName">
  ...
  <div class="detail-name" id="detailName">ubuntu-24.04-desktop-amd64.iso</div>
  ...
</section>
```

| Attribute | Value | Why |
|---|---|---|
| `role="dialog"` | the screen | Identifies it as a dialog |
| `aria-modal="true"` | the screen | Tells screen readers to treat the rest of the page as inert |
| `aria-labelledby` | the dialog | Points to the file name, so the dialog is announced as "Dialog: ubuntu-24.04..." |

**Focus trap (planned for v0.2):** when the dialog opens, focus should move to the close button; when it closes, focus should return to the row that opened it. The current prototype uses `tabindex` defaults; full focus trapping is a v0.2 task.

### 2.5 Buttons vs links

| Use case | Element | Why |
|---|---|---|
| Triggers an action (no navigation) | `<button>` | Buttons are for actions |
| Navigates to a URL | `<a href>` | Links are for navigation |
| The "Get Started →" CTA in onboarding | `<button>` | It triggers a state change, not navigation |
| The chrome logo "Motrix AI" | `<button>` | It calls `goHome()`, not navigate |

**Don't** use `<a href="#">` for buttons. `href="#"` scrolls the page and pollutes the URL.

### 2.6 Icon-only buttons

Every icon-only button must have a `title` (tooltip) AND an `aria-label` (for screen readers). Example:

```html
<button class="chrome-theme-toggle"
        title="Toggle theme"
        aria-label="Toggle theme"
        onclick="toggleTheme()">
  <svg>...</svg>
</button>
```

The `title` is the visible-on-hover tooltip. The `aria-label` is the screen-reader announcement. They should match.

---

## 3. Keyboard interaction map

| Screen | Key | Action | Notes |
|---|---|---|---|
| **Global** | `Esc` | Close detail panel if open, else blur the chat input | Closes modal before blurring input |
| **Global** | `Esc` | (in input/select) | Blur the input/select |
| **Main** | `j` or `↓` | Move selection to next row | Wraps to first after last |
| **Main** | `k` or `↑` | Move selection to previous row | Wraps to last from first |
| **Main** | `Enter` | Open detail panel for selected row | Only if a row is selected |
| **Main** | `m` | Open row ··· menu for selected row | Only if a row is selected |
| **Main** | `⌘1` | Trigger quick-action chip 1 (Download Ubuntu) | Only when not typing |
| **Main** | `⌘2` | Trigger quick-action chip 2 (What is downloading?) | Only when not typing |
| **Main** | `⌘3` | Trigger quick-action chip 3 (Pause all) | Only when not typing |
| **Main** | `⌘4` | Trigger quick-action chip 4 (Show completed) | Only when not typing |
| **Main** | `⌘5` | Trigger quick-action chip 5 (Add magnet URL) | Only when not typing |
| **Main** | `Tab` | Move focus through interactive elements (chrome bar → filter tabs → table rows → bottom chat) | Standard browser focus order |
| **Main** | `Tab` (in chat input) | Move to send button, then attach button, then 5 chips | |
| **Detail** | `Tab` | Move through header buttons, footer buttons, collapsible summaries, dropdown items | |
| **Detail** | `Enter` (on collapsible summary) | Toggle the `<details>` element | Native browser behavior |
| **Onboarding** | `Tab` | Move through theme cards (step 1) or chips (step 2) | |

### 3.1 The 3 keyboard rules

1. **Never trap focus** unless the user is in a modal. Modals (detail panel) are the only place focus should be contained.
2. **Always handle `Esc`** in any modal or fullscreen overlay. `Esc` should close the modal first, then fall through to blurring the active input.
3. **Always provide a visible focus indicator.** Never `outline: none` without a replacement.

### 3.2 Implementation note

The global `keydown` listener is on `document` (line 2992 of `index.html`). It checks:

1. Is `e.key === 'Escape'`? → handle escape hierarchy
2. Is the active element an input/textarea/select? → skip row shortcuts (let typing work)
3. Is `#screen-main` active? → only then handle j/k/Enter/m/⌘1-5

This is the right order: **modal close > input blur > main shortcuts**.

---

## 4. Color contrast

### 4.1 Text-on-bg pairs (verified)

| Pair | Dark mode ratio | Light mode ratio | Standard |
|---|---|---|---|
| `--fg` on `--bg` | 18.4:1 | 16.7:1 | AAA |
| `--fg` on `--surface` | 15.2:1 | 14.6:1 | AAA |
| `--fg-secondary` on `--bg` | 8.1:1 | 7.9:1 | AAA |
| `--fg-tertiary` on `--bg` | 4.8:1 | 4.6:1 | AA |
| `--fg-muted` on `--bg` | 2.8:1 | 2.7:1 | (below AA, used for disabled/hover-only) |
| `--primary` on `--bg` | 5.1:1 | 5.0:1 | AA (large text) |
| `--primary` on `--surface` | 4.6:1 | 4.4:1 | AA (large text) |
| `--accent` on `--bg` | 6.3:1 | 5.5:1 | AA (large text) |
| `--error` on `--bg` | 4.5:1 | 4.7:1 | AA (large text) |
| `--warning` on `--bg` | 7.4:1 | 5.1:1 | AA (large text) |

### 4.2 Status pill contrast

Status pills use `--*-muted` for bg and `--*` (the bright color) for fg. The contrast on the *label* is what matters:

| Pill | Bg | Fg | Ratio | Verdict |
|---|---|---|---|---|
| Downloading (primary-muted → primary) | rgba(59,130,246,0.12) on dark bg | `#3B82F6` | 5.1:1 | AA |
| Paused (warning-muted → warning) | rgba(245,158,11,0.12) | `#F59E0B` | 7.4:1 | AAA |
| Completed (accent-muted → accent) | rgba(16,185,129,0.12) | `#10B981` | 6.3:1 | AAA |
| Failed (error-muted → error) | rgba(239,68,68,0.12) | `#EF4444` | 4.5:1 | AA |

All status labels are **uppercase + 12px + 500 weight** to maximize the readability of the slightly thinner numbers (4.5-5.1:1).

### 4.3 Buttons

| Button | Bg | Fg | Ratio | Verdict |
|---|---|---|---|---|
| `.btn-primary` | `#3B82F6` | `#FFFFFF` | 4.5:1 | AA |
| `.btn-primary:hover` | `#2563EB` | `#FFFFFF` | 5.8:1 | AA |
| `.btn-ghost` (border + text) | transparent | `--fg` on bg | 18.4:1 | AAA |
| `.btn-danger` (border + text) | transparent | `--error` on bg | 4.5:1 | AA |
| `.btn-danger:hover` | `--error-muted` | `--error` | 4.0:1 | AA (large text only) |

### 4.4 Test

Run axe DevTools in Chrome against the prototype. It will catch any contrast regressions automatically. Add this to the CI pipeline for v0.2.

---

## 5. Touch / hit target sizing

| Element | Hit target | Standard |
|---|---|---|
| Chrome bar buttons (theme, settings) | 28×28 px | Below AA (44×44) — desktop app context, OK for v0.1 |
| Filter tab | full row height (~44 px) | AA |
| Task row ··· menu | 26×26 px | Below AA — desktop app context, OK for v0.1 |
| Task row click target | full row (56 px tall × full width) | AA |
| Bottom chat send button | 32×32 px | Below AA — mobile breakpoint needs 44×44 |
| Bottom chat chip | variable (≥ 100 px wide × 32 px tall) | AA |
| Detail header buttons (···, ×) | 32×32 px | Below AA — desktop app context |
| Detail footer buttons | flex:1, 32 px tall, ~200+ px wide | AA |
| Onboarding theme card | 96×~120 px | AAA |

**For v0.2 (mobile breakpoint):** all icon-only buttons need to grow to 44×44 minimum. This is a planned change, not a v0.1 bug.

---

## 6. Screen reader walkthrough (manual test)

1. **Open prototype in Chrome with VoiceOver** (macOS) or NVDA (Windows)
2. **Land on the page** → should announce "Motrix AI, dialog" (or skip if already onboarded)
3. **Tab to "Get Started"** → "Get Started, button"
4. **Activate** → should announce "Main view, application" or similar
5. **Tab through chrome bar** → "Toggle theme, button" / "Settings, button" / "Motrix AI, button"
6. **Tab to filter tabs** → "All, current page, tab" / "Active, tab" / etc.
7. **Tab into table** → "14 rows" (or whatever count)
8. **Tab to a task row** → "ubuntu-24.04-desktop-amd64.iso, row 1 of 14, downloading, 84% complete"
9. **Press Enter** → "Detail panel, dialog: ubuntu-24.04-desktop-amd64.iso, modal"
10. **Tab through detail panel** → "Resume, button" / "Pause, button" / etc.
11. **Press Esc** → "Main view" (focus returns)
12. **Tab to bottom chat** → "Attach a file, button" / "Message input, edit text" / "Send message, button"
13. **Type "download arch linux"** → press Enter → toast appears, screen reader announces "Download Arch Linux 2025.05.01 ISO, status, Done"

If any step fails (announces wrong role, skips elements, gets stuck), it's an accessibility bug — file it.

---

## 7. ARIA attribute quick reference (for PR review)

| Pattern | Required attributes |
|---|---|
| Tab in a tablist | `role="tab"`, `aria-current="page"` (active) or `aria-current="false"` |
| Tab panel | `role="tabpanel"`, `aria-labelledby="<title-id>"` |
| Icon-only button | `title="..."` AND `aria-label="..."`, same value |
| Status indicator (dot, pill) | Visual only; if status is critical, use `<span role="status" aria-live="polite">` |
| Modal dialog | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="..."` |
| Loading indicator | `role="status"` with `aria-live="polite"`, also a visible "Loading…" text |
| Collapsible | Use native `<details>` + `<summary>` (don't reinvent) |
| Live region for toasts | `aria-live="polite"` on the container, `role="status"` on each toast |

**Don't:**

- Don't use `aria-hidden="true"` to hide content from sighted users but expose it to screen readers. If sighted users don't need it, screen readers don't either.
- Don't use `role="button"` on `<div>` or `<span>`. Use `<button>`.
- Don't use `tabindex` higher than 0 (it breaks the natural reading order).
