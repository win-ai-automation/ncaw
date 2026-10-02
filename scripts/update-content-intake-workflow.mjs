import fs from 'node:fs'

const path = new URL('../workflows/01-content-intake.json', import.meta.url)
const workflow = JSON.parse(fs.readFileSync(path, 'utf8'))
const node = (name) => {
  const value = workflow.nodes.find((item) => item.name === name)
  if (!value) throw new Error(`Missing workflow node: ${name}`)
  return value
}

const validate = node('Validate and Normalize')
let validationCode = validate.parameters.jsCode
if (!validationCode.includes('const suppliedMediaUrl')) {
  validationCode = validationCode.replace(
    "const title = String(input.title ?? '').trim();",
    "const title = String(input.title ?? '').trim();\nconst suppliedMediaUrl = String(input.mediaUrl ?? '').trim();",
  )
  validationCode = validationCode.replace(
    "if (!rawUrl && !suppliedContent) throw new Error('Provide url or content');",
    "if (!rawUrl && !suppliedContent && !suppliedMediaUrl) throw new Error('Provide url, content, or mediaUrl');",
  )
  validationCode = validationCode.replace(
    "if (requestedActorId && !/^[a-zA-Z0-9_-]+\\/[a-zA-Z0-9_-]+$/.test(requestedActorId)) throw new Error('Invalid Apify actor ID');",
    "if (suppliedMediaUrl) {\n  const mediaMatch = suppliedMediaUrl.match(/^https:\\/\\/([^\\/?#]+)(?:[\\/?#]|$)/i);\n  if (!mediaMatch) throw new Error('mediaUrl must be a valid HTTPS URL');\n  const mediaHost = mediaMatch[1].toLowerCase().replace(/:\\d+$/, '');\n  if (!(mediaHost === 'fbcdn.net' || mediaHost.endsWith('.fbcdn.net') || mediaHost === 'facebook.com' || mediaHost.endsWith('.facebook.com') || mediaHost === 'supabase.co' || mediaHost.endsWith('.supabase.co'))) throw new Error('Unsupported mediaUrl host');\n}\nif (requestedActorId && !/^[a-zA-Z0-9_-]+\\/[a-zA-Z0-9_-]+$/.test(requestedActorId)) throw new Error('Invalid Apify actor ID');",
  )
  validationCode = validationCode.replace(
    "const defaultActors = { facebook: 'automation-lab/facebook-public-video-downloader' };",
    "const defaultActors = { facebook: 'memo23/facebook-video-downloader' };",
  )
  validationCode = validationCode.replace(
    'platform, suppliedContent, notes, apifyActorId,',
    'platform, suppliedContent, suppliedMediaUrl, notes, apifyActorId,',
  )
}
validationCode = validationCode.replace(
  "mediaHost.endsWith('.facebook.com'))",
  "mediaHost.endsWith('.facebook.com') || mediaHost === 'supabase.co' || mediaHost.endsWith('.supabase.co'))",
)
if (!validationCode.includes('const capturedContent')) {
  validationCode = validationCode.replace(
    "const suppliedMediaUrl = String(input.mediaUrl ?? '').trim();",
    "const suppliedMediaUrl = String(input.mediaUrl ?? '').trim();\nconst capturedContent = String(input.capturedContent ?? '').trim().slice(0, 100000);",
  )
  validationCode = validationCode.replace(
    'suppliedContent, suppliedMediaUrl, notes,',
    'suppliedContent, suppliedMediaUrl, capturedContent, notes,',
  )
}
validate.parameters.jsCode = validationCode

node('Extract with Apify').parameters.body = "={{ JSON.stringify($json.platform === 'facebook' && $json.apifyActorId === 'memo23/facebook-video-downloader' ? { videoUrls: [$json.url], metadataOnly: false, maxFileSizeMb: 100, maxConcurrency: 1 } : { startUrls: [{ url: $json.url }], urls: [$json.url], directUrls: [$json.url], maxItems: 1, resultsLimit: 1 }) }}"

const prepareSource = node('Prepare Source')
prepareSource.parameters.jsCode = prepareSource.parameters.jsCode.replace(
  "const extractionProvider = original.suppliedContent ? 'submitted_content' : $json.extractionProvider === 'apify' ? 'apify' : 'jina';",
  "const extractionProvider = original.suppliedContent ? 'submitted_content' : String($json.extractionProvider || 'jina');",
)

const merge = node('Merge Video Transcript')
merge.parameters.jsCode = "let normalized;\ntry { normalized = $('Prepare Supplied Media').item.json; } catch { normalized = $('Normalize Apify Result').item.json; }\nconst transcript = typeof $json.text === 'string' ? $json.text.trim() : '';\nconst combined = [normalized.apifyContent, transcript ? `VIDEO TRANSCRIPT:\\n${transcript}` : ''].filter(Boolean).join('\\n\\n').slice(0, 100000);\nreturn [{ json: { ...normalized, apifyContent: combined, videoTranscriptFound: Boolean(transcript), extractionProvider: transcript ? `${normalized.extractionProvider}+openai_transcription` : normalized.extractionProvider } }];"

const normalizeApify = node('Normalize Apify Result')
normalizeApify.parameters.jsCode = normalizeApify.parameters.jsCode.replace(
  "const apifyContent = [...new Set(fragments)].join('\\n\\n').slice(0, 100000);",
  "const apifyContent = [...new Set([original.capturedContent, ...fragments].filter(Boolean))].join('\\n\\n').slice(0, 100000);",
)

if (!workflow.nodes.some((item) => item.name === 'Media Supplied?')) {
  workflow.nodes.push({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'has-supplied-media', leftValue: '={{ $json.suppliedMediaUrl }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
    id: '5b383e7c-3139-45d1-9b28-00c17a81bc71',
    name: 'Media Supplied?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [-300, 120],
  })
  workflow.nodes.push({
    parameters: {
      jsCode: "return [{ json: { ...$json, apifyContent: $json.capturedContent || '', mediaUrl: $json.suppliedMediaUrl, videoTranscriptFound: false, extractionProvider: 'browser_extension' } }];",
    },
    id: 'ef66955e-e67e-4987-bf22-503f40ee3824',
    name: 'Prepare Supplied Media',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-80, -100],
  })
}

if (!workflow.nodes.some((item) => item.name === 'Download Apify Video Media')) {
  workflow.nodes.push({
    parameters: {
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      url: '={{ $json.mediaUrl }}',
      options: {
        response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
        timeout: 120000,
      },
    },
    id: 'a836a34a-1df6-4e36-bb3c-bc3204a49eef',
    name: 'Download Apify Video Media',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [650, 120],
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
  })
}

node('Prepare Supplied Media').parameters.jsCode = "return [{ json: { ...$json, apifyContent: $json.capturedContent || '', mediaUrl: $json.suppliedMediaUrl, videoTranscriptFound: false, extractionProvider: 'browser_extension' } }];"
node('Needs Media Transcription?').parameters.conditions = {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
  conditions: [{
    id: 'needs-media-transcription',
    leftValue: "={{ $json.videoTranscriptFound !== true && typeof $json.mediaUrl === 'string' && $json.mediaUrl.trim().length > 0 }}",
    rightValue: true,
    operator: { type: 'boolean', operation: 'true', singleValue: true },
  }],
  combinator: 'and',
}

workflow.connections['Content Supplied?'].main[1] = [{ node: 'Media Supplied?', type: 'main', index: 0 }]
workflow.connections['Media Supplied?'] = { main: [
  [{ node: 'Prepare Supplied Media', type: 'main', index: 0 }],
  [{ node: 'Use Apify?', type: 'main', index: 0 }],
] }
workflow.connections['Prepare Supplied Media'] = { main: [[{ node: 'Download Video Media', type: 'main', index: 0 }]] }
workflow.connections['Needs Media Transcription?'].main[0] = [{ node: 'Download Apify Video Media', type: 'main', index: 0 }]
workflow.connections['Download Apify Video Media'] = { main: [[{ node: 'Transcribe Video Audio', type: 'main', index: 0 }]] }

fs.writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`)
console.log(`Updated ${path.pathname}`)
