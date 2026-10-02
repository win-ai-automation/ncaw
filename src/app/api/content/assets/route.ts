import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSocialImage } from '@/lib/social-image'

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

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { contentId?: unknown; versionId?: unknown; regenerate?: unknown; instructions?: unknown } | null
  const contentId = typeof body?.contentId === 'string' ? body.contentId.trim() : ''
  const versionId = typeof body?.versionId === 'string' ? body.versionId.trim() : ''
  const regenerate = body?.regenerate === true
  const instructions = typeof body?.instructions === 'string' ? body.instructions.trim().slice(0, 2000) : ''
  if (!contentId || !versionId) return NextResponse.json({ error: 'Content ID and version ID are required' }, { status: 400 })

  const { data: existing } = await supabase.from('content_assets').select('*').eq('content_id', contentId).eq('version_id', versionId).eq('asset_type', 'social_image').maybeSingle()
  if (existing && !regenerate) {
    const { data: signed } = await supabase.storage.from('content-assets').createSignedUrl(existing.storage_path, 900)
    return NextResponse.json({ data: { ...existing, url: signed?.signedUrl ?? null } })
  }

  const [{ data: content, error: contentError }, { data: version, error: versionError }] = await Promise.all([
    supabase.from('content_items').select('id,title').eq('id', contentId).single(),
    supabase.from('content_versions').select('id,content_id,version_number,generated_payload').eq('id', versionId).eq('content_id', contentId).single(),
  ])
  if (contentError || !content) return NextResponse.json({ error: contentError?.message || 'Content was not found' }, { status: 404 })
  if (versionError || !version) return NextResponse.json({ error: versionError?.message || 'Content version was not found' }, { status: 404 })

  try {
    const payload = version.generated_payload && typeof version.generated_payload === 'object' && !Array.isArray(version.generated_payload)
      ? version.generated_payload as Record<string, unknown>
      : {}
    const image = await generateSocialImage(content.title, payload, instructions)
    const storagePath = `${contentId}/v${version.version_number}/social-image.${image.extension}`
    const { error: uploadError } = await supabase.storage.from('content-assets').upload(storagePath, image.bytes, { contentType: image.mimeType, upsert: true })
    if (uploadError) throw uploadError
    let asset = existing
    if (!asset) {
      const { data: insertedAsset, error: insertError } = await supabase.from('content_assets').insert({ content_id: contentId, version_id: versionId, asset_type: 'social_image', storage_path: storagePath, mime_type: image.mimeType, created_by: user.id }).select().single()
      if (insertError) throw insertError
      asset = insertedAsset
    }
    const { data: signed } = await supabase.storage.from('content-assets').createSignedUrl(storagePath, 900)
    return NextResponse.json({ data: { ...asset, url: signed?.signedUrl ?? null } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not generate the social image.' }, { status: 502 })
  }
}
