import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Routes configuration
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/auth')
  const isPublicFile = request.nextUrl.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|js|webmanifest)$/)
  const isPublicPage = 
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname.startsWith('/terms') || 
    request.nextUrl.pathname.startsWith('/privacy') || 
    request.nextUrl.pathname.startsWith('/contact')

  // 1. If not logged in and trying to access protected routes, redirect to login
  if (!user && !isAuthPage && !isPublicFile && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. If logged in and trying to access login page, redirect to dashboard or onboarding
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // 3. Profile setup enforcement check
  if (user && !isAuthPage && !isPublicFile && !isPublicPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, mess_id, status')
      .eq('id', user.id)
      .single()

    // Redirect to onboarding if profile is incomplete OR no mess_id
    if (!profile?.full_name || !profile?.mess_id) {
      if (!request.nextUrl.pathname.startsWith('/onboarding')) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    } 
    // If pending, restrict to /dashboard main page only (don't allow sub-routes)
    else if (profile.status === 'pending') {
      const isDashboardSubRoute = request.nextUrl.pathname.startsWith('/dashboard/')
      if (isDashboardSubRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
