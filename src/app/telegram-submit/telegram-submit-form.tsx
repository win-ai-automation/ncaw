'use client'

import Script from 'next/script'
import { ArrowRight, CheckCircle2, FileText, Link2, LoaderCircle, MessageSquareText, ShieldCheck } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import './telegram-submit.css'

type TelegramWebApp = {
  initData: string
  colorScheme?: 'light' | 'dark'
  ready: () => void
  expand: () => void
  close: () => void
  showAlert?: (message: string) => void
  themeParams?: Record<string, string>
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export default function TelegramSubmitForm() {
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function initializeTelegram() {
    const app = window.Telegram?.WebApp
    if (!app) return
    app.ready()
    app.expand()
    document.documentElement.dataset.telegramTheme = app.colorScheme || 'light'
    setReady(true)
  }

  useEffect(() => { initializeTelegram() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const app = window.Telegram?.WebApp
    if (!app?.initData) { setError('Please open this form from the Netfintax Telegram bot.'); return }
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/content/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, notes, initData: app.initData }),
      })
      const payload = await response.json() as { error?: string; warning?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not submit this content.')
      setSuccess(true)
      app.showAlert?.(payload.warning ? `Draft created. ${payload.warning}` : 'Draft created and sent to Review Queue.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit this content.')
    } finally { setPending(false) }
  }

  if (success) return <main className="telegram-submit-page"><section className="telegram-submit-success"><span><CheckCircle2 /></span><h1>Draft ready for review</h1><p>Your source has been processed and added to the Netfintax Review Queue.</p><button onClick={() => window.Telegram?.WebApp?.close()}>Close form</button></section></main>

  return <main className="telegram-submit-page">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={initializeTelegram} />
    <section className="telegram-submit-shell">
      <header><div className="telegram-brand-mark">N</div><div><p>NETFINTAX CONTENT DESK</p><h1>Submit content</h1><span>Add a source for the content automation workflow.</span></div></header>
      <form onSubmit={submit}>
        <label><span><FileText />Title <b>*</b></span><input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter a clear working title" /></label>
        <label><span><Link2 />Source URL <b>*</b></span><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://facebook.com/..." /></label>
        <label><span><MessageSquareText />Instructions for AI <small>Optional</small></span><textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Audience, tone, output requirements, or context..." /></label>
        <div className="telegram-submit-note"><ShieldCheck /><p>Human review is required before publication.</p></div>
        {error && <p className="telegram-submit-error">{error}</p>}
        <button className="telegram-submit-button" disabled={pending || !ready}>{pending ? <><LoaderCircle className="telegram-spinner" />Generating draft...</> : <>Submit content <ArrowRight /></>}</button>
        {!ready && <p className="telegram-submit-hint">Open this page using the button inside the Netfintax Telegram bot.</p>}
      </form>
    </section>
  </main>
}
