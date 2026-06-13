<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton, NIcon, NTabs, NTabPane, NInput, NSwitch, NSelect, NSlider,
  NInputNumber, NDivider, NAlert, NSpace, useMessage,
} from 'naive-ui'
import { ArrowBackOutline, SettingsOutline, TrashOutline, FolderOpenOutline } from '@vicons/ionicons5'
import { useAria2 } from '@/composables/useAria2'
import { useAria2Manager } from '@/composables/useAria2Manager'
import { useOpenCode } from '@/composables/useOpenCode'
import { theme, language, t } from '@/composables/useSettings'

const router = useRouter()
const message = useMessage()
const aria2 = useAria2()
const manager = useAria2Manager()
const openCode = useOpenCode()

const activeTab = ref('ai-model')

// ---- Settings persistence helpers ----
function useLocalStorage<T>(key: string, defaultValue: T) {
  const stored = localStorage.getItem(key)
  const data = ref<T>(stored !== null ? (JSON.parse(stored) as T) : defaultValue)

  watch(data, (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
  }, { deep: true })

  return data
}

// ---- AI Model settings ----
const llmEndpoint = useLocalStorage<string>('motrix-ai:llm-endpoint', '')
const llmApiKey = useLocalStorage<string>('motrix-ai:llm-api-key', '')
const llmModel = useLocalStorage<string>('motrix-ai:llm-model', 'gpt-4o-mini')
const currentModel = computed(() => llmEndpoint.value ? llmModel.value : '内置启发式解析器（零配置）')

// Sync to the LLM config format used by useOpenCode
watch([llmEndpoint, llmApiKey, llmModel], () => {
  import('@/composables/useOpenCode').then(({ setLLMConfig }) => {
    if (llmEndpoint.value) {
      setLLMConfig({
        endpoint: llmEndpoint.value,
        api_key: llmApiKey.value,
        model: llmModel.value,
      })
    } else {
      setLLMConfig(null)
    }
  })
}, { immediate: true })

// ---- Download settings ----
const downloadDir = useLocalStorage<string>('motrix-ai:download-dir', '~/Downloads/Motrix AI')
const maxConcurrent = useLocalStorage<number>('motrix-ai:max-concurrent', 5)
const downloadSpeedLimit = useLocalStorage<number>('motrix-ai:download-speed-limit', 0)
const uploadSpeedLimit = useLocalStorage<number>('motrix-ai:upload-speed-limit', 0)
const autoRetry = useLocalStorage<boolean>('motrix-ai:auto-retry', true)
const maxRetries = useLocalStorage<number>('motrix-ai:max-retries', 3)

// ---- Subtitle settings ----
const subtitleApiKey = useLocalStorage<string>('motrix-ai:opensubtitles-api-key', '')
const subtitleLanguages = useLocalStorage<string[]>('motrix-ai:subtitle-languages', ['zh', 'en'])
const autoSearchSubtitles = useLocalStorage<boolean>('motrix-ai:auto-search-subtitles', true)
const subtitleDir = useLocalStorage<string>('motrix-ai:subtitle-dir', '~/Downloads/Motrix AI/Subtitles')

// ---- Appearance settings ----
// theme and language imported from useSettings (global store)

// ---- Advanced settings ----
const aria2RpcUrl = useLocalStorage<string>('motrix-ai:aria2-rpc-url', 'http://127.0.0.1:6800/jsonrpc')
const aria2RpcSecret = useLocalStorage<string>('motrix-ai:aria2-rpc-secret', '')
const logLevel = useLocalStorage<'debug' | 'info' | 'warn' | 'error'>('motrix-ai:log-level', 'info')

// ---- Apply settings to aria2 when changed ----
watch(maxConcurrent, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-concurrent-downloads': String(val) })
  } catch (e) { console.warn('Failed to apply maxConcurrent:', e) }
})

watch(downloadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-download-limit': String(val * 1024) })
  } catch (e) { console.warn('Failed to apply downloadSpeedLimit:', e) }
})

watch(uploadSpeedLimit, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-overall-upload-limit': String(val * 1024) })
  } catch (e) { console.warn('Failed to apply uploadSpeedLimit:', e) }
})

watch(autoRetry, async (val) => {
  try {
    await aria2.changeGlobalOption({ 'max-tries': val ? String(maxRetries.value) : '0' })
  } catch (e) { console.warn('Failed to apply autoRetry:', e) }
})

watch(maxRetries, async (val) => {
  if (autoRetry.value) {
    try {
      await aria2.changeGlobalOption({ 'max-tries': String(val) })
    } catch (e) { console.warn('Failed to apply maxRetries:', e) }
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
]

const logLevelOptions = [
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warn' },
  { label: 'Error', value: 'error' },
]

// ---- Actions ----
async function pickFolder(target: Ref<string>) {
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

function saveSubtitleApiKey() {
  // Save to localStorage directly (useSubtitle reads from the same key)
  localStorage.setItem('motrix-ai:opensubtitles-api-key', subtitleApiKey.value)
  message.success('API key saved')
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
          <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
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
              不配置 LLM 也能用——内置启发式解析器自动提取标题、画质、年份。
              配置 OpenAI 兼容 API 后，AI 解析更精准（支持模糊描述、口语化表达）。
            </NAlert>

            <div class="setting-group">
              <label>当前模式</label>
              <NInput :value="currentModel" readonly />
              <p class="setting-hint">留空 Endpoint = 零配置启发式模式；填入 = AI 模式</p>
            </div>

            <div class="setting-group">
              <label>API Endpoint (OpenAI 兼容)</label>
              <NInput
                v-model:value="llmEndpoint"
                placeholder="https://api.openai.com/v1/chat/completions"
              />
              <p class="setting-hint">支持 OpenAI / DeepSeek / Ollama / 任何 OpenAI 兼容 API</p>
            </div>

            <div class="setting-group">
              <label>API Key</label>
              <NInput
                v-model:value="llmApiKey"
                type="password"
                show-password-on="click"
                placeholder="sk-..."
              />
              <p class="setting-hint">本地 Ollama 无需填 Key</p>
            </div>

            <div class="setting-group">
              <label>Model</label>
              <NInput
                v-model:value="llmModel"
                placeholder="gpt-4o-mini / deepseek-chat / qwen2.5:7b"
              />
            </div>

            <div class="setting-group">
              <label>连接状态</label>
              <div class="status-indicator">
                <span class="status-dot" :class="openCode.connected.value ? 'connected' : 'disconnected'"></span>
                <span>{{ openCode.connected.value ? '已就绪' : '未连接' }}</span>
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
                  <template #icon><NIcon><FolderOpenOutline /></NIcon></template>
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

        <!-- Subtitles -->
        <NTabPane name="subtitles" :tab="t('settings.subtitles')">
          <div class="tab-content">
            <h3>{{ t('settings.subtitles') }}</h3>

            <div class="setting-group">
              <label>{{ t('settings.subtitleApiKey') }}</label>
              <div class="api-key-row">
                <NInput
                  v-model:value="subtitleApiKey"
                  type="password"
                  show-password-on="click"
                  placeholder="Enter your OpenSubtitles API key"
                />
                <NButton type="primary" size="small" @click="saveSubtitleApiKey">Save</NButton>
              </div>
              <p class="setting-hint">
                Get your API key from <a href="https://opensubtitles.com/api" target="_blank" rel="noopener">opensubtitles.com/api</a>
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
                  <template #icon><NIcon><FolderOpenOutline /></NIcon></template>
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

            <div class="setting-group">
              <label>Danger Zone</label>
              <div class="danger-zone">
                <div class="danger-item">
                  <div>
                    <strong>Clear Download History</strong>
                    <p class="setting-hint">Remove all completed and failed download records from aria2.</p>
                  </div>
                  <NButton type="error" size="small" @click="clearDownloadHistory">
                    <template #icon><NIcon><TrashOutline /></NIcon></template>
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
  background: #10B981;
}

.status-dot.disconnected {
  background: #EF4444;
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
</style>
