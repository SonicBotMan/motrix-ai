# A3b DetailPanel Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Extract ProgressRing, PeerList, DetailFooter from DetailPanel.vue (1087 → ~750 lines).

**Architecture:** Three self-contained child components, each owning one visual zone + its associated logic. DetailPanel becomes a modal container that orchestrates header, stat strip, and collapsible sections.

## Global Constraints

- Repo root: `/home/h523034406/motrix-ai`, branch `refactor/a3b-detailpanel-split`
- Spec: `docs/superpowers/specs/2026-07-18-a3b-detailpanel-split-design.md` (commit `8199cba`)
- Baseline: `07238f7` (main, post-A3a)
- TypeScript strict. No `any`, no `eslint-disable`.
- Tests from workspace root: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- Public API of DetailPanel unchanged (TaskFirstView sees same props/emits).

---

### Task 1: Extract DetailProgressRing.vue

**Files:**

- Create: `apps/gui/src/components/task/DetailProgressRing.vue`
- Modify: `apps/gui/src/components/task/DetailPanel.vue`

**Step 1: Create DetailProgressRing.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/stores/tasks'

interface Props {
  task: Task | null
}
const props = defineProps<Props>()

const ringColor = computed(() => {
  if (!props.task) return 'var(--border)'
  switch (props.task.status) {
    case 'downloading':
      return 'var(--primary)'
    case 'paused':
      return 'var(--warning)'
    case 'completed':
      return 'var(--accent)'
    case 'failed':
      return 'var(--error)'
    default:
      return 'var(--border)'
  }
})

const RING_CIRC = 2 * Math.PI * 48
const ringDashoffset = computed(() => {
  const pct = Math.max(0, Math.min(100, props.task?.progress ?? 0))
  return RING_CIRC * (1 - pct / 100)
})

const ringCaption = computed(() => {
  if (!props.task) return ''
  switch (props.task.status) {
    case 'downloading':
      return `Downloading · ${props.task.eta || '—'} remaining`
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed. Retry to resume.'
    default:
      return 'Queued'
  }
})
</script>

<template>
  <section class="detail-ring" aria-label="Download progress">
    <svg
      class="ring-svg"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      role="progressbar"
      :aria-valuenow="props.task?.progress ?? 0"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="`${props.task?.progress ?? 0}% complete`"
    >
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" stroke-width="4" />
      <g transform="rotate(-90 60 60)">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          :stroke="ringColor"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="RING_CIRC"
          :stroke-dashoffset="ringDashoffset"
        />
      </g>
      <text x="60" y="60" text-anchor="middle" dominant-baseline="central" class="ring-text">
        {{ props.task?.progress ?? 0 }}%
      </text>
    </svg>
    <p class="ring-caption">{{ ringCaption }}</p>
  </section>
</template>

<style scoped>
/* Move ALL .detail-ring, .ring-svg, .ring-text, .ring-caption styles
   from DetailPanel.vue verbatim. They target elements within this
   component's scope (the <section class="detail-ring"> and its children). */
</style>
```

**Step 2: Wire into DetailPanel.vue**

In DetailPanel.vue:

1. **Add import:** `import DetailProgressRing from './DetailProgressRing.vue'`
2. **Delete from script:** `ringColor` computed, `RING_CIRC` constant, `ringDashoffset` computed, `ringCaption` computed (lines ~133-172)
3. **Replace template zone 3** (lines ~395-429) with:
   ```vue
   <DetailProgressRing :task="props.task" />
   ```
4. **Delete from styles:** `.detail-ring`, `.ring-svg`, `.ring-text`, `.ring-caption` rules

**Step 3:** typecheck + test + lint + commit.

Commit: `refactor(gui): extract DetailProgressRing from DetailPanel`

---

### Task 2: Extract DetailPeerList.vue

**Files:**

- Create: `apps/gui/src/components/task/DetailPeerList.vue`
- Modify: `apps/gui/src/components/task/DetailPanel.vue`

**Step 1: Create DetailPeerList.vue**

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

interface Props {
  gid?: string
}
const props = defineProps<Props>()

const peers = ref<Array<{ ip: string; port: string; downloadSpeed: string; uploadSpeed: string }>>([])

function formatPeerSpeed(speedStr: string): string {
  const speed = Number(speedStr) || 0
  if (speed >= 1_000_000) return `${(speed / 1_000_000).toFixed(1)}MB/s`
  if (speed >= 1_000) return `${(speed / 1_000).toFixed(0)}KB/s`
  return `${speed}B/s`
}

let peerPollTimer: ReturnType<typeof setInterval> | null = null

async function fetchPeers(): Promise<void> {
  if (!props.gid) {
    peers.value = []
    return
  }
  try {
    const { useAria2 } = await import('@/composables/useAria2')
    const aria2 = useAria2()
    if (aria2.connected.value) {
      peers.value = await aria2.getPeers(props.gid)
    }
  } catch {
    peers.value = []
  }
}

watch(
  () => props.gid,
  (gid) => {
    if (peerPollTimer) {
      clearInterval(peerPollTimer)
      peerPollTimer = null
    }
    if (gid) {
      void fetchPeers()
      peerPollTimer = setInterval(() => void fetchPeers(), 3000)
    } else {
      peers.value = []
    }
  },
)

onUnmounted(() => {
  if (peerPollTimer) clearInterval(peerPollTimer)
})
</script>

<template>
  <div v-if="peers.length > 0" class="peer-list-section">
    <div class="stat-cell">
      <div class="stat-label">Peers</div>
      <div class="stat-value">{{ peers.length }}</div>
    </div>
    <div class="peer-list-header">Peer Details</div>
    <div v-for="(peer, i) in peers.slice(0, 10)" :key="i" class="peer-row">
      <span class="peer-ip">{{ peer.ip }}:{{ peer.port }}</span>
      <span class="peer-speed">↓{{ formatPeerSpeed(peer.downloadSpeed) }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Move .peer-list-section, .peer-list-header, .peer-row, .peer-ip,
   .peer-speed styles from DetailPanel.vue. Also move the Peers stat-cell
   styling if it's separate from the general stat-cell styling.
   The .stat-cell and .stat-label / .stat-value general styles stay in
   DetailPanel (they're shared by all stat cells). Use :deep() or
   duplicate the minimal stat-cell styles here if needed for scoped
   rendering. */
</style>
```

**Step 2: Wire into DetailPanel.vue**

1. **Add import:** `import DetailPeerList from './DetailPeerList.vue'`
2. **Delete from script:** `peers` ref, `formatPeerSpeed`, `peerPollTimer`, `fetchPeers`, `watch(() => props.task?.gid, ...)`, and the peer-related `onUnmounted` cleanup (lines ~66-111)
3. **Delete from template:** the Peers stat-cell (lines ~379-382) and peer-list-section (lines ~384-390)
4. **Add to template** (after the stat strip `</section>`, before the error banner):
   ```vue
   <DetailPeerList :gid="props.task?.gid" />
   ```
5. **Delete from styles:** peer-specific styles (`.peer-list-section`, `.peer-list-header`, `.peer-row`, `.peer-ip`, `.peer-speed`)

**Step 3:** typecheck + test + lint + commit.

Commit: `refactor(gui): extract DetailPeerList from DetailPanel`

---

### Task 3: Extract DetailFooter.vue

**Files:**

- Create: `apps/gui/src/components/task/DetailFooter.vue`
- Modify: `apps/gui/src/components/task/DetailPanel.vue`

**Step 1: Create DetailFooter.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TaskStatus } from '@/stores/tasks'

interface Props {
  status: TaskStatus
}
const props = defineProps<Props>()

const emit = defineEmits<{
  pause: []
  resume: []
  retry: []
  priority: []
}>()

const isPaused = computed(() => props.status === 'paused')
</script>

<template>
  <footer class="detail-footer">
    <button v-if="isPaused" class="footer-btn footer-btn--primary" type="button" @click="emit('resume')">Resume</button>
    <button
      v-else-if="props.status === 'downloading'"
      class="footer-btn footer-btn--primary"
      type="button"
      @click="emit('pause')"
    >
      Pause
    </button>
    <button v-if="props.status === 'failed'" class="footer-btn footer-btn--ghost" type="button" @click="emit('retry')">
      Retry
    </button>
    <button
      v-if="props.status === 'downloading' || props.status === 'pending'"
      class="footer-btn footer-btn--ghost"
      type="button"
      @click="emit('priority')"
    >
      Priority
    </button>
  </footer>
</template>

<style scoped>
/* Move .detail-footer, .footer-btn, .footer-btn--primary, .footer-btn--ghost
   styles from DetailPanel.vue verbatim. */
</style>
```

**Step 2: Wire into DetailPanel.vue**

1. **Add import:** `import DetailFooter from './DetailFooter.vue'`
2. **Delete from script:** `isPaused` computed, `onPause`, `onResume`, `onRetry` functions (lines ~176, ~210-218)
3. **Replace template zone 5** (lines ~490-519) with:
   ```vue
   <DetailFooter
     :status="props.task.status"
     @pause="emit('pause')"
     @resume="emit('resume')"
     @retry="emit('retry')"
     @priority="emit('priority')"
   />
   ```
4. **Delete from styles:** `.detail-footer`, `.footer-btn`, `.footer-btn--primary`, `.footer-btn--ghost` rules

**Step 3:** typecheck + test + lint + commit.

Commit: `refactor(gui): extract DetailFooter from DetailPanel`

---

### Final Verification

```bash
pnpm typecheck && pnpm test && pnpm lint
wc -l apps/gui/src/components/task/DetailPanel.vue  # < 850
ls apps/gui/src/components/task/DetailProgressRing.vue apps/gui/src/components/task/DetailPeerList.vue apps/gui/src/components/task/DetailFooter.vue
```

Expected: 5 commits total (spec + plan + 3 implementation). DetailPanel < 850 lines. 702 tests pass.

---

## Self-Review

- Spec coverage: all 3 components covered in Tasks 1-3.
- Type consistency: ProgressRing takes `Task | null`, PeerList takes `gid?: string`, Footer takes `TaskStatus`. All match DetailPanel's usage.
- CSS strategy: each component's scoped styles target its own elements. No `:deep()` needed (unlike TaskTable, DetailPanel's children render content INSIDE the parent's modal — no table-layout constraints). The peer stat-cell styling may need attention if it relies on parent `.detail-stats` container — implementer should verify scoped rendering.
