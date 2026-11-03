import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

// Nocna kopia: baza Planera (pg_dump, format custom) i pliki z UPLOAD_DIR (tar.gz) do BACKUP_DIR,
// raz dziennie po BACKUP_HOUR (czas polski), z rotacją BACKUP_KEEP_DAYS. Hasło do bazy idzie przez
// zmienne środowiskowe pg_dump, nie przez argumenty procesu (widoczne w `ps`).

const NAME = /^planer-(db|files)_(\d{4}-\d{2}-\d{2})\./

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (c) => (stderr += c))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} → ${code}: ${stderr.trim().slice(0, 300)}`)),
    )
  })
}

function pgEnv(url: string): NodeJS.ProcessEnv {
  const u = new URL(url)
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, ''),
  }
}

const size = async (file: string) => `${Math.round((await stat(file)).size / 1024)} KB`

/** Zwraca opis wykonanej kopii albo null (wyłączone, za wcześnie, dziś już zrobiona). */
export async function nightlyBackup(): Promise<string | null> {
  const dir = process.env.BACKUP_DIR
  const url = process.env.DATABASE_URL
  if (!dir || !url) return null
  const now = Temporal.Now.zonedDateTimeISO('Europe/Warsaw')
  if (now.hour < Number(process.env.BACKUP_HOUR ?? 3)) return null
  const stamp = now.toPlainDate().toString()
  const dbFile = path.join(dir, `planer-db_${stamp}.dump`)
  await mkdir(dir, { recursive: true })
  await prune(dir, now.toPlainDate())
  if (existsSync(dbFile)) return null

  // Najpierw do pliku tymczasowego — przerwana kopia nie udaje udanej.
  await run(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-privileges', `--file=${dbFile}.part`],
    pgEnv(url),
  )
  await rename(`${dbFile}.part`, dbFile)
  const done = [`baza ${await size(dbFile)}`]

  const uploads = process.env.UPLOAD_DIR
  if (uploads && existsSync(uploads)) {
    const filesFile = path.join(dir, `planer-files_${stamp}.tar.gz`)
    await run('tar', ['-czf', `${filesFile}.part`, '-C', uploads, '.'], {})
    await rename(`${filesFile}.part`, filesFile)
    done.push(`pliki ${await size(filesFile)}`)
  }

  return `${stamp}: ${done.join(', ')}`
}

/** Usuwa kopie starsze niż BACKUP_KEEP_DAYS (przy każdym sprawdzeniu, nie tylko w dniu nowej kopii). */
async function prune(dir: string, today: Temporal.PlainDate) {
  const oldest = today.subtract({ days: Number(process.env.BACKUP_KEEP_DAYS ?? 14) }).toString()
  for (const name of await readdir(dir)) {
    const m = name.match(NAME)
    if (m && (m[2] as string) < oldest) await rm(path.join(dir, name))
  }
}
