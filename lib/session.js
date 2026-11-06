import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

const SESSION_OPTIONS = {
  password: process.env.SESSION_SECRET ?? 'ciet-demo-secret-key-min-32-chars!!',
  cookieName: 'ciet-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession(cookieStore, SESSION_OPTIONS)
}

// Role → default landing page
export const ROLE_HOME = {
  COORDINATOR: '/board',
  SME: '/review',
  PEDAGOGY: '/review',
  APPROVER: '/review',
}
