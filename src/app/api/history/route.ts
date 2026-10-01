import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type HistoryEvent = {
  id: string
  contentId: string
  title: string
  action: string
  detail: string
  status: string
  createdAt: string
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: items, error } = await supabase.from('content_items')
    .select('id,title,platform,status,created_at,updated_at,published_at')
    .order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = items.map((item) => item.id)
  const [{ data: versions, error: versionError }, { data: reviews, error: reviewError }] = ids.length
    ? await Promise.all([
      supabase.from('content_versions').select('id,content_id,version_number,created_at').in('content_id', ids),
      supabase.from('content_reviews').select('id,content_id,decision,comment,created_at').in('content_id', ids),
    ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (versionError || reviewError) return NextResponse.json({ error: versionError?.message || reviewError?.message }, { status: 500 })

  const titles = new Map(items.map((item) => [item.id, item.title]))
  const events: HistoryEvent[] = []
  for (const item of items) {
    events.push({ id: `submitted-${item.id}`, contentId: item.id, title: item.title, action: 'Content submitted', detail: `Source received from ${item.platform}.`, status: 'received', createdAt: item.created_at })
    if (['processing', 'failed', 'scheduled', 'published'].includes(item.status)) {
      const labels: Record<string, string> = { processing: 'Processing started', failed: 'Workflow failed', scheduled: 'Publication scheduled', published: 'Content published' }
      events.push({ id: `status-${item.id}-${item.status}`, contentId: item.id, title: item.title, action: labels[item.status], detail: item.status === 'published' ? 'Published through GoHighLevel.' : `Current status: ${item.status}.`, status: item.status, createdAt: item.published_at || item.updated_at })
    }
  }
  for (const version of versions ?? []) {
    events.push({ id: `version-${version.id}`, contentId: version.content_id, title: titles.get(version.content_id) || 'Deleted content', action: `Draft version ${version.version_number} created`, detail: 'AI draft prepared for human review.', status: 'pending_review', createdAt: version.created_at })
  }
  for (const review of reviews ?? []) {
    const approved = review.decision === 'approve'
    events.push({ id: `review-${review.id}`, contentId: review.content_id, title: titles.get(review.content_id) || 'Deleted content', action: approved ? 'Content approved' : review.decision === 'request_revision' ? 'Revision requested' : 'Content rejected', detail: review.comment || (approved ? 'Approved for publication.' : 'A reviewer decision was recorded.'), status: approved ? 'approved' : review.decision === 'request_revision' ? 'revision_requested' : 'rejected', createdAt: review.created_at })
  }

  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return NextResponse.json({ data: events.slice(0, 250) })
}
