// Motrix AI — Background Service Worker
// Handles context-menu clicks, message routing, and desktop-app communication.

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
 * Send a URL to the Motrix AI desktop app.
 *
 * Strategy:
 * 1. POST to the local HTTP API (default port 18900).
 * 2. If that fails, copy the URL to clipboard and notify the user.
 *
 * @param {string} url   - The resource URL to download.
 * @param {string} title - Optional human-readable title / filename hint.
 */
async function sendToMotrixAI(url, title) {
  try {
    // Try local HTTP API first
    const response = await fetch('http://127.0.0.1:18900/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title })
    })
    if (response.ok) {
      showNotification('Added to Motrix AI', title || url)
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
    sendToMotrixAI(message.url, message.title)
    sendResponse({ success: true })
  }
})
