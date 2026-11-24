# Wygląd: zasady

Jedno źródło zasad wizualnych Planera. Wartości kolorów są w `apps/web/app/globals.css` (motyw Vague,
jasny i ciemny); tu jest, **co znaczą** i kiedy ich używać. Zmiana zasady = zmiana tego pliku.

## Kolory

Komponenty używają wyłącznie tokenów (`bg-panel`, `text-muted`, `border-line`…), nigdy surowych hexów.
Każdy token ma wartość jasną i ciemną, więc oba tryby działają same. Wyjątki z hexami: `globals.css`,
CSS wydruku (`packages/core/src/export.ts`) i kolory osób (`packages/core/src/users.ts`).

### Powierzchnie

| token | do czego |
|---|---|
| `bg` | tło strony; pod nim „mgła” z czterech plam (akcent, niebieski, śliwka, bursztyn) |
| `panel` | wysepki |
| `raised` | elementy wypukłe w wysepce: pola, kafelki, tło kwoty `/+` |
| `line` | obramowania i separatory |
| `sel` | zaznaczenie, obramowanie pod kursorem |

### Tekst — trzy stopnie

| token | do czego |
|---|---|
| `text` | treść i tytuły |
| `muted` | opisy i wartości (np. „jak w systemie”, „możesz zostać do”) |
| `subtle` | podpisy, metadane, rzeczy nieaktywne |

Nie ma czwartego stopnia. Każdy z trzech ma kontrast co najmniej 4,5 : 1 na `panel` (tekst ~13 : 1).

### Akcent

Stara róża (`#9c5859` jasny, `#c48282` ciemny) znaczy **działanie i wybór**: główne przyciski, linki,
nazwy plików, aktywna pozycja, szkic AI. Wybrane/włączone ma tło `bg-active` (18% akcentu). Akcent nie
ostrzega — od tego jest czerwień, celowo w innym odcieniu (cynober) i dużo mocniej nasycona.

### Stany — tylko trzy kolory

| kolor | znaczy | przykłady |
|---|---|---|
| `red` | źle, nie zdążysz | spóźnienie, nakładanie się, „nic nie jedzie”, sesja wygasła |
| `amber` | do zrobienia, uwaga | „do rezerwacji”, brak klucza AI, offline, brak połączenia, problemy w logach |
| `green` | dobrze, gotowe | zarezerwowane, zdążysz, na żywo, wszystko spakowane |

Stan zawsze z tekstem albo znakiem (●), nie samym kolorem.

### Typy kart — bez kolorów stanów

| typ | kolor |
|---|---|
| nocleg | `plum` (śliwka) |
| atrakcja | `teal` (morski) |
| jedzenie | `orange` (pomarańcz) |
| transport | `blue` |
| notatka | bez koloru (`subtle`) |

Każdy typ w trzech postaciach: pasek z lewej (`bar`), kafelek ikony (15% koloru, `chip`) i tekst — w
`apps/web/components/card/type-style.ts`; pinezki mapy i strona dla rodziny mają ten sam podział
(`TYPE_VAR`). `lavender` jest wolna (dziś: ramki na Tablicy, tramwaj na mapie).

Kolor typu nie znaczy nic poza typem: linki nie są morskie, kwoty nie są pomarańczowe.

### Wyjątki

- **Pogoda:** ikona słońca bursztynowa, deszcz niebieski — to obrazki, nie stany.
- **Deszcz i burza na kartach:** karty w godzinach deszczu albo burzy (prognoza godzinowa, `cardSkies`)
  mają w tle scenę na canvasie (`lib/sky-scene.ts`, `components/sky/card-sky.tsx`): chmury przy górnej
  krawędzi, deszcz, kałuża, krople na szybie, w burzy błyskawice. Kolory z tokenów (`--blue`, `--sel`,
  `--muted`); scena leży pod treścią i ma być na tyle przejrzysta, żeby tekst karty dało się czytać.
  Jedna wspólna pętla, rysowane tylko widoczne karty; „ogranicz ruch” = nieruchoma klatka.
- **Linie tras na mapie:** kolor pojazdu (metro i prom niebieskie, prom przerywany; tramwaj lawenda;
  autobus morski; pociąg pomarańczowy; pieszo przerywana `muted`; autem śliwka). Bez kolorów stanów.
- **Kolory osób** (kursory, awatary): akcent, niebieski, śliwka, lawenda — też bez kolorów stanów.

- **Urlop w planerze urlopów:** urlop wspólny ma pełne tło akcentu, urlop jednej osoby tło
  `person-a` / `person-b` (niebieski, śliwka; kolejność osób z `USER_NAMES`), tekst `on-accent`
  (`LEAVE_CELL` w `components/leave/model.ts`). To wybór, nie stan, i ma być widoczny z daleka.
  Urlop do zatwierdzenia (`.leave-pending`) to ten sam kolor osoby, jako lekki odcień (22% z tłem)
  z tekstem w kolorze osoby i pustą kropką ◌ z prawej (`PendingMark`) — status kształtem, nie tylko jasnością.
  Bez bursztynu stanów, bo kolor mówi „kto”.
  Znaczki mają własne tokeny (`hol-pl`, `hol-bb`, `event`, `trip` w `globals.css`; dziś aliasy
  lawendy, morskiego, pomarańczy i śliwki — na ekranie planera nie ma kart, więc kolory typów nic
  tu nie mylą). Kształt i kolor naraz: święto w Polsce kropka, w Brandenburgii romb, wydarzenie mała
  kropka, wyjazd kreska; na urlopie z jasną obwódką. Legenda (`legend.tsx`) pod ikoną ⓘ w nagłówku; kolory osób widać przy ich sumach.
  Kolory etykiet TimeTree nie idą wprost: `eventTone` sprowadza je do najbliższego stonowanego
  odcienia `--ev-*` (czerwień, pomarańcz, żółć, zieleń, morski, niebieski, fiolet, róż, szary), żeby
  pasowały do motywu i nie udawały kolorów stanów.

### Kwoty

Bez koloru: pogrubione, cyfry o stałej szerokości (`font-bold tabular-nums`, `AmountBadge`,
`TotalsText`, `.amount-mark` w treści karty z tłem `raised`).

## Kształt i warstwy

- Obramowanie 1 px `line`. Wysepki `.island` 12 px (`rounded-island`), element w wysepce z `p-1` 9 px
  (`rounded-inner`), małe elementy 6–8 px (`rounded-small`).
- **Cień tylko na warstwach pływających** nad treścią: `shadow-float` (dolne menu, „+”, menu, okna
  potwierdzenia, komunikaty, dymki). Wysepki w treści bez cienia.
- Warstwy: `z-(--z-overlay|popover|nav|drawer|sheet|panel|dialog|toast)`, w tej kolejności.
- Przyciski min. 44 px; gęstsze dostają `.hit` (obszar dotyku 44 × 44).

## Tekst i znaki

- Atkinson Hyperlegible, 14 px; nic poniżej 11 px (`text-2xs`) — telefon w słońcu.
- **Kursywa tylko w podpisach sekcji** (`SectionLabel` i nagłówki w tym samym stylu). Opisy, wartości
  i podpowiedzi bez kursywy — mała szara kursywa jest najtrudniejsza do przeczytania.
- Interfejs po polsku, małymi literami (także tytuły okien). Bez emoji. Znaki: › dalej,
  ⌖ miejsce/przypięte, ● komunikat lub stan, • zaznaczone, · separator.

## Ruch

- **Ruch to sprężyna, przenikanie to krzywa.** Tokeny w `globals.css`: `--spring-smooth` (arkusze),
  `--spring-smooth` z `--spring-quick-ms` (menu i okna), `--spring-snappy` (pigułki, przyciski,
  upuszczenie), `--ease-soft` (przenikanie). Te same parametry w JS: `lib/spring.ts`.
- **Gest i ruch po nim są jednym ruchem.** Puszczenie oddaje prędkość palca sprężynie, o miejscu
  decyduje rzut prędkości (`snapIndex`, `project`), za krawędzią jest opór (`rubber`). Odbicie tylko
  po machnięciu, nigdy po zwykłym dotknięciu.
- **Wszystko da się złapać w locie** (`SpringMotion.stop()` oddaje bieżące miejsce i prędkość).
- Arkusze z dołu przez `useSheet`: w spoczynku bez `transform` (zmienia układ dla `fixed` w środku).
- Zamknięte okna i menu gasną przez `useExit` (kopia, ok. 160 ms) — niczego nie blokują.
- Przyciski mają `.press` (szerokie elementy `.press-soft`); nowe przyciski ikonowe i pigułki też.
- „Ogranicz ruch”: zamiast sprężyn przenikanie 150 ms; w kodzie `reducedMotion()`, `scrollBehavior()`,
  `motionMs()`.
- Nigdy `transition` na `*` (Tablica zaczyna się spóźniać). Bez animowania `backdrop-filter`.

## Mapy

MapLibre w kolorach motywu (`themeMap`); przy wynikach Google zostaje napis `Google Maps`.
