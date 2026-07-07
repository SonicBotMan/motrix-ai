<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NCard, NButton, NInput, NInputNumber, NSwitch, NIcon, NTag, useMessage } from 'naive-ui'
import { TimeOutline, SpeedometerOutline, SaveOutline, AddOutline, TrashOutline } from '@vicons/ionicons5'
import { useSchedule, type ScheduleRule } from '@/composables/useSchedule'

const message = useMessage()

const STORAGE_KEY = 'motrix-ai:schedule-rules'

const DEFAULT_RULES: ScheduleRule[] = [
  { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
  { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5_000_000, max_concurrent: 2 },
  { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10_000_000, max_concurrent: 3 },
]

// ---- Load rules from localStorage ----
function loadRules(): ScheduleRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ScheduleRule[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // fall through to defaults
  }
  return [...DEFAULT_RULES]
}

function persistRules(rules: ScheduleRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    // best-effort
  }
}

const rules = ref<ScheduleRule[]>(loadRules())

// ---- Enabled state stored separately (per-rule toggle) ----
const STORAGE_KEY_ENABLED = 'motrix-ai:schedule-enabled'
const enabledMap = ref<Record<number, boolean>>(loadEnabledMap())

function loadEnabledMap(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENABLED)
    if (raw) return JSON.parse(raw) as Record<number, boolean>
  } catch {
    // fall through
  }
  return {}
}

function persistEnabledMap(): void {
  try {
    localStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabledMap.value))
  } catch {
    // best-effort
  }
}

function isRuleEnabled(index: number): boolean {
  return enabledMap.value[index] !== false
}

function toggleRule(index: number, val: boolean): void {
  enabledMap.value[index] = val
  persistEnabledMap()
  updateSchedulerRules()
}

// ---- Schedule scheduler ----
const sched = useSchedule(getActiveRules())

function getActiveRules(): ScheduleRule[] {
  return rules.value.filter((_, i) => isRuleEnabled(i))
}

function updateSchedulerRules(): void {
  sched.setRules(getActiveRules())
}

// Persist on rules change
watch(
  rules,
  (newRules) => {
    persistRules(newRules)
    updateSchedulerRules()
  },
  { deep: true },
)

onMounted(() => {
  sched.start()
})

onUnmounted(() => {
  sched.stop()
})

// ---- Add form ----
const showAddForm = ref(false)
const newRule = ref<ScheduleRule>({
  name: '',
  time_start: '00:00',
  time_end: '23:59',
  speed_limit: 0,
  max_concurrent: 3,
})

function isValidTimeFormat(t: string): boolean {
  return (
    /^\d{2}:\d{2}$/.test(t) &&
    (() => {
      const [h, m] = t.split(':').map(Number)
      return h >= 0 && h <= 23 && m >= 0 && m <= 59
    })()
  )
}

function addRule() {
  if (!newRule.value.name.trim()) {
    message.warning('请输入规则名称')
    return
  }
  if (!isValidTimeFormat(newRule.value.time_start)) {
    message.warning('开始时间格式错误，请使用 HH:mm')
    return
  }
  if (!isValidTimeFormat(newRule.value.time_end)) {
    message.warning('结束时间格式错误，请使用 HH:mm')
    return
  }
  if (newRule.value.speed_limit < 0) {
    message.warning('速度限制不能为负数')
    return
  }
  if (newRule.value.max_concurrent < 1) {
    message.warning('最大并发至少为 1')
    return
  }
  rules.value.push({ ...newRule.value })
  showAddForm.value = false
  newRule.value = { name: '', time_start: '00:00', time_end: '23:59', speed_limit: 0, max_concurrent: 3 }
  message.success('规则已添加')
}

function removeRule(index: number) {
  rules.value.splice(index, 1)
  // Shift enabled map entries
  const newMap: Record<number, boolean> = {}
  for (const [k, v] of Object.entries(enabledMap.value)) {
    const idx = Number(k)
    if (idx < index) newMap[idx] = v
    else if (idx > index) newMap[idx - 1] = v
  }
  enabledMap.value = newMap
  persistEnabledMap()
  message.success('规则已删除')
}

function saveRules() {
  persistRules(rules.value)
  updateSchedulerRules()
  message.success('调度规则已保存并生效')
}

// ---- Helpers ----
function formatSpeed(bytes: number): string {
  if (bytes === 0) return '无限制'
  return `${(bytes / 1024 / 1024).toFixed(0)} MB/s`
}

const currentRule = computed(() => sched.currentRule.value)
</script>

<template>
  <n-card title="⏰ 智能调度" class="schedule-card">
    <template #header-extra>
      <n-tag v-if="currentRule" type="success" size="small"> 当前: {{ currentRule.name }} </n-tag>
      <n-tag v-else type="default" size="small"> 无匹配规则 </n-tag>
    </template>

    <div class="rules-list">
      <div
        v-for="(rule, index) in rules"
        :key="index"
        class="rule-item"
        :class="{ active: currentRule?.name === rule.name }"
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
            <span class="rule-concurrent">最大并发: {{ rule.max_concurrent }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAddForm" class="add-form">
      <n-input v-model:value="newRule.name" placeholder="规则名称" size="small" />
      <div class="form-row">
        <n-input v-model:value="newRule.time_start" placeholder="开始 HH:mm" size="small" style="width: 100px" />
        <span>·</span>
        <n-input v-model:value="newRule.time_end" placeholder="结束 HH:mm" size="small" style="width: 100px" />
      </div>
      <div class="form-row">
        <label class="form-label">速度限制 (bytes/s, 0=无限)</label>
        <n-input-number v-model:value="newRule.speed_limit" :min="0" size="small" style="width: 140px" />
      </div>
      <div class="form-row">
        <label class="form-label">最大并发</label>
        <n-input-number v-model:value="newRule.max_concurrent" :min="1" :max="20" size="small" style="width: 100px" />
      </div>
      <div class="form-actions">
        <n-button size="small" @click="showAddForm = false">取消</n-button>
        <n-button size="small" type="primary" @click="addRule">
          <template #icon
            ><n-icon><AddOutline /></n-icon
          ></template>
          添加
        </n-button>
      </div>
    </div>

    <div class="card-footer">
      <n-button size="small" @click="showAddForm = true">
        <template #icon
          ><n-icon><AddOutline /></n-icon
        ></template>
        添加规则
      </n-button>
      <n-button size="small" type="primary" @click="saveRules">
        <template #icon
          ><n-icon><SaveOutline /></n-icon
        ></template>
        保存并生效
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
