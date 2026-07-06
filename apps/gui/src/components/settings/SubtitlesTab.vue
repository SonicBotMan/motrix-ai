<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NInput, NSwitch } from 'naive-ui'
import { FolderOpenOutline } from '@vicons/ionicons5'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { t } from '@/composables/useSettings'
import { useMessage } from 'naive-ui'

const message = useMessage()

const subtitleApiKey = useLocalStorage<string>('motrix-ai:opensubtitles-api-key', '')
const subtitleLanguages = useLocalStorage<string[]>('motrix-ai:subtitle-languages', ['zh', 'en'])
const autoSearchSubtitles = useLocalStorage<boolean>('motrix-ai:auto-search-subtitles', true)
const subtitleDir = useLocalStorage<string>('motrix-ai:subtitle-dir', '~/Downloads/Motrix AI/Subtitles')

// NInput works on a single string; subtitleLanguages is string[] in storage.
// Bridge with a computed that joins/splits on comma so the underlying
// persistence shape stays an array (consumed elsewhere as an array).
const subtitleLanguagesText = computed({
  get: () => subtitleLanguages.value.join(','),
  set: (v: string) => {
    subtitleLanguages.value = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  },
})

async function pickSubtitleDir() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (selected && typeof selected === 'string') subtitleDir.value = selected
  } catch (e) {
    console.warn('Folder picker not available:', e)
    message.info('Folder picker is only available in the desktop app')
  }
}

function saveSubtitleApiKey() {
  localStorage.setItem('motrix-ai:opensubtitles-api-key', subtitleApiKey.value)
  message.success('API key saved')
}
</script>

<template>
  <div class="tab-content">
    <h3>{{ t('settings.subtitles') }}</h3>

    <div class="setting-group">
      <label>{{ t('settings.subtitleApiKey') }}</label>
      <NInput
        v-model:value="subtitleApiKey"
        type="password"
        show-password-on="click"
        :placeholder="t('settings.subtitleApiKeyPlaceholder')"
      />
      <NButton size="small" type="primary" @click="saveSubtitleApiKey">{{ t('btn.save') }}</NButton>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.subtitleLangs') }}</label>
      <NInput v-model:value="subtitleLanguagesText" :placeholder="t('settings.subtitleLangsPlaceholder')" />
      <p class="setting-hint">Comma-separated language codes, e.g. zh,en,ja.</p>
    </div>

    <div class="setting-group toggle-row">
      <div>
        <label>{{ t('settings.autoSubtitle') }}</label>
        <p class="setting-hint">Auto-search subtitles for video downloads on completion.</p>
      </div>
      <NSwitch v-model:value="autoSearchSubtitles" />
    </div>

    <div class="setting-group">
      <label>{{ t('settings.subtitleDownloadDir') }}</label>
      <div class="folder-row">
        <NInput v-model:value="subtitleDir" />
        <NButton size="small" @click="pickSubtitleDir">
          <template #icon><FolderOpenOutline /></template>
        </NButton>
      </div>
    </div>
  </div>
</template>
