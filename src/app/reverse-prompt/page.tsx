import ReversePromptPageClient from './ReversePromptPageClient'
import { requireNonAdminUser } from '@/lib/auth'
import { getUserPointsBalance } from '@/lib/points'

export default async function ReversePromptPage() {
  const user = await requireNonAdminUser()
  const pointsBalance = await getUserPointsBalance(user.id)
  return <ReversePromptPageClient initialPointsBalance={pointsBalance} />
}
