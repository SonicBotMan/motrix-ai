<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NSelect, NIcon } from 'naive-ui'
import { DownloadOutline, FlashOutline, ShieldCheckmarkOutline, FolderOutline } from '@vicons/ionicons5'

const router = useRouter()
const step = ref(1)
const downloadDir = ref('~/Downloads/Motrix AI')
const uiLanguage = ref('en')

const nextStep = () => {
  if (step.value < 3) {
    step.value++
  } else {
    router.push('/')
  }
}

const prevStep = () => {
  if (step.value > 1) step.value--
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding-card">
      <!-- Progress Dots -->
      <div class="progress-dots">
        <div v-for="i in 3" :key="i" class="dot" :class="{ active: i === step, completed: i < step }"></div>
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="step === 1" class="step">
        <div class="logo">
          <DownloadOutline :size="48" />
        </div>
        <h1>Welcome to Motrix AI</h1>
        <p class="subtitle">Your AI-powered download assistant. Describe what you want, and we'll handle the rest.</p>
        <div class="features">
          <div class="feature">
            <FlashOutline :size="20" />
            <span>Lightning fast downloads</span>
          </div>
          <div class="feature">
            <ShieldCheckmarkOutline :size="20" />
            <span>Open source & ad-free</span>
          </div>
          <div class="feature">
            <FolderOutline :size="20" />
            <span>Auto-organize files</span>
          </div>
        </div>
      </div>

      <!-- Step 2: Setup -->
      <div v-if="step === 2" class="step">
        <h1>Quick Setup</h1>
        <p class="subtitle">Choose where your downloads live and your preferred language.</p>
        <div class="form-group">
          <label>Download Directory</label>
          <NInput v-model:value="downloadDir" />
        </div>
        <div class="form-group">
          <label>Language</label>
          <NSelect v-model:value="uiLanguage"
            :options="[
            { label: 'English', value: 'en' },
            { label: '中文', value: 'zh' },
            { label: '日本語', value: 'ja' },
          ]" />
        </div>
      </div>

      <!-- Step 3: First Command -->
      <div v-if="step === 3" class="step">
        <h1>Try a command</h1>
        <p class="subtitle">Type something like:</p>
        <div class="examples">
          <div class="example" @click="router.push('/')">
            <DownloadOutline :size="16" />
            <span>Download the latest VS Code for macOS</span>
          </div>
          <div class="example" @click="router.push('/')">
            <DownloadOutline :size="16" />
            <span>下流浪地球 2 4K 字幕版</span>
          </div>
          <div class="example" @click="router.push('/')">
            <DownloadOutline :size="16" />
            <span>magnet:?xt=urn:btih:...</span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="nav">
        <NButton v-if="step > 1" quaternary @click="prevStep">Back</NButton>
        <div v-else></div>
        <NButton type="primary" @click="nextStep">
          {{ step === 3 ? 'Start Downloading →' : 'Continue →' }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg);
  padding: var(--space-4);
}

.onboarding-card {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: var(--space-8);
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  margin-bottom: var(--space-8);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: all var(--transition);
}

.dot.active {
  background: var(--primary);
  width: 24px;
  border-radius: 4px;
}

.dot.completed {
  background: var(--primary);
  opacity: 0.5;
}

.step {
  text-align: center;
}

.logo {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-6);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-muted);
  border-radius: var(--radius-lg);
  color: var(--primary);
}

h1 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.subtitle {
  color: var(--fg-secondary);
  margin-bottom: var(--space-6);
}

.features {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: left;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.feature {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--fg-secondary);
}

.feature svg {
  color: var(--primary);
  flex-shrink: 0;
}

.form-group {
  margin-bottom: var(--space-4);
  text-align: left;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: var(--fg-secondary);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.examples {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.example {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.example:hover {
  background: var(--surface-hover);
}

.example svg {
  color: var(--primary);
  flex-shrink: 0;
}

.nav {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-8);
}
</style>
