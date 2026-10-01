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

        {section === 'content' ? <ContentIntakePanel /> : <DashboardPageSkeleton />}

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!title.trim()) return setError('Enter a title for this content.')
    if (!url.trim() && !content.trim()) return setError('Add a source URL or paste the source content.')
    setSubmitting(true)
    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, content, notes }),
      })
      const payload = await response.json() as { data?: { id: string }; error?: string; warning?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to submit content.')
      setTitle('')
      setUrl('')
      setContent('')
      setNotes('')
      setSuccess(payload.warning || `Draft created and sent to review. Reference: ${payload.data?.id ?? ''}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit content.')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="content-intake-page">
    <header><div><span>CONTENT INTAKE</span><h1>Submit content</h1><p>Add a source for the content automation workflow.</p></div></header>
    <form className="content-intake-card" onSubmit={submit} noValidate>
      {error && <div className="content-form-message error"><CircleAlert />{error}</div>}
      {success && <div className="content-form-message success"><Check />{success}</div>}
      <label>Title <em>*</em><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="Enter a clear working title" /></label>
      <label>Source URL <small>Use a public URL when available</small><div className="content-url-input"><Link2 /><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/content" /></div></label>
      <div className="content-form-divider"><span>or paste the source</span></div>
      <label>Source content <small>Up to 100,000 characters</small><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={100000} placeholder="Paste the original article, transcript, or post here..." /></label>
      <label>Instructions for AI <small>Optional</small><textarea className="content-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Audience, tone, output requirements, or context..." /></label>
      <footer><p><ShieldCheck />Human review is required before publication.</p><button className="primary-btn" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit content'}</button></footer>
    </form>
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
