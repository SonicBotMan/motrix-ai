<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NButton, NInput, NInputNumber, NSwitch, NIcon, NTag, useMessage } from 'naive-ui'
import { TimeOutline, SpeedometerOutline, SaveOutline, AddOutline, TrashOutline } from '@vicons/ionicons5'
import type { ScheduleRule } from '@/composables/useSchedule'
import { useConfigStore } from '@/stores/config'
import { t } from '@/composables/useSettings'

const message = useMessage()
const store = useConfigStore()

const rules = ref<ScheduleRule[]>(store.config.schedule.rules)

function isRuleEnabled(index: number): boolean {
  return rules.value[index]?.enabled !== false
}

function getActiveRules(): ScheduleRule[] {
  return rules.value.filter((_, i) => isRuleEnabled(i))
}

function toggleRule(index: number, val: boolean): void {
  rules.value[index] = { ...rules.value[index], enabled: val }
}

watch(
  rules,
  (newRules) => {
    store.updateSection('schedule', { rules: newRules })
  },
  { deep: true },
)

const showAddForm = ref(false)
const newRule = ref<ScheduleRule>({
  name: '',
  time_start: '00:00',
  time_end: '23:59',
  speed_limit: 0,
  max_concurrent: 3,
})

function isValidTimeFormat(tm: string): boolean {
  return (
    /^\d{2}:\d{2}$/.test(tm) &&
    (() => {
      const [h, m] = tm.split(':').map(Number)
      return h >= 0 && h <= 23 && m >= 0 && m <= 59
    })()
  )
}

function addRule() {
  if (!newRule.value.name.trim()) {
    message.warning(t('schedule.nameRequired'))
    return
  }
  if (!isValidTimeFormat(newRule.value.time_start)) {
    message.warning(t('schedule.invalidTimeFormat'))
    return
  }
  if (!isValidTimeFormat(newRule.value.time_end)) {
    message.warning(t('schedule.invalidTimeFormat'))
    return
  }
  if (newRule.value.speed_limit < 0) {
    message.warning(t('schedule.speedLimitNegative'))
    return
  }
  if (newRule.value.max_concurrent < 1) {
    message.warning(t('schedule.maxConcurrentMin'))
    return
  }
  rules.value.push({ ...newRule.value, enabled: true })
  showAddForm.value = false
  newRule.value = { name: '', time_start: '00:00', time_end: '23:59', speed_limit: 0, max_concurrent: 3 }
  message.success(t('schedule.ruleAdded'))
}

function removeRule(index: number) {
  rules.value.splice(index, 1)
  message.success(t('schedule.ruleDeleted'))
}

function saveRules() {
  message.success(t('schedule.ruleSaved'))
}

function formatSpeed(bytes: number): string {
  if (bytes === 0) return t('schedule.unlimited')
  return `${(bytes / 1024 / 1024).toFixed(0)} MB/s`
}

const currentRuleActive = computed(() => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const current = `${hh}:${mm}`
  return getActiveRules().some((r) => {
    if (r.time_start <= r.time_end) return current >= r.time_start && current < r.time_end
    return current >= r.time_start || current < r.time_end
  })
})
</script>

<template>
  <n-card :title="'⏰ ' + t('schedule.title')" class="schedule-card">
    <template #header-extra>
      <n-tag v-if="currentRuleActive" type="success" size="small">
        {{ t('schedule.currentRule') }}
      </n-tag>
      <n-tag v-else type="default" size="small"> {{ t('schedule.noMatch') }} </n-tag>
    </template>

    <div class="rules-list">
      <div
        v-for="(rule, index) in rules"
        :key="index"
        class="rule-item"
        :class="{ active: currentRuleActive && isRuleEnabled(index) }"
      >
        <div class="rule-header">
          <n-switch :value="isRuleEnabled(index)" size="small" @update:value="(v: boolean) => toggleRule(index, v)" />
          <span class="rule-name">{{ rule.name }}</span>
          <n-button size="tiny" quaternary type="error" @click="removeRule(index)">
            <template #icon
              ><n-icon><TrashOutline /></n-icon
            ></template>
          </n-button>
        </div>
        <div class="rule-details">
          <div class="rule-time">
            <n-icon :size="14"><TimeOutline /></n-icon>
            <n-input v-model:value="rule.time_start" size="tiny" style="width: 70px" placeholder="HH:mm" />
            <span>·</span>
            <n-input v-model:value="rule.time_end" size="tiny" style="width: 70px" placeholder="HH:mm" />
          </div>
          <div class="rule-speed">
            <n-icon :size="14"><SpeedometerOutline /></n-icon>
            <span>{{ formatSpeed(rule.speed_limit) }}</span>
            <span class="rule-concurrent">{{ t('schedule.maxConcurrent') }}: {{ rule.max_concurrent }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAddForm" class="add-form">
      <n-input v-model:value="newRule.name" :placeholder="t('schedule.ruleName')" size="small" />
      <div class="form-row">
        <n-input
          v-model:value="newRule.time_start"
          :placeholder="t('schedule.startTime')"
          size="small"
          style="width: 100px"
        />
        <span>·</span>
        <n-input
          v-model:value="newRule.time_end"
          :placeholder="t('schedule.endTime')"
          size="small"
          style="width: 100px"
        />
      </div>
      <div class="form-row">
        <label class="form-label">{{ t('schedule.speedLimit') }}</label>
        <n-input-number v-model:value="newRule.speed_limit" :min="0" size="small" style="width: 140px" />
      </div>
      <div class="form-row">
        <label class="form-label">{{ t('schedule.maxConcurrent') }}</label>
        <n-input-number v-model:value="newRule.max_concurrent" :min="1" :max="20" size="small" style="width: 100px" />
      </div>
      <div class="form-actions">
        <n-button size="small" @click="showAddForm = false">{{ t('schedule.cancel') }}</n-button>
        <n-button size="small" type="primary" @click="addRule">
          <template #icon
            ><n-icon><AddOutline /></n-icon
          ></template>
          {{ t('schedule.add') }}
        </n-button>
      </div>
    </div>

    <div class="card-footer">
      <n-button size="small" @click="showAddForm = true">
        <template #icon
          ><n-icon><AddOutline /></n-icon
        ></template>
        {{ t('schedule.addRule') }}
      </n-button>
      <n-button size="small" type="primary" @click="saveRules">
        <template #icon
          ><n-icon><SaveOutline /></n-icon
        ></template>
        {{ t('schedule.save') }}
      </n-button>
    </div>
  </n-card>
</template>

<style scoped>
.schedule-card {
  max-width: 500px;
}
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.rule-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
}
.rule-item.active {
  border-color: var(--primary);
  background: var(--primary-muted);
}
.rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.rule-name {
  flex: 1;
  font-weight: 500;
}
.rule-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--fg-secondary);
}
.rule-time,
.rule-speed {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule-concurrent {
  margin-left: auto;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-label {
  font-size: 12px;
  color: var(--fg-secondary);
  white-space: nowrap;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.card-footer {
  display: flex;
  justify-content: space-between;
}
</style>
