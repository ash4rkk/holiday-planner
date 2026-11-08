'use client'

import { Link2, Share2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import {
  createFamilyLink,
  revokeFamilyLink,
} from '@/app/(app)/trips/[tripId]/settings/share-actions'
import { askConfirm } from '@/components/confirm-dialog'
import { buttonClass } from '@/components/ui'

/** Link tylko do odczytu (plan dni, mapa, kwoty — bez plików) dla rodziny; nowy unieważnia stary. */
export function FamilyLink({
  tripId,
  tripTitle,
  token: initial,
}: {
  tripId: string
  tripTitle: string
  token?: string
}) {
  const [token, setToken] = useState(initial)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string>()
  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/p/${token}`
      : token
        ? `/p/${token}`
        : undefined

  const share = async () => {
    if (!url) return
    if (navigator.share) {
      await navigator
        .share({ title: tripTitle, text: `Plan wyjazdu: ${tripTitle}`, url })
        .catch(() => {})
    } else {
      await navigator.clipboard.writeText(url).then(
        () => setNote('• skopiowano'),
        () => setNote('● nie udało się skopiować'),
      )
    }
  }

  return (
    <section className="island flex flex-col gap-2 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-bold">link dla rodziny</p>
          <p className="text-xs text-subtle italic">
            plan dzień po dniu, mapa i kwoty, bez załączników i bez edycji — działa bez logowania
          </p>
        </div>
      </div>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="truncate rounded-small bg-raised px-3 py-2 text-xs text-teal"
          >
            {url}
          </a>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => void share()} className={buttonClass('primary')}>
              <Share2 className="size-4" aria-hidden="true" /> udostępnij
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const ok = await askConfirm({
                  title: 'unieważnić link?',
                  body: 'Kto go ma, przestanie widzieć plan.',
                  confirm: 'unieważnij',
                  danger: true,
                })
                if (!ok) return
                start(async () => {
                  await revokeFamilyLink(tripId)
                  setToken(undefined)
                })
              }}
              className={buttonClass('island')}
            >
              unieważnij
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setToken((await createFamilyLink(tripId)) ?? undefined))}
          className={buttonClass('island')}
        >
          {pending ? 'tworzę…' : 'utwórz link'}
        </button>
      )}
      {note && <p className="text-xs text-subtle">{note}</p>}
    </section>
  )
}
