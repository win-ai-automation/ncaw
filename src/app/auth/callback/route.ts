import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const requestedNext = searchParams.get('next') ?? '/'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/'
  const supabase = await createClient()
  let error: Error | null = null
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code))
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }))
  else error = new Error('The authentication link is invalid or has expired.')
  if (error) return NextResponse.redirect(`${origin}/auth/sign-in?error=${encodeURIComponent(error.message)}`)
  return NextResponse.redirect(`${origin}${next}`)
}
