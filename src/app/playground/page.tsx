import PlaygroundPageClient from './PlaygroundPageClient'
import { requireNonAdminUser } from '@/lib/auth'
import { getUserPointsBalance } from '@/lib/points'

export default async function PlaygroundPage() {
  const user = await requireNonAdminUser()
  const pointsBalance = await getUserPointsBalance(user.id)
  return <PlaygroundPageClient initialPointsBalance={pointsBalance} />
}
