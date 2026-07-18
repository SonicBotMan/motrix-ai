import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Toast } from '@/components/toast/ToastStack.vue'

const TOAST_LIFETIME = 2000
const TOAST_STACK_MAX = 4
const TOAST_EXIT_DELAY = 300

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])
  let toastCounter = 0

  function generateToastId(): string {
    toastCounter += 1
    return `toast-${Date.now()}-${toastCounter}`
  }

  function addToast(toast: Toast): void {
    toasts.value.push(toast)
    while (toasts.value.length > TOAST_STACK_MAX) {
      const oldestDone = toasts.value.findIndex((t) => !t.exiting)
      if (oldestDone !== -1) {
        toasts.value.splice(oldestDone, 1)
      } else {
        toasts.value.shift()
      }
    }
    setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME)
  }

  function dismissToast(id: string): void {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    toasts.value[idx].exiting = true
    setTimeout(() => {
      const i = toasts.value.findIndex((t) => t.id === id)
      if (i !== -1) toasts.value.splice(i, 1)
    }, TOAST_EXIT_DELAY)
  }

  return { toasts, addToast, dismissToast, generateToastId }
})
