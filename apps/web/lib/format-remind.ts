/** 180 → „3 h”, 30 → „30 min”, 1440 → „1 dzień”. */
export function formatLead(min: number): string {
  if (min % 1440 === 0) return min === 1440 ? '1 dzień' : `${min / 1440} dni`
  if (min % 60 === 0) return `${min / 60} h`
  return min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
}
