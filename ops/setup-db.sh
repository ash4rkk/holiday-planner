#!/usr/bin/env bash
# Jednorazowe założenie bazy Planera we wspólnym kontenerze `postgres` na serwerze. Uruchamiane
# z maszyny lokalnej, wykonuje się na serwerze:
#   ssh server 'bash -s' < ops/setup-db.sh
#
# Robi:
# 1. rolę planer_app (losowe hasło, CONNECTION LIMIT 20) i bazę planer, której jest właścicielem;
# 2. rolę planer_readonly (tylko SELECT, default_transaction_read_only=on) z domyślnymi uprawnieniami
#    do tabel, które planer_app założy migracjami;
# 3. REVOKE CONNECT ON DATABASE planer FROM PUBLIC — role innych aplikacji się z nią nie połączą;
# 4. /srv/planer/.env (600) z DATABASE_URL i resztą zmiennych z .env.example do uzupełnienia,
#    /srv/planer/.readonly-password (600) — do przeniesienia do lokalnego ~/.pgpass.
# Hasła losuje serwer; nie są wypisywane. Schemat wgrywa serwis `migrate` przy pierwszym deployu.
# Skrypt odmawia działania, jeśli rola, baza albo plik już istnieją.
set -euo pipefail
# Skrypt przychodzi przez stdin (bash -s), więc każde `docker exec -i` bez własnego wejścia
# dostaje </dev/null — inaczej połknęłoby resztę skryptu.

DIR=/srv/planer
ENV_FILE=$DIR/.env
RO_FILE=$DIR/.readonly-password
PSQL=(docker exec -i postgres psql -U postgres -v ON_ERROR_STOP=1 -qAt)

[[ -f "$DIR/.env.example" ]] || { echo "STOP: brak $DIR/.env.example (najpierw git clone do $DIR)"; exit 1; }
[[ -e "$ENV_FILE" ]] && { echo "STOP: $ENV_FILE już istnieje"; exit 1; }
for role in planer_app planer_readonly; do
  [[ "$("${PSQL[@]}" -c "select count(*) from pg_roles where rolname='$role'" </dev/null)" == 0 ]] \
    || { echo "STOP: rola $role już istnieje"; exit 1; }
done
[[ "$("${PSQL[@]}" -c "select count(*) from pg_database where datname='planer'" </dev/null)" == 0 ]] \
  || { echo "STOP: baza planer już istnieje"; exit 1; }

PW=$(openssl rand -hex 24)
RO_PW=$(openssl rand -hex 24)

"${PSQL[@]}" -v pw="$PW" -v ro_pw="$RO_PW" <<'SQL'
CREATE ROLE planer_app LOGIN PASSWORD :'pw' CONNECTION LIMIT 20;
CREATE ROLE planer_readonly LOGIN PASSWORD :'ro_pw' CONNECTION LIMIT 5;
ALTER ROLE planer_readonly SET default_transaction_read_only = on;
CREATE DATABASE planer OWNER planer_app;
REVOKE CONNECT ON DATABASE planer FROM PUBLIC;
GRANT CONNECT ON DATABASE planer TO planer_readonly;
SQL

"${PSQL[@]}" -d planer <<'SQL'
GRANT USAGE ON SCHEMA public TO planer_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE planer_app IN SCHEMA public GRANT SELECT ON TABLES TO planer_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE planer_app IN SCHEMA public GRANT SELECT ON SEQUENCES TO planer_readonly;
SQL

umask 077
{
  echo "DATABASE_URL=postgresql://planer_app:${PW}@postgres:5432/planer"
  echo
  # Reszta z szablonu, bez lokalnych DATABASE_URL i AUTH_DEV_EMAIL.
  grep -vE '^(DATABASE_URL|AUTH_DEV_EMAIL)=' "$DIR/.env.example"
} > "$ENV_FILE"
echo "$RO_PW" > "$RO_FILE"
chmod 600 "$ENV_FILE" "$RO_FILE"

echo "OK: role planer_app i planer_readonly, baza planer, $ENV_FILE, $RO_FILE"
echo "Uzupełnij w $ENV_FILE: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, ALLOWED_EMAILS, USER_NAMES"
"${PSQL[@]}" -c "select datname, datacl from pg_database where datname = 'planer'" </dev/null
