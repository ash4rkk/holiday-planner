import { Suspense } from 'react'
import { Board } from '@/components/board/board'

export default function BoardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  )
}
