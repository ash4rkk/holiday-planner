// Etap 6: przypomnienia push, kursy NBP; etap 8: kopie zapasowe.
console.log('worker: zaślepka, brak zadań')

setInterval(() => {}, 1 << 30)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0))
}
