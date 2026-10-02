const FACEBOOK_URL = /^https:\/\/(?:[^/]+\.)?(?:facebook\.com|fb\.watch)\//i

function normalizeReelUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    const match = url.pathname.match(/^\/reel\/(\d+)(?:\/|$)/i)
    return /(^|\.)facebook\.com$/i.test(url.hostname) && match
      ? `https://www.facebook.com/reel/${match[1]}`
      : ''
  } catch {
    return ''
  }
}

async function resolveWithFacebookSession(value) {
  try {
    const response = await fetch(value, { credentials: 'include', redirect: 'follow', cache: 'no-store' })
    return normalizeReelUrl(response.url)
  } catch {
    return ''
  }
}

async function waitForResolvedTabUrl(tabId, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    const resolved = normalizeReelUrl(tab?.url)
    if (resolved) return resolved
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return ''
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'CAPTURE_FACEBOOK') return false
  if (typeof message.url !== 'string' || !FACEBOOK_URL.test(message.url)) {
    sendResponse({ ok: false, error: 'Only Facebook URLs are supported.' })
    return false
  }
  ;(async () => {
    let tabId
    const returnTabId = sender.tab?.id
    try {
      const sessionResolvedUrl = await resolveWithFacebookSession(message.url)
      // Facebook often defers video media in background tabs. Briefly activating the
      // page lets its normal player resolve the signed CDN URL without exporting cookies.
      const tab = await chrome.tabs.create({ url: sessionResolvedUrl || message.url, active: true })
      tabId = tab.id
      if (!tabId) throw new Error('Could not open the Facebook page.')
      const tabResolvedUrl = await waitForResolvedTabUrl(tabId)
      const result = await sendToTab(tabId, { type: 'EXTRACT_FACEBOOK' })
      const canonicalUrl = normalizeReelUrl(result?.canonicalUrl) || tabResolvedUrl || sessionResolvedUrl
      if (canonicalUrl) {
        sendResponse({ ...result, ok: true, canonicalUrl })
      } else {
        sendResponse(result)
      }
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Facebook capture failed.' })
    } finally {
      if (tabId) chrome.tabs.remove(tabId).catch(() => {})
      if (returnTabId) chrome.tabs.update(returnTabId, { active: true }).catch(() => {})
    }
  })()
  return true
})
