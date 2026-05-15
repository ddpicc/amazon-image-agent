import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AuthForm from '@/components/AuthForm'

export default async function RegisterPage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/')
  }

  return <AuthForm mode="register" />
}
