// src/composables/useSettings.ts
// Global settings store — reactive, persisted to localStorage, read by App.vue

import { ref, watch, computed } from 'vue'

type Theme = 'dark' | 'light' | 'system'
type Language = 'en' | 'zh'

// ---- localStorage helpers ----
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ---- Reactive settings ----
export const theme = ref<Theme>(load('motrix-ai:theme', 'dark'))
export const language = ref<Language>(load('motrix-ai:language', 'en'))

// System theme detection
const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  systemDark.value = e.matches
})

// Resolved theme: 'system' → actual value
export const resolvedTheme = computed<'dark' | 'light'>(() => {
  if (theme.value === 'system') return systemDark.value ? 'dark' : 'light'
  return theme.value
})

// Is dark mode active
export const isDark = computed(() => resolvedTheme.value === 'dark')

// ---- Persist on change ----
watch(theme, (v) => save('motrix-ai:theme', v))
watch(language, (v) => save('motrix-ai:language', v))

// ---- CSS variables for light/dark ----
function applyThemeVars(dark: boolean) {
  const root = document.documentElement
  if (dark) {
    root.style.setProperty('--bg', '#0a0a0a')
    root.style.setProperty('--bg-elevated', '#141414')
    root.style.setProperty('--surface', '#1a1a1a')
    root.style.setProperty('--surface-hover', '#222222')
    root.style.setProperty('--surface-elevated', '#1e1e1e')
    root.style.setProperty('--border', '#2a2a2a')
    root.style.setProperty('--fg', '#e8e8e8')
    root.style.setProperty('--fg-secondary', '#a0a0a0')
    root.style.setProperty('--fg-muted', '#666666')
    root.style.setProperty('--primary', '#3B82F6')
    root.style.setProperty('--primary-muted', 'rgba(59, 130, 246, 0.15)')
    root.style.setProperty('--danger', '#EF4444')
    root.style.setProperty('--success', '#10B981')
    root.style.setProperty('--warning', '#F59E0B')
    root.style.colorScheme = 'dark'
  } else {
    root.style.setProperty('--bg', '#f5f5f5')
    root.style.setProperty('--bg-elevated', '#ffffff')
    root.style.setProperty('--surface', '#ffffff')
    root.style.setProperty('--surface-hover', '#f0f0f0')
    root.style.setProperty('--surface-elevated', '#fafafa')
    root.style.setProperty('--border', '#e0e0e0')
    root.style.setProperty('--fg', '#1a1a1a')
    root.style.setProperty('--fg-secondary', '#555555')
    root.style.setProperty('--fg-muted', '#999999')
    root.style.setProperty('--primary', '#2563EB')
    root.style.setProperty('--primary-muted', 'rgba(37, 99, 235, 0.1)')
    root.style.setProperty('--danger', '#DC2626')
    root.style.setProperty('--success', '#059669')
    root.style.setProperty('--warning', '#D97706')
    root.style.colorScheme = 'light'
  }
}

// ---- i18n strings ----
const strings: Record<string, Record<Language, string>> = {
  // Nav
  'nav.downloads': { en: 'Downloads', zh: '下载' },
  'nav.queue': { en: 'Queue', zh: '队列' },
  'nav.settings': { en: 'Settings', zh: '设置' },
  'nav.back': { en: 'Back to Chat', zh: '返回聊天' },
  // Buttons
  'btn.pause': { en: 'Pause', zh: '暂停' },
  'btn.resume': { en: 'Resume', zh: '恢复' },
  'btn.retry': { en: 'Retry', zh: '重试' },
  'btn.remove': { en: 'Remove', zh: '删除' },
  'btn.clear': { en: 'Clear', zh: '清除' },
  'btn.clearCompleted': { en: 'Clear Completed', zh: '清除已完成' },
  'btn.download': { en: 'Download', zh: '下载' },
  'btn.back': { en: 'Back', zh: '返回' },
  'btn.pauseAll': { en: 'Pause All', zh: '全部暂停' },
  'btn.resumeAll': { en: 'Resume All', zh: '全部恢复' },
  'btn.open': { en: 'Open', zh: '打开' },
  'btn.openFolder': { en: 'Open Folder', zh: '打开文件夹' },
  'btn.send': { en: 'Send', zh: '发送' },
  // Filters
  'filter.all': { en: 'All', zh: '全部' },
  'filter.active': { en: 'Active', zh: '活跃' },
  'filter.completed': { en: 'Completed', zh: '已完成' },
  'filter.paused': { en: 'Paused', zh: '已暂停' },
  'filter.failed': { en: 'Failed', zh: '失败' },
  // Status
  'status.downloading': { en: 'DOWNLOADING', zh: '下载中' },
  'status.completed': { en: 'COMPLETED', zh: '已完成' },
  'status.paused': { en: 'PAUSED', zh: '已暂停' },
  'status.failed': { en: 'FAILED', zh: '失败' },
  'status.active': { en: 'Active', zh: '活跃' },
  'status.pending': { en: 'PENDING', zh: '等待中' },
  'status.removed': { en: 'REMOVED', zh: '已移除' },
  // Search
  'search.placeholder': { en: 'Paste URL, magnet link, or ed2k://...', zh: '粘贴 URL、磁力链接或 ed2k://...' },
  'search.chatPlaceholder': { en: 'Or describe what you want to download...', zh: '或描述你想下载什么...' },
  'search.results': { en: 'Search results', zh: '搜索结果' },
  'search.found': { en: 'resources found', zh: '个资源' },
  'search.searching': { en: 'Searching...', zh: '搜索中...' },
  'search.noResults': { en: 'No resources found', zh: '未找到资源' },
  // Quick actions
  'action.pasteLink': { en: 'Paste Link', zh: '粘贴链接' },
  'action.uploadTorrent': { en: 'Upload .torrent', zh: '上传种子' },
  'action.quickDownload': { en: 'Quick Download', zh: '快速下载' },
  'action.queue': { en: 'Queue', zh: '队列' },
  // Table headers
  'table.name': { en: 'NAME', zh: '名称' },
  'table.source': { en: 'SOURCE', zh: '来源' },
  'table.status': { en: 'STATUS', zh: '状态' },
  'table.progress': { en: 'PROGRESS', zh: '进度' },
  'table.speed': { en: 'SPEED', zh: '速度' },
  'table.size': { en: 'SIZE', zh: '大小' },
  'table.eta': { en: 'ETA', zh: '剩余' },
  // Queue
  'queue.title': { en: 'Download Queue', zh: '下载队列' },
  'queue.total': { en: 'Total', zh: '总计' },
  'queue.speed': { en: 'Speed', zh: '速度' },
  'queue.tasks': { en: 'tasks', zh: '个任务' },
  'queue.searchPlaceholder': { en: 'Search downloads...', zh: '搜索下载...' },
  'queue.noTasks': { en: 'No download tasks', zh: '暂无下载任务' },
  'queue.selected': { en: 'selected', zh: '已选择' },
  'queue.bulkPause': { en: 'Pause Selected', zh: '暂停所选' },
  'queue.bulkResume': { en: 'Resume Selected', zh: '恢复所选' },
  'queue.bulkRemove': { en: 'Remove Selected', zh: '删除所选' },
  // Settings
  'settings.title': { en: 'Settings', zh: '设置' },
  'settings.aiModel': { en: 'AI Model', zh: 'AI 模型' },
  'settings.downloads': { en: 'Downloads', zh: '下载设置' },
  'settings.subtitles': { en: 'Subtitles', zh: '字幕设置' },
  'settings.appearance': { en: 'Appearance', zh: '外观' },
  'settings.advanced': { en: 'Advanced', zh: '高级' },
  'settings.theme': { en: 'Theme', zh: '主题' },
  'settings.language': { en: 'Language', zh: '语言' },
  'settings.currentModel': { en: 'Current Model', zh: '当前模型' },
  'settings.apiKey': { en: 'API Key', zh: 'API 密钥' },
  'settings.downloadDir': { en: 'Default Directory', zh: '默认下载目录' },
  'settings.maxConcurrent': { en: 'Max Concurrent Downloads', zh: '最大并发下载数' },
  'settings.downloadSpeed': { en: 'Download Speed Limit (KB/s)', zh: '下载速度限制 (KB/s)' },
  'settings.uploadSpeed': { en: 'Upload Speed Limit (KB/s)', zh: '上传速度限制 (KB/s)' },
  'settings.unlimited': { en: 'Unlimited', zh: '无限制' },
  'settings.autoRetry': { en: 'Auto-retry on failure', zh: '失败自动重试' },
  'settings.maxRetries': { en: 'Max retries', zh: '最大重试次数' },
  'settings.subtitleApiKey': { en: 'OpenSubtitles API Key', zh: 'OpenSubtitles API 密钥' },
  'settings.subtitleLangs': { en: 'Preferred Languages', zh: '首选字幕语言' },
  'settings.autoSubtitle': { en: 'Auto-search subtitles', zh: '自动搜索字幕' },
  'settings.subtitleDir': { en: 'Subtitle Directory', zh: '字幕保存目录' },
  'settings.dark': { en: 'Dark', zh: '深色' },
  'settings.light': { en: 'Light', zh: '浅色' },
  'settings.system': { en: 'System', zh: '跟随系统' },
  'settings.rpcUrl': { en: 'aria2 RPC URL', zh: 'aria2 RPC 地址' },
  'settings.rpcSecret': { en: 'aria2 RPC Secret', zh: 'aria2 RPC 密钥' },
  'settings.logLevel': { en: 'Log Level', zh: '日志级别' },
  'settings.dangerZone': { en: 'Danger Zone', zh: '危险操作' },
  'settings.clearHistory': { en: 'Clear Download History', zh: '清除下载历史' },
  // Messages
  'msg.added': { en: 'Added', zh: '已添加' },
  'msg.addFailed': { en: 'Add failed', zh: '添加失败' },
  'msg.addDownloadFailed': { en: 'Failed to add download', zh: '添加下载失败' },
  'msg.unknownError': { en: 'Unknown error', zh: '未知错误' },
  'msg.aria2NotConnected': { en: 'aria2 not connected, added to local list', zh: 'aria2 未连接，已添加到本地列表' },
  'msg.noFilePath': { en: 'No file path available', zh: '没有文件路径' },
  'msg.pathCopied': { en: 'Path copied', zh: '路径已复制' },
  'msg.fileLocation': { en: 'File location', zh: '文件位置' },
  'msg.clipboardReadFailed': { en: 'Cannot read clipboard', zh: '无法读取剪贴板' },
  'msg.downloadComplete': { en: '✅ Download complete', zh: '✅ 下载完成' },
  'msg.organized': { en: 'Organized', zh: '已整理' },
  'msg.recognized': { en: 'Recognized', zh: '识别' },
  'msg.auto': { en: 'auto', zh: '自动' },
  'msg.subtitle': { en: 'subtitle', zh: '字幕' },
  'msg.searchFailed': { en: 'Search failed, please retry', zh: '搜索失败，请重试' },
  'msg.subtitleSearching': { en: 'Searching subtitles...', zh: '正在搜索字幕...' },
  'msg.subtitleFound': { en: 'Subtitle found', zh: '找到字幕' },
  'msg.subtitleNotFound': { en: 'No subtitles found', zh: '未找到匹配字幕' },
  'msg.subtitleDownload': { en: 'Downloading subtitle', zh: '下载字幕' },
  'msg.subtitleDownloadFailed': { en: 'Subtitle download failed', zh: '字幕下载失败' },
  'msg.parsing': { en: 'Parsing...', zh: '解析中...' },
  'msg.settingsSaved': { en: 'Settings saved', zh: '设置已保存' },
}

export function t(key: string): string {
  return strings[key]?.[language.value] ?? key
}

// ---- Apply on load ----
applyThemeVars(isDark.value)
watch(isDark, (dark) => applyThemeVars(dark))
