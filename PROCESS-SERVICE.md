# Goldfish Express — Service Visit Logic and Field Workflow Rationale

## The Problem This Solves

Service revenue is the highest-value, most stable revenue line in the business. The technician brief app exists to protect it — by making sure visits are completed cleanly, follow-ups don't fall through, and recurring problems get escalated before they become account-ending failures.

The first version of the app got the right idea: give the tech what they need before they walk in. But it made one structural mistake: it showed the tech everything about the account at once, at the same visual weight, and expected them to sort through it in a parking lot on a phone.

Luis said it directly: *"Stop making me do the sorting in my head."*

The data supports why this matters. 42% of service visits generate a follow-up. That rate does not come from bad techs — it comes from a system that doesn't give them a clear picture of what they're there to resolve, and doesn't give office a clean handoff when the tech's part is done.

---

## The Ownership Model

Before touching any code, the right question is: who owns what, and at which moment?

The service visit has three distinct moments — parking lot, inside the visit, and after the visit — and the tech's job is different at each one. The original app treated them as one continuous screen.

### What the tech owns

- Physical work done during the visit: replacing filter socks, refilling top-off, checking parameters, fixing equipment
- Noticing and logging observations — including things that keep recurring
- Flagging anything that needs office to act on, with enough context to act on it
- Logging what they did and what still needs to happen before they leave the site

### What office owns

- Anything that changes monthly spend: quoting an equipment upgrade, adjusting service tier, approving a new product
- Scheduling return visits when a part wasn't on the truck or the job spans multiple stops
- Customer communication about anything contractual or financial
- Closing the follow-up loop — once invoice is confirmed, return visit completed, or customer issue resolved
- Acting on the ops queue items the tech flagged

### What the customer owns

- Their own feeding schedule and staff behaviour between visits
- Access constraints (building policy, who has the key)
- Whether they approve an upgrade or a service change

### Why the original app blurred these

The `Mark resolved` button let a tech close a follow-up with a single tap. Dana's concern was precise: *"Field-resolved and fully-resolved are not the same thing."* A tech swapping a part is not the same as the invoice being updated, the return visit being scheduled, or the customer having been called. The button collapsed all of these into one action and silently dropped the trail for everything that still needed to happen downstream.

Similarly, the `Recommend today` section in the brief pushed the tech toward a sales conversation in the parking lot or during the visit. For office accounts especially, anything that changes spend goes through the office manager and account team — not through Luis standing next to a tank in a law firm lobby. The brief was optimised for a hobbyist sale dynamic that does not exist on commercial accounts.

---

## What Changed and Why

### The brief: right now vs later

**Before:** Six sections, all visible, all competing. Account snapshot, last visit, recurring issues, open follow-ups, tank inventory, upsell recommendations — rendered top to bottom regardless of relevance.

**After:** Three sections always visible. Everything else collapsible behind one tap.

Always visible:
1. **Account snapshot** — access notes first, always. A tech who can't get in wastes a trip.
2. **Open follow-ups** — shown before last visit because active work comes before context. Follow-ups now show a kind badge (needs fix / planned / office queue / customer) so the tech knows at a glance whether they're there to act or just to be aware.
3. **Last visit** — quick picture of what was found and done last time.

Collapsible ("More context"):
- Recurring issues, tank inventory, opportunities for office. Available one tap away. Not competing with the active job in the parking lot.

### Follow-up kinds

Follow-ups are not one thing. The same red badge was covering:

| Kind | What it means | What the tech should do |
|---|---|---|
| Needs fix | Something went wrong and needs fixing today | Act on it during the visit |
| Planned continuation | Multi-stop job — today was always the return trip | Complete the planned work, log it |
| Office queue | Waiting on approval, scheduling, or invoice | Log their part if they addressed it; office closes the loop |
| Customer behaviour | Feeding drift, access issue, staff habits | Note it; may need a training conversation, not a tech fix |

Until the database has a `followup_kind` column, the app infers kind from the text of the issue. This is best-effort — the real fix is capturing kind at log time, which the new log form does via the resolution status and next step owner fields.

### The log form: outcome shape over binary capture

**Before:** Issue found (text) → followup required (yes/no) → did you recommend a product (yes/no) → notes.

The problem: it captures whether something happened, not the shape of what happens next. Dana: *"I care a lot about what was done, what is still hanging, and whether the next move belongs to the field, office, or the customer."*

**After:** Four sections in priority order.

1. **What did you do today?** — required. The primary record of the visit. Replaces "issue found" as the leading question because the tech's work is the story, not just whether something was broken.

2. **Is this fully resolved?** — three states: Done / Partial / Couldn't fix. "Partial" and "Couldn't fix" expand the next step section. "Done" closes cleanly.

3. **What still needs to happen + who handles it?** — only shown when not fully resolved. Free text for the next step. Owner picker: Field return / Office / Customer. This is the handoff signal Dana needs. Office gets a clean queue of things they own. Future field returns are distinguishable from office approvals and customer behaviour changes.

4. **Flag for office** — optional. Five kinds: equipment or service opportunity, return visit needed (can't self-schedule), pattern alert, customer escalation, service cadence review. When a tech flags an ATO opportunity, they record what they observed and optionally the SKU. Office gets a structured item to act on. The tech does not pitch it on site.

### Opportunities for office

The `Recommend today` section has been renamed and reframed. It is no longer a to-do in the parking lot. It is context inside the visit: if the tech notices something that matches one of these opportunities during their work, they can flag it in the visit log and office handles the quote and approval. The label change reflects who actually owns this step.

---

## The Ops Queue: Office-Side Business Logic

The tech app is the input layer. The ops queue is what happens with the output.

`lib/ops-queue.ts` implements the same pattern as the compatibility and delivery window logic: structured types, accumulation of observations over time, and insight derivation when the pattern becomes meaningful.

**`OpsQueueItem`** — created when a tech flags something in their visit log. Has a kind, priority, observation text, and optional suggested action. Five kinds cover the range of things a tech might flag that require office to act.

**`deriveRecurringPatterns`** — takes a stream of issue observations for one account and flags any issue that appears 3+ times in the last 6 months. Returns a specific suggested action for each pattern, not just a count:
- Top-off issues → quote an ATO unit
- Filtration issues → consider increasing frequency or leaving a spare on site
- Feeding drift → arrange a staff training session
- Appearance concerns → review whether service cadence matches the account's event schedule

The principle is the same as the compatibility rules: encode the response, not just the detection. A pattern alert that says "top-off keeps running dry" without a suggested action is noise. One that says "quote EQUIP-ATO-001 — this will not resolve itself between visits" is something Dana can act on.

**`deriveAccountServiceInsight`** — aggregated health view for one account. Surfaces: active patterns, stale follow-ups, open ops items, urgent ops items, and a cadence suggestion if the visit frequency doesn't match what the account needs. Output actions mirror the knowledge-capture pattern: escalate / review / monitor.

**`sortOpsQueue`** — priority order: urgent → this week → next visit → whenever. Within priority: oldest first (FIFO), so nothing ages out silently.

---

## What This Does Not Yet Solve

**The follow-up kind column doesn't exist in the database.** The app infers kind from issue text as a stopgap. A `followup_kind` column on `service_visits` and the `open_followups` view would make this reliable. The log form captures it going forward; historical records would need backfilling or a default.

**The new logged fields need a schema migration.** `logged_work_completed`, `logged_resolution_status`, `logged_next_step`, `logged_next_step_owner`, and the ops flag fields are defined in `types/database.ts` but do not yet exist as columns. The legacy fields (`logged_issue`, `logged_followup_required`) are preserved in the insert for backwards compatibility until the migration runs.

**The ops queue has no UI.** `lib/ops-queue.ts` has the sorting, pattern detection, and insight derivation. The queue surface — where Dana or the office team sees flagged items, acts on them, and marks them resolved — is the next build. Without it, the flags accumulate in the database but don't surface to anyone.

**The follow-up close loop is not enforced.** Right now, office can close follow-ups via the existing database update. The new model says office closes them once the full loop is confirmed — but there is no workflow enforcement, no checklist before closure, and no distinction between "tech said they handled their part" and "the whole thing is done." That distinction needs a state machine on the follow-up record (open → tech-handled → office-confirmed → closed).

**Service cadence changes are not surfaced in scheduling.** `deriveAccountServiceInsight` can suggest increasing or decreasing cadence, but there is no pathway from that suggestion to an actual schedule change. The connection between the insight and `lib/schedule.ts` is the next logical step.
