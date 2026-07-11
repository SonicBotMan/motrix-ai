<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps<{
  getCurrentSpeed: () => number
}>()

const MAX_POINTS = 60
const speeds = ref<number[]>([])
let timer: ReturnType<typeof setInterval> | null = null

const maxSpeed = computed(() => Math.max(...speeds.value, 1))

const points = computed(() => {
  if (speeds.value.length < 2) return ''
  const w = 100
  const h = 24
  const step = w / (MAX_POINTS - 1)
  return speeds.value
    .map((s, i) => {
      const x = i * step
      const y = h - (s / maxSpeed.value) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

onMounted(() => {
  timer = setInterval(() => {
    const speed = props.getCurrentSpeed()
    speeds.value.push(speed)
    if (speeds.value.length > MAX_POINTS) speeds.value.shift()
  }, 2000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <svg class="speed-chart" viewBox="0 0 100 24" preserveAspectRatio="none" width="80" height="20" aria-hidden="true">
    <polyline
      v-if="points"
      :points="points"
      fill="none"
      stroke="var(--primary, #3b82f6)"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.speed-chart {
  opacity: 0.7;
}
</style>
