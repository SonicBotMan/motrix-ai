<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import { theme, language, t } from '@/composables/useSettings'

const themeOptions = computed(() => [
  { label: t('settings.dark'), value: 'dark' },
  { label: t('settings.light'), value: 'light' },
  { label: t('settings.system'), value: 'system' },
])

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
</script>

<template>
  <div class="tab-content">
    <h3>{{ t('settings.appearance') }}</h3>

    <div class="setting-group">
      <label>{{ t('settings.theme') }}</label>
      <NSelect v-model:value="theme" :options="themeOptions" />
    </div>

    <div class="setting-group">
      <label>{{ t('settings.language') }}</label>
      <NSelect v-model:value="language" :options="languageOptions" />
    </div>
  </div>
</template>
