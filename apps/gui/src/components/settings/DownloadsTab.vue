<script setup lang="ts">
import { createLogger } from '@motrix-ai/core/browser'
const logger = createLogger('downloads')
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NInputNumber, NSwitch } from 'naive-ui'
import { FolderOpenOutline } from '@vicons/ionicons5'
import { useAria2 } from '@/composables/useAria2'
import { useConfigStore } from '@/stores/config'
import { t } from '@/composables/useSettings'
import { useMessage } from 'naive-ui'

const aria2 = useAria2()
const message = useMessage()
const store = useConfigStore()

const downloadDir = computed<string>({
  get: () => store.config.downloads.base_dir,
  set: (v: string) => store.updateSection('downloads', { base_dir: v }),
})

const downloadDirError = computed(() => {
  const val = downloadDir.value.trim()
  if (!val) return 'Download directory is required'
  return ''
})

// aria2 daemon runtime options — applied via watchers below, not persisted to config.
const maxConcurrent = ref(5)
const downloadSpeedLimit = ref(0)
const uploadSpeedLimit = ref(0)
const autoRetry = ref(true)
const maxRetries = ref(3)

watch(maxConcurrent, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-concurrent-downloads': String(val) })
  } catch (e) {
    logger.warn('Failed to apply maxConcurrent:', e)
  }
})
watch(downloadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-download-limit': String(val * 1024) })
  } catch (e) {
    logger.warn('Failed to apply downloadSpeedLimit:', e)
  }
})
watch(uploadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-upload-limit': String(val * 1024) })
  } catch (e) {
    logger.warn('Failed to apply uploadSpeedLimit:', e)
  }
})
watch(autoRetry, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-tries': val ? String(maxRetries.value) : '0' })
  } catch (e) {
    logger.warn('Failed to apply autoRetry:', e)
  }
})
watch(maxRetries, async (val) => {
  if (autoRetry.value) {
    try {
      await aria2.changeGlobalOption({ 'max-tries': String(val) })
    } catch (e) {
      logger.warn('Failed to apply maxRetries:', e)
    }
  }
})

async function pickDownloadDir() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (selected && typeof selected === 'string') downloadDir.value = selected
  } catch (e) {
    logger.warn('Folder picker not available:', e)
    message.info('Folder picker is only available in the desktop app')
  }
}

async function applyAria2Settings() {
  try {
    await aria2.changeGlobalOption({
      'max-concurrent-downloads': String(maxConcurrent.value),
      'max-overall-download-limit': String(downloadSpeedLimit.value * 1024),
      'max-overall-upload-limit': String(uploadSpeedLimit.value * 1024),
      'max-tries': autoRetry.value ? String(maxRetries.value) : '0',
    })
    message.success('Settings applied to aria2')
  } catch (e) {
    message.error('Failed to apply settings: ' + (e instanceof Error ? e.message : String(e)))
  }
}
</script>

<template>
  <div class="tab-content">
    <h3>{{ t('settings.downloads') }}</h3>

    <div class="setting-group">
      <label>{{ t('settings.downloadDir') }}</label>
      <div class="folder-row">
        <NInput v-model:value="downloadDir" :status="downloadDirError ? 'error' : undefined" />
        <NButton size="small" @click="pickDownloadDir">
          <template #icon><FolderOpenOutline /></template>
        </NButton>
      </div>
      <p v-if="downloadDirError" class="form-error">{{ downloadDirError }}</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.maxConcurrent') }}</label>
      <NInputNumber v-model:value="maxConcurrent" :min="1" :max="20" />
    </div>

    <div class="setting-group">
      <label>{{ t('settings.downloadSpeed') }}</label>
      <NInputNumber v-model:value="downloadSpeedLimit" :min="0" />
      <p class="setting-hint">{{ t('settings.unlimited') }}: 0</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.uploadSpeed') }}</label>
      <NInputNumber v-model:value="uploadSpeedLimit" :min="0" />
      <p class="setting-hint">{{ t('settings.unlimited') }}: 0</p>
    </div>

    <div class="setting-group toggle-row">
      <div>
        <label>{{ t('settings.autoRetry') }}</label>
        <p class="setting-hint">Automatically retry failed downloads.</p>
      </div>
      <NSwitch v-model:value="autoRetry" />
    </div>

    <div v-if="autoRetry" class="setting-group">
      <label>{{ t('settings.maxRetries') }}</label>
      <NInputNumber v-model:value="maxRetries" :min="1" :max="10" />
    </div>

    <NButton type="primary" @click="applyAria2Settings">{{ t('settings.applyNow') }}</NButton>
  </div>
</template>

<style scoped>
.form-error {
  color: var(--error);
  font-size: 12px;
  margin-top: 4px;
}
</style>
