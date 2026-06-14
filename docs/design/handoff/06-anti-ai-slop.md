# 06 — Anti-AI-Slop Binding Checklist

This is the **quality bar for PR review.** Every rule has a reason, and the reason matters more than the rule. If a PR violates one of these patterns, it gets a "do not merge" comment with a link back to the relevant rule.

The 22 rules are organized by **anti-pattern category**: copy, color, layout, type, motion, iconography, and meta.

---

## A. Copy

### Rule 1 — No emoji in user-visible UI

**Anti-pattern:** Using `✨ 🚀 🎯 💡 ⚡ 🔒 📦` (or any Unicode emoji) as a decorative or iconographic element.

**Why it's bad:** Emoji are not part of the design system. They render differently across OSes (Apple vs Google vs Microsoft), they clash with the modern minimal aesthetic, and they make the product look like a hobby project or a marketing demo.

**Replacement:** Use Lucide-style inline SVG icons with `stroke-width="2"`. Icons stay consistent across platforms, match the design language, and scale cleanly.

**What about emoji in source code comments, filenames, or dev-only data?** Allowed. The rule is specifically about what the user sees in the rendered app.

**What about Unicode characters that aren't emoji (✓ ✕ ⌘ → · ⋯)?** These are punctuation/symbols, not emoji. They're allowed. See Rule 3 for the em-dash carve-out.

### Rule 2 — No em-dash (—) in user-visible copy

**Anti-pattern:** Using `—` (em-dash, U+2014) in onboarding copy, settings descriptions, toast text, button labels, etc.

**Why it's bad:** Em-dash is the signature tell of LLM-generated writing. It signals "this was written by a machine" and breaks the "real designer delivered this" feel.

**Allowed in:** CSS comments, HTML comments, JS comments. These are not user-visible.

**Carve-out:** The em-dash IS used as a placeholder character for "no value" in the ETA field of the task table (e.g., a paused task shows `—` in the ETA cell). This is a data convention, not copy. Acceptable.

**Replacement:** Use one of:
- A period + new sentence: "Watch the queue, then ask for more."
- A colon: "Task-first desktop download manager: watch the queue, then ask for more."
- A middle dot `·` (max 1 per line): "Downloading · 84% complete"
- Just a comma: "Task-first desktop download manager, watch the queue, then ask for more."

**The current state:** Round 6 reduced em-dashes from 27 to 0 in user-visible copy.

### Rule 3 — No "filler verbs" or empty rhetoric

**Anti-pattern:** Copy that uses verbs without semantic weight:
- "Empower your workflow with..." 
- "Unlock the power of..."
- "Just tell me what you want"
- "Get the latest..."
- "Try one of these examples to see how it works"

**Why it's bad:** These phrases are noise. They make copy longer without making it more informative. They also signal AI-generated writing.

**Replacement:** Be specific about what the user can do:
- ❌ "Just tell me what you want."
- ✅ "Type a magnet, URL, or pick one below."

- ❌ "Get the latest Arch Linux torrent"
- ✅ "Get Arch Linux 2025.05.01"

- ❌ "Try one of these examples to see how it works:"
- ✅ "Type a magnet, URL, or pick one below."

### Rule 4 — No "Feature One / Feature Two" placeholder copy

**Anti-pattern:** Generic placeholder text in features lists:
- "Feature One"
- "Lightning fast / AI-powered / Private & secure / All formats"
- "Lorem ipsum"

**Why it's bad:** "Lightning fast" is unfalsifiable. "AI-powered" is a buzzword. "All formats" is unsubstantiated. These read as marketing material that the user has learned to ignore.

**Replacement:** Be specific or be honest about the placeholder:
- ❌ "Lightning fast" → ✅ "Resumes downloads in <2s" (or skip if you don't have a benchmark)
- ❌ "AI-powered" → ✅ "Natural language commands" (concrete capability)
- ❌ "Private & secure" → ✅ "No telemetry" (specific commitment)
- ❌ "All formats" → ✅ "Torrents, HTTP, YouTube" (specific list)

**Honest placeholder option:** If you don't have a real number, use a grey block or a labelled stub. `—` in a stat cell is better than a fake number.

### Rule 5 — No invented metrics without sources

**Anti-pattern:** Pulling a number out of thin air:
- "10× faster"
- "99.9% uptime"
- "Used by 50,000+ teams"

**Why it's bad:** When the user checks, the number is wrong, and the product loses credibility. LLMs do this reflexively.

**Replacement:** Either cite a real source (a benchmark, a real customer count) or use a different framing:
- ❌ "10× faster than qBittorrent"
- ✅ "Multi-threaded chunk fetcher" (capability, not false claim)

The prototype's MOCK_TASKS uses plausible-but-clearly-fake numbers (`24.6 MB/s`, `47 seeders`, `eta 38s`). These are fine for a prototype but **must be replaced with real data** before any external release.

### Rule 6 — No chat-first language if product is task-first

**Anti-pattern:** Copy that implies the user is talking to a chatbot:
- "Your AI assistant"
- "I'm here to help"
- "Ask me anything"
- "Let me help you..."

**Why it's bad:** The product is task-first, not chat-first. The AI is an input bar, not a conversation partner. Chat-first language telegraphs the wrong product to the user.

**Replacement:** Treat the chat as a tool, not a persona:
- ❌ "Your AI assistant"
- ✅ "Type a magnet, URL, or command…"

- ❌ "Hi! How can I help you today?"
- ✅ (no greeting; user just types)

**Note:** The original spec is "chat-first," and the original implementation plan is "task-first." The implementation won. If you see "chat-first" in the spec text and the UI says "task-first," that's intentional. The spec is outdated.

### Rule 7 — No locale-style strip / location metadata

**Anti-pattern:** A row of locale/copyright/legal text at the bottom of any screen:
- "Made with ♥ in San Francisco"
- "© 2025 Acme Inc."
- "🇺🇸 English (US)"

**Why it's bad:** This is the boilerplate every LLM-generated landing page sticks at the bottom. It signals "AI made this."

**Replacement:** Real legal text (the actual company name and year) is fine. Marketing-style location tags are not. The prototype has no footer, which is the correct choice for a desktop app.

---

## B. Color

### Rule 8 — No aggressive purple/violet gradient backgrounds

**Anti-pattern:** Page background fills with a purple-to-blue gradient, often with a glow blob.

**Why it's bad:** This is THE signature LLM landing page look. Midjourney / DALL-E / Claude / GPT-4 all default to it. Users have seen it 1,000 times.

**Replacement:** Solid backgrounds. `--bg` is the answer. If you need visual interest, use a 1px hairline grid, a subtle radial gradient that's barely visible, or nothing at all.

**Carve-out:** A 3px top accent stripe on the onboarding card is a 135deg gradient from primary to accent. This is a *small, intentional* flourish, not a background fill. Acceptable.

### Rule 9 — No warm beige / cream / peach / pink / orange-brown page backgrounds

**Anti-pattern:** Off-white, peachy, or warm-tinted page backgrounds.

**Why it's bad:** This is the "cozy consumer product" look. Tools and dashboards should be neutral or dark, not warm.

**Replacement:** Use a neutral (`--bg = #0A0A0B` dark or `#FAFAFA` light) or a brand-tinted background. If the brand has a primary color, a 1-2% tint of it on the bg is fine. Avoid warm tints.

**For Motrix AI specifically:** the audience is power users (developers, torrent veterans, system operators). They want tools that feel like tools, not cozy consumer apps.

### Rule 10 — One accent color, used at most twice per screen

**Anti-pattern:** Multiple accent colors competing for attention:
- Blue buttons + green checkmarks + orange warnings + red errors + purple highlights all on one screen

**Why it's bad:** The eye doesn't know where to land. The "decorative flourish" principle fails when there are 4 of them.

**Replacement:** Pick ONE accent (primary blue). Use it for:
- The primary CTA button
- Active filter tab
- Selected row indicator
- Focus ring (or use near-white in dark mode)

Save the OTHER colors for *state* only:
- Green = success status (only on completed tasks)
- Yellow = warning status (only on paused tasks)
- Red = error status (only on errored tasks)

State colors should appear *because* something is in that state, not as decoration.

### Rule 11 — No neon / outer glows on hover

**Anti-pattern:** A button that grows a blue or purple glow on hover (via `box-shadow`).

**Why it's bad:** Glows are decorative noise. They were a 2020 web trend that has aged badly. Modern minimal design uses *darken* or *lift* for hover, not *glow*.

**Replacement:** Use `background` color change (one step darker or lighter) or a 1px `translateY(-1px)` for hover. No glow.

**The current state:** `.btn-primary` does NOT have a hover glow. It uses `background: var(--primary-hover)` which is `--primary` one step darker. This is correct.

---

## C. Layout

### Rule 12 — No rounded card with a left coloured border accent

**Anti-pattern:** A card with `border-left: 3px solid blue` (or any color) and rounded corners on the other 3 sides.

**Why it's bad:** This is the LLM "feature card" cliché. It's a visual bandaid that says "I don't know how to create hierarchy, so let me color a side."

**Replacement:** Use:
- Background color difference (`--surface` vs `--bg-elevated`)
- 1px borders on all sides
- Spacing (cards have more padding than the gap between them)
- Typography hierarchy (bigger title, smaller body)

**If you absolutely need to draw attention to a single card:** use `--surface-elevated` as its bg. That's what `selected` rows and `active` filter tabs do.

### Rule 13 — No decorative blobs in the background

**Anti-pattern:** Floating colored shapes (blobs, circles, or abstract geometry) behind the content.

**Why it's bad:** Decorative blobs are pure visual filler. They serve no informational purpose. LLMs add them because the page would otherwise look "empty" — but emptiness is a feature, not a bug.

**Replacement:** Empty space. Generous padding. Let the content breathe.

### Rule 14 — No "icon next to every heading"

**Anti-pattern:** A small icon (often an emoji or generic glyph) before every section heading.

**Why it's bad:** The heading itself is the heading. An icon next to it is decoration that competes for attention. It also signals "AI made this" because LLMs reflexively add icons.

**Replacement:** Let the heading stand on its own. Icons are reserved for *actions* (buttons, menu items) or *status* (status pills).

**When an icon IS appropriate next to a heading:** when the heading is a *command* (e.g., "Resume Download" with a play icon). The icon and the verb are a unit.

### Rule 15 — No fake product UI as hero illustration

**Anti-pattern:** A stylized mockup of a chat interface, dashboard, or app screen as a hero image, with no real function.

**Why it's bad:** This is a "screenshot" of something that doesn't exist. It's visual deception. Users can tell.

**Replacement:** If the product exists, show a real screenshot. If it doesn't, show a real text input that *actually works* (the onboarding card does this — it's a real form, not a fake screenshot).

**For Motrix AI:** the detail panel screenshot (`references/03-detail-overlay-2026-06-15.png`) is a real Playwright render of the actual product. It can be used as a hero image because it's the truth.

### Rule 16 — No logo wall (or any wall of fake brand logos)

**Anti-pattern:** "Trusted by:" followed by a row of 5-8 stylized "brand" logos (often fictional).

**Why it's bad:** Invented logos are the most obvious AI tell. Users spot it instantly.

**Replacement:** If you have real customers, use their real logos (with permission). If you don't, don't show this section. The product should stand on its own merit.

---

## D. Type

### Rule 17 — Don't use Inter as a display face

**Anti-pattern:** Using Inter (or Roboto, or Arial) as the *display* typography for headlines, hero text, and section titles.

**Why it's bad:** Inter is designed for *UI* — body, labels, buttons. As a display face, it has no personality. It's the "Helvetica of 2024," which means every default-LLM website uses it.

**Replacement:** Use Inter (or system UI) for *body* and pair it with a distinctive display face:
- Editorial: Iowan Old Style, Charter, Georgia (serif)
- Modern minimal: keep Inter for body, use a *specific* display face (e.g., a brand custom or a system mono)
- Tech / utility: one family is fine (Inter is acceptable here)

**Carve-out for this prototype:** The current spec uses Inter for both body AND display. This is a known compromise — the prototype is single-file, no font loading, and Inter renders identically across all OSes. If the project graduates to a production app, the display face should be revisited (e.g., a custom wordmark, or a serif like Iowan Old Style for the "Motrix AI" wordmark).

### Rule 18 — Mono numerics for all data fields

**Anti-pattern:** Using the UI font (Inter) for sizes, speeds, ETAs, percentages, hashes, file paths.

**Why it's bad:** Inter is proportional — the `1` is narrower than the `0`. In a column of numbers, the decimal points don't line up. The column loses its rhythm.

**Replacement:** Use `font-family: var(--font-mono)` (JetBrains Mono) and `font-variant-numeric: tabular-nums` for all data fields. The decimal points align column-wise.

**Where it applies:** task table cells (size, speed, eta, progress %), detail panel stat strip, progress ring text, source URL, any ID/hash.

### Rule 19 — No justified text

**Anti-pattern:** `text-align: justify` on body paragraphs.

**Why it's bad:** Justified text creates uneven word spacing — long gaps between words on some lines, tight spacing on others. It's hard to read. It's also a 1990s print convention that doesn't transfer to web.

**Replacement:** Left-aligned text. Always. Period.

**Current state:** The prototype has 0 instances of `text-align: justify`. ✓

---

## E. Motion

### Rule 20 — Single motion language (spring-out)

**Anti-pattern:** Using 3-4 different easings in one product:
- `ease-in-out` for the modal
- `linear` for the toast
- `cubic-bezier(0.68, -0.55, 0.265, 1.55)` for the buttons
- Spring physics for the row

**Why it's bad:** Each new easing adds cognitive load. The user feels "something is moving" instead of "the UI is alive." Coherence > variety.

**Replacement:** Pick ONE easing family (spring-out) and stick to it. The prototype uses two related curves:
- `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1)) — gentle settle
- `--ease-default` (cubic-bezier(0.2, 0.8, 0.2, 1)) — sharper spring

Both feel "springy." Both are derived from the same family.

### Rule 21 — Always handle prefers-reduced-motion

**Anti-pattern:** New animations that don't have a reduced-motion override.

**Why it's bad:** Some users have vestibular disorders. Continuous motion triggers nausea, dizziness, or migraines. WCAG 2.3.3 requires this.

**Replacement:** Every animation gets a `prefers-reduced-motion: reduce` block that either:
- Strips the animation entirely (`animation: none`)
- Compresses it to 100ms or less (`transition-duration: 100ms`)
- Removes the moving part (`display: none` for shimmer pseudo-elements)

The prototype has a global reduced-motion block that handles 5 specific overrides. New animations should be added to this block.

**Test:** Toggle reduced-motion in your OS or DevTools, and verify the new animation is suppressed.

---

## F. Iconography

### Rule 22 — Lucide-style inline SVG, stroke 2 or 2.5

**Anti-pattern:** Using:
- An icon font (Font Awesome, Material Icons, etc.)
- An emoji as an icon
- A raster image (PNG icon) for an inline UI element
- An SVG with mismatched stroke widths across the same icon family

**Why it's bad:** Icon fonts render inconsistently, can have accessibility issues, and require loading a separate file. Emoji are inconsistent across OSes. Raster icons don't scale. Mixed stroke widths look chaotic.

**Replacement:** Inline SVG with consistent stroke-width (`2` or `2.5`). The prototype uses `stroke-width="2"` for most icons and `stroke-width="2.5"` for *important* icons (the type icons in the task table and detail panel header — slightly bolder to draw the eye).

**Implementation pattern:**

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="..."/>
</svg>
```

`stroke="currentColor"` makes the icon inherit the parent's text color. The viewBox is always 24×24 (Lucide standard). The stroke is round (matches modern minimal aesthetic).

**Where to find icons:** Lucide (https://lucide.dev) is the source. The prototype's `TYPE_ICONS` and `TOAST_TYPE_ICONS` constants are pulled from there.

---

## G. Process rules

These are not "design rules" but "process rules" that prevent the design from rotting.

### Rule 23 — All design changes go through this checklist

**Process rule:** Before merging any PR that changes CSS, copy, or structure, run the PR review against all 22 rules above. If a rule is violated, the PR gets a "do not merge" comment with a link to the rule.

**When to relax this rule:** When the violation is intentional and documented in an ADR. For example, "We know this card has a left blue border accent; we're keeping it because it represents the in-progress state, see ADR-007." Without the ADR, the violation is a regression.

### Rule 24 — Update the visual baseline when layout changes

**Process rule:** When a layout change affects the visual baseline (chrome bar, table, detail panel, onboarding card), re-render the screenshot at `references/02-main-screen-2026-06-15.png` (or whichever screen changed). The PNGs are the single source of truth for layout — when code drifts from PNG, the PNG is updated.

**How to re-render:** Use the Playwright script in `docs/handoff/scripts/` (if it exists) or capture manually. Save with the new date: `02-main-screen-2026-06-16.png`.

### Rule 25 — Update HANDOFF.md when locked decisions change

**Process rule:** If a locked decision (in `HANDOFF.md` §2) is changed via ADR, update HANDOFF.md in the same PR. Don't let the spec and the doc drift.

---

## H. Self-audit script (run before each release)

```bash
# 1. No emoji in user-visible text
rg '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]' --type html index.html

# 2. No em-dash in user-visible copy (greps in user-facing attributes, not in comments)
rg '—' --type html index.html | rg -v '^\s*(<!--|/\*|\*)' | rg -v '"createdAt"|"timeline"'

# 3. No alert() calls (replaced by toast system)
rg '\balert\(' --type html index.html

# 4. No camelCase onClick (only lowercase onclick)
rg '\bonClick=' --type html index.html

# 5. No dead code (renderMessages, chatMessages, MOCK_MESSAGES)
rg 'renderMessages|MOCK_MESSAGES' --type html index.html

# 6. No "Feature One" or other placeholder copy
rg 'Feature One|Feature Two|Feature Three|Lorem ipsum' --type html index.html

# 7. No text-align: justify
rg 'text-align:\s*justify' --type html index.html

# 8. No emoji shortcuts (✨ 🚀 🎯 ⚡ 🔒 📦)
rg '✨|🚀|🎯|💡|⚡|🔒|📦' --type html index.html

# 9. JS syntax check
node --check <(grep -A 10000 '<script>' index.html | grep -B 10000 '</script>')

# 10. Visual baseline exists
ls -la references/*.png
```

If any command returns output (other than the `ls`), there's a regression. Fix before release.
