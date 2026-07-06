<script setup lang="ts">
import { NButton, NInput, NSelect } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useAria2 } from '@/composables/useAria2'
import { useAria2Manager } from '@/composables/useAria2Manager'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { t } from '@/composables/useSettings'
import { useMessage } from 'naive-ui'

const aria2 = useAria2()
const manager = useAria2Manager()
const message = useMessage()

const aria2RpcUrl = useLocalStorage<string>('motrix-ai:aria2-rpc-url', 'http://127.0.0.1:6800/jsonrpc')
const aria2RpcSecret = useLocalStorage<string>('motrix-ai:aria2-rpc-secret', '')
const logLevel = useLocalStorage<'debug' | 'info' | 'warn' | 'error'>('motrix-ai:log-level', 'info')

const logLevelOptions = [
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warn' },
  { label: 'Error', value: 'error' },
]

async function clearDownloadHistory() {
  try {
    manager.clearHistory()
    await aria2.purgeDownloadResult()
    message.success('Download history cleared')
  } catch (e) {
    message.error('Failed to clear history: ' + (e instanceof Error ? e.message : String(e)))
  }
}
</script>

<template>
  <div class="tab-content">
    <h3>{{ t('settings.advanced') }}</h3>

    <div class="setting-group">
      <label>{{ t('settings.rpcUrl') }}</label>
      <NInput v-model:value="aria2RpcUrl" />
    </div>

    <div class="setting-group">
      <label>{{ t('settings.rpcSecret') }}</label>
      <NInput
        v-model:value="aria2RpcSecret"
        type="password"
        show-password-on="click"
        :placeholder="t('settings.rpcSecretPlaceholder')"
      />
    </div>

    <div class="setting-group">
      <label>{{ t('settings.logLevel') }}</label>
      <NSelect v-model:value="logLevel" :options="logLevelOptions" />
    </div>

    <div class="danger-zone">
      <h4>{{ t('settings.dangerZone') }}</h4>
      <NButton type="error" tertiary @click="clearDownloadHistory">
        <template #icon><TrashOutline /></template>
        {{ t('settings.clearHistory') }}
      </NButton>
    </div>
  </div>
</template>
