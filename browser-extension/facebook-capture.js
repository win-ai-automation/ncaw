function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeReelUrl(value) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const parsed = new URL(value, window.location.origin)
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return ''
    const match = parsed.pathname.match(/^\/reel\/(\d+)(?:\/|$)/i)
    return match ? `https://www.facebook.com/reel/${match[1]}` : ''
  } catch {
    return ''
  }
}

function resolvedReelUrl() {
  const candidates = [
    window.location.href,
    document.querySelector('link[rel="canonical"]')?.href,
    document.querySelector('meta[property="og:url"]')?.content,
  ]
  for (const anchor of document.querySelectorAll('a[href*="/reel/"]')) candidates.push(anchor.href)
  for (const candidate of candidates) {
    const normalized = normalizeReelUrl(candidate)
    if (normalized) return normalized
  }
  const htmlMatch = document.documentElement.innerHTML.match(/(?:https?:\\?\/\\?\/(?:www\\?\.)?facebook\\?\.com)?\\?\/reel\\?\/(\d{6,})/i)
  return htmlMatch ? `https://www.facebook.com/reel/${htmlMatch[1]}` : ''
}

function isUsableMediaUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (/\.(?:jpe?g|png|gif|webp|avif)(?:$|\?)/i.test(url.pathname) || /(?:^|[?&])stp=dst-(?:jpe?g|png|webp)/i.test(url.search)) return false
    if (host.startsWith('scontent.') || host.includes('.scontent.')) return false
    const trustedHost = host === 'fbcdn.net' || host.endsWith('.fbcdn.net') || host === 'facebook.com' || host.endsWith('.facebook.com')
    const looksLikeVideo = host.startsWith('video.') || host.includes('.video.') || /\.mp4(?:$|\?)/i.test(url.pathname) || /\/video\//i.test(url.pathname)
    return trustedHost && looksLikeVideo
  } catch {
    return false
  }
}

function mediaCandidates() {
  const candidates = []
  for (const video of document.querySelectorAll('video')) {
    candidates.push(video.currentSrc, video.src, video.querySelector('source')?.src)
  }
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.initiatorType === 'video' || /\.mp4(?:\?|$)|\/video\//i.test(entry.name)) candidates.push(entry.name)
  }
  return [...new Set(candidates.filter(isUsableMediaUrl))]
}

function extractCaption() {
  const selectors = [
    '[data-ad-preview="message"]',
    '[data-ad-comet-preview="message"]',
    '[role="main"] [dir="auto"]',
    'article [dir="auto"]',
  ]
  const chunks = []
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const text = element.textContent?.replace(/\s+/g, ' ').trim()
      if (text && text.length >= 20 && text.length <= 10000) chunks.push(text)
    }
    if (chunks.length) break
  }
  return [...new Set(chunks)].join('\n\n').slice(0, 100000)
}

async function extractFacebook() {
  let canonicalUrl = ''
  for (let attempt = 0; attempt < 28; attempt += 1) {
    canonicalUrl = resolvedReelUrl() || canonicalUrl
    const candidates = mediaCandidates()
    if (candidates.length) {
      return {
        ok: true,
        mediaUrl: candidates[0],
        caption: extractCaption(),
        canonicalUrl: canonicalUrl || window.location.href,
      }
    }
    const video = document.querySelector('video')
    if (video && attempt === 4) video.play().catch(() => {})
    await sleep(750)
  }
  const loginRequired = Boolean(document.querySelector('input[name="email"], form[action*="login"]'))
  if (canonicalUrl) {
    return {
      ok: true,
      mediaUrl: '',
      canonicalUrl,
      caption: extractCaption(),
      warning: 'The Reel URL was resolved; Apify will download the video.',
    }
  }
  return {
    ok: false,
    canonicalUrl: window.location.href,
    caption: extractCaption(),
    error: loginRequired ? 'Sign in to Facebook in this Chrome profile and try again.' : 'No downloadable Facebook video was exposed on this page.',
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'EXTRACT_FACEBOOK') return false
  extractFacebook().then(sendResponse)
  return true
})
