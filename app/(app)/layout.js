import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import AppShell from '@/app/components/AppShell'

export default async function AppLayout({ children }) {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <AppShell user={session.user}>{children}</AppShell>
}
