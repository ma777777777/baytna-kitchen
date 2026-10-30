// Dates are local calendar days as YYYY-MM-DD strings. No time zones involved.

export function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // noon avoids DST edge cases
}

export function todayIso(): string {
  return iso(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function weekday(s: string): number {
  return parse(s).getDay()
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
}

/** The planning week starts on the shopping day on or before `date`. */
export function weekStartFor(date: string, shopDay: number): string {
  const back = (weekday(date) - shopDay + 7) % 7
  return addDays(date, -back)
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
