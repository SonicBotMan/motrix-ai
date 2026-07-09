<script setup lang="ts">
import { ref, computed } from 'vue'
import { NCard, NButton, NInput, NSwitch, NIcon, useMessage } from 'naive-ui'
import { FolderOpenOutline, CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'
import { t } from '@/composables/useSettings'

const message = useMessage()
const store = useConfigStore()
const testing = ref(false)
const connected = ref(false)

const nasConfig = computed(() => store.config.nas)

function updateField(field: keyof typeof store.config.nas, value: string | boolean) {
  store.updateSection('nas', { [field]: value })
}

async function testConnection() {
  testing.value = true
  try {
    const result = await invoke<boolean>('test_nas_connection', {
      host: nasConfig.value.host,
      port: nasConfig.value.port,
    })
    connected.value = result
    if (result) {
      message.success(t('nas.connectionSuccess'))
    } else {
      message.error(t('nas.connectionFailed'))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    message.error(`${t('nas.connectionError')}: ${msg}`)
    connected.value = false
  } finally {
    testing.value = false
  }
}

function saveConfig() {
  message.success(t('nas.configSaved'))
}
</script>

<template>
  <n-card :title="t('nas.title')" class="nas-card">
    <template #header-extra>
      <n-tag :type="connected ? 'success' : 'error'" size="small">
        {{ connected ? t('nas.connected') : t('nas.disconnected') }}
      </n-tag>
    </template>

    <div class="config-section">
      <div class="row">
        <span class="label">{{ t('nas.enable') }}</span>
        <n-switch :value="nasConfig.enabled" @update:value="(v: boolean) => updateField('enabled', v)" />
      </div>

      <div v-if="nasConfig.enabled" class="nas-form">
        <div class="row">
          <span class="label">{{ t('nas.host') }}</span>
          <n-input
            :value="nasConfig.host"
            placeholder="192.168.1.100"
            size="small"
            @update:value="(v: string) => updateField('host', v)"
          />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.port') }}</span>
          <n-input
            :value="nasConfig.port"
            placeholder="22"
            size="small"
            style="width: 80px"
            @update:value="(v: string) => updateField('port', v)"
          />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.username') }}</span>
          <n-input
            :value="nasConfig.username"
            placeholder="admin"
            size="small"
            @update:value="(v: string) => updateField('username', v)"
          />
        </div>

        <div class="section-title">
          <n-icon :size="16"><FolderOpenOutline /></n-icon>
          <span>{{ t('nas.dirMapping') }}</span>
        </div>

        <div class="row">
          <span class="label">{{ t('nas.movies') }}</span>
          <n-input
            :value="nasConfig.moviePath"
            placeholder="/volume1/Media/Movies"
            size="small"
            @update:value="(v: string) => updateField('moviePath', v)"
          />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.software') }}</span>
          <n-input
            :value="nasConfig.softwarePath"
            placeholder="/volume1/Software"
            size="small"
            @update:value="(v: string) => updateField('softwarePath', v)"
          />
        </div>
        <div class="row">
          <span class="label">{{ t('nas.music') }}</span>
          <n-input
            :value="nasConfig.musicPath"
            placeholder="/volume1/Music"
            size="small"
            @update:value="(v: string) => updateField('musicPath', v)"
          />
        </div>

        <div class="actions">
          <n-button size="small" :loading="testing" @click="testConnection">
            <template #icon>
              <n-icon>
                <CheckmarkCircleOutline v-if="connected" />
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
