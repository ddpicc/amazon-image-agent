import { requireNonAdminUser } from '@/lib/auth'
import CompetitorStrategyPageClient from './CompetitorStrategyPageClient'

export default async function CompetitorStrategyPage() {
  const user = await requireNonAdminUser()
  return <CompetitorStrategyPageClient userId={user.id} />
}
