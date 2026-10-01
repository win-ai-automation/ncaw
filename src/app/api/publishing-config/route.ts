import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SocialAccount = { id: string; name: string; platform: string }

function configuredAccounts(): SocialAccount[] {
  try {
    const parsed = JSON.parse(process.env.GHL_SOCIAL_ACCOUNTS_JSON || '[]') as unknown
    if (Array.isArray(parsed)) return parsed.filter((account): account is SocialAccount => Boolean(account && typeof account === 'object' && typeof (account as SocialAccount).id === 'string' && typeof (account as SocialAccount).name === 'string' && typeof (account as SocialAccount).platform === 'string'))
  } catch { /* Fall back to the legacy comma-separated setting. */ }
  return (process.env.GHL_ACCOUNT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean).map((id, index) => ({ id, name: `Social account ${index + 1}`, platform: 'social' }))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ data: { accounts: configuredAccounts(), timezone: process.env.PUBLISH_TIMEZONE || 'America/Los_Angeles' } })
}
