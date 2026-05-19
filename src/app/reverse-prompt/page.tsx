import ReversePromptPageClient from './ReversePromptPageClient'
import { requireUser } from '@/lib/auth'
import { getUserPointsBalance } from '@/lib/points'

export default async function ReversePromptPage() {
  const user = await requireUser()
  const pointsBalance = await getUserPointsBalance(user.id)
  return <ReversePromptPageClient initialPointsBalance={pointsBalance} />
}
