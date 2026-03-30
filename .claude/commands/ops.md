You are helping the Goldfish Express HQ Operations team update the business rules that drive the technician brief, compatibility checks, delivery windows, upsell recommendations, and pattern alerts.

You have full access to read and edit files in this repo. After making any change, run `npx tsc --noEmit` to confirm there are no TypeScript errors before committing.

The user will describe a change they want to make. Your job is to:
1. Identify which file and rule the change applies to (use the reference below)
2. Read the relevant file before editing
3. Make the change
4. Run the type check
5. Commit with a clear message describing what changed and why
6. Confirm what was changed and what it will do in production

Do not make changes beyond what was asked. Do not refactor surrounding code. Do not add comments unless the logic would otherwise be unclear.

---

## Rule reference

### 1. Turn a compatibility rule on or off
**File:** `lib/operator-config.ts`
**What to edit:** the `rules` block inside `compatibility`
```ts
rules: {
  office_block:            true/false,
  shrimp_incompatibility:  true/false,
  mature_tank_requirement: true/false,
  tank_size_minimum:       true/false,
  manual_review_hold:      true/false,
}
```
Set `enabled: false` to bypass all compatibility checks entirely (e.g. during rollout or to unblock orders while a bug is fixed).

---

### 2. Change delivery zone capacity
**File:** `lib/operator-config.ts`
**What to edit:** `zone_overrides` inside `delivery_windows`
```ts
zone_overrides: {
  "zone-name": { capacity: N },
}
```
Current hardcoded defaults (in `lib/delivery-windows.ts`, `ZONE_CAPACITY`):
downtown=4, north-river=4, south-belt=4, east-clinic=3, west-lake=4, dayton-core=3, louisville-river=3, columbus-outer=3

---

### 3. Change heat blocking for a zone
**File:** `lib/operator-config.ts`
**What to edit:** `zone_overrides` inside `delivery_windows`
```ts
zone_overrides: {
  "zone-name": { heat_block: true/false },
}
```
Only `south-belt` is heat-blocked by default. Heat blocks cannot be overridden at order time — they are structural.

---

### 4. Allow or block weekend delivery
**File:** `lib/operator-config.ts`
**What to edit:** `allow_weekend_delivery: true/false` inside `delivery_windows`

---

### 5. Add or update a new delivery zone
**File:** `lib/delivery-windows.ts`
**What to edit:** `ZONE_CAPACITY` (add the zone name and stop limit) and optionally `HEAT_SENSITIVE_ZONES` (add to the Set if heat-sensitive)
```ts
const ZONE_CAPACITY: Record<string, number> = {
  "new-zone-name": 3,   // add here
  ...
};
```

---

### 6. Update a compatibility friction message or rep talking point
**File:** `lib/compatibility.ts`
**What to edit:** find the concern builder function for the relevant rule, update `customer_message` (shown to customer at checkout) and/or `sales_talking_point` (what the rep says on the phone)

| Rule | Function name |
|------|--------------|
| Predator + shrimp in same cart | `predatorShrimpSameCartConcern` |
| Predator in order history, shrimp added | `predatorInventoryConcern` |
| Shrimp added, predator in history | `shrimpWithInventoryPredatorConcern` |
| Anemone/SPS in immature tank | `maturetankConcern` |
| Tank too small for species | `tankSizeConcern` |
| Trigger fish setup attestation | `triggerFishAttestationConcern` |
| Hawkfish small fish risk | `hawkfishSmallFishConcern` |
| Office account ordering livestock | `officeServiceConcern` |

---

### 7. Update a review hold message (by customer segment)
**File:** `lib/compatibility.ts`
**What to edit:** `REVIEW_MESSAGING` object — three message variants per SKU: `collector`, `hobbyist`, `beginner`
```ts
const REVIEW_MESSAGING: Record<string, SegmentedMessage> = {
  "FISH-TRG-001": {
    collector: "...",
    hobbyist:  "...",
    beginner:  "...",
  },
  ...
}
```

---

### 8. Add a new species to the compatibility review queue
**File:** `lib/compatibility.ts`
Steps:
1. Set `service_dependency: "manual-review"` on the SKU in the Supabase `catalog` table
2. Add a message entry to `REVIEW_MESSAGING` for the new SKU
3. In `checkCompatibility`, inside the `manual_review_hold` block, add a handler for the new SKU (either friction with a custom concern, or review with the standard message)

---

### 9. Add or update an issue-to-SKU upsell mapping
**File:** `lib/upsell.ts`
**What to edit:** `ISSUE_TO_SKU` (issue text → SKU) and `ISSUE_TO_PITCH` (issue text → tech talking point)
```ts
const ISSUE_TO_SKU: Record<string, string> = {
  "exact issue text as logged by tech": "SKU-CODE",
  ...
};
const ISSUE_TO_PITCH: Record<string, string> = {
  "exact issue text as logged by tech": "What the tech says to the customer.",
  ...
};
```
The issue text must match exactly what technicians write in the visit log (case-insensitive, whitespace-trimmed).

---

### 10. Change issue severity classification
**File:** `lib/issues.ts`
**What to edit:** `ISSUE_SEVERITY_MAP` — maps exact issue text to `"critical"`, `"moderate"`, or `"routine"`
```ts
const ISSUE_SEVERITY_MAP: Record<string, IssueSeverity> = {
  "issue text here": "critical",
  ...
};
```
Severity drives the badge colour in the technician brief. Unknown issues default to `"routine"`.

---

### 11. Change pattern detection thresholds
**File:** `lib/ops-queue.ts`
**What to edit:**
```ts
const MIN_OCCURRENCES_FOR_PATTERN = 3;   // raise to reduce noise, lower to catch faster
const PATTERN_LOOKBACK_DAYS = 180;       // how far back to look (default: 6 months)
```

---

### 12. Add or update a pattern action suggestion
**File:** `lib/ops-queue.ts`
**What to edit:** `suggestPatternAction` function — add a new `if (lower.includes("keyword"))` block with the suggested ops action text
```ts
function suggestPatternAction(issue: string, occurrences: number): string {
  const lower = issue.toLowerCase();
  if (lower.includes("your-keyword")) {
    return `Your suggested action for ${occurrences} occurrences.`;
  }
  ...
}
```

---

### 13. Add a new compatibility rule from scratch
**File:** `lib/compatibility.ts`
Steps:
1. Write a concern builder function that returns a `CompatibilityConcern` object with: `code`, `flagged_sku`, `rule`, `summary`, `customer_message`, `sales_talking_point`
2. Add the rule toggle to `CompatibilityConfig` in `lib/operator-config.ts` and set a default in `DEFAULT_OPERATOR_CONFIG`
3. Add a check inside `checkCompatibility` that reads the new toggle and calls your concern builder when the condition is met
4. Add a test case in `lib/compatibility.test.ts`

---

### 14. Add a new delivery window block condition from scratch
**File:** `lib/delivery-windows.ts`
Steps:
1. Add the new check inside `checkDeliveryWindows`, after the existing heat and capacity checks
2. Return a `WindowCheckResult` with `available: false`, a `reason` string, `next_available_date`, and `message`
3. If the condition is configurable, add a toggle to `DeliveryWindowConfig` in `lib/operator-config.ts`
4. Add a test case in `lib/delivery-windows.test.ts`

---

### 15. Add a new pattern action category from scratch
**File:** `lib/ops-queue.ts`
Steps:
1. Add the new keyword match to `suggestPatternAction`
2. If it's a new `OpsItemKind`, add the string literal to the `OpsItemKind` union type in the same file
3. Add a test case in `lib/ops-queue.test.ts`

---

## After every change

```bash
npx tsc --noEmit        # must pass with no errors
npm test                # run if the changed file has a test file
git add <files>
git commit -m "ops: <what changed and why>"
git push                # Vercel redeploys automatically within ~2 minutes
```

Test the change live at `/demo` (compatibility and delivery window engines) or `/insights` → Run now (pattern detection).
