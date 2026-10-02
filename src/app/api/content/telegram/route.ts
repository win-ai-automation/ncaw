import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Database, Json } from '@/lib/supabase/database.types'
import { generateSocialImage } from '@/lib/social-image'

type WorkflowResult = {
  requestId?: string
  extractionProvider?: string
  piiRedactions?: number
  sourceContent?: string
  draft?: Record<string, unknown>
}

function verifyTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken || !initData) return false
  const params = new URLSearchParams(initData)
  const suppliedHash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  if (!suppliedHash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 3600) return false
  params.delete('hash')
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest()
  let receivedHash: Buffer
  try { receivedHash = Buffer.from(suppliedHash, 'hex') } catch { return false }
  return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash)
}

function platformForUrl(sourceUrl: string) {
  const host = new URL(sourceUrl).hostname.toLowerCase()
  return host.includes('youtube.com') || host === 'youtu.be' ? 'youtube'
    : host.includes('linkedin.com') ? 'linkedin'
      : host.includes('facebook.com') || host === 'fb.watch' ? 'facebook'
        : host.includes('instagram.com') ? 'instagram'
          : host.includes('threads.net') ? 'threads'
            : host.includes('tiktok.com') ? 'tiktok'
              : host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com') ? 'x' : 'web'
}

function separateFacebookHashtags(payload: Record<string, unknown>) {
  const social = payload.socialPack && typeof payload.socialPack === 'object' && !Array.isArray(payload.socialPack) ? payload.socialPack as Record<string, unknown> : null
  if (!social || typeof social.facebook !== 'string') return
  const post = social.facebook.trim()
  const hashtags = post.match(/(?:\s+#[\p{L}\p{N}_-]+){1,5}\s*$/u)?.[0]
  if (hashtags) social.facebook = `${post.slice(0, post.length - hashtags.length).trimEnd()}\n\n${hashtags.trim().replace(/\s+/g, ' ')}`
}

async function saveAssets(supabase: ReturnType<typeof createClient<Database>>, userId: string, contentId: string, versionId: string, title: string, payload: Record<string, unknown>) {
  const socialPack = payload.socialPack && typeof payload.socialPack === 'object' ? payload.socialPack : {}
  const files = [
    ['case_study_markdown', 'case-study.md', 'text/markdown', payload.caseStudyMarkdown],
    ['case_study_html', 'case-study.html', 'text/html', payload.caseStudyHTML],
    ['social_pack', 'social-pack.json', 'application/json', JSON.stringify(socialPack, null, 2)],
    ['accuracy_review', 'accuracy-review.md', 'text/markdown', payload.accuracyReview],
  ] as const
  for (const [assetType, name, mimeType, value] of files) {
    if (typeof value !== 'string' || !value.trim()) continue
    const storagePath = `${contentId}/v1/${name}`
    const { error: uploadError } = await supabase.storage.from('content-assets').upload(storagePath, new TextEncoder().encode(value), { contentType: mimeType, upsert: true })
    if (uploadError) throw uploadError
    const { error: rowError } = await supabase.from('content_assets').insert({ content_id: contentId, version_id: versionId, asset_type: assetType, storage_path: storagePath, mime_type: mimeType, created_by: userId })
    if (rowError) throw rowError
  }
  const image = await generateSocialImage(title, payload)
  const imagePath = `${contentId}/v1/social-image.${image.extension}`
  const { error: imageUploadError } = await supabase.storage.from('content-assets').upload(imagePath, image.bytes, { contentType: image.mimeType, upsert: true })
  if (imageUploadError) throw imageUploadError
  const { error: imageRowError } = await supabase.from('content_assets').insert({ content_id: contentId, version_id: versionId, asset_type: 'social_image', storage_path: imagePath, mime_type: image.mimeType, created_by: userId })
  if (imageRowError) throw imageRowError
}

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_INGEST_SECRET?.trim()
  const suppliedSecret = request.headers.get('x-telegram-secret')?.trim()
  const body = await request.json().catch(() => null) as { title?: unknown; url?: unknown; notes?: unknown; chatId?: unknown; messageId?: unknown; initData?: unknown } | null
  const initData = typeof body?.initData === 'string' ? body.initData : ''
  const authorizedBySecret = Boolean(expectedSecret && suppliedSecret === expectedSecret)
  if (!authorizedBySecret && !verifyTelegramInitData(initData)) return NextResponse.json({ error: 'Telegram verification failed. Open the form from the bot and try again.' }, { status: 401 })
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const sourceUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 5000) : ''
  if (!title || title.length > 240) return NextResponse.json({ error: 'Title is required and must be 240 characters or fewer.' }, { status: 400 })
  try { if (!['http:', 'https:'].includes(new URL(sourceUrl).protocol)) throw new Error() }
  catch { return NextResponse.json({ error: 'A valid HTTP/HTTPS URL is required.' }, { status: 400 }) }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  const submitterId = process.env.TELEGRAM_SUBMITTER_USER_ID?.trim()
  if (!supabaseUrl || !secretKey || !submitterId) return NextResponse.json({ error: 'Telegram ingestion is not fully configured.' }, { status: 503 })
  const supabase = createClient<Database>(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', submitterId).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'TELEGRAM_SUBMITTER_USER_ID does not match a profile.' }, { status: 503 })

  const platform = platformForUrl(sourceUrl)
  const { data: content, error: contentError } = await supabase.from('content_items').insert({ title, source_url: sourceUrl, submitter_notes: notes || null, platform, submitted_by: submitterId, status: 'processing' }).select().single()
  if (contentError || !content) return NextResponse.json({ error: contentError?.message || 'Could not create content.' }, { status: 500 })
  await supabase.rpc('record_audit_event', { target_content_id: content.id, event_action: 'content.submitted.telegram', event_metadata: { platform, chatId: String(body?.chatId ?? ''), messageId: String(body?.messageId ?? '') } as Json })

  const webhookUrl = process.env.N8N_CONTENT_WEBHOOK_URL?.trim()
  const webhookSecret = process.env.CONTENT_WEBHOOK_SECRET?.trim()
  if (!webhookUrl || !webhookSecret) return NextResponse.json({ error: 'Content workflow is not configured.', contentId: content.id }, { status: 503 })
  try {
    const actors: Record<string, string | undefined> = { facebook: process.env.APIFY_ACTOR_FACEBOOK, youtube: process.env.APIFY_ACTOR_YOUTUBE, linkedin: process.env.APIFY_ACTOR_LINKEDIN, instagram: process.env.APIFY_ACTOR_INSTAGRAM, threads: process.env.APIFY_ACTOR_THREADS, tiktok: process.env.APIFY_ACTOR_TIKTOK, x: process.env.APIFY_ACTOR_X }
    const workflowResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-content-secret': webhookSecret },
      body: JSON.stringify({ contentId: content.id, title, url: sourceUrl, notes, apifyActorId: (actors[platform] || '').trim() }),
      signal: AbortSignal.timeout(600000),
    })
    const workflow = await workflowResponse.json().catch(() => null) as WorkflowResult | null
    if (!workflowResponse.ok || !workflow?.draft) throw new Error(`n8n returned HTTP ${workflowResponse.status}`)
    separateFacebookHashtags(workflow.draft)
    const draftText = typeof workflow.draft.caseStudyMarkdown === 'string' ? workflow.draft.caseStudyMarkdown : JSON.stringify(workflow.draft, null, 2)
    const flags = Array.isArray(workflow.draft.riskFlags) ? workflow.draft.riskFlags.filter((value): value is string => typeof value === 'string') : []
    const requestedRisk = typeof workflow.draft.riskLevel === 'string' ? workflow.draft.riskLevel.toLowerCase() : ''
    const riskLevel = ['low', 'medium', 'high'].includes(requestedRisk) ? requestedRisk as 'low' | 'medium' | 'high' : flags.length ? 'medium' : 'low'
    const { data: version, error: versionError } = await supabase.from('content_versions').insert({ content_id: content.id, version_number: 1, generated_payload: workflow.draft as Json, editor_content: draftText, created_by: submitterId }).select().single()
    if (versionError || !version) throw versionError || new Error('Could not save generated version.')
    let warning = ''
    try { await saveAssets(supabase, submitterId, content.id, version.id, title, workflow.draft) }
    catch (error) { warning = error instanceof Error ? error.message : 'Assets could not be saved.' }
    await supabase.from('content_items').update({ status: 'pending_review', raw_content: typeof workflow.sourceContent === 'string' ? workflow.sourceContent : null, external_job_id: workflow.requestId || null, risk_flags: flags, risk_level: riskLevel }).eq('id', content.id)
    await supabase.rpc('record_audit_event', { target_content_id: content.id, event_action: 'draft.generated', event_metadata: { source: 'telegram', versionId: version.id, riskLevel } as Json })
    return NextResponse.json({ data: { contentId: content.id, title, status: 'pending_review' }, warning: warning || undefined }, { status: 201 })
  } catch (error) {
    await supabase.from('content_items').update({ status: 'failed' }).eq('id', content.id)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content generation failed.', contentId: content.id }, { status: 502 })
  }
}
