const SOURCE_APP = 'netfintax-content-desk'
const SOURCE_HELPER = 'netfintax-facebook-helper'

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const message = event.data
  if (message?.source === SOURCE_APP && message?.type === 'PING') {
    window.postMessage({ source: SOURCE_HELPER, type: 'READY', requestId: message.requestId }, window.location.origin)
    return
  }
  if (message?.source !== SOURCE_APP || message?.type !== 'CAPTURE_FACEBOOK') return
  chrome.runtime.sendMessage({ type: 'CAPTURE_FACEBOOK', url: message.url }, (result) => {
    const runtimeError = chrome.runtime.lastError?.message
    window.postMessage({
      source: SOURCE_HELPER,
      requestId: message.requestId,
      result: runtimeError ? { ok: false, error: runtimeError } : result,
    }, window.location.origin)
  })
})

window.postMessage({ source: SOURCE_HELPER, type: 'READY' }, window.location.origin)
