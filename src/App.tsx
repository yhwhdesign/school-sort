/**
 * SchoolSort UI.
 *
 * One idea: a parent pastes the school email, and gets back a short list they
 * can act on. The first notice is free; unlimited notices are the paid tier.
 * Everything is stored in localStorage — no account, no server, no sync.
 */
import { useEffect, useMemo, useState } from 'react'
import { SAMPLE_NOTICE } from './sample'
import {
  asChecklist,
  groupItems,
  sortNotice,
  toIcs,
  type Item,
  type SortResult,
} from './engine'

type Step = 'input' | 'result'

const STORAGE = 'schoolsort.v1'

interface Saved {
  text: string
  result: SortResult | null
  checked: Record<string, boolean>
  used: number
  unlocked: boolean
}

/** Hydrate synchronously — a restore effect would race the save effect. */
function readSaved(): Partial<Saved> | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

const SAVED = readSaved()

export default function App() {
  const [step, setStep] = useState<Step>(() => (SAVED?.result ? 'result' : 'input'))
  const [text, setText] = useState(() => SAVED?.text ?? '')
  const [result, setResult] = useState<SortResult | null>(() => SAVED?.result ?? null)
  const [checked, setChecked] = useState<Record<string, boolean>>(() => SAVED?.checked ?? {})
  const [used, setUsed] = useState(() => SAVED?.used ?? 0)
  const [unlocked, setUnlocked] = useState(() => SAVED?.unlocked ?? false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ text, result, checked, used, unlocked }))
    } catch {
      /* private mode / quota — the app still works without persistence */
    }
  }, [text, result, checked, used, unlocked])

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const content = isPdf
        ? await (await import('./pdf')).extractPdfText(file)
        : await file.text()

      if (content.replace(/\s/g, '').length < 80) {
        setError('That file had no readable text. If it is a scan, paste the text instead.')
        return
      }
      setText(content)
    } catch {
      setError('That file did not open. Paste the text instead and it will still work.')
    } finally {
      setBusy(false)
    }
  }

  function sort() {
    if (text.trim().length < 80) {
      setError('Paste a bit more of the notice — a sentence or two is not enough to sort.')
      return
    }
    if (used >= 1 && !unlocked) {
      setError(null)
      setStep('result')
      setResult(null)
      return
    }
    const next = sortNotice(text)
    setResult(next)
    setChecked({})
    setUsed((u) => u + 1)
    setStep('result')
    setError(null)
  }

  function newNotice() {
    setResult(null)
    setText('')
    setChecked({})
    setStep('input')
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={newNotice} type="button">
          <span className="mark" aria-hidden="true" />
          SchoolSort
        </button>
        {step === 'result' && result && (
          <button className="link" onClick={newNotice} type="button">
            New notice
          </button>
        )}
      </header>

      {step === 'input' && (
        <main className="page">
          <p className="eyebrow">Paste it. Sorted in four seconds.</p>
          <h1>
            The school email
            <br />
            is eleven paragraphs.
            <br />
            You need three lines.
          </h1>
          <p className="lede">
            Paste the notice (or upload the PDF) and get the dates, the forms, the money and
            the things to send in — as a list you can actually finish.
          </p>

          <label className="field">
            <span>
              The email or notice <span className="hint">— paste as much as you have</span>
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              placeholder="Paste the whole thing here. The newsletter, the reminder email, the note from the teacher…"
            />
          </label>

          <div className="row between">
            <label className="btn btn-quiet file">
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
              {busy ? 'Reading…' : 'Upload PDF'}
            </label>
            <button
              className="link"
              type="button"
              onClick={() => {
                setText(SAMPLE_NOTICE)
                setError(null)
              }}
            >
              Try a sample notice
            </button>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-block" type="button" onClick={sort} disabled={busy}>
            Sort this notice
          </button>

          <p className="fineprint">
            SchoolSort organizes what you paste. It does not send anything, sign anything, or
            contact the school. Always check the original email before a deadline.
          </p>
        </main>
      )}

      {step === 'result' && result && (
        <ResultView
          result={result}
          checked={checked}
          onToggle={(id) => setChecked((c) => ({ ...c, [id]: !c[id] }))}
          onNew={newNotice}
          unlocked={unlocked}
          onUnlock={() => setUnlocked(true)}
        />
      )}

      {step === 'result' && !result && (
        <main className="page">
          <h2>You’ve used your free notice</h2>
          <p className="lede">
            The free plan sorts one notice. SchoolSort Plus is unlimited — every newsletter,
            every permission slip, every “reminder: tomorrow” email.
          </p>

          <div className="card paywall-card">
            <div className="price-line">
              <strong>$7</strong>
              <span>/month</span>
            </div>
            <p className="muted">Cancel any time. No account needed.</p>
            {unlocked ? (
              <button className="btn btn-block" type="button" onClick={sort}>
                Sort my notice
              </button>
            ) : (
              <>
                <button className="btn btn-block" type="button" onClick={() => setUnlocked(true)}>
                  Unlock unlimited notices
                </button>
                <button className="link" type="button" onClick={newNotice}>
                  Not now
                </button>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ResultView({
  result,
  checked,
  onToggle,
  onNew,
  unlocked,
  onUnlock,
}: {
  result: SortResult
  checked: Record<string, boolean>
  onToggle: (id: string) => void
  onNew: () => void
  unlocked: boolean
  onUnlock: () => void
}) {
  const groups = useMemo(() => groupItems(result.items), [result])
  const done = result.items.filter((i) => checked[i.id]).length
  const dated = result.items.filter((i) => i.iso)

  function downloadCalendar() {
    const blob = new Blob([toIcs(result.items, 'From SchoolSort')], {
      type: 'text/calendar;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'school-dates.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(asChecklist(result.items))
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <main className="page result">
      <p className="eyebrow">
        {result.items.length} things · {dated.length} with a date
      </p>
      <h2>
        {done === result.items.length && result.items.length > 0
          ? 'All done. Nothing else in this one.'
          : 'Here’s what the email actually said'}
      </h2>

      <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemax={result.items.length}>
        <span style={{ width: `${result.items.length ? (done / result.items.length) * 100 : 0}%` }} />
      </div>
      <p className="muted small">
        {done} of {result.items.length} handled
      </p>

      {groups.map((group) => (
        <section key={group.kind} className="group">
          <h3 className="section-title">{group.label}</h3>
          <div className="items">
            {group.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                done={Boolean(checked[item.id])}
                onToggle={() => onToggle(item.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {result.nothingFound && (
        <p className="muted">
          Nothing actionable stood out. That may be good news — or the notice may be written in
          a way we could not read. Skim the original.
        </p>
      )}

      <div className="toolbar">
        <button className="btn btn-quiet" type="button" onClick={() => void copyList()}>
          Copy as list
        </button>
        <button className="btn btn-quiet" type="button" onClick={downloadCalendar} disabled={dated.length === 0}>
          Add dates to calendar
        </button>
        <button className="btn btn-quiet" type="button" onClick={onNew}>
          Sort another
        </button>
      </div>

      {!unlocked && (
        <div className="card paywall-card">
          <p className="eyebrow">SchoolSort Plus</p>
          <h3>Unlimited notices, $7/month</h3>
          <p className="muted">
            One free notice is the whole product. If this saved you a scroll, the next forty
            emails are on the paid plan.
          </p>
          <button className="btn btn-block" type="button" onClick={onUnlock}>
            Unlock unlimited notices
          </button>
        </div>
      )}

      <p className="fineprint">
        SchoolSort only organizes text you provide. Deadlines and amounts should always be
        checked against the school’s original message.
      </p>
    </main>
  )
}

function ItemRow({ item, done, onToggle }: { item: Item; done: boolean; onToggle: () => void }) {
  return (
    <label className={`item ${done ? 'is-done' : ''}`}>
      <input type="checkbox" checked={done} onChange={onToggle} />
      <span className="box" aria-hidden="true" />
      <span className="content">
        <span className="item-text">{item.text}</span>
        {item.iso && <span className="due">{prettyDate(item.iso)}</span>}
      </span>
    </label>
  )
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
