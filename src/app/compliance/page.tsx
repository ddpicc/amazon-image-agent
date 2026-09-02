import { requireNonAdminUser } from '@/lib/auth'
import CompliancePageClient from './CompliancePageClient'

export default async function CompliancePage() {
  await requireNonAdminUser()
  return <CompliancePageClient />
}
