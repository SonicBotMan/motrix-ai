<script setup lang="ts">
import { computed, watch } from 'vue'
import { NAlert, NDivider, NInput, NSelect } from 'naive-ui'
import { useAIProvider } from '@/composables/useAIProvider'
import { useOpenCode } from '@/composables/useOpenCode'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { t } from '@/composables/useSettings'

const aiProvider = useAIProvider()
const openCode = useOpenCode()

const llmEndpoint = useLocalStorage<string>('motrix-ai:llm-endpoint', '')
const llmApiKey = useLocalStorage<string>('motrix-ai:llm-api-key', '')
const llmModel = useLocalStorage<string>('motrix-ai:llm-model', 'gpt-4o-mini')
const currentModel = computed(() => (llmEndpoint.value ? llmModel.value : '内置启发式解析器（零配置）'))

const providerOptions = computed(() => aiProvider.availableProviders.value.map((p) => ({ label: p.name, value: p.id })))
const requiresApiKey = computed(() => aiProvider.currentProvider.value.requiresKey)
const needsBaseUrl = computed(() => aiProvider.config.value.provider === 'ollama')

watch(
  [llmEndpoint, llmApiKey, llmModel],
  () => {
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
  },
  { immediate: true },
)

watch(
  () => aiProvider.config.value,
  (cfg) => {
    if (cfg.provider === 'opencode') {
      llmEndpoint.value = ''
      return
    }
    if (cfg.provider === 'anthropic') {
      llmEndpoint.value = 'https://api.anthropic.com/v1/chat/completions'
      llmApiKey.value = cfg.apiKey ?? ''
      llmModel.value = cfg.model
    } else if (cfg.provider === 'openai') {
      llmEndpoint.value = 'https://api.openai.com/v1/chat/completions'
      llmApiKey.value = cfg.apiKey ?? ''
      llmModel.value = cfg.model
    } else if (cfg.provider === 'ollama') {
      llmEndpoint.value = cfg.baseUrl
        ? `${cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
        : 'http://127.0.0.1:11434/v1/chat/completions'
      llmApiKey.value = ''
      llmModel.value = cfg.model
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div class="tab-content">
    <h3>{{ t('settings.aiModel') }}</h3>

    <NAlert type="info" :bordered="false" style="margin-bottom: 16px">
      Choose an AI provider for natural-language download parsing. OpenCode is free with zero configuration; bring your
      own key for Anthropic Claude or OpenAI GPT, or run Ollama locally.
    </NAlert>

    <div class="setting-group">
      <label>{{ t('settings.provider') }}</label>
      <NSelect
        :value="aiProvider.config.value.provider"
        :options="providerOptions"
        @update:value="aiProvider.setProvider"
      />
      <p class="setting-hint">Select your preferred AI backend.</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.model') }}</label>
      <NSelect
        :value="aiProvider.config.value.model"
        :options="aiProvider.modelOptions.value"
        @update:value="aiProvider.setModel"
      />
    </div>

    <div v-if="requiresApiKey" class="setting-group">
      <label>{{ t('settings.apiKey') }}</label>
      <NInput
        :value="aiProvider.config.value.apiKey"
        type="password"
        show-password-on="click"
        placeholder="sk-..."
        @update:value="aiProvider.setApiKey"
      />
      <p class="setting-hint">Your key is stored locally and never sent anywhere except the provider's API.</p>
    </div>

    <div v-if="needsBaseUrl" class="setting-group">
      <label>{{ t('settings.baseUrl') }}</label>
      <NInput
        :value="aiProvider.config.value.baseUrl"
        placeholder="http://127.0.0.1:11434"
        @update:value="aiProvider.setBaseUrl"
      />
      <p class="setting-hint">Ollama server address. Default: http://127.0.0.1:11434</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.connectionStatus') }}</label>
      <div class="status-indicator">
        <span class="status-dot" :class="openCode.connected.value ? 'connected' : 'disconnected'"></span>
        <span>{{ openCode.connected.value ? 'Ready' : 'Disconnected' }}</span>
      </div>
    </div>

    <NDivider />

    <h4 style="margin-bottom: 16px">Advanced: Custom Endpoint</h4>

    <div class="setting-group">
      <label>{{ t('settings.currentMode') }}</label>
      <NInput :value="currentModel" readonly />
      <p class="setting-hint">Leave empty Endpoint = heuristic mode; fill in = AI mode</p>
    </div>

    <div class="setting-group">
      <label>API Endpoint (OpenAI Compatible)</label>
      <NInput v-model:value="llmEndpoint" placeholder="https://api.openai.com/v1/chat/completions" />
      <p class="setting-hint">Supports OpenAI / DeepSeek / Ollama / any OpenAI-compatible API</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.apiKey') }}</label>
      <NInput v-model:value="llmApiKey" type="password" show-password-on="click" placeholder="sk-..." />
      <p class="setting-hint">Local Ollama does not require a key.</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.model') }}</label>
      <NInput v-model:value="llmModel" placeholder="gpt-4o-mini / deepseek-chat / qwen2.5:7b" />
    </div>
  </div>
</template>
