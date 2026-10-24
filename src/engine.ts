/**
 * SchoolSort engine.
 *
 * Takes the wall of text a school sends home and reduces it to the four things
 * a parent actually needs: what's happening, what to do, what it costs, and what
 * to send in. Deterministic and offline — no model call, no per-sort cost, and
 * the parent can see exactly which sentence each item came from.
 *
 * The unit of work is the sentence: each one is classified once, then grouped.
 */

export type Kind = 'event' | 'deadline' | 'todo' | 'money' | 'form' | 'bring'

export interface Item {
  id: string
  kind: Kind
  text: string
  /** ISO date (YYYY-MM-DD) when we can parse one, used for the calendar export. */
  iso?: string
  source: string
}

export interface SortResult {
  items: Item[]
  counts: Record<Kind, number>
  nothingFound: boolean
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const ACTION_VERBS =
  /\b(bring|send|sign|return|pay|register|rsvp|order|submit|complete|pack|wear|donate|book|schedule|turn in|drop off|pick up|fill out|permission)\b/i

const FORM_WORDS = /\b(form|permission slip|consent|waiver|application|signature|sign and return)\b/i
const MONEY_WORDS = /\$|fee|cost|payment|donation|due\b/i
const EVENT_WORDS =
  /\b(field trip|picture day|photo day|spirit day|assembly|conference|early dismissal|half day|no school|holiday|closed|open house|concert|performance|meeting|parade|book fair|science fair|graduation|class party)\b/i
const BRING_WORDS = /\b(bring|pack|wear|send in|don't forget|do not forget)\b/i

function sentenceSplit(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 12)
}

/** Parse the first date-like phrase in a sentence. Returns YYYY-MM-DD when unambiguous. */
export function findDate(sentence: string, now = new Date()): { iso?: string; label?: string } {
  const lower = sentence.toLowerCase()

  // "October 24", "Oct 24th"
  const monthFirst = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  )
  if (monthFirst) {
    const monthIndex = MONTHS.findIndex((m) => m.startsWith(monthFirst[1].slice(0, 3)))
    const day = Number.parseInt(monthFirst[2], 10)
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const year = inferYear(monthIndex, day, now)
      return { iso: isoDate(year, monthIndex, day), label: monthFirst[0] }
    }
  }

  // "24 October"
  const dayFirst = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
  )
  if (dayFirst) {
    const monthIndex = MONTHS.findIndex((m) => m.startsWith(dayFirst[2].slice(0, 3)))
    const day = Number.parseInt(dayFirst[1], 10)
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const year = inferYear(monthIndex, day, now)
      return { iso: isoDate(year, monthIndex, day), label: dayFirst[0] }
    }
  }

  // "10/24" or "10/24/2026"
  const numeric = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numeric) {
    const month = Number.parseInt(numeric[1], 10) - 1
    const day = Number.parseInt(numeric[2], 10)
    let year = numeric[3] ? Number.parseInt(numeric[3], 10) : inferYear(month, day, now)
    if (year < 100) year += 2000
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return { iso: isoDate(year, month, day), label: numeric[0] }
    }
  }

  // "this Friday", "next Tuesday" — kept as text, never guessed into a date.
  const weekday = lower.match(/\b(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (weekday) return { label: weekday[0] }

  return {}
}

function inferYear(monthIndex: number, day: number, now: Date): number {
  const candidate = new Date(now.getFullYear(), monthIndex, day)
  // More than two months in the past almost certainly means next year's notice.
  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  return candidate < cutoff ? now.getFullYear() + 1 : now.getFullYear()
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function kindFor(sentence: string): Kind | null {
  const hasDate = Object.keys(findDate(sentence)).length > 0

  if (MONEY_WORDS.test(sentence) && /\$\s?\d/.test(sentence)) return 'money'
  if (FORM_WORDS.test(sentence)) return 'form'
  if (BRING_WORDS.test(sentence) && hasDate) return 'bring'
  if (EVENT_WORDS.test(sentence)) return 'event'
  if (ACTION_VERBS.test(sentence)) return 'todo'
  if (hasDate) return 'deadline'
  return null
}

function clean(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > 190 ? `${trimmed.slice(0, 187)}…` : trimmed
}

export function sortNotice(raw: string, now = new Date()): SortResult {
  const sentences = sentenceSplit(raw)
  const items: Item[] = []
  const seen = new Set<string>()

  for (const sentence of sentences) {
    const kind = kindFor(sentence)
    if (!kind) continue

    const key = sentence.toLowerCase().slice(0, 70)
    if (seen.has(key)) continue
    seen.add(key)

    const { iso } = findDate(sentence, now)
    items.push({
      id: `i${items.length}`,
      kind,
      text: clean(sentence),
      iso,
      source: sentence,
    })
  }

  const counts: Record<Kind, number> = { event: 0, deadline: 0, todo: 0, money: 0, form: 0, bring: 0 }
  for (const item of items) counts[item.kind] += 1

  return { items, counts, nothingFound: items.length === 0 }
}

export const KIND_META: Record<Kind, { label: string; order: number }> = {
  deadline: { label: 'Due dates', order: 0 },
  todo: { label: 'Things to do', order: 1 },
  form: { label: 'Forms to return', order: 2 },
  money: { label: 'Money', order: 3 },
  bring: { label: 'Send in / wear', order: 4 },
  event: { label: 'Dates to know', order: 5 },
}

/** Group items into display sections, in the order a parent needs them. */
export function groupItems(items: Item[]): { kind: Kind; label: string; items: Item[] }[] {
  return (Object.keys(KIND_META) as Kind[])
    .sort((a, b) => KIND_META[a].order - KIND_META[b].order)
    .map((kind) => ({
      kind,
      label: KIND_META[kind].label,
      items: items.filter((i) => i.kind === kind),
    }))
    .filter((group) => group.items.length > 0)
}

function icsEscape(value: string): string {
  return value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

/**
 * Build an .ics file for the items that have a parsed date, so one tap drops
 * every deadline into the parent's calendar.
 */
export function toIcs(items: Item[], title: string): string {
  const dated = items.filter((i) => i.iso)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const events = dated.map((item, index) => {
    const day = item.iso!.replace(/-/g, '')
    return [
      'BEGIN:VEVENT',
      `UID:schoolsort-${day}-${index}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${day}`,
      `SUMMARY:${icsEscape(item.text.slice(0, 90))}`,
      `DESCRIPTION:${icsEscape(title)}`,
      'END:VEVENT',
    ].join('\r\n')
  })

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SchoolSort//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
}

export function asChecklist(items: Item[]): string {
  return groupItems(items)
    .map((group) => `${group.label.toUpperCase()}\n${group.items.map((i) => `- ${i.text}`).join('\n')}`)
    .join('\n\n')
}
