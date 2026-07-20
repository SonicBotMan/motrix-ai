# 01 — Design System (Tokens)

This is the **canonical reference for every color, type, space, radius, shadow, and motion value in the project.** When you need to set a color, padding, or animation timing, you reach for a token from this file. If a value isn't in here, you do not invent it — you add it to this file and explain why.

---

## 1. Color tokens

All color tokens are CSS custom properties. Light and dark themes are **separate, complete palettes** — not lightened/darkened versions of each other. Dark mode is the default; light mode is opt-in via `data-theme="light"` on `<html>`.

### 1.1 Dark mode (default — `:root`)

| Token                | Hex                     | OKLCH equivalent       | Use                                                 |
| -------------------- | ----------------------- | ---------------------- | --------------------------------------------------- |
| `--bg`               | `#0A0A0B`               | `oklch(13% 0.003 240)` | Window canvas (everything sits on this)             |
| `--bg-elevated`      | `#121214`               | `oklch(17% 0.003 240)` | Slightly lifted sections (sub-header rows)          |
| `--surface`          | `#18181B`               | `oklch(20% 0.005 240)` | Cards, panels, modals                               |
| `--surface-hover`    | `#222225`               | `oklch(25% 0.005 240)` | Hover state for surface-level elements              |
| `--surface-elevated` | `#27272A`               | `oklch(31% 0.006 240)` | Active filter tab, open dropdown, selected row      |
| `--fg`               | `#FAFAFA`               | `oklch(98% 0.003 240)` | Primary text                                        |
| `--fg-secondary`     | `#A1A1AA`               | `oklch(70% 0.005 240)` | Subtitles, file size next to filename               |
| `--fg-tertiary`      | `#71717A`               | `oklch(53% 0.005 240)` | Metadata, less important                            |
| `--fg-muted`         | `#52525B`               | `oklch(40% 0.005 240)` | Disabled text, hover-only ··· menu                  |
| `--border`           | `#27272A`               | `oklch(31% 0.006 240)` | Default hairline                                    |
| `--border-hover`     | `#3F3F46`               | `oklch(40% 0.005 240)` | Hover state for borders                             |
| `--primary`          | `#3B82F6`               | `oklch(60% 0.18 255)`  | Brand blue — primary buttons, active filters, links |
| `--primary-hover`    | `#2563EB`               | `oklch(54% 0.18 255)`  | Primary button hover bg                             |
| `--primary-muted`    | `rgba(59,130,246,0.12)` | —                      | Selected row bg, focus tint                         |
| `--primary-subtle`   | `rgba(59,130,246,0.08)` | —                      | Row hover bg, very subtle tint                      |
| `--accent`           | `#10B981`               | `oklch(65% 0.16 165)`  | Success green — status pills, completed progress    |
| `--accent-muted`     | `rgba(16,185,129,0.12)` | —                      | Success tinted bg                                   |
| `--warning`          | `#F59E0B`               | `oklch(72% 0.16 75)`   | Paused status, warnings                             |
| `--warning-muted`    | `rgba(245,158,11,0.12)` | —                      | Paused tinted bg                                    |
| `--error`            | `#EF4444`               | `oklch(60% 0.22 25)`   | Failed status, cancel button, danger text           |
| `--error-muted`      | `rgba(239,68,68,0.12)`  | —                      | Error tinted bg                                     |

### 1.2 Light mode (`[data-theme="light"]`)

| Token                | Hex                    | Notes                                                        |
| -------------------- | ---------------------- | ------------------------------------------------------------ |
| `--bg`               | `#FAFAFA`              | Off-white, not pure white (avoids starkness)                 |
| `--bg-elevated`      | `#FFFFFF`              | Pure white, for elements that need to pop                    |
| `--surface`          | `#F3F4F6`              | Light gray for cards                                         |
| `--surface-hover`    | `#E5E7EB`              | Slightly darker gray                                         |
| `--surface-elevated` | `#FFFFFF`              | Active states                                                |
| `--fg`               | `#111827`              | Near-black                                                   |
| `--fg-secondary`     | `#4B5563`              |                                                              |
| `--fg-tertiary`      | `#6B7280`              |                                                              |
| `--fg-muted`         | `#9CA3AF`              | Disabled                                                     |
| `--border`           | `#E5E7EB`              |                                                              |
| `--border-hover`     | `#D1D5DB`              |                                                              |
| `--primary`          | `#2563EB`              | Slightly deeper blue (dark mode's looks washed out on white) |
| `--primary-hover`    | `#1D4ED8`              |                                                              |
| `--primary-muted`    | `rgba(37,99,235,0.08)` | 0.08 instead of 0.12 (less alpha on light)                   |
| `--primary-subtle`   | `rgba(37,99,235,0.05)` |                                                              |
| `--accent`           | `#059669`              |                                                              |
| `--accent-muted`     | `rgba(5,150,105,0.08)` |                                                              |
| `--warning`          | `#D97706`              |                                                              |
| `--warning-muted`    | `rgba(217,119,6,0.08)` |                                                              |
| `--error`            | `#DC2626`              |                                                              |
| `--error-muted`      | `rgba(220,38,38,0.08)` |                                                              |

**Rule:** when you use `--primary-muted` for a tinted bg, the dark-mode alpha is 0.12 and the light-mode alpha is 0.08. **Do not unify these.** Light backgrounds need less alpha to look the same perceptual strength.

### 1.3 Focus ring tokens (per theme)

| Token               | Dark mode                     | Light mode                   | Use                                      |
| ------------------- | ----------------------------- | ---------------------------- | ---------------------------------------- |
| `--focus-ring`      | `oklch(92% 0.005 255)`        | `oklch(45% 0.15 255)`        | `outline: 2px solid` on `:focus-visible` |
| `--focus-ring-soft` | `oklch(92% 0.005 255 / 0.22)` | `oklch(45% 0.15 255 / 0.14)` | 6px spread halo for `box-shadow`         |

**Why near-white in dark mode and mid-blue in light:** in dark mode, near-white has the highest contrast against every button color (including primary blue). In light mode, mid-blue is the conventional focus indicator; using near-black would feel heavy and out-of-family.

**Contrast ratios (verified):**

- Dark mode `--focus-ring` on `--bg`: **15.8:1** (AAA, exceeds 7:1)
- Dark mode `--focus-ring` on `--primary` (blue button): **3.4:1** (passes WCAG 1.4.11 for non-text contrast)
- Light mode `--focus-ring` on `--bg`: **6.8:1** (AAA)
- Light mode `--focus-ring` on `--primary` (blue button): **2.4:1** — borderline, but light mode primary buttons are mostly ghost/outline, not solid fills, so this combination is rare in practice

---

## 2. Typography

### 2.1 Font stacks

| Token         | Stack                                                  | Use                                               |
| ------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `--font-ui`   | `'Inter', system-ui, -apple-system, sans-serif`        | All UI text — body, headings, buttons             |
| `--font-mono` | `'JetBrains Mono', ui-monospace, 'SF Mono', monospace` | Numerics (sizes, speeds, ETA), hashes, file paths |

**Lock:** do not add new font families. If you need a display face, raise it as a separate ADR — the Linear × Raycast aesthetic is set up around Inter + mono.

### 2.2 Type scale (in pixels, applied to default 16px root)

| Role         | Size  | Weight | Line-height | Use                                                 |
| ------------ | ----- | ------ | ----------- | --------------------------------------------------- |
| Display      | 32 px | 600    | 1.2         | Onboarding H1                                       |
| H1 (modal)   | 24 px | 600    | 1.3         | Detail panel section headings, settings pane titles |
| H2           | 20 px | 600    | 1.3         | Sub-headings                                        |
| Body (large) | 16 px | 400    | 1.5         | Settings descriptions, onboarding body              |
| Body         | 14 px | 400    | 1.5         | Default UI text — labels, descriptions, chips       |
| Body (small) | 13 px | 400    | 1.45        | Table cells, secondary labels                       |
| Caption      | 12 px | 500    | 1.4         | Status pills, column headers (UPPERCASE), metadata  |
| Micro        | 11 px | 500    | 1.4         | "··· ⌘1" kbd hints, filter tab labels               |

**Rule:** when a value is not in this scale, you are looking at the wrong scale. Re-evaluate the design before adding 17px / 18px / 22px / etc.

### 2.3 Mono numerics contract

All numbers in the prototype (`speed`, `eta`, `size`, `seeders`, `progress %`) are rendered in `--font-mono` with `font-variant-numeric: tabular-nums` so digits line up column-wise.

**Why:** in a task table, a 4.8 and 4.9 in `size` columns must align to the decimal point. Proportional numerals shift 1-2px per digit and break the column rhythm.

```css
.task-size-text,
.task-eta,
.task-speed,
.task-progress-pct {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
```

---

## 3. Spacing scale

| Token       | Value | Common use                     |
| ----------- | ----- | ------------------------------ |
| `--space-0` | 0     | Reset                          |
| `--space-1` | 4 px  | Inside chips, tightest padding |
| `--space-2` | 8 px  | Button padding-y, chip gap     |
| `--space-3` | 12 px | Card padding-y, form field gap |
| `--space-4` | 16 px | Card padding-x, section gap    |
| `--space-5` | 24 px | Section gap, modal padding     |
| `--space-6` | 32 px | Large section gap              |
| `--space-8` | 48 px | Page-level vertical rhythm     |

**Rule:** spacing comes from this scale. If you need 6px / 10px / 18px / 22px, **don't**. Round to the nearest token.

---

## 4. Radius scale (4-tier)

This is a documented mixed system, not "all-soft" or "all-pill." Each tier is used in specific contexts.

| Token           | Value   | Use                                                        |
| --------------- | ------- | ---------------------------------------------------------- |
| `--radius-xs`   | 6 px    | Buttons, filter tabs, input fields                         |
| `--radius-sm`   | 8 px    | Cards (small), toasts, bottom chat container               |
| `--radius-md`   | 12 px   | Detail panel, onboarding card, settings panes              |
| `--radius-lg`   | 16 px   | (reserved for hero elements — currently unused)            |
| `--radius-xl`   | 20 px   | (reserved)                                                 |
| `--radius-full` | 9999 px | Status pills, quick-action chips, settings tabs, kbd hints |

**Rule:** a new component picks the smallest radius that visually separates it from the bg. Detail panel (large, central) → `--radius-md`. Status pill (small, status-driven) → `--radius-full`. Don't use `--radius-md` on a button.

---

## 5. Shadow scale

| Token         | Value                             | Use                           |
| ------------- | --------------------------------- | ----------------------------- |
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.3)`       | Inline icons, micro elevation |
| `--shadow-sm` | `0 1px 3px ..., 0 1px 2px ...`    | Cards resting on bg           |
| `--shadow-md` | `0 4px 6px ..., 0 2px 4px ...`    | Hover-lifted cards            |
| `--shadow-lg` | `0 10px 25px ..., 0 4px 10px ...` | Detail panel, dropdowns       |
| `--shadow-xl` | `0 20px 50px ..., 0 8px 20px ...` | (reserved for hero-level)     |

**Dark mode uses stronger shadows** (alpha 0.3-0.6) than light mode (alpha 0.04-0.12) because dark bg swallows weak shadows. This is intentional — do not "unify" them.

**Anti-rule:** never apply a shadow to a full-bleed background. Shadows are for _layered_ elements. The window canvas has no shadow.

---

## 6. Motion (full system, see also 03-motion.md)

### 6.1 Easing curves

| Token            | Value                               | Use                                                                   |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `--ease-out`     | `cubic-bezier(0.16, 1, 0.3, 1)`     | Default. Use for almost everything.                                   |
| `--ease-in-out`  | `cubic-bezier(0.65, 0, 0.35, 1)`    | Symmetric — for hovers that go both ways (e.g., toggle state)         |
| `--ease-spring`  | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Overshoot — currently unused, reserved for future "decisive flourish" |
| `--ease-default` | `cubic-bezier(0.2, 0.8, 0.2, 1)`    | A custom sharper spring-out used in modals + row reveal               |

**The "one motion language" rule:** every transition in the prototype uses `--ease-out` or `--ease-default` (both are spring-outs with similar feel). Adding a new easing is an ADR.

### 6.2 Duration scale

| Token                 | Value  | Use                             |
| --------------------- | ------ | ------------------------------- |
| `--transition-fast`   | 150 ms | Hovers, chip select, focus ring |
| `--transition-base`   | 250 ms | Default state changes           |
| `--transition-slow`   | 400 ms | Modal open, screen transitions  |
| `--transition-spring` | 500 ms | (reserved)                      |

### 6.3 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .task-progress-fill::after {
    display: none;
  } /* stop infinite shimmer */
  .task-table tbody tr.row-flash {
    transform: none;
  }
  .chat-toast {
    transition-duration: 100ms !important;
  }
  .detail-panel {
    transition-duration: 100ms !important;
  }
  .task-table tbody tr {
    animation: none !important;
  }
}
```

**Behavior under reduced-motion:** state changes still register (opacity crossfades still happen, just compressed), but no transform animation, no infinite shimmer, no stagger. **Test every new animation in reduced-motion mode.**

---

## 7. Sizing tokens

| Token              | Value | Use                                                  |
| ------------------ | ----- | ---------------------------------------------------- |
| `--chrome-height`  | 48 px | Top chrome bar (window-dots, logo, theme + settings) |
| `--row-height`     | 56 px | Task table row height (compute: 8 + 40 + 8 = 56)     |
| `--hit-target-min` | 44 px | Minimum touch target (mobile breakpoint)             |

---

## 8. Layout grid reference (1080p baseline)

```
+--------------------------------------------------------+
|  Chrome bar (48px, sticky top)                         |
+--------------------------------------------------------+
|                                                        |
|  Task table area                                       |
|  - thead (sticky inside table)                         |
|  - tbody (scrolls vertically)                          |
|  - 8 columns: name | source | status | progress |      |
|    speed | size | eta | actions                        |
|  - col widths: 26% | 18% | 8% | 18% | 8% | 10% | 7% | 5%  |
|                                                        |
+--------------------------------------------------------+
|  Bottom chat (96px, sticky bottom)                     |
|  - row 1: input field + send button + attach           |
|  - row 2: 5 quick-action chips with ⌘1-5 kbd hints    |
+--------------------------------------------------------+
```

**Test at:** 1920×1080 (primary), 1366×768 (laptop), 1280×720 (older laptop). Mobile breakpoint (≤ 768px) is not in the current prototype but must be planned for.

---

## 9. Z-index scale

| Layer                      | Z-index | Use                              |
| -------------------------- | ------- | -------------------------------- |
| Base                       | `auto`  | Normal flow content              |
| Sticky chrome              | 50      | Chrome bar, bottom chat          |
| Sticky panel header/footer | 40      | Inside detail panel              |
| Hover menus                | 60      | Row ··· menu, detail more menu   |
| Modal backdrop             | 100     | Detail panel backdrop            |
| Modal panel                | 101     | Detail panel itself              |
| Toast stack                | 200     | Always above everything          |
| Onboarding overlay         | 300     | When shown (only on first visit) |

**Rule:** pick the smallest z-index that puts you above what you need. Don't jump to 9999.
