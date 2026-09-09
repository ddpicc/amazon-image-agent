import PlaygroundPageClient from './PlaygroundPageClient'
import { requireNonAdminUser } from '@/lib/auth'
import { listEnabledImageModelOptions } from '@/lib/image-model-config'
import { getUserPointsBalance } from '@/lib/points'

export default async function PlaygroundPage() {
  const user = await requireNonAdminUser()
  const [pointsBalance, imageModels] = await Promise.all([
    getUserPointsBalance(user.id),
    listEnabledImageModelOptions(),
  ])
  return <PlaygroundPageClient initialPointsBalance={pointsBalance} imageModels={imageModels} />
}
