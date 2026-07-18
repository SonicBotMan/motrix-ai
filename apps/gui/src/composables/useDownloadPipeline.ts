import { ref, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { KeywordGenerator, ResultEvaluator } from '@motrix-ai/core/browser'
import { useToastStore } from '@/stores/toasts'
import { useTasksStore } from '@/stores/tasks'
import { useOpenCode } from '@/composables/useOpenCode'
import type { SearchResult } from '@/composables/useSearch'

interface UseDownloadPipelineDeps {
  activeFilter: Ref<string>
  bottomChatRef: Ref<{ focus: () => void } | null>
}

export function useDownloadPipeline({ activeFilter, bottomChatRef }: UseDownloadPipelineDeps) {
  const tasksStore = useTasksStore()
  const openCode = useOpenCode()
  const { addToast, generateToastId } = useToastStore()

  // Search state
  const showSearchResults = ref(false)
  const searchResults = ref<SearchResult[]>([])
  const searching = ref(false)
  const searchQuery = ref('')
  const pendingIntent = ref<{ title?: string; year?: number; quality?: string; resource_type?: string } | null>(null)

  // Internal instances
  const keywordGen = new KeywordGenerator()
  const evaluator = new ResultEvaluator()

  /**
   * Add a URI (HTTP/HTTPS/FTP/magnet) to the running aria2 daemon via JSON-RPC.
   * aria2.addUri accepts magnet URIs as well as regular HTTP URLs.
   * Routes through the tasks store so a local placeholder appears in the
   * table immediately (the store picks up the real aria2 task on next poll).
   * @returns the aria2 GID string on success
   */
  async function aria2AddUri(
    uri: string,
    intent?: { title?: string; year?: number; quality?: string; resource_type?: string },
  ): Promise<void> {
    try {
      await tasksStore.addTask(
        uri,
        undefined,
        intent
          ? {
              title: intent.title,
              year: intent.year,
              quality: intent.quality,
              resourceType: intent.resource_type,
            }
          : undefined,
      )
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
    }
  }

  /**
   * Handle a chat input submission.
   * - magnet:? → aria2.addUri (treated as torrent)
   * - http(s)/ftp → aria2.addUri (direct download)
   * - otherwise → parse as natural-language intent via Tauri command
   */
  async function handleSendMessage(message: string): Promise<void> {
    if (!message.trim()) return

    const lines = message
      .trim()
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length > 1) {
      addToast({
        id: generateToastId(),
        type: 'info',
        text: `Adding ${lines.length} downloads…`,
        createdAt: Date.now(),
      })
      let succeeded = 0
      let failed = 0
      for (const line of lines) {
        if (/^(magnet:|ed2k:\/\/|https?:\/\/|ftp:\/\/)/i.test(line)) {
          try {
            await aria2AddUri(line)
            succeeded++
          } catch {
            failed++
          }
        }
      }
      addToast({
        id: generateToastId(),
        type: failed > 0 ? 'error' : 'success',
        text:
          failed > 0 ? `Batch: ${succeeded} added, ${failed} failed` : `Batch complete: ${succeeded} downloads added`,
        createdAt: Date.now(),
      })
      return
    }

    const trimmed = lines[0]

    // --- Magnet link → torrent download ---
    if (trimmed.startsWith('magnet:')) {
      addToast({ id: generateToastId(), type: 'info', text: 'Adding magnet link…', createdAt: Date.now() })
      try {
        await aria2AddUri(trimmed)
        addToast({
          id: generateToastId(),
          type: 'success',
          text: 'Magnet added to queue',
          createdAt: Date.now(),
        })
      } catch (err) {
        addToast({ id: generateToastId(), type: 'error', text: `Add failed: ${String(err)}`, createdAt: Date.now() })
      }
      return
    }

    // --- HTTP / HTTPS / FTP URL → direct download ---
    if (/^(https?|ftp):\/\//i.test(trimmed)) {
      addToast({ id: generateToastId(), type: 'info', text: 'Adding download…', createdAt: Date.now() })
      try {
        await aria2AddUri(trimmed)
        addToast({
          id: generateToastId(),
          type: 'success',
          text: 'Download added to queue',
          createdAt: Date.now(),
        })
      } catch (err) {
        addToast({ id: generateToastId(), type: 'error', text: `Add failed: ${String(err)}`, createdAt: Date.now() })
      }
      return
    }

    // --- Natural language → parse intent → search → show results ---
    addToast({ id: generateToastId(), type: 'info', text: `Searching: "${trimmed}"…`, createdAt: Date.now() })
    try {
      const intent = await invoke<{
        title: string
        resource_type: string
        search_keywords: string[]
        quality: string
        year?: number
      }>('parse_nl_intent', { input: trimmed, llmConfig: openCode.getLLMConfig() })

      pendingIntent.value = intent
      const expandedKeywords = keywordGen.generate({
        title: intent.title,
        resource_type: intent.resource_type as 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other',
        year: intent.year,
        quality: intent.quality as '4K' | '1080p' | '720p' | 'other',
        need_subtitle: false,
        search_keywords: intent.search_keywords,
      })
      searchQuery.value = expandedKeywords[0] || intent.search_keywords[0] || intent.title
      searching.value = true
      showSearchResults.value = true
      searchResults.value = []

      try {
        const SEARCH_SOURCES = ['btdig', '1337x', 'nyaa', 'mikan'] as const
        const responses = await Promise.allSettled(
          SEARCH_SOURCES.map((source) =>
            invoke<{ results: SearchResult[]; total: number; source: string }>('search_proxy', {
              query: searchQuery.value,
              source,
              page: 0,
            }),
          ),
        )
        const allResults: SearchResult[] = []
        const seenHashes = new Set<string>()
        for (const r of responses) {
          if (r.status === 'fulfilled') {
            for (const result of r.value.results ?? []) {
              const hash = result.magnet.match(/btih:([a-zA-Z0-9]+)/i)?.[1]
              const key = hash || result.magnet || `${result.title}_${result.size}`
              if (key && !seenHashes.has(key)) {
                seenHashes.add(key)
                allResults.push(result)
              }
            }
          }
        }
        const ranked = evaluator.evaluate(allResults, {
          title: intent.title,
          resource_type: intent.resource_type as 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other',
          year: intent.year,
          quality: intent.quality as '4K' | '1080p' | '720p' | 'other',
          need_subtitle: false,
          search_keywords: expandedKeywords,
        })
        searchResults.value = ranked
        if (searchResults.value.length === 0) {
          addToast({
            id: generateToastId(),
            type: 'info',
            text: `No results for "${intent.title}"`,
            createdAt: Date.now(),
          })
          showSearchResults.value = false
        }
      } catch (searchErr) {
        addToast({
          id: generateToastId(),
          type: 'error',
          text: `Search failed: ${String(searchErr).slice(0, 60)}`,
          createdAt: Date.now(),
        })
        showSearchResults.value = false
      } finally {
        searching.value = false
      }
    } catch {
      addToast({
        id: generateToastId(),
        type: 'info',
        text: 'Hint: paste a magnet link or HTTP URL to download directly',
        createdAt: Date.now(),
      })
    }
  }

  async function handleSelectSearchResult(result: SearchResult): Promise<void> {
    showSearchResults.value = false
    if (result.magnet) {
      addToast({
        id: generateToastId(),
        type: 'info',
        text: `Adding: ${result.title.slice(0, 40)}…`,
        createdAt: Date.now(),
      })
      try {
        await aria2AddUri(result.magnet, pendingIntent.value || undefined)
        addToast({
          id: generateToastId(),
          type: 'success',
          text: `Downloading: ${result.title.slice(0, 40)}`,
          createdAt: Date.now(),
        })
      } catch (err) {
        addToast({
          id: generateToastId(),
          type: 'error',
          text: `Add failed: ${String(err).slice(0, 60)}`,
          createdAt: Date.now(),
        })
      }
      pendingIntent.value = null
    } else {
      addToast({ id: generateToastId(), type: 'error', text: 'No magnet link for this result', createdAt: Date.now() })
    }
  }

  /**
   * Quick action chips bypass the NL intent parser and instead drive the
   * filter / aria2 directly. Each label maps to exactly one action; we do
   * NOT forward the label through `handleSendMessage` (that would mislead
   * the user into thinking "Pause all" parses as natural language).
   */
  function handleQuickAction(index: number): void {
    switch (index) {
      case 0: // Download Ubuntu 24.04 LTS ISO
        handleSendMessage(
          'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b51d5c4ea&dn=ubuntu-24.04.2-desktop-amd64.iso&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce&tr=https%3A%2F%2Fipv6.torrent.ubuntu.com%2Fannounce',
        )
        return
      case 1: // What is downloading?  → switch to Active filter
        activeFilter.value = 'active'
        addToast({ id: generateToastId(), type: 'info', text: 'Showing active downloads', createdAt: Date.now() })
        return
      case 2: // Pause all
        pauseAllTasks()
        return
      case 3: // Show completed  → switch to Completed filter
        activeFilter.value = 'completed'
        addToast({ id: generateToastId(), type: 'info', text: 'Showing completed downloads', createdAt: Date.now() })
        return
      case 4: // Add magnet URL → focus the bottom chat input
        bottomChatRef.value?.focus()
        addToast({
          id: generateToastId(),
          type: 'info',
          text: 'Paste a magnet or URL in the input below',
          createdAt: Date.now(),
        })
        return
    }
  }

  async function pauseAllTasks(): Promise<void> {
    try {
      await invoke('pause_all')
      void tasksStore.refreshTasks()
      addToast({ id: generateToastId(), type: 'success', text: 'Paused all downloads', createdAt: Date.now() })
    } catch (err) {
      addToast({
        id: generateToastId(),
        type: 'error',
        text: `Pause all failed: ${String(err)}`,
        createdAt: Date.now(),
      })
    }
  }

  /**
   * Open a native file dialog to select a .torrent file, then add it to aria2
   * via the Rust command `add_torrent_file` (which reads the file server-side
   * and calls aria2.addTorrent). This avoids asset-protocol hassles in Tauri 2.
   */
  async function handleAttach(): Promise<void> {
    let selected: string | null = null
    try {
      const result = await openDialog({
        multiple: false,
        filters: [{ name: 'Torrent & Metalink', extensions: ['torrent', 'metalink', 'meta4'] }],
      })
      if (typeof result === 'string') {
        selected = result
      }
    } catch (err) {
      addToast({
        id: generateToastId(),
        type: 'error',
        text: `Could not open file: ${String(err)}`,
        createdAt: Date.now(),
      })
      return
    }
    if (!selected) return

    const fileName = selected.split('/').pop() || selected
    const isMetalink = /\.(metalink|meta4)$/i.test(selected)
    addToast({ id: generateToastId(), type: 'info', text: `Loading ${fileName}...`, createdAt: Date.now() })

    try {
      if (isMetalink) {
        await invoke('add_metalink_file', { path: selected })
      } else {
        const gid = await invoke<string>('add_torrent_file', { path: selected })
        void tasksStore.refreshTasks()
        addToast({
          id: generateToastId(),
          type: 'success',
          text: isMetalink ? 'Metalink added' : `Torrent added: ${String(gid).slice(0, 8)}`,
          createdAt: Date.now(),
        })
      }
    } catch (err) {
      addToast({
        id: generateToastId(),
        type: 'error',
        text: `Could not add file: ${String(err)}`,
        createdAt: Date.now(),
      })
    }
  }

  function closeSearchResults(): void {
    showSearchResults.value = false
  }

  return {
    showSearchResults,
    searchResults,
    searching,
    searchQuery,
    handleSendMessage,
    handleSelectSearchResult,
    handleQuickAction,
    handleAttach,
    closeSearchResults,
  }
}
