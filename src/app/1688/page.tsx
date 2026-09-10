import { requireNonAdminUser } from '@/lib/auth'
import { listEnabledImageModelOptions } from '@/lib/image-model-config'
import { getUserPointsBalance } from '@/lib/points'
import EightEightPageClient from './EightEightPageClient'

export default async function EightEightPage() {
  const user = await requireNonAdminUser()
  const [pointsBalance, imageModels] = await Promise.all([
    getUserPointsBalance(user.id),
    listEnabledImageModelOptions(),
  ])
  return <EightEightPageClient initialPointsBalance={pointsBalance} imageModels={imageModels} />
}
