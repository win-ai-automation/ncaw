const FACEBOOK_URL = /^https:\/\/(?:[^/]+\.)?(?:facebook\.com|fb\.watch)\//i

function sendToTab(tabId, message, attempts = 8) {
  return new Promise((resolve) => {
    const run = (remaining) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (!chrome.runtime.lastError && response) return resolve(response)
        if (remaining <= 1) return resolve({ ok: false, error: 'Facebook page did not become ready.' })
        setTimeout(() => run(remaining - 1), 750)
      })
    }
    run(attempts)
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CAPTURE_FACEBOOK') return false
  if (typeof message.url !== 'string' || !FACEBOOK_URL.test(message.url)) {
    sendResponse({ ok: false, error: 'Only Facebook URLs are supported.' })
    return false
  }
  ;(async () => {
    let tabId
    try {
      const tab = await chrome.tabs.create({ url: message.url, active: false })
      tabId = tab.id
      if (!tabId) throw new Error('Could not open the Facebook page.')
      const result = await sendToTab(tabId, { type: 'EXTRACT_FACEBOOK' })
      sendResponse(result)
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Facebook capture failed.' })
    } finally {
      if (tabId) chrome.tabs.remove(tabId).catch(() => {})
    }
  })()
  return true
})
