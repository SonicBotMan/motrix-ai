// src/composables/useTauri.ts
// Tauri-specific file operations and system integration

import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { createLogger } from '@motrix-ai/core/browser'
const logger = createLogger('tauri')

declare global {
  interface Window {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
}

export function useTauri() {
  const downloadPath = ref<string>('')
  const isTauri = ref(false)

  const checkTauri = () => {
    isTauri.value =
      typeof window !== 'undefined' && (window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined)
  }

  /**
   * Get the default download path from Tauri.
   */
  const getDownloadPath = async (): Promise<string> => {
    if (!isTauri.value) {
      return '~/Downloads/Motrix AI'
    }

    try {
      const path = await invoke<string>('get_download_path')
      downloadPath.value = path
      return path
    } catch (e) {
      logger.error('Failed to get download path:', e)
      return '~/Downloads/Motrix AI'
    }
  }

  /**
   * Save file to disk using Tauri.
   */
  const saveFile = async (path: string, content: Uint8Array): Promise<string> => {
    if (!isTauri.value) {
      // Fallback: create download link
      const blob = new Blob([content as unknown as BlobPart])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split('/').pop() || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return path
    }

    try {
      const result = await invoke<string>('save_file', {
        path,
        content: Array.from(content),
      })
      return result
    } catch (e) {
      logger.error('Failed to save file:', e)
      throw e
    }
  }

  /**
   * Download subtitle from URL and save to disk.
   */
  const downloadSubtitle = async (url: string, savePath: string): Promise<string> => {
    if (!isTauri.value) {
      // Fallback: fetch and create download link
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = savePath.split('/').pop() || 'subtitle.srt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      return savePath
    }

    try {
      const result = await invoke<string>('download_subtitle', {
        url,
        savePath,
      })
      return result
    } catch (e) {
      logger.error('Failed to download subtitle:', e)
      throw e
    }
  }

  /**
   * Open file in system file manager.
   */
  const openInFileManager = async (path: string): Promise<void> => {
    if (!isTauri.value) {
      logger.warn('Not in Tauri environment, cannot open:', path)
      return
    }

    try {
      // Use shell plugin to open file location
      const { Command } = await import('@tauri-apps/plugin-shell')
      const dir = path.substring(0, path.lastIndexOf('/'))
      await Command.create('open', [dir]).execute()
    } catch (e) {
      logger.error('Failed to open file manager:', e)
    }
  }

  /**
   * Get system information.
   */
  const getSystemInfo = async () => {
    if (!isTauri.value) {
      return {
        os: 'unknown',
        arch: 'unknown',
        version: 'unknown',
      }
    }

    try {
      const os = await import('@tauri-apps/plugin-os')
      return {
        os: await os.platform(),
        arch: await os.arch(),
        version: await os.version(),
      }
    } catch (e) {
      logger.error('Failed to get system info:', e)
      return {
        os: 'unknown',
        arch: 'unknown',
        version: 'unknown',
      }
    }
  }

  // Initialize
  onMounted(() => {
    checkTauri()
    if (isTauri.value) {
      getDownloadPath()
    }
  })

  return {
    downloadPath,
    isTauri,
    getDownloadPath,
    saveFile,
    downloadSubtitle,
    openInFileManager,
    getSystemInfo,
  }
}
