import ReversePromptPageClient from './ReversePromptPageClient'
import { requireUser } from '@/lib/auth'

export default async function ReversePromptPage() {
  await requireUser()
  return <ReversePromptPageClient />
}
