// Motrix AI — Popup Script
// Handles the popup UI: send URL to desktop app, clipboard fallback,
// and auto-fill from the active tab.

const MOTRIX_API = 'http://127.0.0.1:18900'

async function getMotrixToken() {
  const res = await fetch(`${MOTRIX_API}/`)
  if (!res.ok) throw new Error(`token endpoint ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error('token missing')
  return data.token
}

document.getElementById('download').addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim()
  if (!url) return

  const status = document.getElementById('status')
  try {
    const token = await getMotrixToken()
    const response = await fetch(`${MOTRIX_API}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Motrix-Token': token
      },
      body: JSON.stringify({ url, title: '' })
    })

    if (response.ok) {
      status.textContent =
        response.status === 202
          ? 'Confirm the download in Motrix AI'
          : 'Added to download queue'
      status.className = 'status success'
      document.getElementById('url').value = ''
    } else {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch {
    // Copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(url)
      status.textContent = 'Copied! Paste in Motrix AI app'
      status.className = 'status success'
    } catch {
      status.textContent = 'Could not connect or copy URL'
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
