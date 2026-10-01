'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  LogOut,
  UserRound,
  X,
} from 'lucide-react'

type Status = 'pending' | 'processing' | 'approved' | 'revision'
type Item = {
  id: number
  title: string
  source: string
  platform: string
  status: Status
  risk: 'Low' | 'Medium' | 'High'
  submittedBy: string
  submittedAt: string
  sourceText: string
  draft: string
  flags: string[]
}

type SearchResult = {
  id: string
  title: string
  platform: string
  status: string
  source_url: string | null
  created_at: string
}

type QueueContent = {
  id: string
  title: string
  source_url: string | null
  platform: string
  raw_content: string | null
  submitter_notes: string | null
  status: string
  risk_level: string
  risk_flags: unknown
  created_at: string
  latest_version: null | {
    id: string
    version_number: number
    editor_content: string | null
    generated_payload: unknown
    created_at: string
  }
}

const seedItems: Item[] = [
  {
    id: 1,
    title: '5 year-end tax preparation steps for business owners',
    source: 'linkedin.com/posts/finance-planning',
    platform: 'LinkedIn',
    status: 'pending',
    risk: 'Medium',
    submittedBy: 'Minh Anh',
    submittedAt: '18 minutes ago',
    sourceText: 'Business owners can reduce their year-end tax bill by reviewing payroll, retirement contributions and entity-level elections before the filing deadline. A proactive plan creates more options than waiting until tax season.',
    draft: 'Year-end is not the time to rush toward a tax “hack.” It is the time for business owners to conduct a structured review.\n\nA sound plan should begin with three questions:\n\n1. Do the books and payroll accurately reflect actual business activity?\n2. Are retirement contributions still aligned with cash flow and long-term goals?\n3. Are there any elections or actions that must be completed before a deadline?\n\nNetfintax helps leadership teams turn financial data into a clear plan with accountable owners, deadlines, and documentation.\n\nNote: Every decision depends on the business structure and specific circumstances. This content is not tax advice.',
    flags: ['Verify the applicable deadline for each election', 'Do not use figures without an authoritative source'],
  },
  {
    id: 2,
    title: 'Case study: Streamlining the payroll process',
    source: 'youtube.com/watch?v=sample',
    platform: 'YouTube',
    status: 'processing',
    risk: 'Low',
    submittedBy: 'Tuan Nguyen',
    submittedAt: '42 minutes ago',
    sourceText: 'A short video about payroll process improvements.',
    draft: '',
    flags: [],
  },
  {
    id: 3,
    title: 'Understanding reasonable compensation',
    source: 'facebook.com/example/posts/123',
    platform: 'Facebook',
    status: 'revision',
    risk: 'High',
    submittedBy: 'Linh Pham',
    submittedAt: 'Yesterday, 4:20 PM',
    sourceText: 'Reasonable compensation is important for S corporation owners.',
    draft: 'This draft is awaiting updated sources and examples.',
    flags: ['Missing authoritative source', 'The original example may be misleading'],
  },
  {
    id: 4,
    title: 'Pre-filing bookkeeping checklist',
    source: 'threads.net/@account/post/sample',
    platform: 'Threads',
    status: 'approved',
    risk: 'Low',
    submittedBy: 'Minh Anh',
    submittedAt: '27/09, 09:15',
    sourceText: 'Bookkeeping checklist.',
    draft: 'The checklist has been approved.',
    flags: [],
  },
]

const statusMeta: Record<Status, { label: string; className: string }> = {
  pending: { label: 'Pending review', className: 'status-pending' },
  processing: { label: 'Processing', className: 'status-processing' },
  approved: { label: 'Approved', className: 'status-approved' },
  revision: { label: 'Needs revision', className: 'status-revision' },
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    received: 'Received', processing: 'Processing', pending_review: 'Pending review',
    revision_requested: 'Needs revision', approved: 'Approved', scheduled: 'Scheduled',
    published: 'Published', rejected: 'Rejected', failed: 'Failed',
  }
  return labels[status] ?? status
}

export type DashboardSection = 'overview' | 'queue' | 'content' | 'history' | 'members' | 'settings'

const sectionCopy: Record<DashboardSection, { title: string; description: string }> = {
  overview: { title: 'Welcome back, Thanh. What would you like to work on?', description: 'All your essential content operations are in one place.' },
  queue: { title: 'Review queue', description: 'Review, edit, and approve content before publication.' },
  content: { title: 'Content management', description: 'Track every piece of content from intake to publication.' },
  history: { title: 'Activity history', description: 'A complete record of team edits, approvals, and publications.' },
  members: { title: 'Team members', description: 'Manage employees, reviewers, and system access.' },
  settings: { title: 'Settings', description: 'Configure integrations, review workflows, and the Netfintax brand.' },
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden>
    <rect x="2.5" y="4" width="15" height="12" rx="2.25" stroke="currentColor" strokeWidth="1.7" />
    <path d={collapsed ? 'M9.5 4.75v10.5' : 'M7.5 4.75v10.5'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="3.75" y="5.25" width={collapsed ? '4.5' : '2.5'} height="9.5" rx="1" fill="currentColor" opacity={collapsed ? '.18' : '.75'} />
  </svg>
}

function App({ section = 'overview', identity }: { section?: DashboardSection; identity: { name: string; role: string; email: string } }) {
  const [items, setItems] = useState(seedItems)
  const [activeId, setActiveId] = useState(1)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [draft, setDraft] = useState(seedItems[0].draft)
  const [showSubmit, setShowSubmit] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const headerActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => setCollapsed(window.localStorage.getItem('netfintax-sidebar-collapsed') === 'true'), [])

  useEffect(() => {
    function closePopovers(event: MouseEvent) {
      if (!headerActionsRef.current?.contains(event.target as Node)) {
        setNotificationOpen(false)
        setAccountOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setNotificationOpen(false); setAccountOpen(false) }
    }
    document.addEventListener('mousedown', closePopovers)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closePopovers); document.removeEventListener('keydown', closeOnEscape) }
  }, [])

  useEffect(() => {
    const query = globalQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError('')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const payload = await response.json() as { data?: SearchResult[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to search')
        setSearchResults(payload.data ?? [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSearchResults([])
          setSearchError((error as Error).message)
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [globalQuery])

  function toggleSidebar() {
    setCollapsed((current) => {
      window.localStorage.setItem('netfintax-sidebar-collapsed', String(!current))
      return !current
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign('/auth/sign-in')
  }

  const initials = identity.name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const roleLabel = identity.role.charAt(0).toUpperCase() + identity.role.slice(1)

  const active = items.find((item) => item.id === activeId) ?? items[0]
  const filtered = useMemo(
    () => items.filter((item) => (filter === 'all' || item.status === filter) && item.title.toLowerCase().includes(query.toLowerCase())),
    [items, filter, query],
  )

  function selectItem(item: Item) {
    setActiveId(item.id)
    setDraft(item.draft)
  }

  function updateStatus(status: Status, message: string) {
    setItems((current) => current.map((item) => item.id === active.id ? { ...item, status, draft } : item))
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img className="netfintax-logo-image" src="/logos/netfintax.png" alt="Netfintax" />
          <span className="netfintax-compact-logo">N</span>
          <span className="brand-badge">Content</span>
          <button className="icon-btn sidebar-close" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <nav>
          <p className="nav-label">Workspace</p>
          <Link href="/" className={section === 'overview' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Overview"><LayoutDashboard size={18} /><span className="nav-copy">Overview</span></Link>
          <Link href="/queue" className={section === 'queue' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Review queue"><Inbox size={18} /><span className="nav-copy">Review queue</span><span className="nav-count">{items.filter(i => i.status === 'pending').length}</span></Link>
          <Link href="/content" className={section === 'content' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Content"><FileText size={18} /><span className="nav-copy">Content</span></Link>
          <Link href="/history" className={section === 'history' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Activity history"><History size={18} /><span className="nav-copy">History</span></Link>
          <p className="nav-label nav-section">Administration</p>
          <Link href="/members" className={section === 'members' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Team members"><ShieldCheck size={18} /><span className="nav-copy">Team members</span></Link>
          <Link href="/settings" className={section === 'settings' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Settings"><Settings size={18} /><span className="nav-copy">Settings</span></Link>
        </nav>
        <div className="sidebar-foot">
          <div className="mini-avatar">TD</div>
          <div><strong>{identity.name}</strong><span>{roleLabel}</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-btn desktop-sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-pressed={collapsed}><SidebarToggleIcon collapsed={collapsed} /></button>
          <button className="icon-btn menu-btn" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="global-search-wrap">
            <label className="header-search"><Search size={19} /><input value={globalQuery} onChange={(event) => { setGlobalQuery(event.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)} placeholder="Search content by title..." />{globalQuery && <button type="button" className="search-clear" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => { setGlobalQuery(''); setSearchResults([]) }}><X /></button>}</label>
            {searchOpen && globalQuery.trim().length >= 2 && <div className="search-popover">
              <div className="search-popover-head"><span>Search results</span>{!searchLoading && <small>{searchResults.length} results</small>}</div>
              <div className="search-popover-body">
                {searchLoading ? <div className="search-state"><span className="search-spinner" />Searching...</div> : searchError ? <div className="search-state search-error"><CircleAlert />{searchError}</div> : searchResults.length === 0 ? <div className="search-state"><Search />No matching content found</div> : searchResults.map((result) => <Link className="search-result" href={`/content?id=${result.id}`} key={result.id} onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchOpen(false)}><span className="search-result-icon"><FileText /></span><span><strong>{result.title}</strong><small>{result.platform} · {statusLabel(result.status)}</small></span><ArrowRight /></Link>)}
              </div>
            </div>}
          </div>
          <div className="top-actions" ref={headerActionsRef}>
            <div className="popover-anchor notification-anchor">
              <button className={`icon-btn notification ${notificationOpen ? 'is-open' : ''}`} onClick={() => { setNotificationOpen(!notificationOpen); setAccountOpen(false) }} aria-expanded={notificationOpen} aria-haspopup="dialog" aria-label="Notifications"><Bell size={19} /><i /></button>
              {notificationOpen && <div className="notification-popover" role="dialog" aria-label="Notifications">
                <header><h2>Notifications</h2></header>
                <div className="notification-empty"><span><Bell /></span><strong>You have no notifications.</strong><p>Important Netfintax updates will appear here.</p></div>
                <footer><button onClick={() => setNotificationOpen(false)}>View all notifications</button></footer>
              </div>}
            </div>
            <div className="popover-anchor account-anchor">
              <button className={`header-profile ${accountOpen ? 'is-open' : ''}`} onClick={() => { setAccountOpen(!accountOpen); setNotificationOpen(false) }} aria-expanded={accountOpen} aria-haspopup="menu">
                <span className="header-avatar">{initials || 'U'}</span>
                <span><strong>{identity.name.toUpperCase()}</strong><small>{roleLabel}</small></span>
                <ChevronDown size={15} />
              </button>
              {accountOpen && <div className="account-popover" role="menu">
                <Link href="/account" role="menuitem" onClick={() => setAccountOpen(false)}><UserRound /><span>Profile</span></Link>
                <Link href="/settings" role="menuitem" onClick={() => setAccountOpen(false)}><Settings /><span>Account settings</span></Link>
                <div className="account-menu-separator" />
                <button role="menuitem" className="logout-action" onClick={signOut}><LogOut /><span>Sign out</span></button>
              </div>}
            </div>
          </div>
        </header>

        {section === 'content' ? <ContentIntakePanel /> : section === 'queue' ? <ReviewQueuePanel /> : <DashboardPageSkeleton />}

        {false && <>
        <section className="page-head">
          <div><p className="eyebrow">REVIEW WORKSPACE</p><h1>{sectionCopy[section].title}</h1><p>{sectionCopy[section].description}</p></div>
          <button className="primary-btn page-submit" onClick={() => setShowSubmit(true)}><Plus size={17} /> Submit content</button>
        </section>

        {section !== 'history' && section !== 'members' && section !== 'settings' && <section className="stat-strip">
          <div><span>Pending review</span><strong>{items.filter(i => i.status === 'pending').length}</strong></div>
          <div><span>Processing</span><strong>{items.filter(i => i.status === 'processing').length}</strong></div>
          <div><span>Needs revision</span><strong>{items.filter(i => i.status === 'revision').length}</strong></div>
          <div><span>Approved this week</span><strong>{items.filter(i => i.status === 'approved').length}</strong></div>
          <div><span>Total content</span><strong>{items.length}</strong></div>
        </section>}

        {section === 'history' || section === 'members' || section === 'settings' ? (
          <SectionPlaceholder section={section as 'history' | 'members' | 'settings'} />
        ) : <section className="workspace">
          <div className="queue-panel">
            <div className="queue-tools">
              <div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search content..." /></div>
              <button className="filter-btn" onClick={() => setFilter(filter === 'all' ? 'pending' : 'all')}>{filter === 'all' ? 'All' : 'Pending'} <ChevronDown size={15} /></button>
            </div>
            <div className="queue-list">
              {filtered.map((item) => (
                <button key={item.id} className={`queue-item ${active.id === item.id ? 'selected' : ''}`} onClick={() => selectItem(item)}>
                  <div className="queue-top"><span className={`status ${statusMeta[item.status].className}`}>{statusMeta[item.status].label}</span><span className="time">{item.submittedAt}</span></div>
                  <h3>{item.title}</h3>
                  <div className="source"><Link2 size={13} /> {item.platform} · {item.source}</div>
                  <div className="queue-bottom"><span className="avatar">{item.submittedBy.split(' ').map(v => v[0]).slice(-2).join('')}</span><span>{item.submittedBy}</span><span className={`risk risk-${item.risk === 'High' ? 'high' : item.risk === 'Medium' ? 'medium' : 'low'}`}>{item.risk}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="review-panel">
            <div className="review-head">
              <div><span className={`status ${statusMeta[active.status].className}`}>{statusMeta[active.status].label}</span><h2>{active.title}</h2><p><Link2 size={14} /> {active.source} <ExternalLink size={13} /></p></div>
              <button className="icon-btn"><MoreHorizontal size={20} /></button>
            </div>

            {active.status === 'processing' ? (
              <div className="processing-state"><div className="loader-ring"><Sparkles size={28} /></div><h3>AI is preparing the draft</h3><p>The content will appear here when processing is complete.</p></div>
            ) : (
              <>
                <div className="risk-banner">
                  <CircleAlert size={19} />
                  <div><strong>{active.flags.length ? `${active.flags.length} items require verification` : 'No major issues detected'}</strong><p>{active.flags[0] ?? 'A reviewer should still read the content before approval.'}</p></div>
                  <button>View details <ArrowRight size={14} /></button>
                </div>
                <div className="editor-grid">
                  <article className="source-card">
                    <div className="card-label"><span>ORIGINAL CONTENT</span><span>{active.sourceText.length} characters</span></div>
                    <p>{active.sourceText}</p>
                    <div className="source-meta"><span>Source</span><strong>{active.platform}</strong><span>Submitted by</span><strong>{active.submittedBy}</strong></div>
                  </article>
                  <article className="draft-card">
                    <div className="card-label"><span><Sparkles size={14} /> NETFINTAX DRAFT</span><span>Saved</span></div>
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Draft content" />
                    <div className="editor-foot"><span>{draft.length} characters</span><span><Clock3 size={13} /> Changes saved locally</span></div>
                  </article>
                </div>
                <div className="review-actions">
                  <button className="reject-btn" onClick={() => updateStatus('revision', 'Content moved to needs revision')}><MessageSquareText size={17} /> Request revision</button>
                  <div><button className="secondary-btn"><ArrowLeft size={16} /> Skip</button><button className="approve-btn" onClick={() => updateStatus('approved', 'Content approved')}><Check size={18} /> Approve</button></div>
                </div>
              </>
            )}
          </div>
        </section>}
        </>}
      </main>

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onSubmit={(item) => { setItems([item, ...items]); selectItem(item); setShowSubmit(false); setToast('Content submitted for processing') }} />}
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
      {mobileNav && <div className="backdrop" onClick={() => setMobileNav(false)} />}
    </div>
  )
}

function DashboardPageSkeleton() {
  return <section className="dashboard-page-skeleton" aria-label="Loading page content" aria-busy="true">
    <div className="skeleton-heading">
      <span className="skeleton-line skeleton-title" />
      <span className="skeleton-line skeleton-subtitle" />
    </div>
    <div className="skeleton-stats">
      {Array.from({ length: 5 }, (_, index) => <span className="skeleton-card" key={index} />)}
    </div>
    <div className="skeleton-workspace">
      <div className="skeleton-list">
        <span className="skeleton-toolbar" />
        {Array.from({ length: 4 }, (_, index) => <span className="skeleton-list-item" key={index} />)}
      </div>
      <div className="skeleton-detail">
        <span className="skeleton-line skeleton-detail-title" />
        <span className="skeleton-line skeleton-detail-subtitle" />
        <span className="skeleton-banner" />
        <div className="skeleton-columns"><span /><span /></div>
      </div>
    </div>
  </section>
}

function ContentIntakePanel() {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressState, setProgressState] = useState<'processing' | 'success' | 'error'>('processing')
  const [showProgress, setShowProgress] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; source?: string }>({})
  const [fieldTouched, setFieldTouched] = useState<{ title?: boolean; source?: boolean }>({})

  function validateTitle(value = title) {
    const message = value.trim() ? undefined : 'Enter a title for this content.'
    setFieldErrors((current) => ({ ...current, title: message }))
    return !message
  }

  function validateSource(nextUrl = url, nextContent = content) {
    const message = nextUrl.trim() || nextContent.trim() ? undefined : 'Add a source URL or paste the source content.'
    setFieldErrors((current) => ({ ...current, source: message }))
    return !message
  }

  useEffect(() => {
    if (!showProgress) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [showProgress])

  useEffect(() => {
    if (!submitting) return
    const stages = [
      { progress: 24, message: 'Sending content to n8n...' },
      { progress: 46, message: 'Validating and preparing the source...' },
      { progress: 68, message: 'Generating the AI draft...' },
      { progress: 86, message: 'Preparing the review package...' },
      { progress: 94, message: 'Waiting for n8n to finish...' },
    ]
    let index = 0
    const timer = window.setInterval(() => {
      if (index < stages.length) {
        setProgress(stages[index].progress)
        setProgressMessage(stages[index].message)
        index += 1
      }
    }, 1400)
    return () => window.clearInterval(timer)
  }, [submitting])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setFieldTouched({ title: true, source: true })
    const titleValid = validateTitle()
    const sourceValid = validateSource()
    if (!titleValid || !sourceValid) return
    setSubmitting(true)
    setShowProgress(true)
    setProgressState('processing')
    setProgress(8)
    setProgressMessage('Starting the n8n workflow...')
    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, content, notes }),
      })
      const payload = await response.json() as { data?: { id: string }; error?: string; warning?: string; workflow?: { message?: string; status?: string } }
      if (!response.ok) throw new Error(payload.error || 'Unable to submit content.')
      setTitle('')
      setUrl('')
      setContent('')
      setNotes('')
      setFieldErrors({})
      setFieldTouched({})
      const message = payload.warning || payload.workflow?.message || `Draft created and sent to review. Reference: ${payload.data?.id ?? ''}`
      setSuccess(message)
      setProgress(100)
      setProgressState('success')
      setProgressMessage(message)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to submit content.'
      setError(message)
      setProgress(100)
      setProgressState('error')
      setProgressMessage(message)
    } finally {
      setSubmitting(false)
      window.setTimeout(() => setShowProgress(false), 2500)
    }
  }

  return <section className="content-intake-page">
    <header><div><h1>Submit content</h1><p>Add a source for the content automation workflow.</p></div></header>
    <form className="content-intake-card" onSubmit={submit} noValidate>
      {error && <div className="content-form-message error"><CircleAlert />{error}</div>}
      {success && <div className="content-form-message success"><Check />{success}</div>}
      <label><span className="content-field-heading">Title <em>*</em></span><input className={fieldErrors.title ? 'has-error' : ''} value={title} onChange={(event) => { setTitle(event.target.value); if (fieldTouched.title) validateTitle(event.target.value) }} onBlur={(event) => { setFieldTouched((current) => ({ ...current, title: true })); validateTitle(event.target.value) }} aria-invalid={Boolean(fieldErrors.title)} aria-describedby="content-title-error" maxLength={240} placeholder="Enter a clear working title" />{fieldErrors.title && <span className="content-field-error" id="content-title-error">{fieldErrors.title}</span>}</label>
      <label>Source URL <small>Use a public URL when available</small><div className={`content-url-input ${fieldErrors.source ? 'has-error' : ''}`}><Link2 /><input type="url" value={url} onChange={(event) => { setUrl(event.target.value); if (fieldTouched.source) validateSource(event.target.value, content) }} onBlur={(event) => { setFieldTouched((current) => ({ ...current, source: true })); validateSource(event.target.value, content) }} aria-invalid={Boolean(fieldErrors.source)} aria-describedby="content-source-error" placeholder="https://example.com/content" /></div></label>
      <div className="content-form-divider"><span>or paste the source</span></div>
      <label>Source content <small>Up to 100,000 characters</small><textarea className={fieldErrors.source ? 'has-error' : ''} value={content} onChange={(event) => { setContent(event.target.value); if (fieldTouched.source) validateSource(url, event.target.value) }} onBlur={(event) => { setFieldTouched((current) => ({ ...current, source: true })); validateSource(url, event.target.value) }} aria-invalid={Boolean(fieldErrors.source)} aria-describedby="content-source-error" maxLength={100000} placeholder="Paste the original article, transcript, or post here..." />{fieldErrors.source && <span className="content-field-error" id="content-source-error">{fieldErrors.source}</span>}</label>
      <label>Instructions for AI <small>Optional</small><textarea className="content-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Audience, tone, output requirements, or context..." /></label>
      <footer><p><ShieldCheck />Human review is required before publication.</p><button className="primary-btn" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit content'}</button></footer>
    </form>
    {showProgress && <div className="workflow-progress-backdrop" role="presentation">
      <section className={`workflow-progress-modal ${progressState}`} role="alertdialog" aria-modal="true" aria-labelledby="workflow-progress-title" aria-describedby="workflow-progress-message">
        <div className="workflow-progress-icon">{progressState === 'success' ? <Check /> : progressState === 'error' ? <CircleAlert /> : <Sparkles />}</div>
        <h2 id="workflow-progress-title">{progressState === 'processing' ? 'Processing content' : progressState === 'success' ? 'Workflow completed' : 'Workflow failed'}</h2>
        <p id="workflow-progress-message">{progressMessage}</p>
        <div className="workflow-progress-track" aria-label={`Workflow progress ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        <strong>{progress}%</strong>
      </section>
    </div>}
  </section>
}

function ReviewQueuePanel() {
  const [items, setItems] = useState<QueueContent[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  async function reviewItem(action: 'approve' | 'request_revision') {
    const item = items.find((entry) => entry.id === selectedId)
    if (!item || actionPending) return
    setActionPending(true)
    setActionMessage('')
    try {
      const response = await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action, comment: revisionNote }),
      })
      const payload = await response.json() as { data?: QueueContent; error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update this content.')
      const nextStatus = action === 'approve' ? 'approved' : 'revision_requested'
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: nextStatus } : entry))
      setActionMessage(payload.message || (action === 'approve' ? 'Content approved successfully.' : 'Revision requested successfully.'))
      setRevisionOpen(false)
      setRevisionNote('')
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'Unable to update this content.')
    } finally {
      setActionPending(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    async function loadQueue() {
      try {
        const response = await fetch('/api/content', { signal: controller.signal })
        const payload = await response.json() as { data?: QueueContent[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load the review queue.')
        const next = payload.data ?? []
        setItems(next)
        setSelectedId((current) => current || next[0]?.id || '')
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') setError(caught instanceof Error ? caught.message : 'Unable to load the review queue.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadQueue()
    return () => controller.abort()
  }, [])

  if (loading) return <DashboardPageSkeleton />

  const filteredItems = items.filter((item) => {
    const matchesQuery = item.title.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'all' || item.status === status
    return matchesQuery && matchesStatus
  })
  const active = items.find((item) => item.id === selectedId) ?? filteredItems[0]
  const flags = Array.isArray(active?.risk_flags) ? active.risk_flags.filter((flag): flag is string => typeof flag === 'string') : []
  const draft = active?.latest_version?.editor_content || ''

  return <section className="live-queue-page">
    <header className="live-queue-heading">
      <div><h1>Review queue</h1><p>Review AI-generated drafts before they are approved for publication.</p></div>
      <div className="live-queue-total"><strong>{items.filter((item) => item.status === 'pending_review').length}</strong><span>Pending review</span></div>
    </header>
    {error ? <div className="queue-state-card error"><CircleAlert /><strong>Unable to load queue</strong><p>{error}</p></div> : items.length === 0 ? <div className="queue-state-card"><Inbox /><strong>No content to review</strong><p>New drafts will appear here after the automation workflow finishes.</p></div> : <div className="live-queue-workspace">
      <aside className="live-queue-list">
        <div className="live-queue-tools">
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content..." /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="pending_review">Pending review</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="approved">Approved</option>
            <option value="revision_requested">Needs revision</option>
          </select>
        </div>
        <div className="live-queue-items">
          {filteredItems.length === 0 ? <div className="queue-list-empty">No matching content</div> : filteredItems.map((item) => <button className={item.id === active?.id ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}>
            <div><span className={`queue-status status-${item.status}`}>{statusLabel(item.status)}</span><time>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time></div>
            <strong>{item.title}</strong>
            <p><Link2 />{item.platform}{item.source_url ? ` · ${new URL(item.source_url).hostname}` : ' · Pasted content'}</p>
            <footer><span className={`queue-risk risk-${item.risk_level}`}>{item.risk_level} risk</span>{item.latest_version && <small>Version {item.latest_version.version_number}</small>}</footer>
          </button>)}
        </div>
      </aside>
      {active && <article className="live-review-detail">
        <header>
          <div><span className={`queue-status status-${active.status}`}>{statusLabel(active.status)}</span><h2>{active.title}</h2><p><Link2 />{active.source_url || 'Source content submitted directly'}</p></div>
          <div className="review-more-wrap">
            <button className="icon-btn" aria-label="More options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal /></button>
            {menuOpen && <div className="review-more-menu">
              <button onClick={async () => { await navigator.clipboard.writeText(active.id); setActionMessage('Content ID copied.'); setMenuOpen(false) }}><Copy />Copy content ID</button>
              {active.source_url && <a href={active.source_url} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><ExternalLink />Open source URL</a>}
              <button onClick={() => { setMenuOpen(false); window.location.reload() }}><History />Refresh content</button>
            </div>}
          </div>
        </header>
        {actionMessage && <div className="review-action-message"><Check />{actionMessage}</div>}
        {flags.length > 0 && <div className="live-risk-banner"><CircleAlert /><div><strong>{flags.length} items require verification</strong><p>{flags[0]}</p></div></div>}
        <div className="live-review-columns">
          <section><header><strong>ORIGINAL CONTENT</strong><span>{active.raw_content?.length ?? 0} characters</span></header><div className="review-copy">{active.raw_content || 'The original content will be extracted from the source URL.'}</div></section>
          <section><header><strong><Sparkles />NETFINTAX DRAFT</strong><span>{active.latest_version ? `Version ${active.latest_version.version_number}` : 'Not ready'}</span></header><div className={`review-copy ${!draft ? 'empty' : ''}`}>{draft || (active.status === 'processing' || active.status === 'received' ? 'The AI draft is still being generated.' : 'No generated draft is available.')}</div></section>
        </div>
        <footer className="live-review-actions"><button className="request-revision-btn" disabled={!active.latest_version || actionPending} onClick={() => { setRevisionOpen(true); setActionMessage('') }}><MessageSquareText />Request revision</button><button className="approve-review-btn" disabled={!active.latest_version || actionPending || active.status === 'approved'} onClick={() => reviewItem('approve')}><Check />{actionPending ? 'Saving...' : active.status === 'approved' ? 'Approved' : 'Approve content'}</button></footer>
      </article>}
    </div>}
    {revisionOpen && <div className="modal-wrap">
      <form className="modal revision-modal" onSubmit={(event) => { event.preventDefault(); reviewItem('request_revision') }}>
        <div className="modal-icon"><MessageSquareText /></div>
        <h2>Request revision</h2>
        <p className="modal-copy">Describe what must be changed before this content can be approved.</p>
        <label>Revision note <span>*</span><textarea autoFocus required maxLength={5000} value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Explain the required changes..." /></label>
        <div className="modal-actions"><button type="button" className="secondary-btn" disabled={actionPending} onClick={() => setRevisionOpen(false)}>Cancel</button><button className="primary-btn" disabled={actionPending || !revisionNote.trim()}>{actionPending ? 'Saving...' : 'Send revision request'}</button></div>
      </form>
    </div>}
  </section>
}

function SectionPlaceholder({ section }: { section: 'history' | 'members' | 'settings' }) {
  const config = {
    history: { icon: History, title: 'No recent activity', body: 'Submissions, edits, approvals, and publications will be recorded here.' },
    members: { icon: ShieldCheck, title: 'Team management', body: 'Invite team members and assign Employee, Reviewer, or Admin roles with Supabase Auth.' },
    settings: { icon: Settings, title: 'System integrations', body: 'Configure n8n, OpenAI, Google Drive, Slack, and GoHighLevel here.' },
  }[section]
  const Icon = config.icon
  return <section className="section-placeholder">
    <div className="placeholder-toolbar"><h2>{sectionCopy[section].title}</h2><button className="primary-btn">{section === 'members' ? 'Invite member' : section === 'settings' ? 'Save settings' : 'Export report'}</button></div>
    <div className="placeholder-card"><span><Icon /></span><h3>{config.title}</h3><p>{config.body}</p></div>
  </section>
}

function SubmitModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (item: Item) => void }) {
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ id: Date.now(), title: 'New content is being analyzed', source: url.replace(/^https?:\/\//, ''), platform: 'Web', status: 'processing', risk: 'Low', submittedBy: 'Thanh Duc', submittedAt: 'Just now', sourceText: notes || 'Extracting content from the source URL.', draft: '', flags: [] })
  }
  return <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}>
      <div className="modal-icon"><Send size={22} /></div><button type="button" className="icon-btn modal-close" onClick={onClose}><X size={19} /></button>
      <p className="eyebrow">CONTENT INTAKE</p><h2>Submit new content</h2><p className="modal-copy">Paste a source URL. The system will extract it and prepare a draft for review.</p>
      <label>Content URL <span>*</span><div className="input-wrap"><Link2 size={17} /><input autoFocus type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://linkedin.com/posts/..." /></div></label>
      <label>Instructions for AI <small>Optional</small><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Example: Focus on business owners and keep the tone concise..." /></label>
      <div className="notice"><ShieldCheck size={18} /><p><strong>Human review is always required</strong><br />Content will never be published automatically.</p></div>
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn">Submit for processing <ArrowRight size={16} /></button></div>
    </form>
  </div>
}

export default App
