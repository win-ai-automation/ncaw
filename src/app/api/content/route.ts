import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

type WorkflowResult = {
  requestId?: string
  status?: string
  message?: string
  extractionProvider?: string
  piiRedactions?: number
  sourceContent?: string
  draft?: Record<string, unknown>
}

const MAX_SOURCE_MEDIA_BYTES = 24 * 1024 * 1024

function isTrustedFacebookMediaUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (host === 'fbcdn.net' || host.endsWith('.fbcdn.net') || host === 'facebook.com' || host.endsWith('.facebook.com'))
  } catch { return false }
}

async function downloadFacebookMedia(value: string) {
  let current = value
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!isTrustedFacebookMediaUrl(current)) throw new Error('Facebook media redirected to an unsupported host')
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 NetfintaxContentDesk/1.0' },
      signal: AbortSignal.timeout(120000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Facebook media redirect had no location')
      current = new URL(location, current).toString()
      continue
    }
    if (!response.ok) throw new Error(`Facebook media returned HTTP ${response.status}`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > MAX_SOURCE_MEDIA_BYTES) throw new Error('Facebook video exceeds the 24 MB transcription limit')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_SOURCE_MEDIA_BYTES) throw new Error('Facebook video is empty or exceeds the 24 MB transcription limit')
    const contentType = (response.headers.get('content-type') || 'video/mp4').split(';')[0].trim().toLowerCase()
    if (!(contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType === 'application/octet-stream')) throw new Error('Facebook returned a non-media response')
    return { bytes, contentType: contentType === 'application/octet-stream' ? 'video/mp4' : contentType }
  }
  throw new Error('Facebook media redirected too many times')
}

async function saveGeneratedAssets(supabase: SupabaseClient<Database>, userId: string, contentId: string, versionId: string, versionNumber: number, payload: Record<string, unknown>) {
  const socialPack = payload.socialPack && typeof payload.socialPack === 'object' ? payload.socialPack : {}
  const files = [
    { type: 'case_study_markdown' as const, name: 'case-study.md', mime: 'text/markdown', value: payload.caseStudyMarkdown },
    { type: 'case_study_html' as const, name: 'case-study.html', mime: 'text/html', value: payload.caseStudyHTML },
    { type: 'social_pack' as const, name: 'social-pack.json', mime: 'application/json', value: JSON.stringify(socialPack, null, 2) },
    { type: 'accuracy_review' as const, name: 'accuracy-review.md', mime: 'text/markdown', value: payload.accuracyReview },
  ].filter((file) => typeof file.value === 'string' && file.value.trim())
  const rows: Database['public']['Tables']['content_assets']['Insert'][] = []
  for (const file of files) {
    const storagePath = `${contentId}/v${versionNumber}/${file.name}`
    const bytes = new TextEncoder().encode(file.value as string)
    const { error } = await supabase.storage.from('content-assets').upload(storagePath, bytes, { contentType: file.mime, upsert: true })
    if (error) throw error
    rows.push({ content_id: contentId, version_id: versionId, asset_type: file.type, storage_path: storagePath, mime_type: file.mime, created_by: userId })
  }
  if (rows.length) {
    const { error } = await supabase.from('content_assets').insert(rows)
    if (error) throw error
  }
}

async function recordAudit(supabase: SupabaseClient<Database>, contentId: string | null, action: string, metadata: Record<string, Json | undefined> = {}) {
  try { await supabase.rpc('record_audit_event', { target_content_id: contentId, event_action: action, event_metadata: metadata as Json }) }
  catch { /* Audit failures must not corrupt the primary operation. */ }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('content_items').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const contentIds = data.map((item) => item.id)
  const { data: versions, error: versionsError } = contentIds.length
    ? await supabase.from('content_versions').select('*').in('content_id', contentIds).order('version_number', { ascending: false })
    : { data: [], error: null }
  if (versionsError) return NextResponse.json({ error: versionsError.message }, { status: 500 })
  const latestVersions = new Map<string, (typeof versions)[number]>()
  const versionsByContent = new Map<string, typeof versions>()
  versions.forEach((version) => {
    if (!latestVersions.has(version.content_id)) latestVersions.set(version.content_id, version)
    versionsByContent.set(version.content_id, [...(versionsByContent.get(version.content_id) ?? []), version])
  })
  return NextResponse.json({ data: data.map((item) => ({ ...item, latest_version: latestVersions.get(item.id) ?? null, versions: versionsByContent.get(item.id) ?? [] })) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc('check_and_record_rate_limit', {
    bucket_name: 'content.generate',
    request_limit: 10,
    window_seconds: 60,
  })
  if (rateLimitError) return NextResponse.json({ error: 'Could not verify the submission rate limit' }, { status: 503 })
  if (!withinRateLimit) {
    return NextResponse.json({ error: 'Too many submissions. Please wait one minute and try again.' }, {
      status: 429,
      headers: { 'Retry-After': '60' },
    })
  }
  const body = await request.json().catch(() => null) as { title?: unknown; url?: unknown; content?: unknown; notes?: unknown; mediaUrl?: unknown; capturedContent?: unknown; canonicalUrl?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const sourceUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  const rawContent = typeof body?.content === 'string' ? body.content.trim() : ''
  const capturedContent = typeof body?.capturedContent === 'string' ? body.capturedContent.trim().slice(0, 100000) : ''
  const canonicalUrl = typeof body?.canonicalUrl === 'string' ? body.canonicalUrl.trim() : ''
  const suppliedMediaUrl = typeof body?.mediaUrl === 'string' ? body.mediaUrl.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 5000) : null
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
  if (title.length > 240) return NextResponse.json({ error: 'Title must be 240 characters or fewer' }, { status: 400 })
  if (!sourceUrl && !rawContent) return NextResponse.json({ error: 'A URL or content is required' }, { status: 400 })
  if (rawContent.length > 100000) return NextResponse.json({ error: 'Content must be 100,000 characters or fewer' }, { status: 400 })
  if (suppliedMediaUrl && !isTrustedFacebookMediaUrl(suppliedMediaUrl)) return NextResponse.json({ error: 'The browser helper returned an unsupported media URL' }, { status: 400 })
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
  const apifyActors: Record<string, string | undefined> = {
    facebook: process.env.APIFY_ACTOR_FACEBOOK,
    youtube: process.env.APIFY_ACTOR_YOUTUBE,
    linkedin: process.env.APIFY_ACTOR_LINKEDIN,
    instagram: process.env.APIFY_ACTOR_INSTAGRAM,
    threads: process.env.APIFY_ACTOR_THREADS,
    tiktok: process.env.APIFY_ACTOR_TIKTOK,
    x: process.env.APIFY_ACTOR_X,
  }
  const apifyActorId = (apifyActors[platform] ?? '').trim()
  const { data, error } = await supabase.from('content_items').insert({ title, source_url: sourceUrl || null, raw_content: rawContent || null, submitter_notes: notes, platform, submitted_by: user.id, status: 'received' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit(supabase, data.id, 'content.submitted', { platform, sourceType: sourceUrl ? 'url' : 'pasted_content' })

  let workflowMediaUrl = suppliedMediaUrl
  if (suppliedMediaUrl) {
    try {
      const media = await downloadFacebookMedia(suppliedMediaUrl)
      const storagePath = `${user.id}/${data.id}/source.mp4`
      const { error: uploadError } = await supabase.storage.from('content-source-media').upload(storagePath, media.bytes, { contentType: media.contentType, upsert: true })
      if (uploadError) throw uploadError
      const { data: signed, error: signedError } = await supabase.storage.from('content-source-media').createSignedUrl(storagePath, 900)
      if (signedError || !signed?.signedUrl) throw signedError || new Error('Could not sign uploaded source media')
      workflowMediaUrl = signed.signedUrl
      await recordAudit(supabase, data.id, 'source_media.captured', { storagePath, byteLength: media.bytes.length })
    } catch (captureError) {
      await recordAudit(supabase, data.id, 'source_media.capture_failed', { message: captureError instanceof Error ? captureError.message : 'Unknown media capture error' })
    }
  }

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
      body: JSON.stringify({ contentId: data.id, title, url: canonicalUrl || sourceUrl, originalUrl: sourceUrl, content: rawContent || (!workflowMediaUrl ? capturedContent : ''), capturedContent, notes, apifyActorId, mediaUrl: workflowMediaUrl }),
      // Video extraction and speech-to-text can take several minutes.
      signal: AbortSignal.timeout(600000),
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
    const requestedRiskLevel = typeof workflow.draft.riskLevel === 'string' ? workflow.draft.riskLevel.toLowerCase() : ''
    const riskLevel = ['low', 'medium', 'high'].includes(requestedRiskLevel) ? requestedRiskLevel as 'low' | 'medium' | 'high' : riskFlags.length >= 3 ? 'high' : riskFlags.length ? 'medium' : 'low'
    const { data: createdVersion, error: versionError } = await supabase.from('content_versions').insert({
      content_id: data.id,
      version_number: 1,
      generated_payload: workflow.draft as Json,
      editor_content: draftText,
      created_by: user.id,
    }).select().single()
    if (versionError) throw versionError
    let assetWarning = ''
    try { await saveGeneratedAssets(supabase, user.id, data.id, createdVersion.id, createdVersion.version_number, workflow.draft) }
    catch (assetError) { assetWarning = assetError instanceof Error ? assetError.message : 'Generated assets could not be saved.' }
    const { data: updated, error: updateError } = await supabase.from('content_items').update({
      status: 'pending_review',
      raw_content: rawContent || (typeof workflow.sourceContent === 'string' ? workflow.sourceContent : null),
      external_job_id: workflow.requestId ?? null,
      risk_flags: riskFlags,
      risk_level: riskLevel,
    }).eq('id', data.id).select().single()
    if (updateError) throw updateError
    await recordAudit(supabase, data.id, 'draft.generated', {
      versionId: createdVersion.id,
      versionNumber: createdVersion.version_number,
      riskLevel,
      riskFlagCount: riskFlags.length,
      extractionProvider: workflow.extractionProvider ?? 'unknown',
      piiRedactions: workflow.piiRedactions ?? 0,
    })
    return NextResponse.json({ data: updated, workflow, warning: assetWarning ? `Draft created, but assets were not saved: ${assetWarning}` : undefined }, { status: 201 })
  } catch (workflowError) {
    await supabase.from('content_items').update({ status: 'failed' }).eq('id', data.id)
    await recordAudit(supabase, data.id, 'workflow.failed', { message: workflowError instanceof Error ? workflowError.message : 'Unknown workflow error' })
    return NextResponse.json({
      error: workflowError instanceof Error ? workflowError.message : 'The n8n workflow failed.',
      data: { ...data, status: 'failed' },
    }, { status: 502 })
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown; comment?: unknown; draft?: unknown; changeNote?: unknown; accountIds?: unknown; scheduleDate?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const action = body?.action === 'approve' || body?.action === 'request_revision' || body?.action === 'save_draft' ? body.action : null
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 5000) : ''
  const draft = typeof body?.draft === 'string' ? body.draft.trim() : ''
  const changeNote = typeof body?.changeNote === 'string' ? body.changeNote.trim().slice(0, 1000) : ''
  const requestedAccountIds = Array.isArray(body?.accountIds) ? body.accountIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean) : []
  const scheduleDate = typeof body?.scheduleDate === 'string' ? body.scheduleDate.trim() : ''
  if (!id || !action) return NextResponse.json({ error: 'Invalid review action' }, { status: 400 })
  if (action === 'request_revision' && !comment) return NextResponse.json({ error: 'A revision note is required' }, { status: 400 })
  if (action === 'save_draft' && !draft) return NextResponse.json({ error: 'Draft content is required' }, { status: 400 })

  const { data: currentVersion, error: versionError } = await supabase.from('content_versions')
    .select('*').eq('content_id', id).order('version_number', { ascending: false }).limit(1).maybeSingle()
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })
  if (!currentVersion) return NextResponse.json({ error: 'No draft is available for review' }, { status: 409 })

  let version = currentVersion
  if (draft && draft !== (currentVersion.editor_content ?? '').trim()) {
    const currentPayload = currentVersion.generated_payload && typeof currentVersion.generated_payload === 'object' && !Array.isArray(currentVersion.generated_payload) ? currentVersion.generated_payload : {}
    const updatedPayload = { ...currentPayload, caseStudyMarkdown: draft } as Json
    const { data: savedVersion, error: saveError } = await supabase.from('content_versions').insert({
      content_id: id,
      version_number: currentVersion.version_number + 1,
      generated_payload: updatedPayload,
      editor_content: draft,
      change_note: changeNote || (action === 'save_draft' ? 'Draft edited manually.' : 'Draft edited during review.'),
      created_by: user.id,
    }).select().single()
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
    version = savedVersion
    try { await saveGeneratedAssets(supabase, user.id, id, savedVersion.id, savedVersion.version_number, updatedPayload as Record<string, unknown>) }
    catch { /* Asset storage must not prevent editorial work. */ }
    await recordAudit(supabase, id, 'draft.version_created', { versionId: savedVersion.id, versionNumber: savedVersion.version_number, changeNote: changeNote || null })
  }

  if (action === 'save_draft') {
    await supabase.from('content_items').update({ status: 'pending_review' }).eq('id', id)
    return NextResponse.json({ data: version, message: `Draft version ${version.version_number} saved successfully.` })
  }

  const decision = action === 'approve' ? 'approve' : 'request_revision'
  const { error: reviewError } = await supabase.from('content_reviews').insert({
    content_id: id,
    version_id: version.id,
    reviewer_id: user.id,
    decision,
    comment: comment || null,
  })
  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 403 })
  await recordAudit(supabase, id, action === 'approve' ? 'review.approved' : 'review.revision_requested', { versionId: version.id, versionNumber: version.version_number, comment: comment || null })

  const nextStatus = action === 'approve' ? 'approved' : 'revision_requested'
  const { data, error } = await supabase.from('content_items').update({ status: nextStatus }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (action === 'request_revision') return NextResponse.json({ data, message: 'Revision requested successfully.' })

  const publishWebhookUrl = process.env.N8N_PUBLISH_WEBHOOK_URL
  const webhookSecret = process.env.CONTENT_WEBHOOK_SECRET
  const locationId = process.env.GHL_LOCATION_ID
  const userId = process.env.GHL_USER_ID
  let configuredAccountIds = (process.env.GHL_ACCOUNT_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  try {
    const configuredAccounts = JSON.parse(process.env.GHL_SOCIAL_ACCOUNTS_JSON || '[]') as Array<{ id?: unknown }>
    const ids = configuredAccounts.map((account) => typeof account?.id === 'string' ? account.id.trim() : '').filter(Boolean)
    if (ids.length) configuredAccountIds = ids
  } catch { /* Use legacy account IDs. */ }
  const accountIds = requestedAccountIds.length ? requestedAccountIds.filter((id) => configuredAccountIds.includes(id)) : configuredAccountIds
  if (requestedAccountIds.length && accountIds.length !== requestedAccountIds.length) return NextResponse.json({ error: 'One or more selected publishing accounts are invalid.' }, { status: 400 })
  let normalizedScheduleDate = ''
  if (scheduleDate) {
    const timestamp = new Date(scheduleDate)
    if (Number.isNaN(timestamp.getTime()) || timestamp.getTime() <= Date.now() + 60000) return NextResponse.json({ error: 'Scheduled publishing time must be at least one minute in the future.' }, { status: 400 })
    normalizedScheduleDate = timestamp.toISOString()
  }
  const { data: configuredItem, error: configurationError } = await supabase.from('content_items').update({
    target_account_ids: accountIds as Json,
    scheduled_at: normalizedScheduleDate || null,
  }).eq('id', id).select().single()
  if (configurationError) return NextResponse.json({ error: configurationError.message }, { status: 500 })
  if (!publishWebhookUrl || !webhookSecret || !locationId || !userId || accountIds.length === 0) {
    return NextResponse.json({ data: configuredItem, message: 'Content approved successfully.', warning: 'Publishing is not configured yet. The content remains approved.' })
  }

  try {
    const publishResponse = await fetch(publishWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-content-secret': webhookSecret },
      body: JSON.stringify({ contentId: data.id, title: data.title, platform: data.platform, sourceUrl: data.source_url, versionId: version.id, versionNumber: version.version_number, draft: version.editor_content, generatedPayload: version.generated_payload, locationId, userId, accountIds, scheduleDate: normalizedScheduleDate || null }),
      signal: AbortSignal.timeout(125000),
    })
    const publishResult = await publishResponse.json().catch(() => null) as { status?: string; externalId?: string; publishedAt?: string; message?: string } | null
    if (!publishResponse.ok) throw new Error(publishResult?.message || `n8n returned ${publishResponse.status}`)
    const publishStatus = publishResult?.status === 'published' ? 'published' : publishResult?.status === 'scheduled' ? 'scheduled' : 'approved'
    const { data: publishedItem, error: publishUpdateError } = await supabase.from('content_items').update({ status: publishStatus, external_job_id: publishResult?.externalId || configuredItem.external_job_id, scheduled_at: publishStatus === 'scheduled' ? normalizedScheduleDate : null, published_at: publishStatus === 'published' ? publishResult?.publishedAt || new Date().toISOString() : null }).eq('id', id).select().single()
    if (publishUpdateError) throw publishUpdateError
    await recordAudit(supabase, id, publishStatus === 'scheduled' ? 'publish.scheduled' : publishStatus === 'published' ? 'publish.completed' : 'publish.sent', { externalId: publishResult?.externalId || null, accountIds, scheduledAt: normalizedScheduleDate || null })
    return NextResponse.json({ data: publishedItem, message: publishResult?.message || (publishStatus === 'published' ? 'Content approved and published successfully.' : 'Content approved and sent to publishing.') })
  } catch (publishError) {
    await recordAudit(supabase, id, 'publish.failed', { message: publishError instanceof Error ? publishError.message : 'Unknown publishing error', accountIds, scheduledAt: normalizedScheduleDate || null })
    return NextResponse.json({ data: configuredItem, message: 'Content approved successfully.', warning: publishError instanceof Error ? `Publishing failed: ${publishError.message}` : 'Publishing failed. The content remains approved.' })
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return NextResponse.json({ error: 'Only administrators can delete content.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Content ID is required' }, { status: 400 })

  await recordAudit(supabase, id, 'content.deleted', {})
  const { error } = await supabase.from('content_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: 'Content deleted successfully.' })
}
