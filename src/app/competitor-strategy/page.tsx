import { requireNonAdminUser } from '@/lib/auth'
import CompetitorStrategyPageClient from './CompetitorStrategyPageClient'

export default async function CompetitorStrategyPage() {
  await requireNonAdminUser()
  return <CompetitorStrategyPageClient />
}
