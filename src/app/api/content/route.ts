import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

type WorkflowResult = {
  requestId?: string
  status?: string
  draft?: Record<string, unknown>
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('content_items').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { title?: unknown; url?: unknown; content?: unknown; notes?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const sourceUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  const rawContent = typeof body?.content === 'string' ? body.content.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 5000) : null
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
  if (title.length > 240) return NextResponse.json({ error: 'Title must be 240 characters or fewer' }, { status: 400 })
  if (!sourceUrl && !rawContent) return NextResponse.json({ error: 'A URL or content is required' }, { status: 400 })
  if (rawContent.length > 100000) return NextResponse.json({ error: 'Content must be 100,000 characters or fewer' }, { status: 400 })
  let platform = 'web'
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      const host = url.hostname.toLowerCase()
      platform = host.includes('youtube.com') || host === 'youtu.be' ? 'youtube'
        : host.includes('linkedin.com') ? 'linkedin'
          : host.includes('facebook.com') || host === 'fb.watch' ? 'facebook'
            : host.includes('instagram.com') ? 'instagram'
              : host.includes('threads.net') ? 'threads'
                : host.includes('tiktok.com') ? 'tiktok'
                  : host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com') ? 'x' : 'web'
    }
    catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }) }
  }
  const { data, error } = await supabase.from('content_items').insert({ title, source_url: sourceUrl || null, raw_content: rawContent || null, submitter_notes: notes, platform, submitted_by: user.id, status: 'received' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const webhookUrl = process.env.N8N_CONTENT_WEBHOOK_URL
  const webhookSecret = process.env.CONTENT_WEBHOOK_SECRET
  if (!webhookUrl || !webhookSecret) {
    return NextResponse.json({ data, warning: 'Content was saved, but the n8n webhook is not configured.' }, { status: 201 })
  }

  await supabase.from('content_items').update({ status: 'processing' }).eq('id', data.id)
  try {
    const workflowResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-content-secret': webhookSecret },
      body: JSON.stringify({ contentId: data.id, title, url: sourceUrl, content: rawContent, notes }),
      signal: AbortSignal.timeout(125000),
    })
    const workflow = await workflowResponse.json().catch(() => null) as WorkflowResult | null
    if (!workflowResponse.ok || !workflow?.draft) {
      throw new Error(`n8n returned ${workflowResponse.status}${workflowResponse.statusText ? ` ${workflowResponse.statusText}` : ''}`)
    }

    const draftText = typeof workflow.draft.caseStudyMarkdown === 'string'
      ? workflow.draft.caseStudyMarkdown
      : JSON.stringify(workflow.draft, null, 2)
    const riskFlags = Array.isArray(workflow.draft.riskFlags)
      ? workflow.draft.riskFlags.filter((value): value is string => typeof value === 'string')
      : []
    const { error: versionError } = await supabase.from('content_versions').insert({
      content_id: data.id,
      version_number: 1,
      generated_payload: workflow.draft as Json,
      editor_content: draftText,
      created_by: user.id,
    })
    if (versionError) throw versionError
    const { data: updated, error: updateError } = await supabase.from('content_items').update({
      status: 'pending_review',
      external_job_id: workflow.requestId ?? null,
      risk_flags: riskFlags,
      risk_level: riskFlags.length >= 3 ? 'high' : riskFlags.length ? 'medium' : 'low',
    }).eq('id', data.id).select().single()
    if (updateError) throw updateError
    return NextResponse.json({ data: updated, workflow }, { status: 201 })
  } catch (workflowError) {
    await supabase.from('content_items').update({ status: 'failed' }).eq('id', data.id)
    return NextResponse.json({
      error: workflowError instanceof Error ? workflowError.message : 'The n8n workflow failed.',
      data: { ...data, status: 'failed' },
    }, { status: 502 })
  }
}
