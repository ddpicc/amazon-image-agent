import { requireNonAdminUser } from '@/lib/auth'
import CompliancePageClient from './CompliancePageClient'

export default async function CompliancePage() {
  const user = await requireNonAdminUser()
  return <CompliancePageClient userId={user.id} />
}
