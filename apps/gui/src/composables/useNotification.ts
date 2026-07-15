// src/composables/useNotification.ts
// Desktop notification composable wrapping Tauri notification commands.

import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { createLogger } from '@motrix-ai/core/browser'
const logger = createLogger('notification')

export function useNotification() {
  /** Current notification permission status. */
  const permission = ref<'default' | 'granted' | 'denied'>('default')

  /**
   * Request permission to display notifications.
   * @returns `true` if permission was granted, `false` otherwise.
   */
  async function requestPermission(): Promise<boolean> {
    try {
      const result = await invoke<string>('request_notification_permission')
      permission.value = result as typeof permission.value
      return result === 'granted'
    } catch (e) {
      logger.error('Failed to request notification permission:', e)
      return false
    }
  }

  /**
   * Send a desktop notification.
   * @param title - Notification title.
   * @param body - Optional notification body text.
   */
  async function sendNotification(title: string, body?: string): Promise<void> {
    try {
      await invoke('send_notification', { title, body })
    } catch (e) {
      logger.error('Failed to send notification:', e)
    }
  }

  return {
    permission,
    requestPermission,
    sendNotification,
  }
}
