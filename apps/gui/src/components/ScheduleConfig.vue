<script setup lang="ts">
import { ref, computed } from 'vue'
import { NCard, NButton, NInput, NSwitch, NIcon, useMessage } from 'naive-ui'
import { TimeOutline, SpeedometerOutline, SaveOutline } from '@vicons/ionicons5'

interface ScheduleRule {
  name: string
  time_start: string
  time_end: string
  speed_limit: number
  max_concurrent: number
  enabled: boolean
}

const message = useMessage()

const rules = ref<ScheduleRule[]>([
  { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5, enabled: true },
  { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5000000, max_concurrent: 2, enabled: true },
  { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10000000, max_concurrent: 3, enabled: true },
])

const showAddForm = ref(false)
const newRule = ref<ScheduleRule>({
  name: '',
  time_start: '00:00',
  time_end: '23:59',
  speed_limit: 0,
  max_concurrent: 3,
  enabled: true,
})

function formatSpeed(bytes: number): string {
  if (bytes === 0) return '无限制'
  return `${(bytes / 1024 / 1024).toFixed(0)} MB/s`
}

function addRule() {
  if (!newRule.value.name) {
    message.warning('请输入规则名称')
    return
  }
  rules.value.push({ ...newRule.value })
  showAddForm.value = false
  newRule.value = { name: '', time_start: '00:00', time_end: '23:59', speed_limit: 0, max_concurrent: 3, enabled: true }
  message.success('规则已添加')
}

function removeRule(index: number) {
  rules.value.splice(index, 1)
  message.success('规则已删除')
}

function saveRules() {
  message.success('调度规则已保存')
}

const currentRule = computed(() => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const current = `${hh}:${mm}`
  return rules.value.find(r => {
    if (r.time_start <= r.time_end) {
      return current >= r.time_start && current < r.time_end
    }
    return current >= r.time_start || current < r.time_end
  })
})
</script>

<template>
  <n-card title="⏰ 智能调度" class="schedule-card">
    <template #header-extra>
      <n-tag v-if="currentRule" type="success" size="small">
        当前: {{ currentRule.name }}
      </n-tag>
    </template>

    <div class="rules-list">
      <div v-for="(rule, index) in rules" :key="index" class="rule-item" :class="{ active: rule === currentRule }">
        <div class="rule-header">
          <n-switch v-model:value="rule.enabled" size="small" />
          <span class="rule-name">{{ rule.name }}</span>
          <n-button size="tiny" quaternary type="error" @click="removeRule(index)">删除</n-button>
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
        <n-input v-model:value="newRule.time_start" placeholder="开始时间" size="small" style="width: 70px" />
        <span>·</span>
        <n-input v-model:value="newRule.time_end" placeholder="结束时间" size="small" style="width: 70px" />
      </div>
      <div class="form-actions">
        <n-button size="small" @click="showAddForm = false">取消</n-button>
        <n-button size="small" type="primary" @click="addRule">添加</n-button>
      </div>
    </div>

    <div class="card-footer">
      <n-button size="small" @click="showAddForm = true">+ 添加规则</n-button>
      <n-button size="small" type="primary" @click="saveRules">
        <template #icon><n-icon><SaveOutline /></n-icon></template>
        保存
      </n-button>
    </div>
  </n-card>
</template>

<style scoped>
.schedule-card { max-width: 500px; }
.rules-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.rule-item { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-elevated); }
.rule-item.active { border-color: #3B82F6; background: rgba(59, 130, 246, 0.1); }
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-name { flex: 1; font-weight: 500; }
.rule-details { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--fg-muted); }
.rule-time, .rule-speed { display: flex; align-items: center; gap: 6px; }
.rule-concurrent { margin-left: auto; }
.add-form { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px dashed var(--border); border-radius: 8px; margin-bottom: 16px; }
.form-row { display: flex; align-items: center; gap: 8px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.card-footer { display: flex; justify-content: space-between; }
</style>
