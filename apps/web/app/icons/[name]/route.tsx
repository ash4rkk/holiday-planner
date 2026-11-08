import { ImageResponse } from 'next/og'

// Ikony PWA rysowane przy buildzie: róż Vague na ciemnym tle, szkicowa karta z pinezką.
const ICONS = {
  '192.png': { size: 192, maskable: false },
  '512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-180.png': { size: 180, maskable: true },
} as const

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }))
}

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name as keyof typeof ICONS]
  if (!icon) return new Response('nie ma takiej ikony', { status: 404 })
  const { size, maskable } = icon
  // Maskowalna: treść w bezpiecznym kole 80%, tło na całą powierzchnię.
  const card = size * (maskable ? 0.46 : 0.6)
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1e1e22',
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      <div
        style={{
          width: card,
          height: card * 0.78,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: card * 0.09,
          padding: card * 0.13,
          background: '#26262b',
          border: `${Math.max(2, size / 64)}px solid #c48282`,
          borderRadius: card * 0.12,
          transform: 'rotate(-6deg)',
        }}
      >
        <div
          style={{ width: '70%', height: card * 0.09, background: '#c48282', borderRadius: 99 }}
        />
        <div
          style={{ width: '90%', height: card * 0.06, background: '#a8a8b6', borderRadius: 99 }}
        />
        <div
          style={{ width: '55%', height: card * 0.06, background: '#a8a8b6', borderRadius: 99 }}
        />
      </div>
    </div>,
    { width: size, height: size },
  )
}
