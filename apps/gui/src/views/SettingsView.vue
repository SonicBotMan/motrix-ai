<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NIcon,
  NTabs,
  NTabPane,
  NInput,
  NSwitch,
  NSelect,
  NSlider,
  NInputNumber,
  NDivider,
  NAlert,
  useMessage,
} from 'naive-ui'
import { ArrowBackOutline, SettingsOutline, TrashOutline, FolderOpenOutline } from '@vicons/ionicons5'
import { useAria2 } from '@/composables/useAria2'
import { useAria2Manager } from '@/composables/useAria2Manager'
import { useOpenCode } from '@/composables/useOpenCode'
import { useAIProvider } from '@/composables/useAIProvider'
import { useConfigStore } from '@/stores/config'
import { theme, language, t } from '@/composables/useSettings'
import ScheduleConfig from '@/components/ScheduleConfig.vue'
import NASConfig from '@/components/NASConfig.vue'

const router = useRouter()
const message = useMessage()
const store = useConfigStore()
const aria2 = useAria2()
const manager = useAria2Manager()
const openCode = useOpenCode()
const aiProvider = useAIProvider()

const activeTab = ref('ai-model')

// ---- BYOK AI Provider options ----
/** Provider options for the AI provider dropdown. */
const providerOptions = computed(() =>
  aiProvider.availableProviders.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
)

/** Whether the current provider requires an API key. */
const requiresApiKey = computed(() => aiProvider.currentProvider.value.requiresKey)

/** Whether the current provider needs a custom base URL (Ollama or custom OpenAI-compatible). */
const needsBaseUrl = computed(() => aiProvider.needsBaseUrl.value)

// ---- Download directory (store-backed) ----
const downloadDir = computed({
  get: () => store.config.downloads.base_dir,
  set: (v: string) => store.updateSection('downloads', { base_dir: v }),
})

// ---- aria2 runtime settings (local refs; applied to daemon, not persisted) ----
const maxConcurrent = ref(5)
const downloadSpeedLimit = ref(0)
const uploadSpeedLimit = ref(0)
const autoRetry = ref(true)
const maxRetries = ref(3)

// ---- Subtitle settings (store-backed) ----
const subtitleApiKey = computed({
  get: () => store.config.subtitles.opensubtitles_api_key ?? '',
  set: (v: string) => store.updateSection('subtitles', { opensubtitles_api_key: v }),
})
const subtitleLanguages = computed({
  get: () => store.config.subtitles.preferred_languages,
  set: (v: string[]) => store.updateSection('subtitles', { preferred_languages: v }),
})
const autoSearchSubtitles = computed({
  get: () => store.config.subtitles.auto_search,
  set: (v: boolean) => store.updateSection('subtitles', { auto_search: v }),
})
const subtitleDir = computed({
  get: () => store.config.subtitles.subtitle_dir ?? '',
  set: (v: string) => store.updateSection('subtitles', { subtitle_dir: v }),
})

// ---- Advanced settings (store-backed) ----
const aria2RpcUrl = computed({
  get: () => store.config.aria2.rpc_url,
  set: (v: string) => store.updateSection('aria2', { rpc_url: v }),
})
const aria2RpcSecret = computed({
  get: () => store.config.aria2.rpc_secret ?? '',
  set: (v: string) => store.updateSection('aria2', { rpc_secret: v }),
})
const logLevel = computed({
  get: () => store.config.ui.log_level,
  set: (v: 'debug' | 'info' | 'warn' | 'error') => store.updateSection('ui', { log_level: v }),
})

// ---- Log level filter ----
const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const originalMethods: Record<string, (...args: unknown[]) => void> = {}

/* eslint-disable no-console */
function applyLogLevel(level: 'debug' | 'info' | 'warn' | 'error') {
  if (typeof console === 'undefined') return
  const threshold = LOG_LEVELS[level] ?? 1
  const methods: Array<{ name: 'log' | 'debug' | 'info' | 'warn' | 'error'; level: number }> = [
    { name: 'log', level: 0 },
    { name: 'debug', level: 0 },
    { name: 'info', level: 1 },
    { name: 'warn', level: 2 },
    { name: 'error', level: 3 },
  ]
  for (const m of methods) {
    if (!(m.name in originalMethods)) {
      originalMethods[m.name] = console[m.name].bind(console)
    }
    const orig = originalMethods[m.name]
    console[m.name] = m.level >= threshold ? orig : () => {}
  }
}
/* eslint-enable no-console */

applyLogLevel(logLevel.value)
watch(logLevel, (val) => applyLogLevel(val))

// ---- Apply aria2 RPC config to the client when the store changes ----
watch(
  [() => store.config.aria2.rpc_url, () => store.config.aria2.rpc_secret],
  () => {
    useAria2({ rpcUrl: store.config.aria2.rpc_url, secret: store.config.aria2.rpc_secret })
  },
  { immediate: true },
)

// ---- Apply aria2 runtime settings to the daemon when they change ----
watch(maxConcurrent, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-concurrent-downloads': String(val) })
  } catch (e) {
    console.warn('Failed to apply maxConcurrent:', e)
  }
})

watch(downloadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-download-limit': String(val * 1024) })
  } catch (e) {
    console.warn('Failed to apply downloadSpeedLimit:', e)
  }
})

watch(uploadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-upload-limit': String(val * 1024) })
  } catch (e) {
    console.warn('Failed to apply uploadSpeedLimit:', e)
  }
})

watch(autoRetry, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-tries': val ? String(maxRetries.value) : '0' })
  } catch (e) {
    console.warn('Failed to apply autoRetry:', e)
  }
})

watch(maxRetries, async (val) => {
  if (autoRetry.value) {
    try {
      await aria2.changeGlobalOption({ 'max-tries': String(val) })
    } catch (e) {
      console.warn('Failed to apply maxRetries:', e)
    }
  }
})

// ---- Language options ----
const languageOptions = [
  { label: '简体中文', value: 'zh' },
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Español', value: 'es' },
  { label: 'Português', value: 'pt' },
  { label: 'Português (BR)', value: 'pt-BR' },
  { label: 'Italiano', value: 'it' },
  { label: 'Русский', value: 'ru' },
  { label: 'العربية', value: 'ar' },
  { label: 'ไทย', value: 'th' },
  { label: 'Tiếng Việt', value: 'vi' },
]

const themeOptions = computed(() => [
  { label: t('settings.dark'), value: 'dark' },
  { label: t('settings.light'), value: 'light' },
  { label: t('settings.system'), value: 'system' },
])

const uiLanguageOptions = [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'Français', value: 'fr' },
]

const logLevelOptions = [
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warn' },
  { label: 'Error', value: 'error' },
]

// ---- Actions ----
async function pickFolder(target: { value: string }) {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (selected && typeof selected === 'string') {
      target.value = selected
    }
  } catch (e) {
    console.warn('Folder picker not available:', e)
    message.info('Folder picker is only available in the desktop app')
  }
}

async function pickDownloadDir() {
  await pickFolder(downloadDir)
}

async function pickSubtitleDir() {
  await pickFolder(subtitleDir)
}

async function clearDownloadHistory() {
  try {
    manager.clearHistory()
    await aria2.purgeDownloadResult()
    message.success('Download history cleared')
  } catch (e) {
    message.error('Failed to clear history: ' + (e instanceof Error ? e.message : String(e)))
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
  <div class="settings-view">
    <!-- Chrome -->
    <header class="chrome">
      <div class="chrome-left">
        <div class="chrome-logo">
          <SettingsOutline :size="18" />
          <span>Settings</span>
        </div>
      </div>
      <div class="chrome-center"></div>
      <div class="chrome-right">
        <NButton quaternary size="small" @click="router.push('/')">
          <template #icon
            ><NIcon><ArrowBackOutline /></NIcon
          ></template>
          Back
        </NButton>
      </div>
    </header>

    <!-- Content -->
    <div class="settings-content">
      <NTabs v-model:value="activeTab" type="line" placement="left">
        <!-- AI Model -->
        <NTabPane name="ai-model" :tab="t('settings.aiModel')">
          <div class="tab-content">
            <h3>{{ t('settings.aiModel') }}</h3>

            <NAlert type="info" :bordered="false" style="margin-bottom: 16px">
              Choose an AI provider for natural-language download parsing. OpenCode is free with zero configuration;
              bring your own key for Anthropic Claude or OpenAI GPT, or run Ollama locally.
            </NAlert>

            <!-- BYOK Provider Selection -->
            <div class="setting-group">
              <label>Provider</label>
              <NSelect
                :value="aiProvider.config.value.provider"
                :options="providerOptions"
                @update:value="aiProvider.setProvider"
              />
              <p class="setting-hint">Select your preferred AI backend.</p>
            </div>

            <div class="setting-group">
              <label>Model</label>
              <NSelect
                :value="aiProvider.config.value.model"
                :options="aiProvider.modelOptions.value"
                @update:value="aiProvider.setModel"
              />
            </div>

            <div v-if="requiresApiKey" class="setting-group">
              <label>API Key</label>
              <NInput
                :value="aiProvider.config.value.api_key"
                type="password"
                show-password-on="click"
                placeholder="sk-..."
                @update:value="aiProvider.setApiKey"
              />
              <p class="setting-hint">Your key is stored locally and never sent anywhere except the provider's API.</p>
            </div>

            <div v-if="needsBaseUrl" class="setting-group">
              <label>Base URL</label>
              <NInput
                :value="aiProvider.config.value.base_url"
                placeholder="http://127.0.0.1:11434"
                @update:value="aiProvider.setBaseUrl"
              />
              <p class="setting-hint">Server address. For Ollama the default is http://127.0.0.1:11434.</p>
            </div>

            <div class="setting-group">
              <label>Connection Status</label>
              <div class="status-indicator">
                <span class="status-dot" :class="openCode.connected.value ? 'connected' : 'disconnected'"></span>
                <span>{{ openCode.statusLabel.value }}</span>
              </div>
            </div>
          </div>
        </NTabPane>

        <!-- Downloads -->
        <NTabPane name="downloads" :tab="t('settings.downloads')">
          <div class="tab-content">
            <h3>{{ t('settings.downloads') }}</h3>

            <div class="setting-group">
              <label>Default Download Directory</label>
              <div class="folder-picker">
                <NInput v-model:value="downloadDir" placeholder="~/Downloads/Motrix AI" />
                <NButton quaternary @click="pickDownloadDir">
                  <template #icon
                    ><NIcon><FolderOpenOutline /></NIcon
                  ></template>
                </NButton>
              </div>
            </div>

            <div class="setting-group">
              <label>{{ t('settings.maxConcurrent') }}</label>
              <div class="slider-row">
                <NSlider v-model:value="maxConcurrent" :min="1" :max="10" :step="1" style="flex: 1" />
                <span class="slider-value">{{ maxConcurrent }}</span>
              </div>
            </div>

            <div class="setting-group">
              <label>Global Download Speed Limit (KB/s)</label>
              <div class="slider-row">
                <NSlider v-model:value="downloadSpeedLimit" :min="0" :max="102400" :step="1024" style="flex: 1" />
                <NInputNumber v-model:value="downloadSpeedLimit" :min="0" size="small" style="width: 120px" />
              </div>
              <p class="setting-hint">0 = unlimited. Applies immediately.</p>
            </div>

            <div class="setting-group">
              <label>Global Upload Speed Limit (KB/s)</label>
              <div class="slider-row">
                <NSlider v-model:value="uploadSpeedLimit" :min="0" :max="102400" :step="1024" style="flex: 1" />
                <NInputNumber v-model:value="uploadSpeedLimit" :min="0" size="small" style="width: 120px" />
              </div>
              <p class="setting-hint">0 = unlimited. Applies immediately.</p>
            </div>

            <NDivider />

            <div class="setting-group">
              <div class="setting-row">
                <div>
                  <label>Auto-Retry on Failure</label>
                  <p class="setting-hint">Automatically retry failed downloads.</p>
                </div>
                <NSwitch v-model:value="autoRetry" />
              </div>
            </div>

            <div v-if="autoRetry" class="setting-group">
              <label>Max Retries</label>
              <div class="slider-row">
                <NSlider v-model:value="maxRetries" :min="1" :max="20" :step="1" style="flex: 1" />
                <span class="slider-value">{{ maxRetries }}</span>
              </div>
            </div>

            <NDivider />

            <div class="setting-group">
              <label>aria2 Connection</label>
              <div class="status-indicator">
                <span class="status-dot" :class="aria2.connected.value ? 'connected' : 'disconnected'"></span>
                <span>{{ aria2.connected.value ? 'Connected to aria2' : 'Disconnected' }}</span>
              </div>
            </div>

            <div class="setting-group">
              <NButton type="primary" @click="applyAria2Settings">Apply Settings Now</NButton>
            </div>
          </div>
        </NTabPane>

        <!-- Schedule -->
        <NTabPane name="schedule" :tab="t('settings.schedule') || 'Schedule'">
          <div class="tab-content">
            <h3>{{ t('settings.schedule') || 'Schedule' }}</h3>

            <NAlert type="info" :bordered="false" style="margin-bottom: 16px">
              Automatically adjust download speed and concurrency based on the time of day.
            </NAlert>

            <ScheduleConfig />
          </div>
        </NTabPane>

        <!-- Subtitles -->
        <NTabPane name="subtitles" :tab="t('settings.subtitles')">
          <div class="tab-content">
            <h3>{{ t('settings.subtitles') }}</h3>

            <div class="setting-group">
              <label>{{ t('settings.subtitleApiKey') }}</label>
              <NInput
                v-model:value="subtitleApiKey"
                type="password"
                show-password-on="click"
                placeholder="Enter your OpenSubtitles API key"
              />
              <p class="setting-hint">
                Get your API key from
                <a href="https://opensubtitles.com/api" target="_blank" rel="noopener">opensubtitles.com/api</a>
              </p>
            </div>

            <div class="setting-group">
              <label>{{ t('settings.subtitleLangs') }}</label>
              <NSelect
                v-model:value="subtitleLanguages"
                multiple
                :options="languageOptions"
                placeholder="Select preferred subtitle languages"
              />
            </div>

            <div class="setting-group">
              <div class="setting-row">
                <div>
                  <label>Auto-Search Subtitles on Download</label>
                  <p class="setting-hint">Automatically search for subtitles when a video download completes.</p>
                </div>
                <NSwitch v-model:value="autoSearchSubtitles" />
              </div>
            </div>

            <div class="setting-group">
              <label>Subtitle Download Directory</label>
              <div class="folder-picker">
                <NInput v-model:value="subtitleDir" placeholder="~/Downloads/Motrix AI/Subtitles" />
                <NButton quaternary @click="pickSubtitleDir">
                  <template #icon
                    ><NIcon><FolderOpenOutline /></NIcon
                  ></template>
                </NButton>
              </div>
            </div>
          </div>
        </NTabPane>

        <!-- Appearance -->
        <NTabPane name="appearance" :tab="t('settings.appearance')">
          <div class="tab-content">
            <h3>{{ t('settings.appearance') }}</h3>

            <div class="setting-group">
              <label>{{ t('settings.theme') }}</label>
              <NSelect v-model:value="theme" :options="themeOptions" />
            </div>

            <div class="setting-group">
              <label>{{ t('settings.language') }}</label>
              <NSelect v-model:value="language" :options="uiLanguageOptions" />
              <p class="setting-hint">Application interface language.</p>
            </div>
          </div>
        </NTabPane>

        <!-- Advanced -->
        <NTabPane name="advanced" :tab="t('settings.advanced')">
          <div class="tab-content">
            <h3>{{ t('settings.advanced') }}</h3>

            <NAlert type="warning" style="margin-bottom: 16px">
              Changing these settings may require restarting aria2 to take effect.
            </NAlert>

            <div class="setting-group">
              <label>{{ t('settings.rpcUrl') }}</label>
              <NInput v-model:value="aria2RpcUrl" placeholder="http://127.0.0.1:6800/jsonrpc" />
              <p class="setting-hint">The JSON-RPC endpoint for aria2. Default: http://127.0.0.1:6800/jsonrpc</p>
            </div>

            <div class="setting-group">
              <label>{{ t('settings.rpcSecret') }}</label>
              <NInput
                v-model:value="aria2RpcSecret"
                type="password"
                show-password-on="click"
                placeholder="Leave empty for no authentication"
              />
              <p class="setting-hint">Secret token for aria2 RPC authentication.</p>
            </div>

            <div class="setting-group">
              <label>{{ t('settings.logLevel') }}</label>
              <NSelect v-model:value="logLevel" :options="logLevelOptions" />
              <p class="setting-hint">Controls the verbosity of application logs.</p>
            </div>

            <NDivider />

            <!-- NAS Archive -->
            <NASConfig />

            <NDivider />

            <div class="setting-group">
              <label>Danger Zone</label>
              <div class="danger-zone">
                <div class="danger-item">
                  <div>
                    <strong>Clear Download History</strong>
                    <p class="setting-hint">Remove all completed and failed download records from aria2.</p>
                  </div>
                  <NButton type="error" size="small" @click="clearDownloadHistory">
                    <template #icon
                      ><NIcon><TrashOutline /></NIcon
                    ></template>
                    Clear History
                  </NButton>
                </div>
              </div>
            </div>
          </div>
        </NTabPane>
      </NTabs>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.chrome-logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  font-size: 15px;
}

.settings-content {
  flex: 1;
  padding: var(--space-6);
  overflow: auto;
}

.tab-content {
  max-width: 600px;
}

.tab-content h3 {
  margin-bottom: var(--space-4);
  font-size: 18px;
  font-weight: 600;
}

.setting-group {
  margin-bottom: var(--space-4);
}

.setting-group label {
  display: block;
  margin-bottom: var(--space-2);
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-secondary);
}

.setting-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--fg-tertiary);
}

.setting-hint a {
  color: var(--primary);
  text-decoration: none;
}

.setting-hint a:hover {
  text-decoration: underline;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.setting-row label {
  margin-bottom: 0;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  min-width: 30px;
  text-align: right;
}

.folder-picker {
  display: flex;
  gap: 8px;
  align-items: center;
}

.api-key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: var(--accent);
}

.status-dot.disconnected {
  background: var(--error);
}

.danger-zone {
  border: 1px solid var(--error-muted);
  border-radius: var(--radius-md);
  padding: 16px;
}

.danger-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.danger-item strong {
  font-size: 13px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 100ms !important;
  }
}
</style>
