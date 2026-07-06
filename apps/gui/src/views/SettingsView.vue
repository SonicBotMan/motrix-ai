<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NTabs, NTabPane } from 'naive-ui'
import { ArrowBackOutline } from '@vicons/ionicons5'
import { t } from '@/composables/useSettings'
import ScheduleConfig from '@/components/ScheduleConfig.vue'
import NASConfig from '@/components/NASConfig.vue'
import AiModelTab from '@/components/settings/AiModelTab.vue'
import DownloadsTab from '@/components/settings/DownloadsTab.vue'
import SubtitlesTab from '@/components/settings/SubtitlesTab.vue'
import AppearanceTab from '@/components/settings/AppearanceTab.vue'
import AdvancedTab from '@/components/settings/AdvancedTab.vue'

const router = useRouter()
const activeTab = ref('ai-model')

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-view">
    <header class="chrome">
      <div class="chrome-left">
        <NButton quaternary circle @click="goBack">
          <template #icon><NIcon :component="ArrowBackOutline" /></template>
        </NButton>
        <span class="chrome-title">{{ t('nav.settings') }}</span>
      </div>
    </header>

    <main class="settings-body">
      <NTabs v-model:value="activeTab" type="line" placement="left">
        <NTabPane name="ai-model" :tab="t('settings.aiModel')">
          <AiModelTab />
        </NTabPane>

        <NTabPane name="downloads" :tab="t('settings.downloads')">
          <DownloadsTab />
        </NTabPane>

        <NTabPane name="schedule" :tab="t('settings.schedule') || 'Schedule'">
          <ScheduleConfig />
        </NTabPane>

        <NTabPane name="subtitles" :tab="t('settings.subtitles')">
          <SubtitlesTab />
        </NTabPane>

        <NTabPane name="appearance" :tab="t('settings.appearance')">
          <AppearanceTab />
        </NTabPane>

        <NTabPane name="nas" tab="NAS">
          <NASConfig />
        </NTabPane>

        <NTabPane name="advanced" :tab="t('settings.advanced')">
          <AdvancedTab />
        </NTabPane>
      </NTabs>
    </main>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg, #0a0a0b);
  color: var(--fg, #fafafa);
}

.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--surface, #131316);
  border-bottom: 1px solid var(--border, #1f1f23);
}

.chrome-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chrome-title {
  font-size: 16px;
  font-weight: 600;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Shared styles applied to settings tab children via :deep(). */
:deep(.tab-content) {
  max-width: 600px;
}

:deep(.tab-content h3) {
  margin-bottom: var(--space-4, 16px);
  font-size: 18px;
  font-weight: 600;
}

:deep(.setting-group) {
  margin-bottom: var(--space-4, 16px);
}

:deep(.setting-group label) {
  display: block;
  margin-bottom: var(--space-2, 8px);
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-secondary, #a0a0a8);
}

:deep(.setting-hint) {
  margin-top: 4px;
  font-size: 12px;
  color: var(--fg-tertiary, #6b7280);
}

:deep(.setting-hint a) {
  color: var(--primary, #3b82f6);
  text-decoration: none;
}

:deep(.setting-hint a:hover) {
  text-decoration: underline;
}

:deep(.folder-row) {
  display: flex;
  gap: 8px;
  align-items: center;
}

:deep(.toggle-row) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

:deep(.status-indicator) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

:deep(.status-dot) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

:deep(.status-dot.connected) {
  background: #10b981;
}

:deep(.status-dot.disconnected) {
  background: #ef4444;
}

:deep(.danger-zone) {
  border: 1px solid var(--error-muted, #7f1d1d);
  border-radius: var(--radius-md, 8px);
  padding: 16px;
  margin-top: 24px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 100ms !important;
  }
}
</style>
