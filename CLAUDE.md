# Planer wakacji

Prywatna PWA dla 2 osób: każdy wyjazd to tablica kart Markdown z miejscami z Google Maps i załącznikami. Pełny plan produktu, motywu i etapów: [docs/plan.md](docs/plan.md). Wdrożenie na serwer (sieć `edge`, Caddy, wspólny Postgres): [docs/deploy.md](docs/deploy.md).

## Stan

- Etap 0 (fundament) — zrobiony: monorepo, Postgres + Drizzle, proxy JWT Cloudflare Access, motyw Vague, Docker Compose pod układ serwera z portfolio.
- Etap 1 (karty i Lista) — zrobiony na gałęzi `etap-1`: wyjazdy (Postgres, server actions), dokument Yjs wyjazdu w IndexedDB (`lib/yjs/trip-doc.tsx`, model w `packages/core/src/trip-doc.ts`), arkusz karty z Tiptap (`components/card/`), Lista z dniami, filtrami i koszem. Karty są na razie tylko na urządzeniu — sync w etapie 3.
- Etap 2 (Tablica) — zrobiony na gałęzi `etap-2`: React Flow (`components/board/`), ramki i strzałki w dokumencie Yjs (`packages/core/src/board.ts`), gesty: tap zaznacza, tap w zaznaczoną otwiera, przytrzymanie przeciąga (`use-hold-drag.ts`), przytrzymanie tła = menu, kropka na krawędzi = strzałka; „ułóż wg dni” z jednym cofnij.
- Etap 3 (sync i offline) — zrobiony na gałęzi `etap-3`: serwer Hocuspocus (`apps/sync`, auth JWT Access przy upgrade, stan w `trip_docs`), provider w `lib/yjs/trip-doc.tsx` (status: na żywo / offline / sesja wygasła), awatary, kursory na tablicy, kursory w edytorze, PWA (Serwist: `app/sw.ts` → `/serwist/sw.js`, manifest, ikony z `app/icons`).
- Etap 4 (miejsca) — zrobiony na gałęzi `etap-4`: Share Target (SW zapisuje udostępnienie w IndexedDB → `/share` → kolejka `outbox` → `/api/inbox`, działa offline), rozwijanie linków Google Maps (`packages/core/src/maps.ts` + `lib/maps-resolve.ts`, zapas: Nominatim), skrzynka (`inbox_items`), wklejanie linku („+” i menu tablicy), mini-mapy i nawigacja w karcie, widok Mapa z trasą dnia (MapLibre + OpenFreeMap).
- Etap 5 (pliki i linki) — zrobiony na gałęzi `etap-5`: załączniki (`attachments`, pliki w `UPLOAD_DIR`, typ rozpoznawany z bajtów, metadane w mapie `attachments` dokumentu Yjs), podgląd w aplikacji (PDF.js), pliki aktywnego wyjazdu w cache `attachments` (SW cache-first + `lib/offline-files.ts`), podglądy Open Graph (`lib/safe-fetch.ts` z ochroną SSRF), szablony kart (`card_templates`, „z szablonu” w „+”, „zapisz jako szablon”).
- Następny: Etap 6 (parser /+, kursy NBP, Pulpit dnia, przypomnienia push).

## Stos

Node 26 · pnpm monorepo · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 · Tailwind v4 · next-themes · Drizzle ORM + postgres-js · PostgreSQL 17 · jose · Vitest · Biome · Docker Compose (na serwerze w sieci `edge` ze wspólnymi `caddy`, `cloudflared`, `postgres`).
Etap 1: Yjs + y-indexeddb, Tiptap 3 (Collaboration na Y.XmlFragment karty, @tiptap/markdown), zod, lucide-react; własne proste komponenty w `components/ui.tsx` zamiast shadcn/ui.
Etap 2: @xyflow/react 12 + roughjs.
Etap 3: Hocuspocus 4 (server, provider, extension-database), @tiptap/extension-collaboration-caret, Serwist 9 (@serwist/turbopack).
Etap 4: maplibre-gl 6 (kafelki OpenFreeMap: positron / dark), Nominatim jako geokoder zapasowy.
Etap 5: pdfjs-dist 6 (worker w public/ jak MapLibre), ipaddr.js.
Planowane (kolejne etapy): web-push, Anthropic API, Playwright.

## Struktura

```
apps/web        Next.js; proxy.ts (auth), lib/auth/, app/(app)/ (ekrany za logowaniem)
apps/sync       serwer Hocuspocus: WebSocket /sync, dokument Yjs na wyjazd, zapis do trip_docs
apps/worker     zadania w tle (na razie zaślepka)
packages/core   wspólny kod: schemat Drizzle (src/db/schema.ts), migracje (drizzle/), helpery
```

`@planer/core` eksportuje źródła TS (bez builda); web ma go w `transpilePackages`, sync/worker uruchamiane przez tsx.

## Komendy

```bash
pnpm install
nvm use                  # Node 26 z .nvmrc
cp .env.example apps/web/.env.local   # raz; Next czyta env tylko z apps/web
docker compose --profile local up -d postgres   # lokalny Postgres pg-planer na 127.0.0.1:5433
pnpm dev                 # Next na :3000, logowanie przez AUTH_DEV_EMAIL
pnpm dev:sync            # serwer sync na :1234 (osobny terminal; NEXT_PUBLIC_SYNC_URL w .env.local)
pnpm lint                # biome check; pnpm format naprawia
pnpm typecheck
pnpm test
pnpm db:generate         # po zmianie schema.ts → nowa migracja w packages/core/drizzle
pnpm db:migrate          # wymaga DATABASE_URL
/srv/scripts/deploy.sh planer   # na serwerze, po git pull --ff-only (docs/deploy.md)
```

## Pułapki

- Nie uruchamiaj `next build` przy działającym `next dev` — dzielą `apps/web/.next`, a dev wpada w pętlę przeładowań („HMR hash mismatch”). Naprawa: zatrzymaj dev, `rm -rf apps/web/.next`.
- React Flow wyłącza zdarzenia wskaźnika na węzłach bez wbudowanego zaznaczania/przeciągania — elementy, które mają reagować, potrzebują `pointer-events-auto`.
- SW rejestrowany jako `type: 'classic'` — worker modułowy przeglądarka pobiera bez cookie, więc za Cloudflare Access dostałby 401.
- Zmiany samego URL (np. `?card=`) przez `window.history.pushState`, nie `router.push` — router pyta serwer, więc offline nic by się nie otworzyło.
- Manifest, `/icons/*` i `/offline` są poza `proxy.ts` i mają Bypass w Access (przeglądarka pobiera manifest bez cookie).
- MapLibre szuka workera obok swojego pliku — po bundlowaniu go tam nie ma. `dev`/`build` kopiują go do `public/` (`scripts/copy-maplibre-worker.mjs`), a `components/map/maplibre.ts` ustawia `setWorkerUrl`. MapLibre nadpisuje też `transform` elementu znacznika i daje kontenerowi `position: relative` — kształty pinezek w elemencie wewnętrznym, rozmiar mapy z wrappera.
- Nie wołaj `router.refresh()`, gdy w adresie jest `?card=` — Next przestaje potem synchronizować zmiany adresu z `history.pushState` i arkusz karty się nie otwiera. Nowe dane trzymaj w stanie klienta (np. `addTemplate` w `TripProvider`).
- Dynamiczne ścieżki plików na serwerze oznaczaj `/* turbopackIgnore: true */`, inaczej build śledzi cały projekt do `standalone`.
- pnpm nie uruchamia skryptów `pre*`/`post*` — kroki przygotowawcze wpisuj wprost w skrypt.
- Rozwijanie linków chodzi tylko po hostach Google (`isAllowedMapsHost`) — to ochrona przed SSRF, nie poluzowuj jej.
- Service worker działa tylko w buildzie produkcyjnym (`next build && next start`); w `next dev` jest wyłączony.
- W zsh nie używaj zmiennej `path` w skryptach (to tablica powiązana z `PATH`).

## Auth

- `apps/web/proxy.ts` (Next 16: dawny middleware) weryfikuje `Cf-Access-Jwt-Assertion` (lub cookie `CF_Authorization`) przez JWKS zespołu, sprawdza `aud`, `iss` i allowlistę `ALLOWED_EMAILS`, potem ustawia `x-user-email` (nagłówek z zewnątrz jest zawsze usuwany).
- Poza logowaniem: `/api/health`, `/p/*` (publiczny link, etap 8), statyki.
- `AUTH_DEV_EMAIL` działa tylko przy `NODE_ENV=development`.
- W kodzie serwerowym: `getCurrentUser()` z `lib/auth/user.ts`.

## Konwencje

- Interfejs tylko po polsku, teksty wprost w kodzie; etykiety małymi literami („dziś”, „otwórz kartę”). Komentarze w kodzie po polsku.
- Kolory wyłącznie z tokenów Vague (`bg-panel`, `text-muted`, `border-line`, `text-accent`…) zdefiniowanych w `apps/web/app/globals.css`; żadnych surowych hexów w komponentach.
- Obramowanie 1 px `line` zamiast cieni; wysepki `.island` (12 px), małe elementy 6–8 px; przyciski min. 44 px.
- Bez emoji; znaki: › dalej, ⌖ miejsca/przypięte, ● komunikat, • zaznaczone, · separator.
- Mobile-first (Android, Chrome); desktop to dodatek.
- Wersje zależności przypięte dokładnie; nie bierz wydań młodszych niż ok. tydzień (pnpm 11 i tak ich pilnuje przez `minimumReleaseAge`).
- Migracje addytywne; każda trafia na produkcję (serwis `planer-migrate` przy deployu) i do lokalnej bazy (`pnpm db:migrate`).
- Na serwerze tylko odczyt, chyba że wprost poproszono o deploy lub zmianę; każdą komendę `ssh server` pokaż przed uruchomieniem.
- Jeden etap = jedna gałąź (`etap-N`); na starcie etapu plan, potem małe kroki z testem na telefonie.
