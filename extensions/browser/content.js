// Motrix AI — Content Script
// Scans the page for magnet links, ed2k links, and video sources,
// then injects a "Motrix AI" download button next to each one.

;(function () {
  /**
   * Observe DOM mutations so dynamically added links also get buttons.
   */
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          findDownloadLinks(node)
        }
      })
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })

  /**
   * Find supported download links inside the given root element and attach
   * download buttons.
   *
   * @param {ParentNode} root - Element or document to scan.
   */
  function findDownloadLinks(root) {
    // Magnet links
    const links = root.querySelectorAll('a[href^="magnet:"]')
    links.forEach((link) => {
      if (!link.dataset.motrixProcessed) {
        link.dataset.motrixProcessed = 'true'
        addDownloadButton(link, link.href, 'Magnet')
      }
    })

    // ed2k links
    const ed2kLinks = root.querySelectorAll('a[href^="ed2k://"]')
    ed2kLinks.forEach((link) => {
      if (!link.dataset.motrixProcessed) {
        link.dataset.motrixProcessed = 'true'
        addDownloadButton(link, link.href, 'ed2k')
      }
    })

    // Video sources
    const videos = root.querySelectorAll('video[src], video source[src]')
    videos.forEach((video) => {
      const src = video.src || video.querySelector('source')?.src
      if (src && !video.dataset.motrixProcessed) {
        video.dataset.motrixProcessed = 'true'
        addDownloadButton(video, src, 'Video')
      }
    })
  }

  /**
   * Inject a "Motrix AI" download button immediately after the given element.
   *
   * @param {HTMLElement} element - Element to place the button next to.
   * @param {string}      url     - Download URL.
   * @param {string}      type    - Link type label (Magnet, ed2k, Video).
   */
  function addDownloadButton(element, url, type) {
    const btn = document.createElement('button')
    btn.textContent = '⬇ Motrix AI'
    btn.style.cssText = `
      margin-left: 8px;
      padding: 2px 8px;
      background: #3B82F6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `
    btn.title = 'Download ' + type + ' with Motrix AI'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      chrome.runtime.sendMessage({ type: 'DOWNLOAD', url, title: document.title })
    })
    element.parentNode?.insertBefore(btn, element.nextSibling)
  }

  // Initial scan
  findDownloadLinks(document.body)
})()
