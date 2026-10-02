type SocialImageResult = {
  bytes: Uint8Array
  mimeType: 'image/jpeg'
  extension: 'jpg'
  model: string
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function generateSocialImage(title: string, payload: Record<string, unknown>, additionalInstructions = ''): Promise<SocialImageResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for social image generation.')

  const socialPack = payload.socialPack && typeof payload.socialPack === 'object' && !Array.isArray(payload.socialPack)
    ? payload.socialPack as Record<string, unknown>
    : {}
  const sourceSummary = textValue(payload.summary) || textValue(socialPack.facebook) || textValue(payload.caseStudyMarkdown)
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare'
  const prompt = [
    'Create one polished editorial social-media image that can be reused on Facebook, LinkedIn, Instagram, and Threads.',
    'Use a professional financial-services visual style: trustworthy, modern, calm, clean composition, navy and blue palette with a subtle warm accent.',
    'Landscape composition at 1.92:1. Keep important subjects in the central safe area so the image can be cropped for other platforms.',
    'Do not include logos, brand names, hashtags, UI screenshots, watermarks, signatures, or fine-print text. Avoid depicting identifiable real people.',
    `Topic: ${title.slice(0, 240)}`,
    sourceSummary ? `Source-grounded context: ${sourceSummary.slice(0, 1800)}` : '',
    additionalInstructions.trim() ? `Requested revision: ${additionalInstructions.trim().slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n')

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1536x800',
      quality: 'medium',
      output_format: 'jpeg',
      output_compression: 85,
    }),
    signal: AbortSignal.timeout(180000),
  })
  const result = await response.json().catch(() => null) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } } | null
  if (!response.ok) throw new Error(result?.error?.message || `OpenAI image generation returned HTTP ${response.status}.`)
  const encoded = result?.data?.[0]?.b64_json
  if (!encoded) throw new Error('OpenAI image generation returned no image data.')
  return { bytes: new Uint8Array(Buffer.from(encoded, 'base64')), mimeType: 'image/jpeg', extension: 'jpg', model }
}
