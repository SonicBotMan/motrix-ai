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
/* Stat cell styles for the Peers display */
.stat-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-right: 1px solid var(--border);
  flex: 0 0 auto;
}

.stat-cell:last-child {
  border-right: none;
}

.stat-label {
  font-family: var(--font-ui);
  font-size: var(--text-micro);
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-tertiary);
}

.stat-value {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-h2);
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
}

/* Peer list section */
.peer-list-section {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border);
  padding: var(--space-3) var(--space-5);
}

.peer-list-header {
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  font-weight: 600;
  color: var(--fg-secondary);
  margin-bottom: var(--space-2);
}

.peer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
  font-family: var(--font-mono);
  font-size: var(--text-body-sm);
}

.peer-ip {
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-speed {
  color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
