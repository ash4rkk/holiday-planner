// Pogoda na pokaz: przykładowy wyjazd (`pnpm db:sample`) ma zapisaną pogodę dni w `trips.demo_weather`,
// a aplikacja pokazuje ją zamiast Open-Meteo — żeby zawsze był dzień z deszczem i z burzą.

export type DemoWeatherDay = {
  date: string
  /** Kod WMO dnia (0 słońce, 2 chmury, 63 deszcz, 95 burza). */
  code: number
  max: number
  min: number
  /** Godziny opadu [od, do), np. [11, 17]. */
  wet?: [number, number]
}

const STORM = 95
const RAIN = 63

function inWet(day: DemoWeatherDay, hour: number): boolean {
  return Boolean(day.wet && hour >= day.wet[0] && hour < day.wet[1])
}

/** Temperatura godziny: minimum o 5, maksimum o 15. */
function tempAt(day: DemoWeatherDay, hour: number): number {
  const t = (Math.cos(((hour - 15) / 24) * 2 * Math.PI) + 1) / 2
  return Math.round((day.min + (day.max - day.min) * t) * 10) / 10
}

/** To samo co `/api/weather`: teraz i dni. */
export function demoDaily(days: DemoWeatherDay[], now = new Date()) {
  const today = days.find((d) => d.date === isoDate(now))
  const hour = now.getHours()
  return {
    current: today && {
      temp: tempAt(today, hour),
      code: inWet(today, hour) ? today.code : today.wet ? 3 : today.code,
    },
    daily: days.map(({ date, code, max, min }) => ({ date, code, max, min })),
  }
}

/** To samo co `/api/weather/hourly`: godzina po godzinie i dni ze szczegółami. */
export function demoHourly(days: DemoWeatherDay[]) {
  return {
    hours: days.flatMap((day) =>
      Array.from({ length: 24 }, (_, hour) => {
        const wet = inWet(day, hour)
        return {
          time: `${day.date}T${String(hour).padStart(2, '0')}:00`,
          temp: tempAt(day, hour),
          code: wet ? (day.code === STORM ? STORM : RAIN) : day.wet ? 3 : day.code,
          rain: wet ? 90 : 5,
          mm: wet ? (day.code === STORM ? 6 : 2) : 0,
        }
      }),
    ),
    days: days.map((day) => ({
      date: day.date,
      code: day.code,
      max: day.max,
      min: day.min,
      rain: day.wet ? 90 : 5,
      wind: day.code === STORM ? 55 : 15,
      sunrise: '07:25',
      sunset: '17:30',
    })),
  }
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
