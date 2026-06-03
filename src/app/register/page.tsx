import { getCurrentUser, getDefaultAppPathForUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AuthForm from '@/components/AuthForm'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: { aff?: string }
}) {
  const user = await getCurrentUser()
  if (user) {
    redirect(getDefaultAppPathForUser(user))
  }

  return <AuthForm mode="register" initialReferralCode={searchParams?.aff || ''} />
}
