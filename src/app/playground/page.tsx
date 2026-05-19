import PlaygroundPageClient from './PlaygroundPageClient'
import { requireUser } from '@/lib/auth'
import { getUserPointsBalance } from '@/lib/points'

export default async function PlaygroundPage() {
  const user = await requireUser()
  const pointsBalance = await getUserPointsBalance(user.id)
  return <PlaygroundPageClient initialPointsBalance={pointsBalance} />
}
