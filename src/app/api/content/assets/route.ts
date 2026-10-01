import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const contentId = new URL(request.url).searchParams.get('contentId')?.trim()
  if (!contentId) return NextResponse.json({ error: 'Content ID is required' }, { status: 400 })

  const { data: assets, error } = await supabase.from('content_assets').select('*').eq('content_id', contentId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const data = await Promise.all(assets.map(async (asset) => {
    const { data: signed } = await supabase.storage.from('content-assets').createSignedUrl(asset.storage_path, 900)
    return { ...asset, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json({ data })
}
