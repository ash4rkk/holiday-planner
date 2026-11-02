# Planer wakacji — plan aplikacji

planer.wiergowsky.com · 1 listopada 2026 · Arek

## Wizja i założenia

Planer to prywatna aplikacja PWA dla 2 osób, w której każdy wyjazd jest jedną tablicą z kartami Markdown, miejscami z Google Maps i załącznikami. Łączy swobodę Excalidraw (układanie, łączenie, grupowanie) z czytelnością notatek Markdown.

- Mobile-first: głównym urządzeniem jest telefon, desktop jest wygodnym dodatkiem.
- Trzy widoki w menu: Tablica (swobodny canvas), Lista (pionowe karty do szybkiego czytania i edycji) i Mapa (wszystkie miejsca wyjazdu). Na start otwiera się Pulpit dnia.
- Offline: pełna edycja bez zasięgu, scalanie zmian po powrocie sieci.
- Współpraca: 2 użytkowników edytuje na żywo, bez konfliktów.
- Dostęp: tylko przez Cloudflare Access, ten sam co dla wiergowsky.com.
- AI: czat, który czyta tablicę i doradza, oraz import, który ze zdjęcia biletu lub paragonu tworzy szkic karty.

## Decyzje z wywiadu

| Obszar | Decyzja |
|---|---|
| Koncepcja | Notatki Markdown jako karty na tablicy, styl mieszany: czyste karty, szkicowe strzałki i ramki; motyw Vague w wariancie jasnym i ciemnym (róż, Atkinson Hyperlegible, tło „mgła”, pływające menu) |
| Ekran startowy | Pulpit dnia: karty na dziś wg godzin, następne miejsce z dojazdem, pogoda, wydatki dzisiaj |
| Widoki wyjazdu | Trzy pozycje w menu: Tablica, Lista, Mapa; „ułóż wg dni” na Tablicy; prognoza pogody przy dniach w Liście; bez wyszukiwania |
| Struktura | Wyjazd = jedna tablica; nowy wyjazd z krótkiego formularza (nazwa, daty, waluty); po powrocie archiwum, nadal edytowalne (domyślnie) |
| Dni | Data jako pole karty (karty leżą dowolnie, Lista grupuje po dacie) |
| Pola karty | Data, data końcowa (noclegi, wynajem), godzina, czas trwania, status, lokalizacja, przypomnienie — wszystkie opcjonalne i zwijane |
| Typy kart | Stała lista typów z ikoną i kolorem (Nocleg, Atrakcja, Jedzenie, Transport, Notatka) |
| Szablony | Szablony kart, np. „Lot” z polami na numer i terminal |
| Relacje | Strzałki między kartami, ramki-grupy, karty-checklisty, karty przypięte; kosz kart (przywracanie przez 30 dni) |
| Rysowanie odręczne | Nie będzie |
| Użytkownicy | 2 osoby, logowanie Cloudflare Access (jak wiergowsky.com); obie widzą wszystkie wyjazdy; interfejs tylko po polsku |
| Współpraca | Na żywo + offline, CRDT (Yjs); kursor i awatar drugiej osoby na tablicy |
| Offline | PWA z pełną edycją offline; załączniki aktywnego wyjazdu pobierane automatycznie |
| Telefony | Oba Android, więc Web Share Target działa natywnie |
| Hosting | Własny VPS (4 GB RAM lub więcej) za Cloudflare Tunnel |
| Elementy tablicy | Karty MD, załączniki-dokumenty (bilety, rezerwacje, paragony; bez galerii zdjęć z wyjazdu), linki z podglądem, mini-mapy |
| Google Maps | Udostępnij → Planer → wybór wyjazdu (+ notatka) → skrzynka; wklejanie; otwieranie nawigacji |
| Edytor | WYSIWYG z zapisem Markdown, pasek formatowania nad klawiaturą |
| Koszty | Składnia `/+300` w treści karty; PLN i kilka walut wyjazdu (np. EUR i CHF), kurs NBP z daty karty, sumy w PLN i walucie głównej wyjazdu, tylko podgląd |
| Powiadomienia | Push: przypomnienia z kart z datą i godziną, czas wyprzedzenia ustawiany w karcie (domyślnie wg typu), oraz zmiany drugiej osoby |
| Eksport | Markdown i PDF do druku; link tylko do odczytu dla rodziny (z kwotami, bez logowania) |
| AI — czat | Claude (API), tylko czyta i doradza, limit ok. 20 zł miesięcznie; widzi całą tablicę, treść załączników i wyszukuje w sieci |
| AI — import | Zdjęcie biletu, paragonu, rezerwacji → AI tworzy kartę z typem, datą, godziną i kwotą; zatwierdzana w wyskakującym oknie (podgląd danych, Zatwierdź / Popraw / Odrzuć) |
| Wykonanie | Arek z Claude Code, bez terminu: plan dzielony na małe, samodzielne etapy |

## Funkcje

Rdzeniem jest karta: treść Markdown plus kilka opcjonalnych pól, umieszczona na tablicy wyjazdu i widoczna też w Liście, na Mapie i w Pulpicie.

### Karta

- Treść: Markdown edytowany w WYSIWYG (nagłówki, listy, pogrubienia, linki, checklisty `- [ ]`).
- Typ: Nocleg, Atrakcja, Jedzenie, Transport, Notatka — ikona i kolor paska karty.
- Pola opcjonalne: data, data końcowa, godzina, czas trwania, status, lokalizacja, przypomnienie (ile wcześniej). Zwinięte, dopóki puste.
- Załączniki: zdjęcia i PDF-y, miniatury w karcie, podgląd pełnoekranowy.
- Link z podglądem: wklejony URL tworzy kartę z tytułem, opisem i miniaturą (Open Graph).
- Mini-mapa: statyczna mapka z pinezką, klik otwiera nawigację w Google Maps.
- Przypięcie: przypięte karty są zawsze na górze Listy.
- Szablony kart: np. „Lot” (numer, terminal, godzina odprawy), „Nocleg” (check-in, check-out, kod do drzwi).

### Koszty w treści

- Zapis `/+300` to 300 PLN, `/+50EUR` lub `/+50€` to 50 euro. Wyjazd może mieć kilka walut (np. EUR i CHF); każdą zapisuje się z sufiksem, np. `/+20CHF`.
- Kilka kwot w jednej karcie sumuje się; suma pokazuje się jako plakietka na karcie.
- Sumy dnia i wyjazdu w PLN i walucie głównej wyjazdu, po kursie NBP z dnia daty karty (lub dzisiejszym).
- Tylko podgląd, bez rozliczania między osobami.

### Tablica

- Nieskończony canvas: pinch-zoom, przesuwanie dwoma palcami, przeciąganie kart.
- Ramki-grupy z nazwą (np. „Rzym”, „Do rozważenia”); przesunięcie ramki przesuwa jej karty.
- Strzałki między kartami w stylu szkicu, z opcjonalną etykietą („pociąg 2 h”).
- Bez rysowania odręcznego.

### Lista

- Karty w pionie, grupowane po dacie; karty bez daty w sekcji „Bez daty”.
- W ramach dnia sortowanie po godzinie; filtr po typie i statusie.
- Najszybsze miejsce do edycji na telefonie.

### Mapa

- Pinezki wszystkich kart z lokalizacją, kolor wg typu.
- Zakładki dni u góry: „wszystkie”, „dziś” i każdy kolejny dzień wyjazdu; kropka pod zakładką oznacza dzień z zaplanowanymi miejscami. Klik w pinezkę otwiera kartę.
- Trasa dnia: w zakładce dnia widać tylko jego miejsca, ponumerowane według godziny i połączone przerywanymi strzałkami w akcencie. Trasa zaczyna się od noclegu, w którym śpicie tej nocy (pole „data końcowa”). Miejsca dnia bez współrzędnych są wymienione pod mapą jako „poza mapą”.

### Pulpit dnia

- Karty na dziś na osi godzin.
- Następne miejsce z czasem dojazdu i przyciskiem nawigacji.
- Pogoda dla lokalizacji noclegu lub bieżącej pozycji.
- Wydatki dzisiaj: suma kwot z dzisiejszych kart.
- Poza wyjazdem: odliczanie do najbliższego wyjazdu i lista wyjazdów.

### Skrzynka miejsc

- Miejsca udostępnione z Google Maps czekają na liście wyjazdu.
- Z niej przeciągasz miejsce na tablicę albo jednym kliknięciem tworzysz kartę.

### Powiadomienia i eksport

- Push: przypomnienie przed kartą z datą i godziną (np. 3 h przed lotem) oraz info o zmianach drugiej osoby.
- Eksport wyjazdu do pliku .md i PDF do druku, ułożonego dzień po dniu.

### Porządkowanie, kosz i udostępnianie

- Ułóż wg dni: przycisk na Tablicy ustawia karty z datą w kolumny dni; karty bez daty, ramki i strzałki zostają na miejscu. Jedno „cofnij” przywraca poprzedni układ.
- Kosz kart: usunięta karta dostaje `deletedAt` i przez 30 dni można ją przywrócić; worker czyści starsze.
- Link tylko do odczytu: strona `/p/<token>` z Listą dni, Mapą i kwotami, bez załączników i bez edycji. Token jest długi i losowy, można go unieważnić (tabela `share_links`). W Cloudflare Access ścieżka `/p/*` ma regułę Bypass, reszta aplikacji zostaje za logowaniem.
- Pogoda w Liście: ikona i temperatura przy nagłówku dnia z Open-Meteo, do 16 dni naprzód.
- Bez wyszukiwania: wystarczą filtry Listy i czat AI.

## UX na telefonie

Nawigacja to dolny pasek z czterema pozycjami: Dziś, Tablica, Lista, Mapa; czat AI i skrzynka są pod przyciskami w górnym pasku wyjazdu.

### Ekrany

1. Dziś (Pulpit dnia) — domyślny ekran po otwarciu.
2. Wyjazdy — lista wyjazdów (nadchodzące, archiwum), z menu u góry Pulpitu.
3. Tablica wybranego wyjazdu.
4. Lista wybranego wyjazdu.
5. Mapa wybranego wyjazdu.
6. Karta — pełnoekranowy edytor (bottom sheet rozwijany do pełnego ekranu).
7. Skrzynka — miejsca do rozdzielenia.
8. Czat AI — panel od dołu, z kontekstem bieżącego wyjazdu.
9. Udostępnianie — ekran po „Udostępnij → Planer”: wybór wyjazdu i notatka.

### Gesty na tablicy

| Gest | Akcja |
|---|---|
| Jeden palec na tle | Przesuwanie tablicy |
| Dwa palce | Zoom i przesuwanie |
| Tap w kartę | Zaznaczenie, pasek akcji nad kartą |
| Podwójny tap / tap w zaznaczoną | Otwarcie edytora karty |
| Przytrzymanie karty | Przeciąganie |
| Przeciągnięcie z uchwytu na krawędzi | Rysowanie strzałki do innej karty |
| Przytrzymanie tła | Menu: nowa karta, ramka, wklej |

### Zasady

- Edycja treści zawsze w pełnoekranowym arkuszu, nie na małej karcie w canvasie.
- Przyciski minimum 44 px, kluczowe akcje w zasięgu kciuka (dół ekranu).
- Pasek formatowania Markdown nad klawiaturą: nagłówek, lista, checklista, link, `/+` kwota.
- Duży przycisk „+”: nowa karta, zdjęcie (import AI), wklej link.
- Motyw Vague w wariancie jasnym lub ciemnym: domyślnie wg systemu, przełącznik w nagłówku.

## Motyw: Vague

Aplikacja ma dwa warianty motywu Vague: jasny (ciepłe złamane białe tło, przyciemnione akcenty) i ciemny, rozjaśniony względem oryginału. Oba mają jeden akcent w przygaszonym różu, krój Atkinson Hyperlegible, nieruchome tło „mgła” i pływające menu; bez animowanego tła. Domyślnie wariant idzie za ustawieniem systemu, przełącznik w nagłówku zapamiętuje wybór.

### Tokeny

| Token | Ciemny | Jasny | Użycie w planerze |
|---|---|---|---|
| bg | #1e1e22 | #f3f1ed | Tło aplikacji, pasek formatowania |
| panel | #26262b | #fbfaf7 | Karty, wysepki nagłówka i nawigacji, arkusze |
| raised | #2c2c32 | #ebe8e3 | Pola w karcie, pola tekstowe, aktywna zakładka |
| line | #36363f | #dcd8d1 | Obramowania kart, separatory |
| sel | #44444e | #cfcac2 | Zaznaczenie, uchwyt arkusza |
| text | #dedede | #2b2a30 | Treść, tytuły kart |
| muted | #a8a8b6 | #55555f | Ikony, nieaktywne pozycje |
| subtle | #8f8fa8 | #66667a | Etykiety i metadane kursywą |
| dim | #5a5a6c | #a7a5ae | Wyłączone elementy, nieaktywne kropki |
| accent | #c48282 | #9c5859 | Aktywny element, przyciski główne, trasa, szkic AI |
| accent-hover | #d49a9a | #874a4b | Najechanie na element w akcencie |
| on-accent | #1e1e22 | #fbfaf7 | Tekst na pełnym akcencie |

Każdy kolor tekstu ma kontrast co najmniej 4,5:1 na swoim tle i panelu, także subtle (ok. 4,8:1). W jasnym wariancie róż jest przyciemniony do #9c5859, bo oryginalny #c48282 na jasnym tle ma tylko ok. 2,7:1.

Poświata akcentu: 12–15% na najechanie i tagi, 18–22% na aktywny filtr i zaznaczenie, 35–40% na mocne wyróżnienie. Na pełnym różu tekst ma kolor #141415.

### Kolory znaczeniowe

| Element | Ciemny | Jasny |
|---|---|---|
| Nocleg (śliwka) | #bb9dbd | #85638a |
| Atrakcja (bursztyn) | #e8b589 | #9a6a34 |
| Jedzenie, „potwierdzone”, „offline” (zieleń) | #7fa563 | #4f7637 |
| Transport, woda na mapie (błękit) | #6e94b2 | #3f6b8c |
| Notatka, nazwy załączników (turkus) | #9bb4bc | #3f7480 |
| Kwoty `/+` i sumy (pomarańcz) | #e0a363 | #a3621f |
| Nazwy ramek na tablicy (lawenda) | #aeaed1 | #62629a |
| Błąd synchronizacji (czerwień) | #d8647e | #ad3f58 |

Tło ikon i plakietek to ten sam kolor przy 14–16% krycia (`color-mix`), więc w obu wariantach liczy się automatycznie.

### Tło i menu

- Tło „mgła”: na kolorze bg cztery miękkie, nieruchome plamy (akcent 18%, błękit 15%, śliwka 15%, bursztyn 11%) jako radialne gradienty z kolorów motywu, więc działa w obu wariantach. Widać je na Pulpicie, w Liście i między wysepkami; Tablica i Mapa mają własne tło.
- Pływające menu: kapsuła na środku przy dolnej krawędzi, nad treścią (82% krycia panelu, rozmycie 14 px). Aktywna pozycja rozwija się z ikoną i podpisem na poświacie akcentu 20%, pozostałe to same ikony 44 × 44 px z etykietą dla czytników ekranu.
- Treść przewija się pod menu: listy mają u dołu ok. 100 px zapasu, a karta wybranego miejsca na Mapie i przycisk „+” stoją nad kapsułą.
- Chowanie przy przewijaniu: przewijanie w dół (o więcej niż ok. 6 px, poza samą górą ekranu) zsuwa menu w dół poza ekran, a przewinięcie w górę od razu je pokazuje. Przejście 0,2 s, przycisk „+” zjeżdża razem z menu. Menu wraca też po zmianie ekranu, przewinięciu na sam dół i otwarciu klawiatury. Na Tablicy i Mapie menu się nie chowa, bo przesuwanie palcem służy tam do poruszania widokiem.
- W kodzie: hook `useScrollDirection` na kontenerze przewijania (pasywny nasłuch scroll, próg ok. 6 px, `requestAnimationFrame`), a menu przesuwane przez `transform: translateY()`, żeby nie przeliczać układu. Przy `prefers-reduced-motion` menu znika bez animacji.

### Typografia

- Krój: Atkinson Hyperlegible (Google Fonts, 400 i 700 z kursywą), zapasowo system-ui. Krój maszynowy Sometype Mono zostaje opcjonalnie dla godzin i kwot, gdyby zabrakło równych cyfr.
- Rozmiary na telefonie: 11–12 px etykiety i metadane, 13–14 px treść, 18–24 px nagłówki ekranów.
- Grubość 400; 700 tylko w nagłówkach i tytułach kart (Atkinson nie ma pośrednich grubości).
- Kursywa w #606079 dla metadanych, etykiet sekcji i podpowiedzi.
- Etykiety interfejsu małymi literami, po polsku („dziś”, „tablica”, „otwórz kartę”); nazwy własne i treść kart bez zmian.
- Znaki zamiast ozdobników: › dalej, ⌖ przypięte i miejsca, ● komunikat, • zaznaczone, · separator. Bez emoji.

### Kształty i stany

- Wysepki: nagłówek, przyciski i nawigacja jako osobne pastylki z zaokrągleniem 12 px, odstęp 4 px od krawędzi i między nimi, 2 px po bokach.
- Małe elementy (tagi, statusy, pola, przyciski paska formatowania) 6–8 px.
- Każda karta i wysepka ma obramowanie 1 px w kolorze line, bo w słońcu sama różnica odcieni tła i panelu znika; bez cieni, poświat i gradientów.
- Aktywna karta (np. „następne miejsce”, wybrane miejsce na mapie) ma różową kreskę 2 px u góry.
- Wysepki i kropki (gdyby wrócić do menu z wysepkami): nieaktywna pozycja to kropka w #3a3a46, aktywna to kapsułka 18 px w różu.
- Zadanie ukończone: #606079, przekreślone. Szkic AI: przerywana różowa ramka.
- Przejścia stanów 0,2 s; poza tym bez ruchu.

### Wdrożenie w Next.js

- Tokeny jako zmienne CSS w `app/globals.css`, osobno dla `[data-theme="dark"]` i `[data-theme="light"]`, podpięte do motywu Tailwind, żeby komponenty shadcn/ui używały tylko ich.
- Przełączanie przez next-themes (atrybut `data-theme`, wartość domyślna `system`, wybór zapisywany lokalnie); skrypt motywu przed renderem, żeby nie mrugało.
- Krój przez `next/font/google` (Atkinson Hyperlegible, opcjonalnie Sometype Mono dla cyfr).
- Manifest PWA: `background_color` #f3f1ed; `theme-color` w `<head>` osobno dla `prefers-color-scheme: light` i `dark`, żeby pasek systemu pasował do wariantu.
- `color-scheme` ustawiane razem z motywem, żeby pola formularzy i paski przewijania pasowały.

Źródło: przewodnik „Vague — zasady stylu”; prototyp ekranów w tym motywie jest na kanwie „Planer wakacji — prototyp”. Wartości tokenów: `apps/web/app/globals.css`.

## Architektura i stos

Całość działa w Docker Compose na VPS, w tym samym układzie co portfolio (wspólna sieć `edge` z `cloudflared`, `caddy` i `postgres`), a jedynym wejściem z internetu jest Cloudflare Tunnel chroniony przez Cloudflare Access. Szczegóły: [deploy.md](deploy.md). Stan wyjazdu (karty, układ, strzałki) to jeden dokument Yjs, który żyje w IndexedDB telefonu i synchronizuje się przez WebSocket z serwerem Hocuspocus.

Telefony rozmawiają z VPS tylko przez Cloudflare; edycja na żywo idzie przez serwer sync, a wywołania AI, pogody i kursów wychodzą z serwera.

| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | SSR dla Pulpitu, API routes |
| UI | Tailwind CSS + shadcn/ui | Komponenty mobile, kolory i zaokrąglenia tylko z tokenów motywu Vague |
| Tablica | React Flow (@xyflow/react) + rough.js dla strzałek i ramek | Karty to zwykłe komponenty React; dotyk i zoom gotowe; szkicowy styl tylko tam, gdzie trzeba |
| Edytor | Tiptap (ProseMirror) + rozszerzenie Markdown | WYSIWYG, zapis do Markdown, współedycja przez y-prosemirror |
| Sync | Yjs + Hocuspocus (serwer WebSocket) + y-indexeddb | CRDT: edycja offline i na żywo bez konfliktów |
| Baza | PostgreSQL + Drizzle ORM | Metadane, użytkownicy, push, kursy walut, migawki Yjs |
| Pliki | Wolumen na dysku VPS (opcjonalnie MinIO) | Proste; serwowane przez Next za Access |
| Logowanie | Cloudflare Access, weryfikacja JWT `Cf-Access-Jwt-Assertion` w proxy | Jedno logowanie z wiergowsky.com, bez własnych haseł |
| PWA | Serwist (service worker), manifest z `share_target` | Offline, instalacja, udostępnianie z Google Maps |
| Push | Web Push (VAPID, biblioteka web-push) + worker z harmonogramem | Przypomnienia z kart i zmiany drugiej osoby |
| Mapy | MapLibre GL + kafelki OSM (np. OpenFreeMap) | Bez kosztów; Google Maps tylko jako cel nawigacji |
| Dojazd | OSRM / openrouteservice lub link do nawigacji Google | Czas dojazdu w Pulpicie |
| Pogoda | Open-Meteo | Bez klucza API |
| Kursy | API NBP (tabela A) | Przeliczanie waluty wyjazdu na PLN |
| AI | Anthropic API (Claude) z wizją i narzędziem wyszukiwania | Czat i import zdjęć biletów/paragonów |
| PDF | Strona druku + Playwright (Chromium) na serwerze | PDF z tych samych komponentów co Lista |

## Model danych

Dane dzielą się na dwie części: treść tablicy w dokumencie Yjs (jeden na wyjazd) i wszystko inne w Postgresie. Kwoty i sumy nie są zapisywane — liczy się je z treści kart.

### Dokument Yjs wyjazdu

```ts
type TripDoc = {
  cards: Y.Map<CardId, Y.Map>   // pola poniżej
  frames: Y.Map<FrameId, { title, x, y, w, h }>
  edges: Y.Map<EdgeId, { from: CardId, to: CardId, label?: string }>
}

type Card = {
  type: 'stay' | 'sight' | 'food' | 'transport' | 'note'
  x: number; y: number; w: number; h: number
  frameId?: FrameId
  date?: string        // '2027-07-14'
  time?: string        // '14:30'
  durationMin?: number
  endDate?: string     // noclegi, wynajem
  remindMin?: number   // ile minut wcześniej push
  status?: 'idea' | 'booked' | 'done'
  location?: { name, address, lat, lng, mapsUrl }
  linkPreview?: { url, title, description, image }
  attachmentIds: string[]
  pinned: boolean
  templateId?: string
  aiDraft?: boolean    // szkic z importu AI, czeka na zatwierdzenie
  content: Y.XmlFragment  // treść Tiptap, eksport do Markdown
}
```

### Tabele Postgres

| Tabela | Najważniejsze kolumny | Po co |
|---|---|---|
| users | id, email, name, color | Mapowanie e-maila z Cloudflare Access; kolor kursora |
| trips | id, title, start_date, end_date, currencies (główna pierwsza), cover_attachment_id, archived | Lista wyjazdów, waluta wyjazdu |
| trip_docs | trip_id, state (bytea), updated_at | Trwały zapis dokumentu Yjs przez Hocuspocus |
| attachments | id, trip_id, filename, mime, size, path, sha256, created_by | Pliki na dysku VPS |
| inbox_items | id, trip_id, maps_url, name, address, lat, lng, note, created_by, used_at | Skrzynka miejsc |
| card_templates | id, name, type, markdown, default_fields (jsonb) | Szablony kart |
| reminders | trip_id, card_id, fire_at, sent_at | Wyliczane z kart przy zmianie dokumentu |
| push_subscriptions | user_id, endpoint, p256dh, auth | Web Push |
| fx_rates | currency, date, rate_pln | Cache kursów NBP |
| ai_threads / ai_messages | trip_id, user_id, role, content, created_at | Historia czatu per wyjazd |
| share_links | token, trip_id, revoked_at | Link tylko do odczytu `/p/<token>` |

### Kwoty w treści

```ts
const AMOUNT = /\/\+(\d+(?:[.,]\d{1,2})?)\s?(zł|pln|eur|€|usd|\$|[a-z]{3})?/gi
```

Brak sufiksu = PLN; sufiks = ta waluta, przeliczana po kursie NBP z daty karty. Kwoty z jednej karty sumują się, a sumy dnia i wyjazdu są pokazywane w PLN i walucie wyjazdu.

## Google Maps i udostępnianie

Na Androidzie zainstalowana PWA pojawia się w arkuszu „Udostępnij” Google Maps; link trafia do ekranu wyboru wyjazdu, a serwer zamienia go na nazwę, adres i współrzędne.

### Przepływ

1. W Google Maps: Udostępnij → Planer.
2. PWA otwiera `/share` z polami title, text, url (Google Maps zwykle wkłada nazwę, adres i krótki link maps.app.goo.gl do text).
3. Ekran udostępniania: wybór wyjazdu (domyślnie najbliższy), opcjonalna notatka, „Dodaj do skrzynki”.
4. Serwer rozwija krótki link (przekierowania) i wyciąga współrzędne z adresu docelowego (`!3d…!4d…`, `@lat,lng` lub `q=`); nazwę bierze z pierwszej linii tekstu.
5. Gdy współrzędnych brak, geokoduje adres (Nominatim).
6. Bez zasięgu: pozycja zapisuje się w IndexedDB i jest rozwijana po powrocie sieci.

### Manifest

```json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "title", "text": "text", "url": "url",
    "files": [{ "name": "files", "accept": ["image/*", "application/pdf"] }]
  }
}
```

Jeden cel udostępniania obsługuje i linki z Google Maps, i zdjęcia/PDF-y do importu AI. Service worker przechwytuje POST, zapisuje dane w IndexedDB i przekierowuje na ekran wyboru wyjazdu.

### Wklejanie i nawigacja

- Wklejony link Google Maps na tablicę lub do Listy tworzy kartę z lokalizacją i mini-mapą; inny link tworzy kartę z podglądem Open Graph.
- „Nawiguj” otwiera `https://www.google.com/maps/dir/?api=1&destination=lat,lng`, które Android przekazuje do aplikacji Google Maps.
- „Otwórz w Mapach” używa oryginalnego linku miejsca.

### Opcjonalnie później

- Google Places API (płatne powyżej darmowego limitu) dla godzin otwarcia, telefonu i zdjęć miejsca. W MVP te dane może uzupełnić czat AI przez wyszukiwanie.

## AI: czat i import

AI ma dwie role: czat, który tylko czyta i doradza, oraz import, który ze zdjęcia lub PDF-u tworzy szkic karty do zatwierdzenia. Oba działają po stronie serwera; klucz Anthropic API nigdy nie trafia do przeglądarki.

### Czat

- Panel od dołu w każdym widoku wyjazdu, historia zapisywana per wyjazd.
- Kontekst: wszystkie karty wyjazdu jako Markdown z polami (typ, data, godzina, status, lokalizacja, kwoty), skrócone przy dużych wyjazdach.
- Załączniki: tekst z PDF-ów i zdjęcia biletów przekazywane jako obrazy lub dokumenty, gdy pytanie ich dotyczy.
- Wyszukiwanie w sieci przez narzędzie wyszukiwania w API, np. aktualne godziny otwarcia czy wydarzenia.
- Czat niczego nie zmienia na tablicy; może odsyłać do kart linkiem („otwórz kartę”).
- Przykładowe podpowiedzi: „Co mamy jutro?”, „Czy zdążymy z lotniska do hotelu?”, „Czego brakuje w planie dnia 3?”, „Ile wydaliśmy na jedzenie?”.

### Import ze zdjęcia

1. „+” → Zdjęcie lub udostępnienie obrazu/PDF-u do Planera.
2. Plik zapisuje się jako załącznik wyjazdu.
3. Claude z wizją zwraca ustrukturyzowany JSON: typ karty, tytuł, data, godzina, lokalizacja, kwota z walutą, kluczowe dane (np. numer lotu, miejsce, kod rezerwacji).
4. Aplikacja tworzy kartę z `aiDraft: true`, treścią Markdown (z `/+kwota`) i załącznikiem.
5. Wyskakuje okno z podglądem rozpoznanych danych i przyciskami „Zatwierdź”, „Popraw” i „Odrzuć”; do decyzji karta jest szkicem z przerywaną ramką.

| Dokument | Typ karty | Co wyciąga |
|---|---|---|
| Bilet lotniczy / karta pokładowa | Transport | Lot, trasa, data, godzina, terminal, miejsce |
| Bilet kolejowy / autobusowy | Transport | Trasa, data, godziny, wagon, miejsce, cena |
| Rezerwacja noclegu | Nocleg | Nazwa, adres, check-in/out, kod, cena |
| Paragon | Jedzenie lub Notatka | Miejsce, data, kwota z walutą |
| Bilet wstępu | Atrakcja | Miejsce, data, godzina, cena |

Import w trybie offline: zdjęcie czeka w kolejce i jest przetwarzane po powrocie sieci.

## Struktura projektu

Jedno repozytorium (monorepo pnpm) z aplikacją Next.js, serwerem sync i workerem; wspólny kod (typy kart, parser kwot, schemat bazy) w pakiecie core.

```
planer/
├─ apps/
│  ├─ web/                      # Next.js
│  │  ├─ app/
│  │  │  ├─ (app)/
│  │  │  │  ├─ page.tsx            # Pulpit dnia
│  │  │  │  ├─ trips/page.tsx      # lista wyjazdów
│  │  │  │  └─ trips/[tripId]/
│  │  │  │     ├─ board/page.tsx
│  │  │  │     ├─ list/page.tsx
│  │  │  │     ├─ map/page.tsx
│  │  │  │     ├─ inbox/page.tsx
│  │  │  │     └─ print/page.tsx  # źródło PDF
│  │  │  ├─ share/page.tsx         # ekran po „Udostępnij”
│  │  │  ├─ api/
│  │  │  │  ├─ maps/resolve/       # rozwijanie linków Google Maps
│  │  │  │  ├─ link-preview/
│  │  │  │  ├─ attachments/
│  │  │  │  ├─ ai/chat/            # streaming
│  │  │  │  ├─ ai/import/
│  │  │  │  ├─ export/[tripId]/    # .md i .pdf
│  │  │  │  ├─ weather/ fx/ route/
│  │  │  │  └─ push/subscribe/
│  │  │  └─ manifest.ts
│  │  ├─ components/  board/ card/ editor/ list/ map/ chat/ ui/
│  │  ├─ lib/  yjs/ auth/ offline/
│  │  ├─ sw.ts                      # Serwist
│  │  └─ proxy.ts                   # weryfikacja JWT Cloudflare Access (Next 16)
│  ├─ sync/                     # Hocuspocus + zapis do Postgresa
│  └─ worker/                   # przypomnienia push, kursy NBP, kopie
├─ packages/
│  └─ core/                     # typy, parser kwot, Drizzle schema, Markdown↔Tiptap
├─ docker-compose.yml          # migrate, web, sync, worker w sieci edge (caddy, cloudflared, postgres są wspólne na serwerze)
└─ CLAUDE.md                   # zasady projektu dla Claude Code
```

## Etapy realizacji

Bez terminu, więc plan to 9 etapów, z których każdy daje używalną aplikację; po etapie 3 da się już planować prawdziwy wyjazd. Każdy etap to kilka sesji Claude Code z jasnym kryterium „gotowe”.

| Etap | Zakres | Gotowe, gdy |
|---|---|---|
| 0. Fundament | Monorepo, Docker Compose, Postgres + Drizzle, cloudflared, Cloudflare Access + proxy JWT, CLAUDE.md | planer.wiergowsky.com wpuszcza tylko Was dwoje i pokazuje imię zalogowanej osoby |
| 1. Karty i Lista | Wyjazdy (CRUD), dokument Yjs lokalnie w IndexedDB, karta z Tiptap + Markdown, typy, pola, widok Lista | Na telefonie tworzysz wyjazd i karty z datami, Lista grupuje je po dniach |
| 2. Tablica | React Flow, przeciąganie, zoom, ramki-grupy, strzałki rough.js, przypinanie | Te same karty ułożone na tablicy, zmiany widoczne w Liście |
| 3. Sync i offline | Hocuspocus, zapis do Postgresa, kursory drugiej osoby, PWA (Serwist), instalacja | Dwa telefony edytują jednocześnie; edycja w trybie samolotowym scala się po powrocie sieci |
| 4. Miejsca | Share Target, rozwijanie linków Maps, skrzynka, mini-mapy, widok Mapa, nawigacja | „Udostępnij → Planer” z Google Maps kończy się pinezką na Mapie |
| 5. Pliki i linki | Upload załączników, cache offline aktywnego wyjazdu, podglądy Open Graph, szablony kart | Bilet PDF otwiera się bez internetu |
| 6. Pulpit, koszty, push | Parser `/+`, kursy NBP, Pulpit dnia (oś, dojazd, pogoda, wydatki), przypomnienia i powiadomienia o zmianach | Rano Pulpit pokazuje plan dnia, a 3 h przed lotem przychodzi push |
| 7. AI | Czat z kontekstem wyjazdu i wyszukiwaniem, import zdjęć i PDF-ów do szkiców kart | Zdjęcie paragonu tworzy szkic karty z kwotą |
| 8. Eksport i kopie | Eksport .md, PDF z widoku druku, codzienny backup bazy i plików | PDF wyjazdu dzień po dniu do druku; kopia z ostatniej nocy na dysku |

Praca z Claude Code: jeden etap = jedna gałąź; na początku etapu plan (tryb planowania), potem realizacja małymi krokami z testem na telefonie po każdym.

## Ryzyka i otwarte pytania

Największe ryzyko to połączenie Cloudflare Access z PWA offline: po wygaśnięciu sesji Access aplikacja musi dalej działać z cache i zsynchronizować się po ponownym zalogowaniu.

| Ryzyko | Skutek | Jak ograniczyć |
|---|---|---|
| Wygasła sesja Cloudflare Access | Sync i API zwracają przekierowanie do logowania zamiast danych | Długi czas sesji w Access dla tej aplikacji; wykrywanie przekierowania i baner „Zaloguj ponownie” bez utraty lokalnych zmian |
| WebSocket przez Tunnel i Access | Brak edycji na żywo | Sync pod tą samą domeną (np. `/sync`), test w etapie 3 jako pierwszy |
| Format linków Google Maps się zmienia | Brak współrzędnych | Kilka wzorców + geokodowanie adresu jako zapas; testy na zapisanych przykładach |
| Edycja tablicy na małym ekranie | Frustracja, błędne przeciągnięcia | Edycja treści zawsze w arkuszu; Lista jako główne miejsce szybkich zmian |
| Push na Androidzie przy uśpionej PWA | Spóźnione przypomnienia | Web Push z serwera (nie timery w przeglądarce); test na obu telefonach |
| Koszty API Claude | Rachunek przy częstym czacie z załącznikami | Kontekst skracany, załączniki tylko gdy potrzebne, limit ok. 20 zł miesięcznie, po nim czat wyłączony do końca miesiąca; licznik w ustawieniach |
| Utrata danych na VPS | Utrata planów i biletów | Codzienny backup poza VPS; dokument Yjs i tak leży też na obu telefonach |

### Otwarte pytania

- [x] Waluty: wyjazd może mieć kilka walut, wszystkie przeliczane po kursie NBP.
- [ ] Pola karty i statusy ustalone; statusy domyślnie: pomysł / potwierdzone / zaliczone.
- [x] Import AI: karta zatwierdzana w wyskakującym oknie.
- [x] Widoczność: obie osoby widzą wszystkie wyjazdy, bez uprawnień per wyjazd.
- [x] Język: tylko polski, teksty wprost w kodzie.
- [x] VPS: 4 GB RAM lub więcej, więc PDF przez Playwright zostaje.
