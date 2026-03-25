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
└── /schedule            — today's visits + this week, sorted by urgency
    └── /visit/[id]/brief — pre-visit brief for a specific account
        └── /visit/[id]/log — post-visit log form (or read-only view if already logged)
```

### The brief screen

This is the core of the app. It runs five database queries in parallel (so the page loads fast even on a weak cell signal) and renders six sections in priority order:

1. **Account snapshot** — customer type, segment, city. Access notes are shown first in a yellow callout because a technician who can't get into the building has wasted the trip before it started.
2. **Last visit** — relative date ("23 days ago"), who did it, what issue was found, severity badge, followup status.
3. **Recurring issues** — issues that have appeared across multiple past visits, sorted by frequency. Collapsed by default with the top issue previewed.
4. **Open followups** — unresolved items from previous visits. Red border if any exist. Each can be marked resolved in-place without leaving the screen.
5. **Tank inventory** — what the customer has ordered in the last 12 months, grouped by category. Tells the technician what's in the tank without asking.
6. **Recommend today** — up to 3 product recommendations with a customer-facing talking point for each.

### The upsell engine (`lib/upsell.ts`)

Recommendations are ranked in two passes:

**Pass 1 — issue-informed.** A lookup table maps known recurring issue descriptions to the SKU that would prevent or solve them. If the customer has a recurring "top-off reservoir running dry" issue, the engine recommends the auto top-off unit and generates a pitch the technician can say directly: *"An auto top-off unit handles evaporation automatically — no more salinity swings between visits."*

**Pass 2 — upsell graph.** The catalog includes an `upsell_relationships` field on each SKU — an array of complementary products. If a customer has a coral SPS pack, the engine recommends the monthly maintenance service that coral typically needs. This graph is defined at the product level and requires no per-customer configuration.

Filters applied before any recommendation surfaces:
- SKUs the customer already owns (last 12 months of orders) are excluded
- Office accounts (`office_service` customer type) are never shown fish or coral — they have display tanks maintained for aesthetics, not hobbyist livestock

### The visit loop

```
visit_schedule (status: scheduled)
  → technician reads brief
  → technician logs visit
  → service_visits (new row inserted, logged_* fields populated)
  → visit_schedule (status: completed, visit_id → service_visits.id)
```

When a visit is logged, the schedule card turns green with a "✓ Logged" badge. Tapping it again shows the read-only log — what was found, whether a followup was raised, what was recommended.

### Issue severity (`lib/issues.ts`)

Issues found on past visits are classified into three tiers:

| Severity | Example | Why |
|----------|---------|-----|
| Critical | Top-off reservoir running dry | Can change salinity and kill fish within hours |
| Moderate | Filter sock clogged | Degrades water quality over days |
| Routine | Feeding schedule drifted between staff | Manageable, but recurring |

Unknown issues default to routine. The severity drives the colour of the badge shown on past visits in the brief.

---

## Running locally

```bash
# Install dependencies
npm install

# Add environment variables
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Seed the database (requires SUPABASE_SERVICE_ROLE_KEY in .env.local)
npm run seed

# Start the dev server
npm run dev
```

### Database setup

Run `supabase/schema.sql` in the Supabase SQL editor before seeding. The schema creates six tables, two views, and the RLS policies that control who can read what.

Anonymous sign-ins must be enabled in your Supabase project under Authentication → Sign In Methods.

---

## Tests

```bash
npm test
```

17 unit tests covering the two pieces of pure business logic:

**`lib/upsell.test.ts`** — the recommendation engine:
- Already-owned SKUs are excluded
- Office accounts never receive fish or coral recommendations
- Issue-informed recommendations rank above graph-based ones
- Max 3 recommendations enforced
- Unknown SKUs in the upsell graph don't crash the engine
- Every recommendation includes a non-empty pitch string

**`lib/issues.test.ts`** — the severity classifier:
- Known issues map to the correct severity tier
- Unknown issues default to routine
- Input is normalised (case-insensitive, whitespace trimmed)

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router) | Server components fetch data in parallel before the page renders — important for weak connections |
| Database + Auth | Supabase | Postgres with row-level security, email OTP and anonymous auth out of the box |
| Styling | Tailwind CSS | Fast to write, readable in code review |
| Deployment | Vercel | Zero-config deploy from GitHub |
| Tests | Vitest | Fast, TypeScript-native, no config needed for pure function tests |

---

## Project structure

```
app/
  (auth)/login/         — login screen
  (app)/schedule/       — today's and this week's visits
  (app)/visit/[id]/
    brief/              — pre-visit brief (server component, 5 parallel queries)
    log/                — post-visit log (server + client)

components/
  schedule/VisitCard    — visit card with logged/emergency/overdue states
  brief/                — six sections of the pre-visit brief
  log/VisitLogForm      — editable form or read-only view

lib/
  upsell.ts             — recommendation engine
  issues.ts             — severity classification
  schedule.ts           — visit frequency rules and date helpers
  segments.ts           — customer segment display labels

types/database.ts       — TypeScript interfaces mirroring the schema
supabase/schema.sql     — full database schema with RLS policies
scripts/seed.ts         — seeds all five CSV datasets into Supabase
```
