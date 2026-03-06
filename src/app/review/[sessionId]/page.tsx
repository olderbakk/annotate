import { createServiceClient } from '@/lib/supabase'
import ReviewClient from './ReviewClient'
import { notFound } from 'next/navigation'

export default async function ReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = createServiceClient()

  const { data: session, error } = await supabase
    .from('sessions')
    .select()
    .eq('id', sessionId)
    .single()

  if (error || !session) notFound()

  return <ReviewClient session={session} />
}
