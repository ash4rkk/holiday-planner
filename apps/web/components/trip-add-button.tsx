'use client'

import { createCard } from '@planer/core'
import { AddButton } from '@/components/add-button'
import { DraftReview, ImportRunner, ImportStatus } from '@/components/ai/import-ui'
import { enqueueImport, runImports } from '@/lib/ai-import'
import { createFromTemplate } from '@/lib/card-templates'
import { pasteAsCard } from '@/lib/place-card'
import { openPacking } from '@/lib/use-packing-drawer'
import { useTrip } from '@/lib/yjs/trip-doc'

/**
 * „+” w menu dolnym dla widoków bez własnych akcji (dziś, Mapa): te same pozycje co na Liście.
 * Nowa karta dostaje `date`, gdy widok ma wybrany dzień. Z importem AI (kolejka i przegląd szkiców).
 */
export function TripAddButton({
  date,
  onOpen,
}: {
  date?: string
  onOpen: (id: string, isNew?: boolean) => void
}) {
  const { trip, doc, templates } = useTrip()
  return (
    <>
      <AddButton
        onNew={() => onOpen(createCard(doc, { type: 'note', ...(date && { date }) }), true)}
        onPacking={openPacking}
        templates={templates}
        onImport={(files) =>
          void enqueueImport(trip.id, files).then(() => runImports(trip.id, doc))
        }
        onTemplate={(t) => onOpen(createFromTemplate(doc, t), true)}
        onPaste={async () => {
          const id = await pasteAsCard(doc)
          if (id) onOpen(id)
        }}
      />
      <ImportRunner />
      <ImportStatus />
      <DraftReview onEdit={(id) => onOpen(id)} />
    </>
  )
}
