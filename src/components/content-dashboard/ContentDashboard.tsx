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
  Download,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Inbox,
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
  Trash2,
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
  target_account_ids: unknown
  scheduled_at: string | null
  created_at: string
  latest_version: null | {
    id: string
    version_number: number
    editor_content: string | null
    generated_payload: unknown
    change_note: string | null
    created_at: string
  }
  versions: Array<{
    id: string
    version_number: number
    editor_content: string | null
    generated_payload: unknown
    change_note: string | null
    created_at: string
  }>
}

type HistoryEvent = { id: string; contentId: string; title: string; action: string; detail: string; status: string; createdAt: string }
type SocialAccount = { id: string; name: string; platform: string }
type ContentAsset = { id: string; version_id: string; asset_type: string; storage_path: string; mime_type: string; created_at: string; url: string | null }
type DraftOutputView = 'caseStudy' | 'accuracyReview' | 'facebook' | 'linkedin' | 'threads' | 'instagram' | 'email' | 'complianceNotes'

function draftOutput(payload: unknown, view: DraftOutputView, fallback: string) {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const social = root.socialPack && typeof root.socialPack === 'object' ? root.socialPack as Record<string, unknown> : {}
  const value = view === 'caseStudy' ? root.caseStudyMarkdown ?? fallback : view === 'accuracyReview' ? root.accuracyReview : view === 'complianceNotes' ? root.complianceNotes : social[view]
  if (typeof value === 'string') return value
  if (view === 'facebook' && value == null && typeof social.linkedin === 'string') return social.linkedin
  if (view === 'instagram' && Array.isArray(value)) {
    return value.map((item, index) => {
      if (!item || typeof item !== 'object') return `Slide ${index + 1}\n${String(item)}`
      const slide = item as Record<string, unknown>
      const number = typeof slide.slide === 'number' || typeof slide.slide === 'string' ? slide.slide : index + 1
      const heading = typeof slide.heading === 'string' ? slide.heading.trim() : ''
      const body = typeof slide.body === 'string' ? slide.body.trim() : ''
      return [`SLIDE ${number}${heading ? ` — ${heading}` : ''}`, body].filter(Boolean).join('\n')
    }).join('\n\n')
  }
  return value == null ? '' : String(value)
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
          <Link href="/content" className={section === 'content' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Content"><FileText size={18} /><span className="nav-copy">Content</span></Link>
          <Link href="/queue" className={section === 'queue' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Review queue"><Inbox size={18} /><span className="nav-copy">Review queue</span><span className="nav-count">{items.filter(i => i.status === 'pending').length}</span></Link>
          <Link href="/history" className={section === 'history' ? 'active' : ''} onClick={() => setMobileNav(false)} data-tooltip="Activity history"><History size={18} /><span className="nav-copy">History</span></Link>
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

        {section === 'content' ? <ContentIntakePanel /> : section === 'queue' ? <ReviewQueuePanel /> : section === 'history' ? <HistoryPanel /> : <DashboardPageSkeleton />}

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
    <div className="content-intake-layout">
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
    <aside className="content-guide-card">
      <header><div><h2>How it works</h2><p>Turn a source into a review-ready draft.</p></div></header>
      <ol>
        <li><span>1</span><div><strong>Add your source</strong><p>Enter a clear title, then paste a public URL or the original content.</p></div></li>
        <li><span>2</span><div><strong>Guide the AI</strong><p>Add an audience, tone, format, or key points under Instructions for AI.</p></div></li>
        <li><span>3</span><div><strong>Review the draft</strong><p>n8n generates the draft and sends it to Review queue for approval.</p></div></li>
      </ol>
      <section className="content-guide-tip"><div><strong>Before you submit</strong><p>Remove sensitive client data and verify all tax, legal, deadline, and rate information.</p></div></section>
      <footer><FileText /><span>You can follow the result in <Link href="/queue">Review queue</Link>.</span></footer>
    </aside>
    </div>
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [publishProgressOpen, setPublishProgressOpen] = useState(false)
  const [publishProgress, setPublishProgress] = useState(0)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishState, setPublishState] = useState<'processing' | 'success' | 'error'>('processing')
  const [editorDraft, setEditorDraft] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [publishOptionsOpen, setPublishOptionsOpen] = useState(false)
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [outputView, setOutputView] = useState<DraftOutputView>('caseStudy')
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareFrom, setCompareFrom] = useState<number | null>(null)
  const [compareTo, setCompareTo] = useState<number | null>(null)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [assets, setAssets] = useState<ContentAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)

  useEffect(() => {
    if (!publishProgressOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [publishProgressOpen])

  const selectedItem = items.find((entry) => entry.id === selectedId)
  useEffect(() => {
    setEditorDraft(selectedItem?.latest_version?.editor_content || '')
    setSelectedVersion(selectedItem?.latest_version?.version_number ?? null)
    setChangeNote('')
    setOutputView('caseStudy')
  }, [selectedId, selectedItem?.latest_version?.id])

  async function saveDraft() {
    const item = items.find((entry) => entry.id === selectedId)
    if (!item?.latest_version || !editorDraft.trim() || actionPending) return
    setActionPending(true)
    setActionMessage('')
    try {
      const response = await fetch('/api/content', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, action: 'save_draft', draft: editorDraft, changeNote }) })
      const payload = await response.json() as { data?: QueueContent['latest_version']; error?: string; message?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to save this draft.')
      const saved = payload.data
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'pending_review', latest_version: saved, versions: [saved!, ...(entry.versions || [])] } : entry))
      setSelectedVersion(saved.version_number)
      setChangeNote('')
      setActionMessage(payload.message || 'Draft saved successfully.')
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'Unable to save this draft.')
    } finally { setActionPending(false) }
  }

  async function openPublishOptions() {
    setActionMessage('')
    setConfigLoading(true)
    setPublishOptionsOpen(true)
    try {
      const response = await fetch('/api/publishing-config', { cache: 'no-store' })
      const payload = await response.json() as { data?: { accounts?: SocialAccount[] }; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to load publishing accounts.')
      const accounts = payload.data?.accounts ?? []
      setSocialAccounts(accounts)
      setSelectedAccountIds(accounts.map((account) => account.id))
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'Unable to load publishing accounts.')
      setPublishOptionsOpen(false)
    } finally { setConfigLoading(false) }
  }

  async function reviewItem(action: 'approve' | 'request_revision') {
    const item = items.find((entry) => entry.id === selectedId)
    if (!item || actionPending) return
    setActionPending(true)
    setActionMessage('')
    let progressTimer: number | undefined
    if (action === 'approve') {
      setPublishProgressOpen(true)
      setPublishState('processing')
      setPublishProgress(10)
      setPublishMessage('Approving the selected content...')
      const stages = [
        { progress: 30, message: 'Sending the approved draft to n8n...' },
        { progress: 55, message: 'Preparing posts for Facebook and LinkedIn...' },
        { progress: 78, message: 'Publishing through GoHighLevel...' },
        { progress: 92, message: 'Waiting for publishing confirmation...' },
      ]
      let stageIndex = 0
      progressTimer = window.setInterval(() => {
        if (stageIndex < stages.length) {
          setPublishProgress(stages[stageIndex].progress)
          setPublishMessage(stages[stageIndex].message)
          stageIndex += 1
        }
      }, 1300)
    }
    try {
      const response = await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action, comment: revisionNote, draft: editorDraft, changeNote, accountIds: action === 'approve' ? selectedAccountIds : undefined, scheduleDate: action === 'approve' && scheduleMode === 'scheduled' ? new Date(scheduleDate).toISOString() : undefined }),
      })
      const payload = await response.json() as { data?: QueueContent; error?: string; message?: string; warning?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update this content.')
      const nextStatus = payload.data?.status || (action === 'approve' ? 'approved' : 'revision_requested')
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: nextStatus } : entry))
      const resultMessage = payload.warning ? `${payload.message || 'Content approved.'} ${payload.warning}` : payload.message || (action === 'approve' ? 'Content approved successfully.' : 'Revision requested successfully.')
      setActionMessage(resultMessage)
      if (action === 'approve') {
        setPublishProgress(100)
        setPublishState(payload.warning ? 'error' : 'success')
        setPublishMessage(resultMessage)
      }
      setRevisionOpen(false)
      setPublishOptionsOpen(false)
      setRevisionNote('')
    } catch (caught) {
      const resultMessage = caught instanceof Error ? caught.message : 'Unable to update this content.'
      setActionMessage(resultMessage)
      if (action === 'approve') {
        setPublishProgress(100)
        setPublishState('error')
        setPublishMessage(resultMessage)
      }
    } finally {
      if (progressTimer) window.clearInterval(progressTimer)
      setActionPending(false)
      if (action === 'approve') window.setTimeout(() => setPublishProgressOpen(false), 2500)
    }
  }

  async function deleteItem() {
    const item = items.find((entry) => entry.id === selectedId)
    if (!item || actionPending) return
    setActionPending(true)
    setActionMessage('')
    try {
      const response = await fetch('/api/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this content.')
      const remaining = items.filter((entry) => entry.id !== item.id)
      setItems(remaining)
      setSelectedId(remaining[0]?.id || '')
      setDeleteOpen(false)
      setActionMessage(payload.message || 'Content deleted successfully.')
    } catch (caught) {
      setDeleteOpen(false)
      setActionMessage(caught instanceof Error ? caught.message : 'Unable to delete this content.')
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
  const versions = active?.versions || []
  const viewedVersion = versions.find((entry) => entry.version_number === selectedVersion) ?? active?.latest_version
  const displayedOutput = outputView === 'caseStudy' ? editorDraft : draftOutput(viewedVersion?.generated_payload, outputView, editorDraft)
  const fromVersion = versions.find((entry) => entry.version_number === compareFrom)
  const toVersion = versions.find((entry) => entry.version_number === compareTo)

  function openVersionCompare() {
    if (versions.length < 2) return
    setCompareTo(versions[0].version_number)
    setCompareFrom(versions[1].version_number)
    setCompareOpen(true)
  }

  async function openAssets() {
    if (!active) return
    setMenuOpen(false)
    setAssetsLoading(true)
    setAssetsOpen(true)
    try {
      const response = await fetch(`/api/content/assets?contentId=${encodeURIComponent(active.id)}`, { cache: 'no-store' })
      const payload = await response.json() as { data?: ContentAsset[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to load generated files.')
      setAssets(payload.data ?? [])
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'Unable to load generated files.')
      setAssetsOpen(false)
    } finally { setAssetsLoading(false) }
  }

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
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
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
              <button onClick={openAssets}><Download />Generated files</button>
              <button onClick={() => { setMenuOpen(false); window.location.reload() }}><History />Refresh content</button>
              <button className="danger" onClick={() => { setMenuOpen(false); setDeleteOpen(true); setActionMessage('') }}><Trash2 />Delete content</button>
            </div>}
          </div>
        </header>
        {actionMessage && <div className="review-action-message"><Check />{actionMessage}</div>}
        {active.status === 'scheduled' && active.scheduled_at && <div className="review-schedule-banner"><Clock3 /><div><strong>Publication scheduled</strong><p>{new Date(active.scheduled_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })} · {Array.isArray(active.target_account_ids) ? active.target_account_ids.length : 0} account(s)</p></div></div>}
        {flags.length > 0 && <div className="live-risk-banner"><CircleAlert /><div><strong>{flags.length} items require verification</strong><p>{flags[0]}</p></div></div>}
        <div className="live-review-columns">
          <section><header><strong>ORIGINAL CONTENT</strong><span>{active.raw_content?.length ?? 0} characters</span></header><div className="review-copy">{active.raw_content || 'The original content will be extracted from the source URL.'}</div></section>
          <section className="draft-editor-card"><header><strong><Sparkles />NETFINTAX OUTPUT</strong><div className="draft-output-selectors"><select aria-label="Select AI output" value={outputView} onChange={(event) => setOutputView(event.target.value as DraftOutputView)}><option value="caseStudy">Case study</option><option value="accuracyReview">Accuracy review</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="threads">Threads / X</option><option value="instagram">Instagram</option><option value="email">Email</option><option value="complianceNotes">Compliance</option></select>{versions.length > 0 ? <select aria-label="Select draft version" value={selectedVersion ?? ''} onChange={(event) => { const version = versions.find((entry) => entry.version_number === Number(event.target.value)); if (version) { setSelectedVersion(version.version_number); setEditorDraft(version.editor_content || '') } }}>{versions.map((version) => <option key={version.id} value={version.version_number}>Version {version.version_number}</option>)}</select> : <span>Not ready</span>}{versions.length > 1 && <button type="button" className="draft-compare-btn" onClick={openVersionCompare}><History />Compare</button>}</div></header><textarea className={!displayedOutput ? 'empty' : ''} value={displayedOutput} onChange={(event) => outputView === 'caseStudy' && setEditorDraft(event.target.value)} readOnly={outputView !== 'caseStudy'} disabled={!active.latest_version || (outputView === 'caseStudy' && ['published', 'scheduled'].includes(active.status))} placeholder={active.status === 'processing' || active.status === 'received' ? 'The AI output is still being generated.' : `No ${outputView} output is available in this version.`} /></section>
        </div>
        <div className="draft-change-note"><input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={1000} disabled={!active.latest_version || ['published', 'scheduled'].includes(active.status)} placeholder="Describe your edit (optional)..." /></div>
        <footer className="live-review-actions"><button className="request-revision-btn" disabled={!active.latest_version || actionPending || active.status === 'published'} onClick={() => { setRevisionOpen(true); setActionMessage('') }}><MessageSquareText />Request revision</button><button className="secondary-btn save-draft-btn" disabled={!active.latest_version || actionPending || !editorDraft.trim() || editorDraft.trim() === (active.latest_version.editor_content || '').trim() || ['published', 'scheduled'].includes(active.status)} onClick={saveDraft}><FileText />{actionPending ? 'Saving...' : 'Save draft'}</button><button className="approve-review-btn" disabled={!active.latest_version || actionPending || ['approved', 'scheduled', 'published'].includes(active.status)} onClick={openPublishOptions}><Check />{active.status === 'published' ? 'Published' : active.status === 'scheduled' ? 'Scheduled' : active.status === 'approved' ? 'Approved' : 'Approve content'}</button></footer>
      </article>}
    </div>}
    {publishOptionsOpen && <div className="modal-wrap">
      <form className="modal publish-options-modal" onSubmit={(event) => { event.preventDefault(); reviewItem('approve') }}>
        <div className="modal-icon"><Send /></div><button type="button" className="icon-btn modal-close" onClick={() => setPublishOptionsOpen(false)}><X /></button>
        <h2>Approve and publish</h2><p className="modal-copy">Choose where and when this approved version will be published.</p>
        <fieldset><legend>Social accounts</legend>{configLoading ? <p>Loading accounts...</p> : socialAccounts.length === 0 ? <p>No publishing accounts are configured.</p> : socialAccounts.map((account) => <label className="publish-account" key={account.id}><input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={(event) => setSelectedAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} /><span><strong>{account.name}</strong><small>{account.platform}</small></span></label>)}</fieldset>
        <fieldset><legend>Publishing time</legend><label className="publish-radio"><input type="radio" name="schedule-mode" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} />Publish now</label><label className="publish-radio"><input type="radio" name="schedule-mode" checked={scheduleMode === 'scheduled'} onChange={() => setScheduleMode('scheduled')} />Schedule for later</label>{scheduleMode === 'scheduled' && <input className="publish-datetime" type="datetime-local" required value={scheduleDate} min={new Date(Date.now() + 120000).toISOString().slice(0, 16)} onChange={(event) => setScheduleDate(event.target.value)} />}</fieldset>
        <div className="modal-actions"><button type="button" className="secondary-btn" disabled={actionPending} onClick={() => setPublishOptionsOpen(false)}>Cancel</button><button className="primary-btn" disabled={actionPending || configLoading || selectedAccountIds.length === 0 || (scheduleMode === 'scheduled' && !scheduleDate)}>{actionPending ? 'Publishing...' : scheduleMode === 'scheduled' ? 'Approve & schedule' : 'Approve & publish'}</button></div>
      </form>
    </div>}
    {compareOpen && <div className="modal-wrap">
      <section className="modal version-compare-modal" role="dialog" aria-modal="true" aria-labelledby="version-compare-title">
        <button type="button" className="icon-btn modal-close" onClick={() => setCompareOpen(false)}><X /></button>
        <div className="modal-icon"><History /></div><h2 id="version-compare-title">Compare versions</h2><p className="modal-copy">Review the draft before and after editing.</p>
        <div className="version-compare-grid">
          <article><header><select value={compareFrom ?? ''} onChange={(event) => setCompareFrom(Number(event.target.value))}>{versions.map((version) => <option key={version.id} value={version.version_number}>Version {version.version_number}</option>)}</select><time>{fromVersion ? new Date(fromVersion.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</time></header><p className="version-change-note">{fromVersion?.change_note || 'Original AI-generated draft'}</p><pre>{fromVersion?.editor_content || 'No content'}</pre></article>
          <article><header><select value={compareTo ?? ''} onChange={(event) => setCompareTo(Number(event.target.value))}>{versions.map((version) => <option key={version.id} value={version.version_number}>Version {version.version_number}</option>)}</select><time>{toVersion ? new Date(toVersion.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</time></header><p className="version-change-note">{toVersion?.change_note || 'Original AI-generated draft'}</p><pre>{toVersion?.editor_content || 'No content'}</pre></article>
        </div>
        <div className="modal-actions"><button type="button" className="primary-btn" onClick={() => setCompareOpen(false)}>Done</button></div>
      </section>
    </div>}
    {assetsOpen && <div className="modal-wrap">
      <section className="modal assets-modal" role="dialog" aria-modal="true" aria-labelledby="assets-title">
        <button type="button" className="icon-btn modal-close" onClick={() => setAssetsOpen(false)}><X /></button><div className="modal-icon"><Download /></div><h2 id="assets-title">Generated files</h2><p className="modal-copy">Download versioned assets stored securely in Supabase.</p>
        {assetsLoading ? <div className="assets-empty">Loading files...</div> : assets.length === 0 ? <div className="assets-empty">No generated files are available for this content yet.</div> : <div className="assets-list">{assets.map((asset) => <a key={asset.id} href={asset.url || '#'} target="_blank" rel="noreferrer" className={!asset.url ? 'disabled' : ''}><span><FileText /><span><strong>{asset.asset_type.replaceAll('_', ' ')}</strong><small>{asset.storage_path.split('/').at(-2)} · {new Date(asset.created_at).toLocaleDateString('en-US')}</small></span></span><Download /></a>)}</div>}
        <div className="modal-actions"><button type="button" className="primary-btn" onClick={() => setAssetsOpen(false)}>Done</button></div>
      </section>
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
    {deleteOpen && <div className="modal-wrap">
      <section className="modal delete-content-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-content-title">
        <div className="modal-icon danger"><Trash2 /></div>
        <h2 id="delete-content-title">Delete content?</h2>
        <p className="modal-copy">This permanently deletes <strong>{active?.title}</strong>, including its generated versions and review history. This action cannot be undone.</p>
        <div className="modal-actions"><button type="button" className="secondary-btn" disabled={actionPending} onClick={() => setDeleteOpen(false)}>Cancel</button><button type="button" className="delete-content-btn" disabled={actionPending} onClick={deleteItem}>{actionPending ? 'Deleting...' : 'Delete content'}</button></div>
      </section>
    </div>}
    {publishProgressOpen && <div className="workflow-progress-backdrop" role="presentation">
      <section className={`workflow-progress-modal ${publishState}`} role="alertdialog" aria-modal="true" aria-labelledby="publish-progress-title" aria-describedby="publish-progress-message">
        <div className="workflow-progress-icon">{publishState === 'success' ? <Check /> : publishState === 'error' ? <CircleAlert /> : <Send />}</div>
        <h2 id="publish-progress-title">{publishState === 'processing' ? 'Publishing content' : publishState === 'success' ? 'Publishing completed' : 'Publishing failed'}</h2>
        <p id="publish-progress-message">{publishMessage}</p>
        <div className="workflow-progress-track" aria-label={`Publishing progress ${publishProgress}%`}><span style={{ width: `${publishProgress}%` }} /></div>
        <strong>{publishProgress}%</strong>
      </section>
    </div>}
  </section>
}

function HistoryPanel() {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let active = true
    fetch('/api/history', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load activity history.')
        if (active) setEvents(payload.data ?? [])
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Could not load activity history.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const filteredEvents = useMemo(() => events.filter((event) => {
    const matchesQuery = !query.trim() || `${event.title} ${event.action} ${event.detail}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (filter === 'all' || event.status === filter)
  }), [events, filter, query])
  const publishedCount = events.filter((event) => event.status === 'published').length
  const approvedCount = events.filter((event) => event.status === 'approved').length
  const attentionCount = events.filter((event) => ['failed', 'rejected', 'revision_requested'].includes(event.status)).length

  if (loading) return <DashboardPageSkeleton />
  if (error) return <section className="history-page"><div className="queue-state-card error"><CircleAlert /><strong>Could not load history</strong><p>{error}</p></div></section>

  return <section className="history-page">
    <header className="history-heading">
      <div><span>ACTIVITY LOG</span><h1>Activity history</h1><p>Track every submission, draft, review decision, and publication.</p></div>
      <Link className="primary-btn" href="/content"><Plus />Submit content</Link>
    </header>
    <div className="history-stats">
      <article><span>Total activity</span><strong>{events.length}</strong><small>Latest 250 events</small></article>
      <article><span>Approved</span><strong>{approvedCount}</strong><small>Review decisions</small></article>
      <article><span>Published</span><strong>{publishedCount}</strong><small>Sent to GoHighLevel</small></article>
      <article><span>Needs attention</span><strong>{attentionCount}</strong><small>Revision, rejected, or failed</small></article>
    </div>
    <div className="history-card">
      <div className="history-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity or content..." /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter activity">
          <option value="all">All activity</option><option value="received">Submitted</option><option value="pending_review">Draft created</option><option value="revision_requested">Needs revision</option><option value="approved">Approved</option><option value="published">Published</option><option value="failed">Failed</option>
        </select>
      </div>
      {filteredEvents.length === 0 ? <div className="history-empty"><History /><strong>No activity found</strong><p>{events.length ? 'Try another search or filter.' : 'New submissions and review actions will appear here.'}</p></div> :
        <div className="history-list">{filteredEvents.map((event) => {
          const EventIcon = event.status === 'published' ? Send : event.status === 'approved' ? Check : event.status === 'revision_requested' ? MessageSquareText : ['failed', 'rejected'].includes(event.status) ? CircleAlert : event.status === 'pending_review' ? FileText : Inbox
          const date = new Date(event.createdAt)
          return <article key={event.id}>
            <span className={`history-event-icon status-${event.status}`}><EventIcon /></span>
            <div className="history-event-copy"><div><strong>{event.action}</strong><span className={`queue-status status-${event.status}`}>{statusLabel(event.status)}</span></div><h2>{event.title}</h2><p>{event.detail}</p></div>
            <div className="history-event-meta"><time dateTime={event.createdAt}>{Number.isNaN(date.getTime()) ? event.createdAt : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</time><Link href="/queue">View content <ArrowRight /></Link></div>
          </article>
        })}</div>}
    </div>
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
