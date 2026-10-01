import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return NextResponse.json({ data: [] })
  if (query.length > 100) return NextResponse.json({ error: 'Search query is too long' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to search' }, { status: 401 })

  // Escape PostgREST pattern characters so user input is treated as text.
  const safeQuery = query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
  const { data, error } = await supabase
    .from('content_items')
    .select('id,title,platform,status,source_url,created_at')
    .ilike('title', `%${safeQuery}%`)
    .order('updated_at', { ascending: false })
    .limit(8)

  if (error) return NextResponse.json({ error: 'Unable to search content' }, { status: 500 })
  return NextResponse.json({ data })
}
