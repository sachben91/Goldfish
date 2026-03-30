# Goldfish Express — Technician Pre-Visit Brief

A mobile-first web app for fish tank maintenance technicians. Before walking into an account, a technician opens the app in the parking lot and gets a single screen with everything they need to know: access instructions, what happened last visit, recurring issues, open followups, what's in the tank, and what to recommend.

Live: [goldfish-express.vercel.app](https://goldfish-express.vercel.app) — use "Continue as demo" to sign in without an account.

---

## Why this, not something else

The Goldfish Express dataset covers five areas: the product catalog, customer accounts, technicians, orders, and service visit history. A few directions were on the table before committing to this one.

### What we considered

**Delivery risk dashboard**
The data includes temperature sensitivity flags and delivery timelines. A dashboard could surface which in-transit orders are at risk of arriving stressed or dead. This is a real operational problem — fish are live cargo and some species don't survive mishandling.

Why we didn't build it: the business risk is low-value. Most high-risk SKUs are commodity livestock (clownfish, snails, shrimp) with low unit prices. When a delivery goes wrong, the cost is a replacement fish, not a lost account. The data also lacks real transit time or carrier information, so any risk score would be a proxy at best.

**Customer churn analysis**
Some accounts have long gaps in visit history and no recent orders. A churn prediction model could flag accounts likely to cancel. The problem: the dataset is too small for a credible model, and the output (a list of at-risk customers) doesn't tell a technician what to do differently when they're standing in front of one.

**Operations reporting for the owner**
Revenue breakdowns, followup resolution rates, visit frequency compliance — all derivable from the data. But this is a dashboard for the owner, not a tool for the person doing the work. It doesn't change any behavior in the field.

### Why the pre-visit brief

Two numbers stood out in the service visit history:

- **42% of visits recorded a followup requirement** — meaning nearly half of all visits ended with something unresolved that needed attention next time
- **$403k in service revenue** — the maintenance contracts, not the fish, are the core business

The gap is that technicians have no structured way to walk into an account already knowing what's unresolved. They rely on memory, which fails across a roster of 60+ accounts. A technician who walks in prepared costs nothing extra — they're already there. One who walks in blind wastes the visit or misses a revenue opportunity.

The upsell angle came from the same logic. If a customer's top recurring issue is "filter sock clogged three times this year," that's a natural conversation opener for a monthly maintenance upgrade. The brief gives the technician the talking point, not just the data.

---

## How the app works

### Screens

```
/ (root)
├── /login               — email OTP or anonymous demo login
├── /schedule            — today's visits + this week, sorted by urgency
│   └── /visit/[id]/brief — pre-visit brief for a specific account
│       └── /visit/[id]/log — post-visit log form (or read-only view if already logged)
├── /insights            — recurring issue patterns across all accounts (ops team)
└── /demo                — live API demo: compatibility check + delivery windows
```

### The brief screen

This is the core of the app. It runs five database queries in parallel (so the page loads fast even on a weak cell signal) and renders sections in priority order:

1. **Today's job** — always-visible banner showing the visit category (monthly maintenance, biweekly, emergency rescue) and any open follow-up items that need attention on this visit.
2. **Account snapshot** — customer type, segment, city. Access notes shown first in a yellow callout — a technician who can't get in has wasted the trip before it started.
3. **Last visit** — relative date ("23 days ago"), who did it, what issue was found, severity badge, followup status.
4. **Recurring issues** — issues appearing across multiple past visits, sorted by frequency. Collapsed by default with the top issue previewed.
5. **Open followups** — unresolved items from previous visits. Red border if any exist. Each can be marked resolved in-place without leaving the screen.
6. **Tank inventory** — what the customer has ordered in the last 12 months, grouped by category. Tells the technician what's in the tank without asking.
7. **Recommend today** — up to 3 product recommendations with a customer-facing talking point for each.

### The visit log

After the visit, the technician fills in a structured log (not a free-text field):

- What work was completed
- Resolution status: resolved / ongoing / escalated / needs_part
- Next step and who owns it (tech, customer, or office)
- Whether an ops flag should be raised (water quality, equipment, livestock, other), with a note and SKU if relevant

When a visit is logged, the schedule card turns green with a "✓ Logged" badge. Tapping it again shows the read-only log.

The open followups view reads `logged_work_completed` first, falling back to the older `issue_found` field — so both old and new visit records display correctly.

### The visit loop

```
visit_schedule (status: scheduled)
  → technician reads brief
  → technician logs visit
  → service_visits (new row, logged_* fields populated)
  → visit_schedule (status: completed, visit_id → service_visits.id)
```

### The upsell engine (`lib/upsell.ts`)

Recommendations are ranked in two passes:

**Pass 1 — issue-informed.** A lookup table maps known recurring issue descriptions to the SKU that would prevent or solve them. If a customer has a recurring "top-off reservoir running dry" issue, the engine recommends the auto top-off unit with a ready-made pitch.

**Pass 2 — upsell graph.** The catalog includes an `upsell_relationships` field on each SKU — an array of complementary products. If a customer has a coral SPS pack, the engine recommends the monthly maintenance service that coral typically needs.

Filters: already-owned SKUs are excluded; office accounts never see fish or coral.

### Issue severity (`lib/issues.ts`)

| Severity | Example | Why |
|----------|---------|-----|
| Critical | Top-off reservoir running dry | Can change salinity and kill fish within hours |
| Moderate | Filter sock clogged | Degrades water quality over days |
| Routine | Feeding schedule drifted between staff | Manageable, but recurring |

Unknown issues default to routine. Severity drives the colour of badges on past visits in the brief.

---

## The compatibility engine (`lib/compatibility.ts`)

Answers one question at point of sale: can these SKUs be safely ordered together given this customer's tank?

Returns one of three outcomes:

| Result | Meaning |
|--------|---------|
| `ok: true` | Safe to proceed |
| `ok: "friction"` | Concern flagged — customer must acknowledge before completing order. Includes a customer-facing message and a sales rep talking point. |
| `ok: "review"` | Held for livestock team review. Customer is told why and what happens next. |

Rules that can fire:

- **Office block** — office display accounts ordering live fish or coral
- **Shrimp incompatibility** — predatory fish (aggressive-non-reef, semi-aggressive-predator) in same cart as ornamental shrimp, or either in the customer's recent order history
- **Mature tank requirement** — species that need an established system (BTA, SPS coral) ordered for a tank under 12 months old
- **Manual review hold** — trigger fish (beginner segments go straight to review; others self-attest via friction), hawkfish, anemones
- **Tank size minimum** — species with a gallon minimum ordered for a smaller tank on record

Every rule is configurable via `lib/operator-config.ts` — rules can be disabled, and zone-level overrides are supported.

**API:** `POST /api/compatibility/check` — fetches the full catalog from Supabase, runs the check, returns the result. Callers only need to send cart SKUs and customer context.

---

## The delivery window engine (`lib/delivery-windows.ts`)

Answers one question at point of sale: can we reliably fulfil same-day delivery for this zone, on this date, under current conditions?

Two independent signals block same-day delivery:

1. **Temperature** — south-belt has a 27% livestock replacement rate year-round; on warm or high-heat days it spikes. Same-day live delivery to heat-sensitive zones is blocked when the temperature flag is `warm` or `high_heat`. This is structural — no override is possible for heat blocks.

2. **Route capacity** — each zone has a safe stop limit derived from historical data. Adding a same-day stop past that limit causes route drift and a 54% replacement rate on late deliveries vs 0% on-time. Capacity blocks can be overridden by a rep using the override checklist (customer availability, cold storage, prior experience, etc.).

Returns either a list of available time windows (`10:00–12:00`, `12:00–14:00`, `15:00–17:00`) or a block with reason, message, and next available date.

**API:** `POST /api/delivery-windows/check` — pure function, no database call needed. Pass zone, date, stop count, temperature flag, and optional current time.

---

## The insights cron (`/insights`)

A nightly job (02:00 UTC via Vercel cron) runs `deriveRecurringPatterns` across all customer accounts and writes results to the `pattern_alerts` table.

The algorithm flags any issue that appears 3+ times in a 180-day window for a single customer, and suggests an ops action (schedule a dedicated repair visit, order a replacement part, escalate to the livestock team, etc.).

The `/insights` page shows:
- Last run time, accounts processed, patterns found
- All current alerts grouped by customer, with occurrence count, last seen date, and the suggested ops action

A "Run now" button triggers the same job on demand for authenticated users — useful for demos and for checking the output after new visit data is entered.

**Tables:** `pattern_alerts` (current alert set, replaced on each run), `cron_runs` (run history with status and counts).

---

## The demo page (`/demo`)

A live API sandbox with two panels. Click a preset scenario to call the API and see the response.

**Compatibility scenarios:**
- Trigger fish + cleaner shrimp in same cart → friction (predator/prey)
- Bubble Tip Anemone in a 6-month-old tank → friction (mature tank requirement)
- Office account ordering coral → friction (office block)
- Beginner segment ordering a trigger fish → review hold
- Yellow tang for a mature 100g tank → clear

**Delivery window scenarios:**
- South-belt on a high-heat day → heat block
- Downtown with 4 stops already booked → capacity block
- Order placed at 15:30 when all cutoffs have passed → no windows remaining
- North-river, stable temperature, 1 stop, 8am → available (all three windows)

Each result shows the colour-coded outcome, the customer-facing message, and (for friction) the rep talking point. A collapsible section shows the raw request payload.

---

## Running locally

```bash
npm install

cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

npm run seed   # seeds all five CSV datasets

npm run dev    # http://localhost:3000
```

### Database setup

Run migrations in order before seeding:

```bash
npx supabase db push
```

Migrations live in `supabase/migrations/`. They add the structured visit log columns, fix the `open_followups` view to coalesce old and new field names, and create the `pattern_alerts` and `cron_runs` tables.

Anonymous sign-ins must be enabled in your Supabase project under Authentication → Sign In Methods.

---

## Tests

```bash
npm test
```

Unit tests covering the pure business logic in `lib/`:

| File | What's tested |
|------|---------------|
| `upsell.test.ts` | Already-owned SKU exclusion, office account filtering, issue-informed ranking, 3-recommendation cap, empty graph edge cases |
| `issues.test.ts` | Known issue severity mapping, unknown issue default, case/whitespace normalisation |
| `compatibility.test.ts` | All six rules — office block, shrimp incompatibility (cart + inventory), mature tank, manual review (trigger/hawkfish/BTA), tank size minimum; operator config overrides; segment tier routing |
| `delivery-windows.test.ts` | Heat block, capacity block, cutoff filtering, next-weekday calculation, weekend skip logic, operator config overrides |
| `ops-queue.test.ts` | 3+ occurrence threshold, 180-day window, suggested action mapping, deduplication |
| `review-queue.test.ts` | Review queue logic |
| `knowledge-capture.test.ts` | Knowledge capture logic |

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router) | Server components fetch data in parallel before the page renders |
| Database + Auth | Supabase | Postgres with RLS, email OTP and anonymous auth out of the box |
| Styling | Tailwind CSS | Fast to write, readable in code review |
| Deployment | Vercel | Zero-config deploy from GitHub, cron jobs via `vercel.json` |
| Tests | Vitest | Fast, TypeScript-native, no config needed for pure function tests |

---

## Project structure

```
app/
  (auth)/login/              — login screen (email OTP + anonymous demo)
  (app)/
    schedule/                — today's and this week's visits
    visit/[id]/
      brief/                 — pre-visit brief (server component, parallel queries)
      log/                   — post-visit log form or read-only view
    insights/                — recurring issue patterns (ops team view)
    demo/                    — live API sandbox

app/api/
  compatibility/check/       — POST: runs compatibility engine against catalog
  delivery-windows/check/    — POST: runs delivery window check (no DB)
  insights/run/              — POST: manual insights trigger (session auth)
  cron/insights/             — GET: nightly cron (CRON_SECRET auth)
  orders/                    — order history endpoints

components/
  schedule/VisitCard         — visit card with logged/emergency/overdue states
  brief/                     — seven sections of the pre-visit brief
  log/VisitLogForm           — structured log form or read-only view

lib/
  compatibility.ts           — compatibility check engine
  delivery-windows.ts        — delivery window engine + override checklist
  upsell.ts                  — recommendation engine
  issues.ts                  — severity classification
  ops-queue.ts               — recurring pattern detection
  operator-config.ts         — feature flags and per-zone config
  schedule.ts                — visit frequency rules and date helpers
  segments.ts                — customer segment display labels

supabase/
  migrations/                — schema migrations (run in order via supabase db push)
  schema.sql                 — full schema with RLS policies

scripts/seed.ts              — seeds all five CSV datasets into Supabase
types/database.ts            — TypeScript interfaces mirroring the schema
vercel.json                  — cron schedule (nightly insights at 02:00 UTC)
```
