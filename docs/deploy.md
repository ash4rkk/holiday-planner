# Wdrożenie na serwer

Ten sam układ co portfolio: kod w `/srv/planer` (klon `origin/main`), deploy przez
`/srv/scripts/deploy.sh planer`. Kontenery Planera wiszą w zewnętrznej sieci `edge`, w której są już
wspólne `cloudflared`, `caddy` i `postgres`; Planer nie ma własnego tunelu, proxy ani serwera bazy.

```
telefon → Cloudflare Access → Cloudflare Tunnel (cloudflared) → caddy → planer-web:3000
                                                                       → planer-sync:1234 (etap 3, /sync)
planer-web / planer-sync / planer-worker / planer-migrate → postgres:5432 (baza planer)
```

Oznaczenia: **[L]** terminal lokalny (WSL), **[S]** serwer (`ssh server`), **[CF]** panel Cloudflare.

## Pierwsze wdrożenie

### 1. Kod [S]

```bash
cd /srv && git clone <origin> planer
```

### 2. Baza i `.env` [L → S]

```bash
ssh server 'bash -s' < ops/setup-db.sh
```

Zakłada role `planer_app` i `planer_readonly`, bazę `planer` (bez `CONNECT` dla `PUBLIC`),
`/srv/planer/.env` z `DATABASE_URL` i `/srv/planer/.readonly-password`. Odmawia, jeśli coś już
istnieje. Nocny `/srv/scripts/backup.sh` (`pg_dumpall`) obejmie bazę `planer` bez zmian.

Potem uzupełnij w `/srv/planer/.env`: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (krok 4),
`ALLOWED_EMAILS`, `USER_NAMES`. `AUTH_DEV_EMAIL` na serwerze nie ustawiaj (i tak działa tylko w dev).

Hasło `planer_readonly` przenieś do lokalnego `~/.pgpass` (wpis dla `localhost:15432`, jak
`portfolio_readonly`) i usuń plik z serwera.

### 3. Caddy [S]

Blok w `/srv/edge/Caddyfile` na wzór bloku `portfolio.wiergowsky.com` (ten sam sposób nasłuchu —
TLS kończy się w Cloudflare), z celem `planer-web:3000`, np.:

```caddyfile
http://planer.wiergowsky.com {
	encode zstd gzip
	reverse_proxy planer-web:3000
}
```

Caddy przekazuje nagłówek `Cf-Access-Jwt-Assertion` dalej bez konfiguracji — aplikacja go weryfikuje.
W etapie 3 dojdzie `handle /sync* { reverse_proxy planer-sync:1234 }` (WebSocket działa w
`reverse_proxy` bez dodatkowych opcji).

Caddy ma `admin off`: plik nadpisuj w miejscu (`cat > /srv/edge/Caddyfile`, bo to bind mount
pojedynczego pliku — edytor podmieniający plik zerwie montowanie), potem `docker restart caddy`.
Przed restartem sprawdź składnię:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### 4. Cloudflare [CF]

1. **Tunnel:** w istniejącym tunelu (tym od portfolio) dodaj Public Hostname `planer.wiergowsky.com`
   z tym samym celem co `portfolio.wiergowsky.com` (Caddy).
2. **Access — aplikacja główna:** Access → Applications → Add → Self-hosted, domena
   `planer.wiergowsky.com`, ta sama polityka i dostawca tożsamości co wiergowsky.com. Session Duration
   długo (np. 1 miesiąc), bo PWA offline musi przetrwać bez ponownego logowania.
   Overview → **Application Audience (AUD) Tag** → `CF_ACCESS_AUD`; team domain
   (`<zespol>.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`.
3. **Access — link publiczny (etap 8):** osobna aplikacja dla `planer.wiergowsky.com/p/*` z polityką
   Bypass. Aplikacja i tak pomija weryfikację JWT dla `/p/*`.

`ALLOWED_EMAILS` to druga linia obrony: inne kontenery w sieci `edge` mogą sięgnąć do `planer-web`
z pominięciem Access, a bez ważnego JWT dla adresu z listy dostaną 401/403.

### 5. Start [S]

```bash
/srv/scripts/deploy.sh planer
```

## Kolejne wdrożenia [L → S]

1. [L] `pnpm lint && pnpm typecheck && pnpm test`, push na `main`.
2. [S] Backup przed zmianą schematu: `/srv/scripts/backup.sh`.
3. [S] `cd /srv/planer && git status --short && git pull --ff-only` — przy lokalnych zmianach albo
   odmowie pulla stop.
4. [S] `/srv/scripts/deploy.sh planer`.

Migracje stosuje serwis `planer-migrate` przy każdym `up -d`, przed startem `planer-web`, `planer-sync`
i `planer-worker` (`depends_on: service_completed_successfully`). Jeśli migracja się nie powiedzie,
nowe kontenery nie wystartują, a działają dalej stare. Migracje mają być addytywne (nowy kod po
starym schemacie nie musi działać, ale stary kod po nowym — tak), żeby wycofanie kodu nie wymagało
cofania bazy.

Każda nowa migracja = też lokalna baza: `pnpm db:migrate` (inaczej lokalny `next dev` zwróci 500).

## Sprawdzenie

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep planer
```
Oczekiwane: `planer-web Up … (healthy)`, `planer-sync Up`, `planer-worker Up`; `planer-migrate` nie
działa (zakończony).

```bash
docker logs planer-migrate 2>&1 | tail -3 && docker logs --since 10m planer-web 2>&1 | tail -20
```
Oczekiwane: `migracje zastosowane`, w logu web `✓ Ready` bez `Error`.

- Telefon → `https://planer.wiergowsky.com` → logowanie Access → Pulpit „cześć, <imię>”.
- Inne konto → odmowa Access (albo 403 z aplikacji).
- `curl -sI https://planer.wiergowsky.com` → przekierowanie do `*.cloudflareaccess.com`.

## Wycofanie [S]

```bash
cd /srv/planer && git checkout --detach <poprzedni-commit> && /srv/scripts/deploy.sh planer
```

Powrót: `git checkout main && git pull --ff-only && /srv/scripts/deploy.sh planer`.
