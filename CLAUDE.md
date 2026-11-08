# Planer wakacji

Prywatna PWA dla 2 osób: każdy wyjazd to tablica kart Markdown z miejscami z Google Maps i załącznikami. Pełny plan produktu, motywu i etapów: [docs/plan.md](docs/plan.md). Wdrożenie na serwer (sieć `edge`, Caddy, wspólny Postgres): [docs/deploy.md](docs/deploy.md).

## Stan

- Etap 0 (fundament) — zrobiony: monorepo, Postgres + Drizzle, proxy JWT Cloudflare Access, motyw Vague, Docker Compose pod układ serwera z portfolio.
- Etap 1 (karty i Lista) — zrobiony na gałęzi `etap-1`: wyjazdy (Postgres, server actions), dokument Yjs wyjazdu w IndexedDB (`lib/yjs/trip-doc.tsx`, model w `packages/core/src/trip-doc.ts`), arkusz karty z Tiptap (`components/card/`), Lista z dniami, filtrami i koszem. Karty są na razie tylko na urządzeniu — sync w etapie 3.
- Etap 2 (Tablica) — zrobiony na gałęzi `etap-2`: React Flow (`components/board/`), ramki i strzałki w dokumencie Yjs (`packages/core/src/board.ts`), gesty: tap zaznacza, tap w zaznaczoną otwiera, przytrzymanie przeciąga (`use-hold-drag.ts`), przytrzymanie tła = menu; „ułóż wg dni” z jednym cofnij. Nowych strzałek ręcznych się już nie rysuje (kropki usunięte), istniejące zostają.
- Etap 3 (sync i offline) — zrobiony na gałęzi `etap-3`: serwer Hocuspocus (`apps/sync`, auth JWT Access przy upgrade, stan w `trip_docs`), provider w `lib/yjs/trip-doc.tsx` (status: na żywo / offline / sesja wygasła), awatary, kursory na tablicy, kursory w edytorze, PWA (Serwist: `app/sw.ts` → `/serwist/sw.js`, manifest, ikony z `app/icons`).
- Etap 4 (miejsca) — zrobiony na gałęzi `etap-4`: Share Target (SW zapisuje udostępnienie w IndexedDB → `/share` → kolejka `outbox` → `/api/inbox`, działa offline), rozwijanie linków Google Maps (`packages/core/src/maps.ts` + `lib/maps-resolve.ts`, zapas: Nominatim), skrzynka (`inbox_items`), wklejanie linku („+” i menu tablicy), mini-mapy i nawigacja w karcie, widok Mapa z trasą dnia (MapLibre + OpenFreeMap).
- Etap 5 (pliki i linki) — zrobiony na gałęzi `etap-5`: załączniki (`attachments`, pliki w `UPLOAD_DIR`, typ rozpoznawany z bajtów, metadane w mapie `attachments` dokumentu Yjs), podgląd w aplikacji (PDF.js), pliki aktywnego wyjazdu w cache `attachments` (SW cache-first + `lib/offline-files.ts`), podglądy Open Graph (`lib/safe-fetch.ts` z ochroną SSRF), szablony kart (`card_templates`, „z szablonu” w „+”, „zapisz jako szablon”).
- Etap 6 (Pulpit, koszty, push) — zrobiony na gałęzi `etap-6`: kwoty `/+` (`packages/core/src/amounts.ts`), kursy NBP z cache `fx_rates` (`@planer/core/fx`, `/api/fx`, `lib/use-rates.ts`), sumy kart/dni/wyjazdu, pogoda (Open-Meteo, `/api/weather`) w Liście i na Pulpicie, dojazd (OSRM FOSSGIS, `/api/route`), Pulpit dnia (`components/today/`), push: subskrypcje (`push_subscriptions`, `/settings`), przypomnienia (`reminders`, liczy sync, wysyła worker), zmiany drugiej osoby (sync, po 3 min ciszy), strefa czasowa wyjazdu (`trips.timezone`).
- Etap 7 (AI) — zrobiony na gałęzi `etap-7`: czat (`/api/ai/chat`, SSE; kontekst wyjazdu z `trip_docs` przez `tripContext` w core; wyszukiwanie w sieci; narzędzie `read_attachment`; historia `ai_messages`), import zdjęć/PDF-ów do szkiców kart (`/api/ai/import`, ustrukturyzowane wyjście; kolejka offline w IndexedDB `imports`; okienko Zatwierdź/Popraw/Odrzuć), koszt w `ai_usage` i limit miesięczny (`lib/ai/budget.ts`).
- Etap 8 (eksport i kopie) — zrobiony na gałęzi `etap-8`: konwersja treści kart Yjs → Markdown/HTML (`packages/core/src/rich-text.ts`), eksport `.md`, widok do druku i PDF z Chromium (`/api/export/[tripId]`, `lib/export/`), link dla rodziny `/p/<token>` (`share_links`, `app/p/[token]`), nocna kopia bazy i plików w workerze (`apps/worker/src/backup.ts`).
- Audyt po etapie 8: `docs/audyt-2026-11.md`; poprawione punkty 1, 2, 4, 5, 6, 7 i ponowienie `tar`.
- Po wdrożeniu: wybór profilu na `/` (raz na sesję, `components/profile/`), „dziś” wyjazdu `/trips/<id>/today` (Pulpit zastąpiony), wyjście „‹” do `/trips`, pogoda w nagłówku dnia i w obrysie dnia na Tablicy.
- Animacje i wygląd: przejścia React `ViewTransition`, arkusze `.sheet-in`, „+” w menu dolnym (portal do `NAV_SLOT`), oś dnia na Liście, grupowanie pinezek. Przytrzymanie karty na Liście = przeniesienie na inny dzień. Czat proponuje karty narzędziem `propose_cards` (dodaje je dopiero osoba). Przerwy dnia: `packages/core/src/gaps.ts`, odcinki dnia `dayLegs`, plany `@planer/core/routes` (Google dla komunikacji, OSRM pieszo i autem, wyniki w `route_cache`), `/api/route/plan`, `useDayPlans`, „czas wyjść” w workerze.
- Etap 9 (pomysły i warianty) — gałąź `etap-9`: karty bez dnia w drawerze/panelu pomysłów (`components/board/ideas-drawer.tsx`, `isIdea`), przeciąganie na dzień z podpowiedzią godziny (`dropTarget`), warianty (`variantOf`, `chooseVariant`; wariant nie ma daty, więc plan liczy tylko kartę główną), rozgałęzienie na desktopie, stos na Tablicy telefonu, karuzela na Liście (`variant-carousel.tsx`), siatka co 20 (`GRID`), zaznaczanie Ctrl/Shift, panel karty z wysepkami (`card-sheet.tsx`, `CardSections`), statusy „do rezerwacji” i „zarezerwowane”, kolumna godzin na Liście, „możesz zostać do” (`stayTimes`), chowanie minionych dojazdów z marginesem (`legIsPast`), brak połączenia zamiast długich tras pieszych (`isFarWalk`), propozycje AI od razu z „do pomysłów” (zapisane w `ai_messages.proposals`), mapa w kolorach motywu (`themeMap`) i trasa rozbita na pojazdy z przystankami (`routeMarks`), dymek miejsca przy pinezce, dzień na Tablicy jako ołówkowa ramka z osią godzin, stały odstęp dni przy rysowaniu, kadrowanie dnia strzałkami (`focusDay`), górny pasek jako dwie wysepki z „⋯” na telefonie (`more` w `TopBar`), okna potwierdzenia (`ConfirmDialog`).
- Wszystkie etapy z planu są zrobione; dalej: testy na telefonach, poprawki.

## Stos

Node 26 · pnpm monorepo · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 · Tailwind v4 · next-themes · Drizzle ORM + postgres-js · PostgreSQL 17 · jose · Vitest · Biome · Docker Compose (na serwerze w sieci `edge` ze wspólnymi `caddy`, `cloudflared`, `postgres`).
Etap 1: Yjs + y-indexeddb, Tiptap 3 (Collaboration na Y.XmlFragment karty, @tiptap/markdown), zod, lucide-react; własne proste komponenty w `components/ui.tsx` zamiast shadcn/ui.
Etap 2: @xyflow/react 12 + roughjs.
Etap 3: Hocuspocus 4 (server, provider, extension-database), @tiptap/extension-collaboration-caret, Serwist 9 (@serwist/turbopack).
Etap 4: maplibre-gl 6 (kafelki OpenFreeMap: positron / dark), Nominatim jako geokoder zapasowy.
Etap 5: pdfjs-dist 6 (worker w public/ jak MapLibre), ipaddr.js.
Etap 6: web-push (VAPID), Temporal (Node 26) do stref czasowych przypomnień.
Etap 7: @anthropic-ai/sdk 1.x (Claude Opus 5.5 domyślnie, `fallbacks: "default"`), sharp do zmniejszania zdjęć.
Etap 8: playwright-core + Chromium (PDF), pg_dump 17 w obrazie workera.

## Struktura

```
apps/web        Next.js; proxy.ts (auth), lib/auth/, app/(app)/ (ekrany za logowaniem)
apps/sync       serwer Hocuspocus: WebSocket /sync, dokument Yjs na wyjazd, zapis do trip_docs
apps/worker     zadania w tle: przypomnienia push (co 30 s), kursy NBP (co 6 h), nocna kopia bazy i plików
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
- Biblioteki z plikami innymi niż JS (np. `playwright-core` → `browsers.json`) wymagają `outputFileTracingIncludes` w `next.config.ts`, inaczej w obrazie `standalone` ich brakuje. Sprawdzaj nowe zależności serwerowe w zbudowanym obrazie, nie tylko w `next dev`.
- Dynamiczne ścieżki plików na serwerze oznaczaj `/* turbopackIgnore: true */`, inaczej build śledzi cały projekt do `standalone`.
- pnpm nie uruchamia skryptów `pre*`/`post*` — kroki przygotowawcze wpisuj wprost w skrypt.
- Pozycje kart w dokumencie Yjs są wspólne dla telefonu i desktopu. Rozsuwanie dni i wyśrodkowanie przy rozgałęzieniu (`shiftAt`, `insets` w `board.tsx`) liczymy tylko przy rysowaniu; nie zapisuj ich. Upuszczanie działa na współrzędnych z ekranu, więc zapis potrzebuje `baseX`.
- Węzły rysowane w locie (warianty na Tablicy) podają `measured` i `handles` wprost, inaczej React Flow pomija ich strzałki.
- Czat i inne okna nad Tablicą przez portal do `body`: `fixed` wrapper Tablicy tworzy kontekst warstw i `z-index` przegrywa z dolnym menu.
- `pnpm dev:sync` czyta env z `apps/web/.env.local` (`--env-file`); bez tego sync nie widzi `AUTH_DEV_EMAIL`.
- Rozwijanie linków chodzi tylko po hostach Google (`isAllowedMapsHost`) — to ochrona przed SSRF, nie poluzowuj jej.
- AI: historia czatu wraca do modelu bez bloków rozumowania (zapisujemy tylko tekst tur), więc opis wyjazdu w prompcie systemowym może się zmieniać między pytaniami — nie dodawaj zapisu pełnych bloków odpowiedzi bez przemyślenia „preserved thinking” (edycja historii = 400).
- AI: zmienne dane (data, godzina, kto pyta) idą w treść pytania, nie do promptu systemowego — inaczej cache promptu nie działa.
- AI: odpowiedź czatu nie zależy od połączenia przeglądarki (dokańcza się i zapisuje w tle), przerywa ją tylko `/api/ai/chat/stop`. Rejestr trwających odpowiedzi (`lib/ai/chat-runs.ts`) jest w pamięci procesu — przy kilku replikach web trzeba go przenieść do bazy. Do modelu idzie najwyżej 40 ostatnich wiadomości; propozycje kart wracają jako krótki opis w treści odpowiedzi (`proposalsSummary`), a decyzje osób są w `ai_messages.decisions`.
- Treść kart do HTML tylko przez `blocksToHtml` (ucieczka znaków, odrzuca niebezpieczne linki) — nigdy surowego tekstu z dokumentu w `dangerouslySetInnerHTML`.
- `Temporal` tylko po stronie serwera (`@planer/core/reminders`) — nie importuj go do kodu klienta, przeglądarki go jeszcze nie mają.
- Moduły `@planer/core/fx`, `/push`, `/reminders-db` używają bazy — tylko serwer (API, sync, worker).
- W obrazach sync i worker `CMD` to Node wprost, nie `pnpm`: pnpm nie przekazuje SIGTERM, więc `server.destroy()` nie zapisałby dokumentów. `init: true` tego nie naprawia.
- Push tylko na hosty z `isPushEndpoint`, sync tylko z `Origin` aplikacji (`isAppOrigin`, `APP_ORIGIN`) — to ochrona przed SSRF i obcymi stronami, nie poluzowuj.
- Zdjęcia profili tylko na serwerze (`UPLOAD_DIR/profiles/<imię>.jpg`, `/api/profile-photo/<imię>`), nigdy w repo — jest publiczne. E-maile profili też tylko w `.env`.
- Wyniki Google Routes są zapisywane w `route_cache` i pokazywane z liniami i przesiadkami, wbrew warunkom Google (dopuszczają tylko cache współrzędnych). To świadoma decyzja właściciela; ryzyko to blokada klucza. Przy wynikach zostaje tekst `Google Maps` (`text-attrib`).
- Nie dawaj `transition`/`transition-duration` na `*`: domyślna właściwość to `all`, więc Tablica spóźniała się o czas przejścia.
- Style komponentów typu `.island` trzymaj w `@layer components`, inaczej wygrywają z klasami Tailwind.
- Service worker działa tylko w buildzie produkcyjnym (`next build && next start`); w `next dev` jest wyłączony.
- `pnpm dev` dla sync/worker uruchamia `tsx watch` jako osobny proces `node` — zabicie powłoki go nie zatrzymuje; przy testach sprawdzaj `ps`, bo stary worker potrafi przejąć przypomnienia.
- Wartości z `;` w `.env` (np. `USER_NAMES`) w cudzysłowie, inaczej `source .env` w powłoce je ucina.
- W zsh nie używaj zmiennej `path` w skryptach (to tablica powiązana z `PATH`).
- `cacheComponents: true`: router trzyma 3 ostatnie widoki ukryte w `<Activity>` (stan zostaje, efekty się zwijają). Bez `export const dynamic` — strony z bazą bez innego dynamicznego API zaczynają od `await connection()`; layout wyjazdu i Pogoda mają `instant = false` (wejście może czekać). Nie owijaj drzewa w `key={pathname}` — odmontowuje wszystkie widoki.
- Portale z ukrytego widoku (np. „+” w menu, `<Toast>`, czat) nie chowają się same — `useHideWhenInactive(ref)` chowa je synchronicznie. Biblioteki z instancją w efekcie (MapLibre) po powrocie odtwarzałyby się od nowa: mapa żyje w `components/map/map-cache.ts`, widok tylko ją przypina.
- Linki dolnego menu bez `prefetch={true}`: przy `cacheComponents` dev zgłasza wtedy „dynamic data during prefetching” i nawigacja potrafi stanąć.
- Testy przejść w headless Chrome: wyjście z Tablicy z View Transition wisi (brak klatek) — testuj z `headless: false`. W dev wskaźnik Next w lewym dolnym rogu zasłania „dziś”.

## Auth

- `apps/web/proxy.ts` (Next 16: dawny middleware) weryfikuje `Cf-Access-Jwt-Assertion` (lub cookie `CF_Authorization`) przez JWKS zespołu, sprawdza `aud`, `iss` i opcjonalną allowlistę `ALLOWED_EMAILS` (pusta = decyduje polityka Access), potem ustawia `x-user-email` (nagłówek z zewnątrz jest zawsze usuwany).
- Poza logowaniem: `/api/health`, `/p/*` (link dla rodziny, tylko pod ważnym tokenem), statyki, manifest, ikony, worker mapy.
- `AUTH_DEV_EMAIL` działa tylko przy `NODE_ENV=development`.
- W kodzie serwerowym: `getCurrentUser()` z `lib/auth/user.ts`.

## Konwencje

- Interfejs tylko po polsku, teksty wprost w kodzie; etykiety małymi literami („dziś”, „otwórz kartę”). Komentarze w kodzie po polsku.
- Kolory wyłącznie z tokenów Vague (`bg-panel`, `text-muted`, `border-line`, `text-accent`…) zdefiniowanych w `apps/web/app/globals.css`; żadnych surowych hexów w komponentach.
- Obramowanie 1 px `line` zamiast cieni; wysepki `.island` (12 px), małe elementy 6–8 px; przyciski min. 44 px.
- Bez emoji; znaki: › dalej, ⌖ miejsca/przypięte, ● komunikat, • zaznaczone, · separator.
- Tokeny poza kolorami: `rounded-inner` (element w wysepce z `p-1`), `bg-active` (wybrane/włączone), `text-2xs` (najmniejszy tekst, nic poniżej 11 px), warstwy `z-(--z-overlay|popover|nav|drawer|sheet|panel|dialog|toast)`. Gęste przyciski poniżej 44 px dostają `.hit` (obszar dotyku 44 × 44).
- Odwracalne zmiany planu (kosz, pomysły, pominięcie, usunięcie ramki/strzałki) od razu i z „cofnij”: `withUndo(doc, label, fn)` z `lib/undo.ts` (`undoable` w core). Okno potwierdzenia tylko dla nieodwracalnych, `danger` dla destrukcyjnych.
- Bez `window.prompt/confirm`: `askText` / `askConfirm` z `components/confirm-dialog.tsx` (rysuje `DialogHost` w layoucie). Menu i okienka zamyka `useDismiss` (Esc + dotknięcie obok). Komunikaty nad menu dolnym przez `<Toast>` (wspólny stos).
- Słownictwo: karty bez dnia to „pomysły”, usuwanie to „do kosza”, Mapy Google odmieniane po polsku (napis `Google Maps` tylko jako atrybucja). Tytuły okien też małymi literami.
- Ustawienia wracają tam, skąd je otwarto (`?from=`, `lib/back.ts`).
- Mobile-first (Android, Chrome); desktop to dodatek.
- Wersje zależności przypięte dokładnie; nie bierz wydań młodszych niż ok. tydzień (pnpm 11 i tak ich pilnuje przez `minimumReleaseAge`).
- Migracje addytywne; każda trafia na produkcję (serwis `planer-migrate` przy deployu) i do lokalnej bazy (`pnpm db:migrate`).
- Na serwerze tylko odczyt, chyba że wprost poproszono o deploy lub zmianę; każdą komendę `ssh server` pokaż przed uruchomieniem.
- Jeden etap = jedna gałąź (`etap-N`); na starcie etapu plan, potem małe kroki z testem na telefonie.
