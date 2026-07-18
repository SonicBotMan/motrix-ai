<script setup lang="ts">
import { computed } from 'vue'
import { NAlert, NInput, NSelect } from 'naive-ui'
import { useAIProvider } from '@/composables/useAIProvider'
import { useOpenCode } from '@/composables/useOpenCode'
import { t } from '@/composables/useSettings'

const aiProvider = useAIProvider()
const openCode = useOpenCode()

const providerOptions = computed(() => aiProvider.availableProviders.value.map((p) => ({ label: p.name, value: p.id })))
const requiresApiKey = computed(() => aiProvider.requiresApiKey.value)
const needsBaseUrl = computed(() => aiProvider.needsBaseUrl.value)

const modelError = computed(() => {
  const provider = aiProvider.config.value.provider
  const model = aiProvider.config.value.model?.trim()
  if (provider !== 'opencode' && !model) {
    return 'Model is required for this provider'
  }
  return ''
})

const apiKeyError = computed(() => {
  const provider = aiProvider.config.value.provider
  const apiKey = aiProvider.config.value.api_key?.trim()
  if ((provider === 'anthropic' || provider === 'openai') && !apiKey) {
    return 'API key is required for this provider'
  }
  return ''
})

const baseUrlError = computed(() => {
  const baseUrl = aiProvider.config.value.base_url?.trim()
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    return 'Base URL must start with http:// or https://'
  }
  return ''
})
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
        v-if="aiProvider.modelOptions.value.length > 0"
        :value="aiProvider.config.value.model"
        :options="aiProvider.modelOptions.value"
        :status="modelError ? 'error' : undefined"
        @update:value="aiProvider.setModel"
      />
      <NInput
        v-else
        :value="aiProvider.config.value.model"
        placeholder="gpt-4o-mini / deepseek-chat / qwen2.5:7b"
        :status="modelError ? 'error' : undefined"
        @update:value="aiProvider.setModel"
      />
      <p v-if="modelError" class="form-error">{{ modelError }}</p>
    </div>

    <div v-if="requiresApiKey" class="setting-group">
      <label>{{ t('settings.apiKey') }}</label>
      <NInput
        :value="aiProvider.config.value.api_key"
        type="password"
        show-password-on="click"
        placeholder="sk-..."
        :status="apiKeyError ? 'error' : undefined"
        @update:value="aiProvider.setApiKey"
      />
      <p v-if="apiKeyError" class="form-error">{{ apiKeyError }}</p>
      <p class="setting-hint">Your key is stored locally and never sent anywhere except the provider's API.</p>
    </div>

    <div v-if="needsBaseUrl" class="setting-group">
      <label>{{ t('settings.baseUrl') }}</label>
      <NInput
        :value="aiProvider.config.value.base_url"
        placeholder="http://127.0.0.1:11434"
        :status="baseUrlError ? 'error' : undefined"
        @update:value="aiProvider.setBaseUrl"
      />
      <p v-if="baseUrlError" class="form-error">{{ baseUrlError }}</p>
      <p class="setting-hint">Server address. Default: http://127.0.0.1:11434</p>
    </div>

    <div class="setting-group">
      <label>{{ t('settings.connectionStatus') }}</label>
      <div class="status-indicator">
        <span class="status-dot" :class="openCode.connected.value ? 'connected' : 'disconnected'"></span>
        <span>{{ openCode.statusLabel.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-error {
  color: var(--error);
  font-size: 12px;
  margin-top: 4px;
}
</style>
