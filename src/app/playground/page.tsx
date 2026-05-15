import PlaygroundPageClient from './PlaygroundPageClient'
import { requireUser } from '@/lib/auth'

export default async function PlaygroundPage() {
  await requireUser()
  return <PlaygroundPageClient />
}
