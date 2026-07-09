<script setup lang="ts">
defineProps<{
  activeFilter: string
}>()

const emit = defineEmits<{
  'update:activeFilter': [value: string]
}>()

interface FilterTab {
  label: string
  value: string
}

const filterTabs: FilterTab[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Completed', value: 'completed' },
]

function select(value: string): void {
  emit('update:activeFilter', value)
}
</script>

<template>
  <div class="filter-tabs" role="tablist" aria-label="Filter tasks">
    <button
      v-for="tab in filterTabs"
      :key="tab.value"
      type="button"
      class="filter-tab"
      :class="{ active: activeFilter === tab.value }"
      role="tab"
      :aria-selected="activeFilter === tab.value ? 'true' : 'false'"
      @click="select(tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.filter-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--border, #1f1f23);
  margin-bottom: 8px;
}

.filter-tab {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fg-tertiary, #6b7280);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition:
    color 150ms cubic-bezier(0.16, 1, 0.3, 1),
    background 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.filter-tab:hover {
  color: var(--fg, #fafafa);
  background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.filter-tab.active {
  color: var(--fg, #fafafa);
  background: var(--surface-active, rgba(255, 255, 255, 0.08));
}
</style>
