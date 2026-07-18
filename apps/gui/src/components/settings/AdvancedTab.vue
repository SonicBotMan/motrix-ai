<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NSelect, NSwitch } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useAria2 } from '@/composables/useAria2'
import { useAria2Manager } from '@/composables/useAria2Manager'
import { useConfigStore } from '@/stores/config'
import { t } from '@/composables/useSettings'
import { useMessage } from 'naive-ui'

const aria2 = useAria2()
const manager = useAria2Manager()
const message = useMessage()
const store = useConfigStore()

const userAgent = ref('')
const checkCertificate = ref(true)
const btTracker = ref('')
const customHeaders = ref('')

aria2
  .getGlobalOption()
  .then((opts) => {
    userAgent.value = opts['user-agent'] || ''
    checkCertificate.value = opts['check-certificate'] !== 'false'
    btTracker.value = opts['bt-tracker'] || ''
    customHeaders.value = opts['header'] || ''
  })
  .catch(() => {})

watch(userAgent, async (val) => {
  if (aria2.connected.value) {
    try {
      await aria2.changeGlobalOption({ 'user-agent': val })
    } catch (_e) {
      /* best effort */
    }
  }
})

watch(checkCertificate, async (val) => {
  if (aria2.connected.value) {
    try {
      await aria2.changeGlobalOption({ 'check-certificate': val ? 'true' : 'false' })
    } catch (_e) {
      /* best effort */
    }
  }
})

watch(btTracker, async (val) => {
  if (aria2.connected.value) {
    try {
      await aria2.changeGlobalOption({ 'bt-tracker': val })
    } catch (_e) {
      /* best effort */
    }
  }
})

watch(customHeaders, async (val) => {
  if (aria2.connected.value) {
    try {
      await aria2.changeGlobalOption({ header: val })
    } catch (_e) {
      /* best effort */
    }
  }
})

const aria2RpcUrl = computed<string>({
  get: () => store.config.aria2.rpc_url,
  set: (v: string) => store.updateSection('aria2', { rpc_url: v }),
})
const aria2RpcSecret = computed<string>({
  get: () => store.config.aria2.rpc_secret || '',
  set: (v: string) => store.updateSection('aria2', { rpc_secret: v }),
})
const logLevel = computed<'debug' | 'info' | 'warn' | 'error'>({
  get: () => store.config.ui.log_level,
  set: (v: 'debug' | 'info' | 'warn' | 'error') => store.updateSection('ui', { log_level: v }),
})

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

    <div class="setting-group">
      <label>User Agent</label>
      <NInput v-model:value="userAgent" placeholder="Leave empty for aria2 default" />
    </div>

    <div class="setting-group">
      <label>Check HTTPS Certificates</label>
      <NSwitch v-model:value="checkCertificate" />
    </div>

    <div class="setting-group">
      <label>BitTorrent Trackers</label>
      <NInput v-model:value="btTracker" placeholder="http://tracker1.com/announce,http://tracker2.com/announce" />
    </div>

    <div class="setting-group">
      <label>Custom HTTP Headers</label>
      <NInput
        v-model:value="customHeaders"
        type="textarea"
        :rows="3"
        placeholder="X-Custom-Header: value&#10;Another-Header: value"
      />
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
