import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SocialAccount = { id: string; name: string; platform: string }

function configuredAccountIds() {
  return (process.env.GHL_ACCOUNT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
}

async function configuredAccounts(): Promise<SocialAccount[]> {
  try {
    const parsed = JSON.parse(process.env.GHL_SOCIAL_ACCOUNTS_JSON || '[]') as unknown
    if (Array.isArray(parsed)) {
      const accounts = parsed.filter((account): account is SocialAccount => Boolean(account && typeof account === 'object' && typeof (account as SocialAccount).id === 'string' && typeof (account as SocialAccount).name === 'string' && typeof (account as SocialAccount).platform === 'string'))
      if (accounts.length) return accounts
    }
  } catch { /* Fall back to the legacy comma-separated setting. */ }
  const accountIds = configuredAccountIds()
  const locationId = process.env.GHL_LOCATION_ID?.trim()
  const accessToken = process.env.GHL_ACCESS_TOKEN?.trim()
  if (accountIds.length && locationId && accessToken) {
    try {
      const response = await fetch(`https://services.leadconnectorhq.com/social-media-posting/${encodeURIComponent(locationId)}/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', Version: 'v3' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      const result = await response.json().catch(() => null) as { results?: { accounts?: Array<{ id?: unknown; name?: unknown; platform?: unknown }> } } | null
      if (response.ok && Array.isArray(result?.results?.accounts)) {
        const byId = new Map(result.results.accounts.flatMap((account) => typeof account.id === 'string' ? [[account.id, account] as const] : []))
        return accountIds.map((id, index) => {
          const account = byId.get(id)
          return {
            id,
            name: typeof account?.name === 'string' && account.name.trim() ? account.name.trim() : `Social account ${index + 1}`,
            platform: typeof account?.platform === 'string' && account.platform.trim() ? account.platform.trim() : 'social',
          }
        })
      }
    } catch { /* Keep publishing available with local account IDs if GHL metadata cannot be loaded. */ }
  }
  return accountIds.map((id, index) => ({ id, name: `Social account ${index + 1}`, platform: 'social' }))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ data: { accounts: await configuredAccounts(), timezone: process.env.PUBLISH_TIMEZONE || 'America/Los_Angeles' } })
}
