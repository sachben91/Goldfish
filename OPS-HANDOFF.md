# Ops handoff — rules you own and how to change them

This document is for the operations team. It covers every rule in the system that encodes a business decision, where it lives, what it does, and how to change it.

**You do not need a developer to make any of these changes.** All of them can be done with Claude Code — open it in the project directory, describe the change you want using the language in this document (file name, rule name, what to change), and it will make the edit. The only thing you need is access to push to the GitHub repo, which triggers an automatic redeploy on Vercel within ~2 minutes.

Example prompts that work:
- *"In `lib/upsell.ts`, add a new issue-to-SKU mapping: 'skimmer overflowing' → 'EQUIP-SKM-002', with talking point: 'A correctly sized skimmer won't overflow between visits — worth looking at an upgrade.'"*
- *"In `lib/ops-queue.ts`, change `MIN_OCCURRENCES_FOR_PATTERN` from 3 to 4."*
- *"In `lib/compatibility.ts`, in `triggerFishAttestationConcern`, update `customer_message` to say: [new text]."*

The constraint is not technical access — it's knowing which file and rule to point Claude at. That's what this document is for.

---

## What this system does not decide for you

Every rule in this system can be overridden. The system's job is to make the risk visible — not to own the decision. A friction flag at checkout means "a rep needs to talk to this customer," not "the order is blocked." A review hold means "the livestock team should look at this before we ship," not "this customer can't order this SKU."

If a rule is firing incorrectly, that's a signal to change the rule — not to work around it.

---

## 1. Compatibility rules — what triggers friction or review at checkout

**File:** `lib/operator-config.ts`
**Who owns it:** Ops + livestock team
**How to change:** Edit the file, commit, deploy. No database change needed.

### Turning a rule on or off

```ts
rules: {
  office_block:            true,   // office accounts ordering fish/coral
  shrimp_incompatibility:  true,   // predatory fish + shrimp in same order
  mature_tank_requirement: true,   // anemones/SPS into tanks under 12 months
  tank_size_minimum:       true,   // species minimums vs tank size on record
  manual_review_hold:      true,   // triggers, hawkfish, BTA → review queue
}
```

Set any rule to `false` to disable it entirely. For example, if your team decides to stop enforcing tank size minimums while you audit the customer records, set `tank_size_minimum: false`.

### Turning off all compatibility checks temporarily

```ts
compatibility: {
  enabled: false,   // pass all orders through without checking
  ...
}
```

Use this during rollout or if a bug is causing false positives and you need to unblock orders while it's fixed.

---

## 2. Delivery window rules — what blocks same-day delivery

**File:** `lib/operator-config.ts`
**Who owns it:** Ops + route manager
**How to change:** Edit the file, commit, deploy.

### Changing zone capacity

Each zone has a maximum number of same-day stops before route reliability degrades. Current defaults:

| Zone | Capacity |
|------|----------|
| downtown | 4 |
| north-river | 4 |
| south-belt | 4 |
| east-clinic | 3 |
| west-lake | 4 |
| dayton-core | 3 |
| louisville-river | 3 |
| columbus-outer | 3 |

To change a zone's capacity, add it to `zone_overrides`:

```ts
delivery_windows: {
  zone_overrides: {
    "downtown": { capacity: 5 },        // hired a second driver
    "east-clinic": { capacity: 2 },     // route is slower in winter
  }
}
```

### Changing heat blocking by zone

South-belt is the only zone currently blocked on warm/high-heat days. To add or remove zones:

```ts
zone_overrides: {
  "north-river": { heat_block: true },    // new zone showing heat losses
  "south-belt":  { heat_block: false },   // cold-chain upgrade installed
}
```

Heat blocks are not overridable at order time — they are structural. If you lift a heat block, you own the replacement cost on any heat-related losses.

### Allowing weekend delivery

```ts
allow_weekend_delivery: true
```

Off by default. Turning this on means the "next available date" calculation will include Saturdays and Sundays.

---

## 3. Compatibility friction messages and talking points

**File:** `lib/compatibility.ts`
**Who owns it:** Livestock team + sales reps
**How to change:** Requires a developer, but the change is low-risk (text only).

Each friction concern has two messages:
- `customer_message` — shown to the customer on the web checkout
- `sales_talking_point` — what the rep says on the phone or email

These are the current messages and where to find them:

| Rule | Function | Line |
|------|----------|------|
| Predator + shrimp in same cart | `predatorShrimpSameCartConcern` | ~118 |
| Predator in order history, shrimp added | `predatorInventoryConcern` | ~128 |
| Shrimp added, predator in history | `shrimpWithInventoryPredatorConcern` | ~139 |
| Anemone/SPS in immature tank | `maturetankConcern` | ~150 |
| Tank too small for species | `tankSizeConcern` | ~164 |
| Trigger fish setup attestation | `triggerFishAttestationConcern` | ~175 |
| Hawkfish small fish risk | `hawkfishSmallFishConcern` | ~186 |
| Office account ordering livestock | `officeServiceConcern` | ~197 |

To update a message, tell a developer: "In `lib/compatibility.ts`, in `[function name]`, update `customer_message` to say: [new text]."

### Review hold messages (by customer segment)

Species that go to the livestock review queue have three versions of their customer message — one for collectors, one for regular hobbyists, one for beginners:

**File:** `lib/compatibility.ts`, `REVIEW_MESSAGING` object (~line 87)

Current species with segmented review messages: `FISH-TRG-001` (trigger), `FISH-HWK-001` (hawkfish), `CORL-ANO-001` (bubble tip anemone).

To add a new species to the review queue, a developer needs to:
1. Set `service_dependency: "manual-review"` on the SKU in the catalog
2. Add a message entry to `REVIEW_MESSAGING` for that SKU
3. Add handling in the main `checkCompatibility` function

---

## 4. Upsell recommendations — what the tech is prompted to mention

**File:** `lib/upsell.ts`
**Who owns it:** Ops + sales
**How to change:** Requires a developer. The tables are simple key-value maps — easy to edit.

### Issue-to-SKU mapping

When a customer has a recurring issue, the engine recommends the SKU that would fix it. Current mappings:

| Recurring issue | Recommended SKU |
|----------------|----------------|
| top-off reservoir running dry | EQUIP-ATO-001 |
| sump evaporation swings | EQUIP-ATO-001 |
| filter sock clogged | SERV-MNT-001 |
| feeding schedule drifted between staff | SERV-CNS-001 |
| office manager asked for simpler weekly checklist | SERV-CNS-001 |
| water clarity dipped before evening event | SERV-MNT-002 |
| display fish looked stressed under event lighting | SERV-EMR-001 |
| staff fed tank twice and water looked cloudy | SERV-CNS-001 |

The issue text must match exactly what technicians write in the visit log. If techs are logging "top off ran dry" but the map expects "top-off reservoir running dry," the recommendation won't fire. Check the actual log text if a mapping isn't working.

To add a mapping, tell a developer: "In `lib/upsell.ts`, add to `ISSUE_TO_SKU`: `"[exact issue text]": "[SKU]"` and to `ISSUE_TO_PITCH`: `"[same issue text]": "[talking point for tech]"`."

### Max recommendations

Currently capped at 3 per visit (`MAX_RECOMMENDATIONS = 3`). Change this if you want more or fewer.

---

## 5. Pattern detection thresholds — what triggers an insight alert

**File:** `lib/ops-queue.ts`
**Who owns it:** Ops
**How to change:** Requires a developer. Two numbers to know:

```ts
const MIN_OCCURRENCES_FOR_PATTERN = 3;   // how many times before it's flagged
const PATTERN_LOOKBACK_DAYS = 180;       // how far back to look (6 months)
```

If you're getting too many alerts (noise), raise `MIN_OCCURRENCES_FOR_PATTERN` to 4 or 5.
If you want to catch faster-moving problems, reduce `PATTERN_LOOKBACK_DAYS` to 90.

### Pattern action suggestions

When a pattern fires, the system suggests an ops action. Current logic maps issue text to a suggested action:

| Issue contains | Suggested action |
|----------------|-----------------|
| "top-off" or "evaporation" | Quote an ATO unit |
| "filter sock" or "sump" | Increase service frequency or leave spare on site |
| "feeding" or "staff" | Arrange a staff training session |
| "access" or "front desk" | Update access notes, confirm direct contact |
| "appearance", "event", "water clarity" | Review service cadence vs event schedule |
| (anything else) | Review with account manager |

These are in `suggestPatternAction()` in `lib/ops-queue.ts`. To add or change a suggestion, tell a developer which keyword and what the new suggested action text should be.

---

## 6. Issue severity classification — what shows as critical vs routine in the brief

**File:** `lib/issues.ts`
**Who owns it:** Livestock team
**How to change:** Requires a developer.

Issues from past visits are classified into three tiers when displayed in the technician brief:

- **Critical** (red) — can harm livestock within hours
- **Moderate** (amber) — degrades conditions over days
- **Routine** (grey) — manageable, but worth noting

Unknown issues default to routine. If a common issue is being misclassified, tell a developer: "In `lib/issues.ts`, add `[issue text]` to the `[critical/moderate/routine]` list."

---

## 7. Adding a new zone to delivery routing

New zones are not in the config — they're in the code. To add a zone:

1. Add it to `ZONE_CAPACITY` in `lib/delivery-windows.ts` with a capacity number
2. If it's heat-sensitive, add it to `HEAT_SENSITIVE_ZONES` in the same file
3. Optionally add it to `zone_overrides` in `operator-config.ts` to override defaults

Tell a developer all three pieces: zone name (must match what's passed in the API call), capacity, and whether it's heat-sensitive.

---

## How to deploy a change

1. Open Claude Code in the project directory
2. Describe the change using the file and rule names in this document
3. Claude Code makes the edit — review the diff before confirming
4. Commit and push to GitHub (`main` branch) — Claude Code can do this too
5. Vercel auto-deploys within ~2 minutes
6. Test at [goldfish-express.vercel.app/demo](https://goldfish-express.vercel.app/demo) — the demo page runs the compatibility and delivery window engines live without placing a real order

For urgent changes (a rule is firing incorrectly and blocking real orders), the full cycle from "open Claude Code" to live fix is under 10 minutes.

---

## What's not in this document

These things are owned by the database, not the code — change them directly in Supabase:

- **Customer tank sizes and ages** — `customers` table, `tank_size_gallons` and `tank_age_months` columns
- **Customer type** (`hobbyist`, `office_service`, `collector`, `wholesale`) — `customers` table, `customer_type` column
- **Customer segment** (e.g. `reef-vip`, `beginner-learning`) — `customers` table, `segment` column
- **Catalog SKU attributes** (compatibility group, tank size minimum, buyer type hint) — `catalog` table
- **Which SKUs upsell to which** — `catalog` table, `upsell_relationships` column (JSON array of SKUs)
- **Visit schedule** — `visit_schedule` table
- **Open followups** — mark resolved in the app, or update `followup_resolved = true` directly in `service_visits`
