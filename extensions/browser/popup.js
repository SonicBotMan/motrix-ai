// Motrix AI — Popup Script
// Handles the popup UI: send URL to desktop app, clipboard fallback,
// and auto-fill from the active tab.

document.getElementById('download').addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim()
  if (!url) return

  const status = document.getElementById('status')
  try {
    const response = await fetch('http://127.0.0.1:18900/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title: '' })
    })

    if (response.ok) {
      status.textContent = '✅ Added to download queue'
      status.className = 'status success'
      document.getElementById('url').value = ''
    } else {
      throw new Error('Failed')
    }
  } catch {
    // Copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(url)
      status.textContent = '📋 Copied! Paste in Motrix AI app'
      status.className = 'status success'
    } catch {
      status.textContent = '⚠️ Could not connect or copy URL'
      status.className = 'status error'
    }
  }
})

// Auto-fill from current tab if it looks like a download URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].url) {
    const url = tabs[0].url
    if (
      url.startsWith('magnet:') ||
      url.startsWith('ed2k://') ||
      url.match(/\.(torrent|mp4|mkv|avi|zip|rar)$/i)
    ) {
      document.getElementById('url').value = url
    }
  }
})
