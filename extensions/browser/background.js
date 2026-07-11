// Motrix AI — Background Service Worker
// Handles context-menu clicks, message routing, and desktop-app communication.

const MOTRIX_API = 'http://127.0.0.1:18900'
const TOKEN_CACHE_KEY = 'motrixToken'

/**
 * Create the context-menu entry when the extension is installed or updated.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'motrix-ai-download',
    title: 'Download with Motrix AI',
    contexts: ['link', 'video', 'audio']
  })
})

/**
 * Route context-menu clicks.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'motrix-ai-download') {
    const url = info.linkUrl || info.srcUrl
    if (url) {
      sendToMotrixAI(url, tab?.title || '')
    }
  }
})

/**
 * Fetch (and session-cache) the HTTP API token from the desktop app.
 * The app exposes the session token on GET / while requiring it on POST.
 */
async function getMotrixToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await chrome.storage.session.get(TOKEN_CACHE_KEY)
    if (cached[TOKEN_CACHE_KEY]) return cached[TOKEN_CACHE_KEY]
  }

  const res = await fetch(`${MOTRIX_API}/`)
  if (!res.ok) throw new Error(`token endpoint ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error('token missing')
  await chrome.storage.session.set({ [TOKEN_CACHE_KEY]: data.token })
  return data.token
}

/**
 * POST a download URL with X-Motrix-Token. On 403, refresh token once.
 */
async function postDownload(url, title, token) {
  return fetch(`${MOTRIX_API}/api/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Motrix-Token': token
    },
    body: JSON.stringify({ url, title })
  })
}

/**
 * Send a URL to the Motrix AI desktop app.
 *
 * Strategy:
 * 1. Fetch session token, then POST to the local HTTP API (port 18900).
 * 2. If that fails, copy the URL to clipboard and notify the user.
 *
 * @param {string} url   - The resource URL to download.
 * @param {string} title - Optional human-readable title / filename hint.
 */
async function sendToMotrixAI(url, title) {
  try {
    let token = await getMotrixToken()
    let response = await postDownload(url, title, token)

    // Secret rotates when the desktop app restarts — refresh once.
    if (response.status === 403) {
      await chrome.storage.session.remove(TOKEN_CACHE_KEY)
      token = await getMotrixToken({ forceRefresh: true })
      response = await postDownload(url, title, token)
    }

    if (response.ok) {
      const pending = response.status === 202
      showNotification(
        pending ? 'Confirm in Motrix AI' : 'Added to Motrix AI',
        title || url
      )
      return
    }
  } catch {
    // Desktop app not running or not reachable — fall through to clipboard.
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url)
    showNotification('Copied URL', 'Paste in Motrix AI')
  } catch {
    showNotification('Motrix AI', 'Could not connect to desktop app or copy URL.')
  }
}

/**
 * Show a simple notification to the user.
 *
 * @param {string} title - Notification title.
 * @param {string} body  - Notification body text.
 */
function showNotification(title, body) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message: body
  })
}

/**
 * Listen for messages from content scripts and popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD') {
    sendToMotrixAI(message.url, message.title || '')
    sendResponse({ success: true })
  }
})
