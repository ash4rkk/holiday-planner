// Google nie ma twardego limitu kwoty (budżet tylko ostrzega), więc pilnuje go aplikacja.
// Liczymy najgorszy wariant cennika: najmniejszy darmowy limit i najdroższy plan Compute Routes,
// bo Google nie podaje, do którego planu należy komunikacja miejska. Dzięki temu kwoty nie da się
// przekroczyć przy żadnym z nich (chyba że ten sam rachunek zużywa Routes gdzie indziej).

const FREE_REQUESTS = 1000
const WORST_USD_PER_REQUEST = 15 / 1000
const USD_PLN = 4.5

/** Ile zapytań miesięcznie mieści się w kwocie; 0 zł = tylko darmowa pula. */
export function routesMonthlyLimit(budgetPln: number): number {
  const paid = Number.isFinite(budgetPln) && budgetPln > 0 ? budgetPln : 0
  return FREE_REQUESTS + Math.floor(paid / (WORST_USD_PER_REQUEST * USD_PLN))
}
