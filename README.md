# SchoolSort

Paste the school email. Get back the four things that actually matter: what's happening, what
to do, what it costs, and what to send in. With checkboxes and a one-tap calendar export.

Everything runs in the browser. No account, no server, no API key.

---

## Status

**Working**

- Paste text, upload a PDF or a .txt, or load a sample notice
- Six item types: due dates, tasks, forms, money, things to send in, dates to know
- Date parsing for "October 24", "24 October", "10/24/2026", "this Friday"
- Checklist with progress, `.ics` calendar export, copy-as-list
- First notice free, $7/month after that (test-mode unlock)
- Notice and checklist persist through a refresh (localStorage)

**Not built yet**

- Real payments — the unlock is local
- Sync between parents (deliberate: nothing to sync, nothing to breach)

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5178, plus a LAN URL for your phone
npm run build    # typecheck + static bundle in dist/
```

Port 5178 so it can run alongside SpeechCraft (5177) on the same machine.

---

## How it works

```
index.html → src/main.tsx → App.tsx → engine.ts
                              ├── pdf.ts   (lazy, only for PDF uploads)
                              ├── sample.ts (demo notice)
                              ├── base.css  (layout, type, controls)
                              └── styles.css (palette, list styles)
```

`App.tsx` owns the `input → result` state machine, the free-notice gate and persistence.
`engine.ts` is pure: text in, `SortResult` out.

### Extraction

`sortNotice(text)` splits the notice into sentences and classifies each one with `kindFor()`:

| Kind | Trigger |
|---|---|
| `money` | a `$` amount |
| `form` | "form", "permission slip", "consent", "sign and return" |
| `bring` | "bring", "pack", "wear" **and** a date |
| `event` | "field trip", "picture day", "early dismissal", "no school"… |
| `todo` | an action verb ("send", "pay", "register", "submit"…) |
| `deadline` | anything else containing a date |

Duplicates are collapsed by the first 70 characters, so the same sentence quoted twice in an
email appears once.

### Dates

`findDate()` handles month-first, day-first and numeric dates. The year is inferred: a date
more than two months in the past is treated as next year's notice, which is what a parent
reading a September email about an October event needs.

Weekday phrases ("this Friday") are kept as text but never invented into a date.

`toIcs()` exports only items with a parsed date, one all-day event each.

### Ordering

`KIND_META` sets the display order — due dates first, "dates to know" last — because a parent
needs the deadline before the newsletter.

### The free gate

`used` counts sorts. The first is free; the second renders the plan page instead. Unlocking
swaps in a "Sort my notice" button rather than silently re-sorting, so the state transition is
explicit.

---

## Pricing

**$7/month** for unlimited notices. First notice free.

The current unlock is local. Real payments need Stripe plus a server-side check — see
[PROJECT.md](../PROJECT.md) in the workspace archive for the launch checklist.

---

## Extending it

**A new rule** — add a regex next to the others in `src/engine.ts`, one line in `kindFor()`,
and a matching sentence in `src/sample.ts` so the demo proves it.

**A new group** — add to the `Kind` union, `KIND_META` (label + order) and the `counts`
initialiser. TypeScript will point at every place that needs updating.

---

## Honest limitations

- It is a **filter, not an authority**. Unusual phrasing is missed, and a deadline can be
  labelled as a task. The UI tells people to check the original email, and it should keep
  saying so.
- No school-system integration, no email forwarding, no account. That is the point for v0.1 —
  but it also means the parent must copy and paste.
- Scanned-image PDFs have no text layer; the app says so and asks for pasted text.

---

## Deploy

Cloudflare Pages, free and licensed for commercial use:

```bash
npm run build
npx wrangler pages deploy dist --project-name schoolsort
```

Vercel's Hobby tier is not licensed for commercial use — previews only, or pay for Pro.

---

## Branches

- `dev` — all work happens here
- `main` — production

---

## Verification

2026-10-23: build clean under strict TypeScript; sample notice produced 11 items across 5
groups with 8 parsed dates; checking an item moved progress to 1/11; calendar export enabled;
second notice hit the paywall; unlock → re-sort succeeded; no horizontal overflow at 390 px.
