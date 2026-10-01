import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const body = await request.json().catch(() => null) as { url?: unknown; content?: unknown; notes?: unknown } | null
  const sourceUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  const rawContent = typeof body?.content === 'string' ? body.content.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 5000) : null
  if (!sourceUrl && !rawContent) return NextResponse.json({ error: 'A URL or content is required' }, { status: 400 })
  if (sourceUrl) {
    try { const url = new URL(sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() }
    catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }) }
  }
  const { data, error } = await supabase.from('content_items').insert({ source_url: sourceUrl || null, raw_content: rawContent || null, submitter_notes: notes, submitted_by: user.id, status: 'received' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
