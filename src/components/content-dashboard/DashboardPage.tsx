import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContentDashboard, { type DashboardSection } from './ContentDashboard'

export default async function DashboardPage({ section = 'overview' }: { section?: DashboardSection }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')
  const { data: profile } = await supabase.from('profiles').select('full_name,role').eq('id', user.id).maybeSingle()
  return <ContentDashboard section={section} identity={{
    name: profile?.full_name || user.user_metadata.full_name || user.email?.split('@')[0] || 'User',
    role: profile?.role || 'employee',
    email: user.email || '',
  }} />
}
