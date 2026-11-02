import { InboxList } from '@/components/inbox/inbox-list'
import { listInbox } from '@/lib/inbox'

export default async function InboxPage({ params }: PageProps<'/trips/[tripId]/inbox'>) {
  const { tripId } = await params
  const items = await listInbox(tripId)
  return <InboxList items={items} />
}
