import { requireNonAdminUser } from '@/lib/auth'
import RemoveBackgroundPageClient from './RemoveBackgroundPageClient'

export default async function RemoveBackgroundPage() {
  await requireNonAdminUser()
  return <RemoveBackgroundPageClient />
}
