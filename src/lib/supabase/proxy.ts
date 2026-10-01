import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const publicAuthPaths = ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password', '/auth/reset-password', '/auth/callback']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isPublicAuth = publicAuthPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const isApi = pathname.startsWith('/api/')

  if (!user && !isPublicAuth && !isApi) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/auth/sign-in'
    redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(redirectUrl)
  }
  if (user && ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password'].includes(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/content'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }
  return response
}

