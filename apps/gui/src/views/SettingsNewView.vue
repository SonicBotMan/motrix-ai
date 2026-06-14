<script setup lang="ts">
/**
 * SettingsNewView — 7-tab settings screen for Motrix AI
 *
 * Tabs: General / Appearance / AI / Storage / Network / Notifications / About
 *
 * Each tab uses UiInput, UiButton, UiTag from components/ui.
 * Uses design tokens from tokens.css for all colors, spacing, and radii.
 * Proper ARIA: role=tab, aria-current, aria-selected, role=tabpanel.
 *
 * Design ref: docs/design/handoff/HANDOFF.md §3.1 (Settings screen)
 */

import { ref } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiTag from '@/components/ui/UiTag.vue'

const emit = defineEmits<{
  navigate: [view: string]
}>()

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface SettingsTab {
  id: string
  label: string
}

const tabs: SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI' },
  { id: 'storage', label: 'Storage' },
  { id: 'network', label: 'Network' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'about', label: 'About' },
]

const activeTab = ref('general')

function selectTab(tabId: string): void {
  activeTab.value = tabId
}

// ---------------------------------------------------------------------------
// General settings
// ---------------------------------------------------------------------------

const language = ref('en')
const startupBehavior = ref('restore')
const launchOnStartup = ref(false)
const autoStartDownloads = ref(true)
const checkUpdatesOnLaunch = ref(true)

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese (Simplified)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
]

// ---------------------------------------------------------------------------
// Appearance settings
// ---------------------------------------------------------------------------

const theme = ref<'dark' | 'light' | 'system'>('dark')
const fontSize = ref(14)
const fontFamily = ref('inter')
const density = ref<'comfortable' | 'compact'>('comfortable')

const themeOptions: Array<{ value: 'dark' | 'light' | 'system'; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

function selectTheme(value: 'dark' | 'light' | 'system'): void {
  theme.value = value
  // Apply theme immediately
  const html = document.documentElement
  if (value === 'system') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', value)
  }
}

// ---------------------------------------------------------------------------
// AI settings
// ---------------------------------------------------------------------------

const aiProvider = ref('openai')
const aiApiKey = ref('')
const aiModel = ref('gpt-4o-mini')
const aiEndpoint = ref('')
const aiTemperature = ref(0.3)
const aiEnabled = ref(true)

const providerOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'local', label: 'Local (Ollama)' },
  { value: 'none', label: 'Built-in heuristic (no AI)' },
]

// ---------------------------------------------------------------------------
// Storage settings
// ---------------------------------------------------------------------------

const downloadDir = ref('~/Downloads/Motrix')
const maxConcurrentDownloads = ref(5)
const autoOrganize = ref(false)
const organizeBy = ref('type')
const deleteAfterInstall = ref(false)
const diskSpaceWarning = ref(2)

// ---------------------------------------------------------------------------
// Network settings
// ---------------------------------------------------------------------------

const useProxy = ref(false)
const proxyHost = ref('')
const proxyPort = ref('')
const proxyUsername = ref('')
const proxyPassword = ref('')
const maxConnections = ref(16)
const maxConnectionsPerServer = ref(8)
const minSplitSize = ref(20)
const enableIPv6 = ref(false)
const userAgent = ref('MotrixAI/1.0')

// ---------------------------------------------------------------------------
// Notifications settings
// ---------------------------------------------------------------------------

const notificationsEnabled = ref(true)
const soundEnabled = ref(true)
const notifyOnComplete = ref(true)
const notifyOnError = ref(true)
const notifyOnPause = ref(false)
const notificationSound = ref('default')

// ---------------------------------------------------------------------------
// About info
// ---------------------------------------------------------------------------

const appVersion = '1.0.0'
const buildDate = '2026-06-15'
const electronVersion = 'Tauri 2.0'
const rustVersion = '1.78.0'
const vueVersion = '3.5'

const links = [
  { label: 'GitHub', url: 'https://github.com/motrix-ai/motrix-ai' },
  { label: 'Documentation', url: 'https://docs.motrix.ai' },
  { label: 'Report a Bug', url: 'https://github.com/motrix-ai/motrix-ai/issues' },
  { label: 'License (MIT)', url: 'https://opensource.org/licenses/MIT' },
]

function openExternalLink(url: string): void {
  window.open(url, '_blank', 'noopener')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goBack(): void {
  emit('navigate', 'main')
}

function toggleTheme(): void {
  const html = document.documentElement
  const current = html.getAttribute('data-theme')
  html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light')
}


</script>

<template>
  <div class="settings-layout">
    <!-- Chrome bar (reuses top bar pattern) -->
    <header class="settings-chrome">
      <div class="chrome-left">
        <div class="chrome-dots">
          <span class="dot red" />
          <span class="dot yellow" />
          <span class="dot green" />
        </div>
        <div
          class="chrome-logo"
          title="Back to downloads"
          @click="goBack"
        >
          <span class="logo-motrix">Motrix</span>
          <span class="logo-ai"> AI</span>
        </div>
      </div>
      <div class="chrome-center" />
      <div class="chrome-right">
        <button
          class="chrome-btn"
          type="button"
          title="Toggle theme"
          aria-label="Toggle theme"
          @click="toggleTheme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </button>
        <button
          class="chrome-btn"
          type="button"
          title="Back to downloads"
          aria-label="Back to downloads"
          @click="goBack"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Settings body: sidebar tabs + content panel -->
    <div class="settings-body">
      <!-- Tab sidebar -->
      <nav
        class="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="settings-tab"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :aria-current="activeTab === tab.id ? 'page' : 'false'"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Tab content -->
      <div class="settings-content">
        <!-- ── General ────────────────────────────────────────────── -->
        <section
          v-if="activeTab === 'general'"
          role="tabpanel"
          aria-labelledby="tab-general"
          class="tab-panel"
        >
          <h2 class="panel-title">General</h2>
          <p class="panel-desc">App-wide behavior and startup preferences.</p>

          <div class="setting-group">
            <div class="setting-row">
              <label class="setting-label" for="general-language">Language</label>
              <div class="setting-control">
                <select id="general-language" v-model="language" class="ui-select">
                  <option v-for="opt in languageOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="general-startup">On startup</label>
              <div class="setting-control">
                <select id="general-startup" v-model="startupBehavior" class="ui-select">
                  <option value="restore">Restore previous session</option>
                  <option value="empty">Start with empty queue</option>
                  <option value="resume">Resume all downloads</option>
                </select>
              </div>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Launch Motrix AI on system startup</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: launchOnStartup }"
                :aria-checked="launchOnStartup"
                @click="launchOnStartup = !launchOnStartup"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Auto-start pending downloads</span>
                <span class="setting-hint">Begin queued downloads when the app opens</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: autoStartDownloads }"
                :aria-checked="autoStartDownloads"
                @click="autoStartDownloads = !autoStartDownloads"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Check for updates on launch</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: checkUpdatesOnLaunch }"
                :aria-checked="checkUpdatesOnLaunch"
                @click="checkUpdatesOnLaunch = !checkUpdatesOnLaunch"
              >
                <span class="switch-thumb" />
              </button>
            </div>
          </div>
        </section>

        <!-- ── Appearance ─────────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'appearance'"
          role="tabpanel"
          aria-labelledby="tab-appearance"
          class="tab-panel"
        >
          <h2 class="panel-title">Appearance</h2>
          <p class="panel-desc">Theme, typography, and information density.</p>

          <div class="setting-group">
            <div class="setting-row">
              <span class="setting-label">Theme</span>
              <div class="setting-control theme-cards">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  type="button"
                  class="theme-card"
                  :class="{ selected: theme === opt.value }"
                  role="radio"
                  :aria-checked="theme === opt.value"
                  @click="selectTheme(opt.value)"
                >
                  <div class="theme-preview" :class="`preview-${opt.value}`">A</div>
                  <span class="theme-card-label">{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="appearance-fontsize">Font size</label>
              <div class="setting-control inline-control">
                <input
                  id="appearance-fontsize"
                  v-model.number="fontSize"
                  type="range"
                  min="12"
                  max="18"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ fontSize }}px</UiTag>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="appearance-font">Font family</label>
              <div class="setting-control">
                <select id="appearance-font" v-model="fontFamily" class="ui-select">
                  <option value="inter">Inter (default)</option>
                  <option value="system">System UI</option>
                  <option value="jetbrains">JetBrains Mono</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="appearance-density">Information density</label>
              <div class="setting-control">
                <select id="appearance-density" v-model="density" class="ui-select">
                  <option value="comfortable">Comfortable (56px rows)</option>
                  <option value="compact">Compact (44px rows)</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- ── AI ─────────────────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'ai'"
          role="tabpanel"
          aria-labelledby="tab-ai"
          class="tab-panel"
        >
          <h2 class="panel-title">AI</h2>
          <p class="panel-desc">Configure the natural language engine. Leave empty for zero-config heuristic parsing.</p>

          <div class="setting-group">
            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Enable AI assistance</span>
                <span class="setting-hint">Process chat commands with the configured model</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: aiEnabled }"
                :aria-checked="aiEnabled"
                @click="aiEnabled = !aiEnabled"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="ai-provider">Provider</label>
              <div class="setting-control">
                <select id="ai-provider" v-model="aiProvider" class="ui-select">
                  <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-control full">
                <UiInput
                  v-model="aiApiKey"
                  type="password"
                  label="API key"
                  placeholder="sk-..."
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-control full">
                <UiInput
                  v-model="aiEndpoint"
                  label="Custom endpoint (optional)"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-control full">
                <UiInput
                  v-model="aiModel"
                  label="Model"
                  placeholder="gpt-4o-mini"
                />
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="ai-temp">Temperature</label>
              <div class="setting-control inline-control">
                <input
                  id="ai-temp"
                  v-model.number="aiTemperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ aiTemperature.toFixed(1) }}</UiTag>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-control">
                <UiButton variant="secondary" size="md" @click="() => {}">
                  Test connection
                </UiButton>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Storage ────────────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'storage'"
          role="tabpanel"
          aria-labelledby="tab-storage"
          class="tab-panel"
        >
          <h2 class="panel-title">Storage</h2>
          <p class="panel-desc">Where downloads are saved and how they are organized.</p>

          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-control full">
                <UiInput
                  v-model="downloadDir"
                  label="Download directory"
                  placeholder="~/Downloads/Motrix"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-control">
                <UiButton variant="secondary" size="md" @click="() => {}">
                  Choose folder
                </UiButton>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="storage-concurrent">Max concurrent downloads</label>
              <div class="setting-control inline-control">
                <input
                  id="storage-concurrent"
                  v-model.number="maxConcurrentDownloads"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ maxConcurrentDownloads }}</UiTag>
              </div>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Auto-organize downloads</span>
                <span class="setting-hint">Sort completed files into subfolders</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: autoOrganize }"
                :aria-checked="autoOrganize"
                @click="autoOrganize = !autoOrganize"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div v-if="autoOrganize" class="setting-row">
              <label class="setting-label" for="storage-organize">Organize by</label>
              <div class="setting-control">
                <select id="storage-organize" v-model="organizeBy" class="ui-select">
                  <option value="type">File type (documents, videos, etc.)</option>
                  <option value="date">Date (YYYY-MM)</option>
                  <option value="source">Source domain</option>
                </select>
              </div>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Delete torrent file after completion</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: deleteAfterInstall }"
                :aria-checked="deleteAfterInstall"
                @click="deleteAfterInstall = !deleteAfterInstall"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="storage-disk">Disk space warning (GB)</label>
              <div class="setting-control inline-control">
                <input
                  id="storage-disk"
                  v-model.number="diskSpaceWarning"
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ diskSpaceWarning }} GB</UiTag>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Network ────────────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'network'"
          role="tabpanel"
          aria-labelledby="tab-network"
          class="tab-panel"
        >
          <h2 class="panel-title">Network</h2>
          <p class="panel-desc">Proxy, connection limits, and protocol options.</p>

          <div class="setting-group">
            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Use a proxy server</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: useProxy }"
                :aria-checked="useProxy"
                @click="useProxy = !useProxy"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <template v-if="useProxy">
              <div class="setting-row proxy-row">
                <div class="setting-control">
                  <UiInput
                    v-model="proxyHost"
                    label="Proxy host"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div class="setting-control proxy-port">
                  <UiInput
                    v-model="proxyPort"
                    label="Port"
                    placeholder="7890"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-control">
                  <UiInput
                    v-model="proxyUsername"
                    label="Username (optional)"
                    placeholder="username"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-control">
                  <UiInput
                    v-model="proxyPassword"
                    type="password"
                    label="Password (optional)"
                    placeholder="password"
                  />
                </div>
              </div>
            </template>

            <div class="setting-row">
              <label class="setting-label" for="net-maxconn">Max connections per task</label>
              <div class="setting-control inline-control">
                <input
                  id="net-maxconn"
                  v-model.number="maxConnections"
                  type="range"
                  min="1"
                  max="64"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ maxConnections }}</UiTag>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="net-maxperserver">Max connections per server</label>
              <div class="setting-control inline-control">
                <input
                  id="net-maxperserver"
                  v-model.number="maxConnectionsPerServer"
                  type="range"
                  min="1"
                  max="16"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ maxConnectionsPerServer }}</UiTag>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="net-split">Min split size (MB)</label>
              <div class="setting-control inline-control">
                <input
                  id="net-split"
                  v-model.number="minSplitSize"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  class="ui-range"
                >
                <UiTag variant="info">{{ minSplitSize }} MB</UiTag>
              </div>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Enable IPv6</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: enableIPv6 }"
                :aria-checked="enableIPv6"
                @click="enableIPv6 = !enableIPv6"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row">
              <div class="setting-control full">
                <UiInput
                  v-model="userAgent"
                  label="User agent"
                  placeholder="MotrixAI/1.0"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- ── Notifications ──────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'notifications'"
          role="tabpanel"
          aria-labelledby="tab-notifications"
          class="tab-panel"
        >
          <h2 class="panel-title">Notifications</h2>
          <p class="panel-desc">Control when and how the app alerts you.</p>

          <div class="setting-group">
            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Enable notifications</span>
                <span class="setting-hint">Show system or in-app notifications</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: notificationsEnabled }"
                :aria-checked="notificationsEnabled"
                @click="notificationsEnabled = !notificationsEnabled"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">Play sound</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: soundEnabled }"
                :aria-checked="soundEnabled"
                :disabled="!notificationsEnabled"
                @click="soundEnabled = !soundEnabled"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row">
              <label class="setting-label" for="notif-sound">Notification sound</label>
              <div class="setting-control">
                <select id="notif-sound" v-model="notificationSound" class="ui-select" :disabled="!soundEnabled">
                  <option value="default">Default</option>
                  <option value="chime">Chime</option>
                  <option value="bell">Bell</option>
                  <option value="pop">Pop</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            <div class="setting-divider" />

            <p class="setting-section-label">Notify me when</p>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">A download completes</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: notifyOnComplete }"
                :aria-checked="notifyOnComplete"
                :disabled="!notificationsEnabled"
                @click="notifyOnComplete = !notifyOnComplete"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">A download fails</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: notifyOnError }"
                :aria-checked="notifyOnError"
                :disabled="!notificationsEnabled"
                @click="notifyOnError = !notifyOnError"
              >
                <span class="switch-thumb" />
              </button>
            </div>

            <div class="setting-row toggle-row">
              <div class="setting-label-group">
                <span class="setting-label">A download is paused</span>
              </div>
              <button
                type="button"
                role="switch"
                class="ui-switch"
                :class="{ on: notifyOnPause }"
                :aria-checked="notifyOnPause"
                :disabled="!notificationsEnabled"
                @click="notifyOnPause = !notifyOnPause"
              >
                <span class="switch-thumb" />
              </button>
            </div>
          </div>
        </section>

        <!-- ── About ──────────────────────────────────────────────── -->
        <section
          v-else-if="activeTab === 'about'"
          role="tabpanel"
          aria-labelledby="tab-about"
          class="tab-panel"
        >
          <h2 class="panel-title">About</h2>

          <div class="about-card">
            <div class="about-logo">
              <span class="logo-motrix-lg">Motrix</span>
              <span class="logo-ai-lg"> AI</span>
            </div>
            <p class="about-tagline">Task-first desktop download manager.</p>

            <dl class="about-info">
              <div class="about-info-row">
                <dt>Version</dt>
                <dd>{{ appVersion }}</dd>
              </div>
              <div class="about-info-row">
                <dt>Build date</dt>
                <dd>{{ buildDate }}</dd>
              </div>
              <div class="about-info-row">
                <dt>Framework</dt>
                <dd>{{ electronVersion }}</dd>
              </div>
              <div class="about-info-row">
                <dt>Rust</dt>
                <dd>{{ rustVersion }}</dd>
              </div>
              <div class="about-info-row">
                <dt>Vue</dt>
                <dd>{{ vueVersion }}</dd>
              </div>
            </dl>

            <div class="about-tags">
              <UiTag variant="success">MIT License</UiTag>
              <UiTag variant="info">No telemetry</UiTag>
              <UiTag variant="warning">Open source</UiTag>
            </div>

            <div class="about-links">
              <button
                v-for="link in links"
                :key="link.url"
                type="button"
                class="about-link"
                @click="openExternalLink(link.url)"
              >
                {{ link.label }}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 17L17 7M17 7H8M17 7v9" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg, #0A0A0B);
  color: var(--fg, #FAFAFA);
  font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
}

/* --- Chrome bar --- */

.settings-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--chrome-height, 48px);
  padding: 0 var(--space-4, 16px);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 50;
}

.chrome-left {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.chrome-dots {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full, 9999px);
  pointer-events: none;
}

.dot.red { background: #ff5f57; }
.dot.yellow { background: #febc2e; }
.dot.green { background: #28c840; }

.chrome-logo {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: var(--space-1, 4px) var(--space-2, 8px);
  border-radius: var(--radius-xs, 6px);
  transition: background var(--transition-fast, 150ms) var(--ease-out);
}

.chrome-logo:hover {
  background: var(--surface-hover);
}

.logo-motrix { color: var(--primary); }
.logo-ai { color: var(--fg); }

.chrome-center { flex: 1; }

.chrome-right {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.chrome-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out),
    background var(--transition-fast, 150ms) var(--ease-out);
}

.chrome-btn:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.chrome-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

/* --- Settings body layout --- */

.settings-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* --- Tab sidebar --- */

.settings-tabs {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  padding: var(--space-4, 16px) var(--space-2, 8px);
  background: var(--bg-elevated, #121214);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.settings-tab {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3, 12px);
  height: 36px;
  font-family: var(--font-ui);
  font-size: var(--text-body, 14px);
  font-weight: 500;
  color: var(--fg-tertiary);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  text-align: left;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out),
    background var(--transition-fast, 150ms) var(--ease-out);
}

.settings-tab:hover {
  color: var(--fg-secondary);
  background: var(--surface-hover);
}

.settings-tab.active {
  color: var(--fg);
  background: var(--surface-elevated);
}

.settings-tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--focus-ring-soft);
}

/* --- Tab content --- */

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6, 32px) var(--space-8, 48px);
}

.tab-panel {
  max-width: 640px;
  animation: fadeSlideUp 250ms var(--ease-out);
}

@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-title {
  font-family: var(--font-ui);
  font-size: var(--text-h1, 24px);
  font-weight: 600;
  color: var(--fg);
  margin: 0 0 var(--space-1, 4px) 0;
}

.panel-desc {
  font-family: var(--font-ui);
  font-size: var(--text-body, 14px);
  color: var(--fg-secondary);
  margin: 0 0 var(--space-6, 32px) 0;
  line-height: 1.5;
}

/* --- Setting groups --- */

.setting-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  padding: var(--space-3, 12px) 0;
  border-bottom: 1px solid var(--border);
  min-height: 52px;
}

.setting-row:last-child {
  border-bottom: none;
}

.toggle-row {
  align-items: center;
}

.setting-label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.setting-label {
  font-family: var(--font-ui);
  font-size: var(--text-body, 14px);
  font-weight: 500;
  color: var(--fg);
  flex-shrink: 0;
  padding-top: 6px;
}

.toggle-row .setting-label {
  padding-top: 0;
}

.setting-hint {
  font-family: var(--font-ui);
  font-size: var(--text-caption, 12px);
  color: var(--fg-tertiary);
  line-height: 1.4;
}

.setting-control {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  min-width: 0;
}

.setting-control.full {
  max-width: 400px;
}

.setting-control.inline-control {
  flex-direction: row;
  align-items: center;
  gap: var(--space-3, 12px);
}

.setting-divider {
  height: 1px;
  background: var(--border);
  margin: var(--space-3, 12px) 0;
}

.setting-section-label {
  font-family: var(--font-ui);
  font-size: var(--text-caption, 12px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-tertiary);
  margin: 0 0 var(--space-1, 4px) 0;
}

/* --- Custom select --- */

.ui-select {
  width: 100%;
  max-width: 320px;
  height: 36px;
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: var(--text-body, 14px);
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  outline: none;
  transition:
    border-color var(--transition-fast, 150ms) var(--ease-out),
    box-shadow var(--transition-fast, 150ms) var(--ease-out);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.ui-select:hover {
  border-color: var(--border-hover);
}

.ui-select:focus-visible {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-muted);
}

.ui-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Range slider --- */

.ui-range {
  flex: 1;
  max-width: 240px;
  height: 6px;
  background: var(--surface-hover);
  border-radius: var(--radius-full, 9999px);
  outline: none;
  appearance: none;
  cursor: pointer;
}

.ui-range::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full, 9999px);
  background: var(--primary);
  border: 2px solid var(--fg);
  cursor: pointer;
  transition: transform var(--transition-fast, 150ms) var(--ease-out);
}

.ui-range::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.ui-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full, 9999px);
  background: var(--primary);
  border: 2px solid var(--fg);
  cursor: pointer;
}

.ui-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px var(--primary-muted);
}

/* --- Toggle switch --- */

.ui-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border: none;
  border-radius: var(--radius-full, 9999px);
  background: var(--surface-hover);
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--transition-fast, 150ms) var(--ease-out);
}

.ui-switch.on {
  background: var(--primary);
}

.ui-switch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ui-switch:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full, 9999px);
  background: var(--fg);
  transition: transform var(--transition-fast, 150ms) var(--ease-spring);
}

.ui-switch.on .switch-thumb {
  transform: translateX(20px);
  background: #fff;
}

/* --- Theme cards --- */

.theme-cards {
  display: flex;
  gap: var(--space-3, 12px);
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  width: 96px;
  padding: var(--space-2, 8px);
  background: transparent;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  transition:
    border-color var(--transition-fast, 150ms) var(--ease-out),
    background var(--transition-fast, 150ms) var(--ease-out);
}

.theme-card:hover {
  border-color: var(--border-hover);
}

.theme-card.selected {
  border-color: var(--primary);
  background: var(--primary-muted);
}

.theme-card:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.theme-preview {
  width: 100%;
  height: 40px;
  border-radius: var(--radius-xs, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 600;
}

.preview-dark {
  background: #0A0A0B;
  color: #FAFAFA;
}

.preview-light {
  background: #FAFAFA;
  color: #111827;
}

.preview-system {
  background: linear-gradient(135deg, #0A0A0B 50%, #FAFAFA 50%);
  color: var(--fg);
}

.theme-card-label {
  font-family: var(--font-ui);
  font-size: var(--text-caption, 12px);
  font-weight: 500;
  color: var(--fg-secondary);
}

/* --- Proxy row --- */

.proxy-row {
  display: flex;
  gap: var(--space-3, 12px);
}

.proxy-port {
  max-width: 120px;
}

/* --- About card --- */

.about-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-8, 48px) var(--space-6, 32px);
  gap: var(--space-4, 16px);
}

.about-logo {
  font-family: var(--font-ui);
  font-size: var(--text-display, 32px);
  font-weight: 700;
}

.logo-motrix-lg { color: var(--primary); }
.logo-ai-lg { color: var(--fg); }

.about-tagline {
  font-family: var(--font-ui);
  font-size: var(--text-body, 14px);
  color: var(--fg-secondary);
  margin: 0;
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  margin: var(--space-4, 16px) 0;
  width: 100%;
  max-width: 320px;
}

.about-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2, 8px) 0;
  border-bottom: 1px solid var(--border);
}

.about-info-row:last-child {
  border-bottom: none;
}

.about-info-row dt {
  font-family: var(--font-ui);
  font-size: var(--text-caption, 12px);
  font-weight: 500;
  color: var(--fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.about-info-row dd {
  font-family: var(--font-mono);
  font-size: var(--text-body-sm, 13px);
  color: var(--fg);
  margin: 0;
}

.about-tags {
  display: flex;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  justify-content: center;
}

.about-links {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  width: 100%;
  max-width: 320px;
  margin-top: var(--space-4, 16px);
}

.about-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: var(--text-body-sm, 13px);
  font-weight: 500;
  color: var(--primary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  transition:
    background var(--transition-fast, 150ms) var(--ease-out),
    border-color var(--transition-fast, 150ms) var(--ease-out);
}

.about-link:hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
}

.about-link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--focus-ring-soft);
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
  .tab-panel {
    animation: none !important;
  }

  .settings-layout * {
    transition-duration: 0.01ms !important;
  }
}
</style>
