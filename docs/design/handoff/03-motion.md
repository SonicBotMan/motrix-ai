# 03 — Motion System

The motion system has **5 named keyframes** and **1 single motion language** (spring-out easing). Do not add new keyframes or easings without an ADR.

Visual reference: open `index.html` in a browser, toggle `prefers-reduced-motion: reduce` in your OS or DevTools, and compare behavior.

---

## 1. The 5 keyframes

### 1.1 `fadeSlideUp`

```css
@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

| Property       | Value                                        |
| -------------- | -------------------------------------------- |
| Duration       | 250ms                                        |
| Easing         | `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1)) |
| Where used     | Onboarding step transitions (step 0 → 1 → 2) |
| Reduced-motion | Compresses to 0.01ms (functionally instant)  |

**Why 16px and not more:** onboarding is the user's first impression, and the card itself is already 600px tall on a 1080p screen. A larger translateY would overshoot; 16px is the "noticeable but not theatrical" sweet spot.

### 1.2 `shimmer`

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

| Property       | Value                                                                             |
| -------------- | --------------------------------------------------------------------------------- |
| Duration       | 2s                                                                                |
| Iteration      | infinite                                                                          |
| Easing         | linear                                                                            |
| Where used     | `.task-progress-fill::after` (the moving highlight on a downloading progress bar) |
| Reduced-motion | `display: none` (no shimmer at all)                                               |

**Implementation:**

```css
.task-progress-fill.downloading {
  background: linear-gradient(
    90deg,
    var(--primary) 0%,
    var(--primary) 40%,
    var(--primary-hover) 50%,
    var(--primary) 60%,
    var(--primary) 100%
  );
  background-size: 200% 100%;
}
.task-progress-fill.downloading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: inherit;
  animation: shimmer 2s linear infinite;
}
```

**Why this exists:** a static progress bar reads as "stuck" even when actively downloading. The shimmer is a 1px-thin "wave" sweeping left-to-right, signaling that the bar is live.

### 1.3 `spin`

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

| Property       | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Duration       | 700ms                                                                |
| Iteration      | infinite                                                             |
| Easing         | linear                                                               |
| Where used     | `.spinner` (the 14×14 circle shown in the send button while sending) |
| Reduced-motion | Compresses to 0.01ms (effectively stops)                             |

**Note:** although reduced-motion stops this, the `.spinner` element is only shown while the system is in a "sending" state — and that state itself is ≤ 1.1s. So in practice the spinner is never long enough to trigger vestibular issues. Still, the reduced-motion override keeps us compliant with WCAG 2.3.3.

### 1.4 `pulse`

```css
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
```

| Property       | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Duration       | 1.5s                                                         |
| Iteration      | infinite                                                     |
| Easing         | ease-in-out (default, not a custom curve)                    |
| Where used     | `.chat-toast .toast-dot` (the small dot in a thinking toast) |
| Reduced-motion | Compresses to 0.01ms (effectively solid)                     |

**Why:** while the AI is "thinking," the dot needs to look alive. A pulse (rather than a spinner) is calmer and matches the toast's low-noise aesthetic.

### 1.5 `modalScaleIn` / `modalScaleOut`

```css
@keyframes modalScaleIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
@keyframes modalScaleOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
}
```

| Property       | In                                                | Out                |
| -------------- | ------------------------------------------------- | ------------------ |
| Duration       | 400ms                                             | 220ms              |
| Easing         | `--ease-default` (cubic-bezier(0.2, 0.8, 0.2, 1)) | same               |
| Where used     | Detail panel open                                 | Detail panel close |
| Reduced-motion | Compresses to 100ms (panel-body transition)       | same               |

**Why asymmetric durations (in 400 / out 220):** the panel needs to feel like it "settles in" (longer in), but exits should feel like a "settle back" (shorter out). This is the Linear convention.

**The `--ease-default` curve** is sharper than `--ease-out`. Use it for elements that need to "snap" with a hint of overshoot.

### 1.6 `rowReveal`

```css
@keyframes rowReveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

| Property       | Value                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Duration       | 220ms per row                                                           |
| Easing         | `cubic-bezier(0.2, 0.8, 0.2, 1)` (same as modal — the "default" spring) |
| Stagger        | 28ms × row index (set via `--row-i` CSS var)                            |
| Where used     | Every task table filter switch + initial render                         |
| Reduced-motion | `animation: none !important` (stripped entirely)                        |

**Implementation:**

```css
.task-table tbody tr {
  animation: rowReveal 220ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
}
```

JS sets `--row-i` inline on each row:

```js
tr.style.setProperty('--row-i', i)
```

**Math:** 6 rows × 28ms stagger + 220ms single-row duration = **388ms total reveal** (last row finishes at 168ms + 220ms = 388ms).

**Why 220ms and not 200:** the 200ms cap is for _purely linear_ motion. With the spring curve, 220ms reads as the same "instant" perceptually but lets the spring overshoot register. Linear/Vercel use 220-250ms for table row reveals.

**Why stagger matters:** without it, filter switch feels like a hard cut. With it, the user sees the new list "settle in" row by row, which anchors attention.

**Why stripped in reduced-motion:** the stagger delay (`calc(var(--row-i) * 28ms)`) is not affected by the global `animation-duration: 0.01ms` override, so under reduced-motion, rows would _still_ appear one by one (just with zero-duration fade). Stripping the entire animation is the correct fix.

---

## 2. The single motion language

All 5 keyframes (and every transition in the prototype) use spring-out easings:

| Curve                                             | Where                         | Feel           |
| ------------------------------------------------- | ----------------------------- | -------------- |
| `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1))      | Default state changes, hovers | Gentle settle  |
| `--ease-default` (cubic-bezier(0.2, 0.8, 0.2, 1)) | Modals, row reveal, scale     | Sharper spring |

Both curves have `y2 > 1` (the "1" in the second control point), which produces a slight overshoot — the spring feel. Neither is a pure ease-out (`cubic-bezier(0, 0, 0.2, 1)`), which would feel corporate and flat.

**Rule:** when adding a new transition, pick from these two curves. **Do not** introduce linear, ease-in, ease-in-out-symmetric, or back/elastic.

---

## 3. Transition durations

| Class                 | Duration | Use                                                          |
| --------------------- | -------- | ------------------------------------------------------------ |
| `--transition-fast`   | 150ms    | Hover state changes, focus ring                              |
| `--transition-base`   | 250ms    | Default (unused as a var; keyframes use their own durations) |
| `--transition-slow`   | 400ms    | (reserved)                                                   |
| `--transition-spring` | 500ms    | (reserved)                                                   |

Most transitions in the prototype are not defined via these tokens — they're embedded in `transition: ... 220ms var(--ease-default)` directly on the element. This is a known inconsistency (the tokens exist but the spec uses literal values). When refactoring, prefer the tokens; for v0.1 keep the literals to avoid touching every selector.

---

## 4. Toast motion in detail

The toast stack has the most motion of any component. It runs **3 transitions** in sequence per toast:

```
[enter]       [thinking hold]      [done]       [exit]
 220ms         700-1100ms            2000ms       300ms
 fadeIn        pulse dot             swap icon    fadeOut
 translateY    (no transform)        + status     translateY
 8px → 0                              label        0 → -8px
```

| State class           | Visual                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| (just created)        | `opacity: 0; transform: translateY(8px)`                                                  |
| `.visible`            | `opacity: 1; transform: translateY(0)` (added after 1 frame to trigger transition)        |
| `.thinking` (default) | dot pulses, status text "Thinking…"                                                       |
| `.done`               | dot stops pulsing, icon swaps (info → check), status text "Done" / "Completed" / "Failed" |
| `.exiting` (dismiss)  | `opacity: 0; transform: translateY(-8px)` over 300ms, then `display: none`                |

**State transitions in code:**

```js
// createToastNode returns the node
const node = createToastNode(text, status, type)
stack.appendChild(node)
node.offsetHeight // force reflow to register initial state
node.classList.add('visible')
// (700-1100ms later, in setTimeout)
node.classList.remove('thinking')
node.classList.add('done')
// (2000ms after .done, in setTimeout)
dismissToast(node)
```

**The `offsetHeight` reflow is critical** — without it, browsers batch the initial `opacity: 0` and the `opacity: 1` into one paint, and the transition never fires. This is a known web platform quirk.

---

## 5. Reduced-motion contract (binding)

`@media (prefers-reduced-motion: reduce)` overrides:

| Override                                                  | Effect                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `animation-duration: 0.01ms !important`                   | All keyframes complete in 0.01ms (effectively instant)                              |
| `animation-iteration-count: 1 !important`                 | No infinite loops (shimmer, spin, pulse all stop)                                   |
| `transition-duration: 0.01ms !important`                  | All transitions are instant (state changes still register)                          |
| `scroll-behavior: auto !important`                        | No smooth scroll                                                                    |
| `.task-progress-fill::after { display: none }`            | Shimmer explicitly hidden (override of `display` not subject to animation-duration) |
| `.task-table tbody tr.row-flash { transform: none }`      | Row flash doesn't scale                                                             |
| `.chat-toast { transition-duration: 100ms !important }`   | Toasts can still animate but very fast                                              |
| `.detail-panel { transition-duration: 100ms !important }` | Same for detail panel                                                               |
| `.task-table tbody tr { animation: none !important }`     | Filter switch stagger is fully stripped                                             |

**Why 100ms and not 0.01ms for toast and detail:** these elements _do_ have position changes (toast entering above the input, panel scaling in). If we collapse to 0.01ms, the user might miss the visual state change entirely. 100ms is short enough to avoid vestibular triggers but long enough to register.

**Test in reduced-motion mode before shipping any new animation.** This is non-negotiable.

---

## 6. Adding new motion (decision framework)

Before adding a new keyframe or transition, ask:

1. **Is this on the critical path?** (e.g., filter switch, button hover) → 100-220ms, no overshoot, no delay. Sub-200ms.
2. **Is this a 1st-impression flourish?** (e.g., onboarding step, first load) → 250-400ms with spring curve. **Single moment only.**
3. **Is this a continuous indicator?** (e.g., shimmer, pulse) → infinite loop, low contrast change, **stripped in reduced-motion**.

**If the answer is "all three," you're over-engineering.** Pick one of the three roles and stay in its duration band.

If you genuinely need a new keyframe:

- Add it to `index.html` near the related component
- Document it in this file (§1)
- Document the reduced-motion behavior in §5
- Add a test: toggle reduced-motion and verify the new animation is suppressed or compressed
