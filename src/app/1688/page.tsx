import { requireNonAdminUser } from '@/lib/auth'
import EightEightPageClient from './EightEightPageClient'

export default async function EightEightPage() {
  await requireNonAdminUser()
  return <EightEightPageClient />
}
