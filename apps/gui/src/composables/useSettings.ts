// src/composables/useSettings.ts
// Global settings store — reactive, persisted to localStorage, read by App.vue

import { ref, watch, computed } from 'vue'

type Theme = 'dark' | 'light' | 'system'
type Language = 'en' | 'zh' | 'ja' | 'ko' | 'fr'

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
  'nav.downloads': { en: 'Downloads', zh: '下载' , ja: 'ダウンロード', ko: '다운로드', fr: 'Téléchargements' },
  'nav.queue': { en: 'Queue', zh: '队列' , ja: 'キュー', ko: '대기열', fr: "File d'attente" },
  'nav.settings': { en: 'Settings', zh: '设置' , ja: '設定', ko: '설정', fr: 'Paramètres' },
  'nav.back': { en: 'Back to Chat', zh: '返回聊天' , ja: 'チャットに戻る', ko: '채팅으로 돌아가기', fr: 'Retour au chat' },
  // Buttons
  'btn.pause': { en: 'Pause', zh: '暂停' , ja: '一時停止', ko: '일시정지', fr: 'Pause' },
  'btn.resume': { en: 'Resume', zh: '恢复' , ja: '再開', ko: '재개', fr: 'Reprendre' },
  'btn.retry': { en: 'Retry', zh: '重试' , ja: '再試行', ko: '재시도', fr: 'Réessayer' },
  'btn.remove': { en: 'Remove', zh: '删除' , ja: '削除', ko: '삭제', fr: 'Supprimer' },
  'btn.clear': { en: 'Clear', zh: '清除' , ja: 'クリア', ko: '지우기', fr: 'Effacer' },
  'btn.clearCompleted': { en: 'Clear Completed', zh: '清除已完成' , ja: '完了をクリア', ko: '완료 삭제', fr: 'Effacer terminés' },
  'btn.download': { en: 'Download', zh: '下载' , ja: 'ダウンロード', ko: '다운로드', fr: 'Télécharger' },
  'btn.back': { en: 'Back', zh: '返回' , ja: '戻る', ko: '뒤로', fr: 'Retour' },
  'btn.pauseAll': { en: 'Pause All', zh: '全部暂停' , ja: 'すべて一時停止', ko: '모두 일시정지', fr: 'Tout mettre en pause' },
  'btn.resumeAll': { en: 'Resume All', zh: '全部恢复' , ja: 'すべて再開', ko: '모두 재개', fr: 'Tout reprendre' },
  'btn.open': { en: 'Open', zh: '打开' , ja: '開く', ko: '열기', fr: 'Ouvrir' },
  'btn.openFolder': { en: 'Open Folder', zh: '打开文件夹' , ja: 'フォルダを開く', ko: '폴더 열기', fr: 'Ouvrir le dossier' },
  'btn.send': { en: 'Send', zh: '发送' , ja: '送信', ko: '보내기', fr: 'Envoyer' },
  // Filters
  'filter.all': { en: 'All', zh: '全部' , ja: 'すべて', ko: '전체', fr: 'Tous' },
  'filter.active': { en: 'Active', zh: '活跃' , ja: 'アクティブ', ko: '진행중', fr: 'Actifs' },
  'filter.completed': { en: 'Completed', zh: '已完成' , ja: '完了', ko: '완료', fr: 'Terminés' },
  'filter.paused': { en: 'Paused', zh: '已暂停' , ja: '一時停止', ko: '일시정지', fr: 'En pause' },
  'filter.failed': { en: 'Failed', zh: '失败' , ja: '失敗', ko: '실패', fr: 'Échoués' },
  // Status
  'status.downloading': { en: 'DOWNLOADING', zh: '下载中' , ja: 'ダウンロード中', ko: '다운로드 중', fr: 'TÉLÉCHARGEMENT' },
  'status.completed': { en: 'COMPLETED', zh: '已完成' , ja: '完了', ko: '완료', fr: 'TERMINÉ' },
  'status.paused': { en: 'PAUSED', zh: '已暂停' , ja: '一時停止', ko: '일시정지', fr: 'EN PAUSE' },
  'status.failed': { en: 'FAILED', zh: '失败' , ja: '失敗', ko: '실패', fr: 'ÉCHOUÉ' },
  'status.active': { en: 'Active', zh: '活跃' , ja: 'アクティブ', ko: '진행중', fr: 'Actif' },
  'status.pending': { en: 'PENDING', zh: '等待中' , ja: '待機中', ko: '대기중', fr: 'EN ATTENTE' },
  'status.removed': { en: 'REMOVED', zh: '已移除' , ja: '削除済み', ko: '삭제됨', fr: 'SUPPRIMÉ' },
  // Search
  'search.placeholder': { en: 'Paste URL, magnet link, or ed2k://...', zh: '粘贴 URL、磁力链接或 ed2k://...' , ja: 'URL、マグネットリンク、ed2k://を貼り付け...', ko: 'URL, 마그넷 링크, ed2k:// 붙여넣기...', fr: 'Coller URL, lien magnet ou ed2k://...' },
  'search.chatPlaceholder': { en: 'Or describe what you want to download...', zh: '或描述你想下载什么...' , ja: 'またはダウンロードしたいものを説明...', ko: '또는 다운로드할 내용 설명...', fr: 'Ou décrivez ce que vous voulez télécharger...' },
  'search.results': { en: 'Search results', zh: '搜索结果' , ja: '検索結果', ko: '검색 결과', fr: 'Résultats de recherche' },
  'search.found': { en: 'resources found', zh: '个资源' , ja: '件のリソース', ko: '개 리소스', fr: 'ressources trouvées' },
  'search.searching': { en: 'Searching...', zh: '搜索中...' , ja: '検索中...', ko: '검색 중...', fr: 'Recherche...' },
  'search.noResults': { en: 'No resources found', zh: '未找到资源' , ja: 'リソースが見つかりません', ko: '리소스를 찾을 수 없습니다', fr: 'Aucune ressource trouvée' },
  // Quick actions
  'action.pasteLink': { en: 'Paste Link', zh: '粘贴链接' , ja: 'リンクを貼り付け', ko: '링크 붙여넣기', fr: 'Coller le lien' },
  'action.uploadTorrent': { en: 'Upload .torrent', zh: '上传种子' , ja: 'Torrentをアップロード', ko: 'Torrent 업로드', fr: 'Uploader .torrent' },
  'action.quickDownload': { en: 'Quick Download', zh: '快速下载' , ja: 'クイックダウンロード', ko: '빠른 다운로드', fr: 'Téléchargement rapide' },
  'action.queue': { en: 'Queue', zh: '队列' , ja: 'キュー', ko: '대기열', fr: "File d'attente" },
  // Table headers
  'table.name': { en: 'NAME', zh: '名称' , ja: '名前', ko: '이름', fr: 'NOM' },
  'table.source': { en: 'SOURCE', zh: '来源' , ja: 'ソース', ko: '소스', fr: 'SOURCE' },
  'table.status': { en: 'STATUS', zh: '状态' , ja: 'ステータス', ko: '상태', fr: 'STATUT' },
  'table.progress': { en: 'PROGRESS', zh: '进度' , ja: '進捗', ko: '진행률', fr: 'PROGRESSION' },
  'table.speed': { en: 'SPEED', zh: '速度' , ja: '速度', ko: '속도', fr: 'VITESSE' },
  'table.size': { en: 'SIZE', zh: '大小' , ja: 'サイズ', ko: '크기', fr: 'TAILLE' },
  'table.eta': { en: 'ETA', zh: '剩余' , ja: '残り時間', ko: '남은 시간', fr: 'TEMPS RESTANT' },
  // Queue
  'queue.title': { en: 'Download Queue', zh: '下载队列' , ja: 'ダウンロードキュー', ko: '다운로드 대기열', fr: 'File de téléchargement' },
  'queue.total': { en: 'Total', zh: '总计' , ja: '合計', ko: '합계', fr: 'Total' },
  'queue.speed': { en: 'Speed', zh: '速度' , ja: '速度', ko: '속도', fr: 'Vitesse' },
  'queue.tasks': { en: 'tasks', zh: '个任务' , ja: 'タスク', ko: '작업', fr: 'tâches' },
  'queue.searchPlaceholder': { en: 'Search downloads...', zh: '搜索下载...' , ja: 'ダウンロードを検索...', ko: '다운로드 검색...', fr: 'Rechercher des téléchargements...' },
  'queue.noTasks': { en: 'No download tasks', zh: '暂无下载任务' , ja: 'ダウンロードタスクなし', ko: '다운로드 작업 없음', fr: 'Aucune tâche de téléchargement' },
  'queue.selected': { en: 'selected', zh: '已选择' , ja: '選択済み', ko: '선택됨', fr: 'sélectionné' },
  'queue.bulkPause': { en: 'Pause Selected', zh: '暂停所选' , ja: '選択を一時停止', ko: '선택 일시정지', fr: 'Mettre en pause la sélection' },
  'queue.bulkResume': { en: 'Resume Selected', zh: '恢复所选' , ja: '選択を再開', ko: '선택 재개', fr: 'Reprendre la sélection' },
  'queue.bulkRemove': { en: 'Remove Selected', zh: '删除所选' , ja: '選択を削除', ko: '선택 삭제', fr: 'Supprimer la sélection' },
  // Settings
  'settings.title': { en: 'Settings', zh: '设置' , ja: '設定', ko: '설정', fr: 'Paramètres' },
  'settings.aiModel': { en: 'AI Model', zh: 'AI 模型' , ja: 'AI モデル', ko: 'AI 모델', fr: 'Modèle IA' },
  'settings.downloads': { en: 'Downloads', zh: '下载设置' , ja: 'ダウンロード設定', ko: '다운로드 설정', fr: 'Téléchargements' },
  'settings.subtitles': { en: 'Subtitles', zh: '字幕设置' , ja: '字幕設定', ko: '자막 설정', fr: 'Sous-titres' },
  'settings.appearance': { en: 'Appearance', zh: '外观' , ja: '外観', ko: '외관', fr: 'Apparence' },
  'settings.advanced': { en: 'Advanced', zh: '高级' , ja: '詳細設定', ko: '고급', fr: 'Avancé' },
  'settings.theme': { en: 'Theme', zh: '主题' , ja: 'テーマ', ko: '테마', fr: 'Thème' },
  'settings.language': { en: 'Language', zh: '语言' , ja: '言語', ko: '언어', fr: 'Langue' },
  'settings.currentModel': { en: 'Current Model', zh: '当前模型' , ja: '現在のモデル', ko: '현재 모델', fr: 'Modèle actuel' },
  'settings.apiKey': { en: 'API Key', zh: 'API 密钥' , ja: 'APIキー', ko: 'API 키', fr: 'Clé API' },
  'settings.downloadDir': { en: 'Default Directory', zh: '默认下载目录' , ja: 'デフォルトディレクトリ', ko: '기본 디렉토리', fr: 'Répertoire par défaut' },
  'settings.maxConcurrent': { en: 'Max Concurrent Downloads', zh: '最大并发下载数' , ja: '最大同時ダウンロード数', ko: '최대 동시 다운로드', fr: 'Téléchargements simultanés max' },
  'settings.downloadSpeed': { en: 'Download Speed Limit (KB/s)', zh: '下载速度限制 (KB/s)' , ja: 'ダウンロード速度制限 (KB/s)', ko: '다운로드 속도 제한 (KB/s)', fr: 'Limite de téléchargement (KB/s)' },
  'settings.uploadSpeed': { en: 'Upload Speed Limit (KB/s)', zh: '上传速度限制 (KB/s)' , ja: 'アップロード速度制限 (KB/s)', ko: '업로드 속도 제한 (KB/s)', fr: "Limite d'upload (KB/s)" },
  'settings.unlimited': { en: 'Unlimited', zh: '无限制' , ja: '無制限', ko: '무제한', fr: 'Illimité' },
  'settings.autoRetry': { en: 'Auto-retry on failure', zh: '失败自动重试' , ja: '失敗時に自動再試行', ko: '실패 시 자동 재시도', fr: 'Réessayer automatiquement' },
  'settings.maxRetries': { en: 'Max retries', zh: '最大重试次数' , ja: '最大再試行回数', ko: '최대 재시도 횟수', fr: 'Tentatives max' },
  'settings.subtitleApiKey': { en: 'OpenSubtitles API Key', zh: 'OpenSubtitles API 密钥' , ja: 'OpenSubtitles APIキー', ko: 'OpenSubtitles API 키', fr: 'Clé API OpenSubtitles' },
  'settings.subtitleLangs': { en: 'Preferred Languages', zh: '首选字幕语言' , ja: '優先言語', ko: '선호 언어', fr: 'Langues préférées' },
  'settings.autoSubtitle': { en: 'Auto-search subtitles', zh: '自动搜索字幕' , ja: '字幕を自動検索', ko: '자막 자동 검색', fr: 'Rechercher automatiquement' },
  'settings.subtitleDir': { en: 'Subtitle Directory', zh: '字幕保存目录' , ja: '字幕保存先', ko: '자막 저장 경로', fr: 'Répertoire des sous-titres' },
  'settings.dark': { en: 'Dark', zh: '深色' , ja: 'ダーク', ko: '다크', fr: 'Sombre' },
  'settings.light': { en: 'Light', zh: '浅色' , ja: 'ライト', ko: '라이트', fr: 'Clair' },
  'settings.system': { en: 'System', zh: '跟随系统' , ja: 'システム', ko: '시스템', fr: 'Système' },
  'settings.rpcUrl': { en: 'aria2 RPC URL', zh: 'aria2 RPC 地址' , ja: 'RPC URL', ko: 'RPC URL', fr: 'URL RPC' },
  'settings.rpcSecret': { en: 'aria2 RPC Secret', zh: 'aria2 RPC 密钥' , ja: 'RPC シークレット', ko: 'RPC 시크릿', fr: 'Secret RPC' },
  'settings.logLevel': { en: 'Log Level', zh: '日志级别' , ja: 'ログレベル', ko: '로그 레벨', fr: 'Niveau de journal' },
  'settings.dangerZone': { en: 'Danger Zone', zh: '危险操作' , ja: '危険ゾーン', ko: '위험 영역', fr: 'Zone de danger' },
  'settings.clearHistory': { en: 'Clear Download History', zh: '清除下载历史' , ja: '履歴をクリア', ko: '기록 지우기', fr: "Effacer l'historique" },
  // Messages
  'msg.added': { en: 'Added', zh: '已添加' , ja: '追加しました', ko: '추가됨', fr: 'Ajouté' },
  'msg.addFailed': { en: 'Add failed', zh: '添加失败' , ja: '追加失敗', ko: '추가 실패', fr: "Échec de l'ajout" },
  'msg.addDownloadFailed': { en: 'Failed to add download', zh: '添加下载失败' , ja: 'ダウンロード追加失敗', ko: '다운로드 추가 실패', fr: "Échec de l'ajout du téléchargement" },
  'msg.unknownError': { en: 'Unknown error', zh: '未知错误' , ja: '不明なエラー', ko: '알 수 없는 오류', fr: 'Erreur inconnue' },
  'msg.aria2NotConnected': { en: 'aria2 not connected, added to local list', zh: 'aria2 未连接，已添加到本地列表' , ja: 'aria2未接続', ko: 'aria2 미연결', fr: 'aria2 non connecté' },
  'msg.noFilePath': { en: 'No file path available', zh: '没有文件路径' , ja: 'ファイルパスなし', ko: '파일 경로 없음', fr: 'Aucun chemin de fichier' },
  'msg.pathCopied': { en: 'Path copied', zh: '路径已复制' , ja: 'パスをコピーしました', ko: '경로 복사됨', fr: 'Chemin copié' },
  'msg.fileLocation': { en: 'File location', zh: '文件位置' , ja: 'ファイルの場所', ko: '파일 위치', fr: 'Emplacement du fichier' },
  'msg.clipboardReadFailed': { en: 'Cannot read clipboard', zh: '无法读取剪贴板' , ja: 'クリップボード読み取り失敗', ko: '클립보드 읽기 실패', fr: 'Échec de lecture du presse-papiers' },
  'msg.downloadComplete': { en: '✅ Download complete', zh: '✅ 下载完成' , ja: 'ダウンロード完了', ko: '다운로드 완료', fr: 'Téléchargement terminé' },
  'msg.organized': { en: 'Organized', zh: '已整理' , ja: '整理しました', ko: '정리됨', fr: 'Organisé' },
  'msg.recognized': { en: 'Recognized', zh: '识别' , ja: '認識しました', ko: '인식됨', fr: 'Reconnu' },
  'msg.auto': { en: 'auto', zh: '自动' , ja: '自動', ko: '자동', fr: 'Auto' },
  'msg.subtitle': { en: 'subtitle', zh: '字幕' , ja: '字幕', ko: '자막', fr: 'Sous-titre' },
  'msg.searchFailed': { en: 'Search failed, please retry', zh: '搜索失败，请重试' , ja: '検索失敗', ko: '검색 실패', fr: 'Échec de la recherche' },
  'msg.subtitleSearching': { en: 'Searching subtitles...', zh: '正在搜索字幕...' , ja: '字幕を検索中...', ko: '자막 검색 중...', fr: 'Recherche de sous-titres...' },
  'msg.subtitleFound': { en: 'Subtitle found', zh: '找到字幕' , ja: '字幕が見つかりました', ko: '자막을 찾았습니다', fr: 'Sous-titres trouvés' },
  'msg.subtitleNotFound': { en: 'No subtitles found', zh: '未找到匹配字幕' , ja: '字幕が見つかりません', ko: '자막을 찾을 수 없습니다', fr: 'Aucun sous-titre trouvé' },
  'msg.subtitleDownload': { en: 'Downloading subtitle', zh: '下载字幕' , ja: '字幕ダウンロード', ko: '자막 다운로드', fr: 'Téléchargement de sous-titres' },
  'msg.subtitleDownloadFailed': { en: 'Subtitle download failed', zh: '字幕下载失败' , ja: '字幕ダウンロード失敗', ko: '자막 다운로드 실패', fr: 'Échec du téléchargement' },
  'msg.parsing': { en: 'Parsing...', zh: '解析中...' , ja: '解析中...', ko: '분석 중...', fr: 'Analyse...' },
  'msg.settingsSaved': { en: 'Settings saved', zh: '设置已保存' , ja: '設定を保存しました', ko: '설정 저장됨', fr: 'Paramètres enregistrés' },
}

export function t(key: string): string {
  return strings[key]?.[language.value] ?? key
}

// ---- Apply on load ----
applyThemeVars(isDark.value)
watch(isDark, (dark) => applyThemeVars(dark))
