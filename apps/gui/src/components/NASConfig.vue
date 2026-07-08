<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NButton, NInput, NSwitch, NIcon, useMessage } from 'naive-ui'
import { FolderOpenOutline, CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'
import { t } from '@/composables/useSettings'

interface NASConfig {
  enabled: boolean
  host: string
  port: string
  username: string
  moviePath: string
  softwarePath: string
  musicPath: string
  connected: boolean
}

const message = useMessage()
const store = useConfigStore()
const testing = ref(false)

const config = ref<NASConfig>({
  enabled: false,
  host: '192.168.1.100',
  port: '22',
  username: '',
  moviePath: '/volume1/Media/Movies',
  softwarePath: '/volume1/Software',
  musicPath: '/volume1/Music',
  connected: false,
})

async function testConnection() {
  testing.value = true
  try {
    const result = await invoke<boolean>('test_nas_connection', {
      host: config.value.host,
      port: config.value.port,
      username: config.value.username,
    })
    config.value.connected = result
    if (result) {
      message.success(t('nas.connectionSuccess'))
    } else {
      message.error(t('nas.connectionFailed'))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('not found') || msg.includes('command') || msg.includes('invoke')) {
      message.warning(t('nas.featureUnavailable'))
      config.value.connected = false
    } else {
      message.error(`${t('nas.connectionError')}: ${msg}`)
      config.value.connected = false
    }
  } finally {
    testing.value = false
  }
}

function saveConfig() {
  store.updateSection('archive', {
    enabled: config.value.enabled,
    targets: [
      {
        name: 'NAS',
        host: config.value.host,
        path: config.value.moviePath,
        match: {},
      },
    ],
  })
  message.success(t('nas.configSaved'))
}

const archive = store.config.archive
if (archive.targets.length > 0) {
  config.value.enabled = archive.enabled
  config.value.host = archive.targets[0].host
  config.value.moviePath = archive.targets[0].path
}
</script>

<template>
  <n-card :title="t('nas.title')" class="nas-card">
    <template #header-extra>
      <n-tag :type="config.connected ? 'success' : 'error'" size="small">
        {{ config.connected ? t('nas.connected') : t('nas.disconnected') }}
      </n-tag>
    </template>

    <div class="config-section">
      <div class="row">
        <span class="label">{{ t('nas.enable') }}</span>
        <n-switch v-model:value="config.enabled" />
      </div>

      <div v-if="config.enabled" class="nas-form">
        <div class="row">
          <span class="label">{{ t('nas.host') }}</span>
          <n-input v-model:value="config.host" placeholder="192.168.1.100" size="small" />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.port') }}</span>
          <n-input v-model:value="config.port" placeholder="22" size="small" style="width: 80px" />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.username') }}</span>
          <n-input v-model:value="config.username" placeholder="admin" size="small" />
        </div>

        <div class="section-title">
          <n-icon :size="16"><FolderOpenOutline /></n-icon>
          <span>{{ t('nas.dirMapping') }}</span>
        </div>

        <div class="row">
          <span class="label">{{ t('nas.movies') }}</span>
          <n-input v-model:value="config.moviePath" placeholder="/volume1/Media/Movies" size="small" />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.software') }}</span>
          <n-input v-model:value="config.softwarePath" placeholder="/volume1/Software" size="small" />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.music') }}</span>
          <n-input v-model:value="config.musicPath" placeholder="/volume1/Music" size="small" />
        </div>

        <div class="actions">
          <n-button size="small" :loading="testing" @click="testConnection">
            <template #icon>
              <n-icon>
                <CheckmarkCircleOutline v-if="config.connected" />
                <CloseCircleOutline v-else />
              </n-icon>
            </template>
            {{ t('nas.testConnection') }}
          </n-button>
          <n-button size="small" type="primary" @click="saveConfig">{{ t('nas.save') }}</n-button>
        </div>
      </div>
    </div>
  </n-card>
</template>

<style scoped>
.nas-card {
  max-width: 500px;
}
.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.label {
  min-width: 80px;
  font-size: 14px;
}
.nas-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 8px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
