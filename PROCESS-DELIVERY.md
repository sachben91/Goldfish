# Goldfish Express — Delivery Windows: Logic and Business Rationale

## The Problem: The Promise Is Made Before the Route Knows

Same-day delivery stops get added to routes after the van is already loaded. The route drifts. Delivery windows slip. Live livestock arrives late and stressed.

The causal chain is direct: sales promises same-day → stop added after van is loaded → route runs late → replacement required.

This is not a marginal effect:

| Condition | Replacement rate |
|-----------|-----------------|
| On-time delivery | 0.0% |
| Late delivery | 54.4% |
| Rush add-on orders | 53.5% |
| Standard orders | 11.4% |

**Every replacement came from a late delivery. Not one on-time delivery resulted in a replacement.**

Rush orders are 4.7× more likely to require a replacement than standard orders.

**The fix:** surface delivery window availability at point of sale, before the promise is made. The system checks current route load per zone and temperature conditions. If a zone is at capacity or heat conditions make delivery unreliable, same-day is unavailable — the customer is offered the next viable slot instead. No Slack message to Luis, no van repacking, no late delivery.

---

## Two Independent Signals

### Signal 1: Temperature (south-belt)

South-belt has a 27% replacement rate — roughly double the average. Critically, this rate does not decrease with fewer stops. It holds at ~27–31% regardless of route load.

This is not a capacity problem. It is a structural zone problem amplified by temperature. On warm and high-heat days, the failure rate spikes further. The south-belt heat block is not operator discretion — it is a hard gate. There is no conversation that changes the physics of a sealed livestock bag in direct sun.

Heat-sensitive zones are defined in `lib/delivery-windows.ts`. Other zones show under 5% heat-related replacement — manageable with cold packs. South-belt is the outlier and is treated as such.

### Signal 2: Route capacity

Each zone has a safe stop limit derived from historical delivery data — the point beyond which adding a same-day stop causes route drift and late arrivals. These limits are conservative by design: average stops plus approximately one buffer stop.

| Zone | Capacity |
|---|---|
| downtown | 4 |
| north-river | 4 |
| south-belt | 4 (heat check fires first) |
| east-clinic | 3 |
| west-lake | 4 |
| dayton-core | 3 |
| louisville-river | 3 |
| columbus-outer | 3 |

When a zone is at capacity, same-day is unavailable for that zone and date. The customer is offered the next available slot.

---

## Rep Discretion on Capacity Blocks

Heat blocks are not overridable. Capacity blocks are.

A sales rep talking to a customer on the phone has context the system doesn't: whether the customer is home all day, has a temperature-controlled area for receipt, has an aerator as backup, or has successfully received same-day before. That context is worth capturing — and it is worth acting on.

The override mechanism requires a rep to work through a checklist with the customer before proceeding:

1. **Can you confirm you'll be available for the full delivery window?** — gating question. If the customer can't commit to availability, the override is not worth making.
2. **Do you have a shaded, cool area to hold the bags if you need a few minutes to set up?** — informative
3. **Do you have an aerator or battery-powered air pump available as backup?** — informative
4. **Is your tank or quarantine system filled and ready to receive immediately?** — informative
5. **Have you done same-day delivery with us before, and did it go smoothly?** — informative

All checklist answers are recorded alongside the override and the eventual outcome. This is not a form for the customer — it is a structured data collection event. Over time, the answers start predicting outcomes.

---

## The Revenue Picture

Rush orders account for $59,683 in gross revenue across the dataset. The breakdown:

| Category | Orders | Gross | Replacement rate | Net (after replacements) |
|---|---|---|---|---|
| Heat block (south-belt + warm/hot) | 9 | $1,682 | 66.7% | ~$561 |
| Capacity-concern (rush add-on after route packed) | 95 | $17,194 | 50.5% | ~$8,507 |
| Viable same-day (unaffected) | 202 | $40,807 | 0% | $40,807 |

The heat block is not a real revenue question. Nine orders, $1,682 gross, 66.7% replacement rate — these are near-certain losses. The net after replacements is approximately $561.

The capacity-concern block is where the meaningful revenue sits. $17,194 gross, 50.5% replacement rate — roughly coin-flip outcomes. Rep override discretion exists specifically for this category: a rep who knows the customer's setup can beat the population average.

The viable same-day category is untouched. $40,807, 0% replacement rate — these orders pass through exactly as before.

---

## How Override Data Improves the System

The checklist answers accumulate in `lib/knowledge-capture.ts` as `DeliveryWindowOverride` records. `deriveDeliveryOverrideInsight` aggregates these by zone and computes per-answer replacement rates.

When a specific answer pattern predicts ≥50% replacement across 5+ overrides, the insight function suggests `add_required_answer` — promoting that informational question to a gating requirement. This is the mechanism by which the checklist tightens over time: not top-down rule changes, but bottom-up signal from what actually predicted outcomes.

Zone-level monitoring runs separately via `DeliveryOutcome` records and `deriveZoneInsight`. Two thresholds:
- ≥15% replacement rate → `flag`: something may be wrong, review the zone
- ≥30% replacement rate → `critical`: intervention required

The zone insight breaks down replacement rate by rush orders and heat conditions separately, so ops knows whether the fix is tightening same-day capacity, enabling a heat block, or investigating route configuration.

---

## What Gets Preserved

**Operations keeps route integrity.** Luis still owns route changes. The system does not assign routes or override his decisions. It stops the upstream damage — the same-day promise made before the route is consulted — so his routes are not disrupted by stops that were never viable.

**Sales keeps their velocity.** The delivery window check is instant. The rep gets an answer in the same call, not the next day. When same-day is unavailable, the customer is offered the next slot immediately — the conversation stays open.

**Rep discretion is preserved for capacity blocks.** Where the system cannot distinguish a good override from a bad one, the rep can. The checklist captures their assessment. The outcome records their track record.

---

## Operator Toggles

All delivery window rules are operator-adjustable via `lib/operator-config.ts`:

- **Master switch** — disables all window checks (e.g. during a system migration)
- **Per-zone heat block** — can be disabled if a zone gets a cold-chain upgrade, or enabled for a new zone showing temperature-related losses
- **Per-zone capacity** — can be raised or lowered as route staffing changes
- **Weekend delivery** — disabled by default; can be enabled per operator preference

The system encodes the current best understanding of zone performance. That understanding will change. The toggles ensure no code deploy is required to adapt to new operational reality.

---

## What This Does Not Solve

**Rep override discretion has no UI.** The checklist exists in `lib/delivery-windows.ts` and the override record type exists in `lib/knowledge-capture.ts`. The interface through which a rep actually works through the checklist and records the override has not been built. Until it is, overrides have no structured capture path.

**`deriveDeliveryOverrideInsight` runs on data that does not yet exist.** The checklist answer correlations will only become meaningful once overrides have been recorded at scale. The infrastructure is in place; the data has to accumulate.

**Zone capacities are derived from historical averages, not real-time route state.** The current model uses a fixed stop limit per zone. A more precise version would integrate with Luis's actual route state — stops already confirmed, driver location, time remaining — and compute a dynamic capacity rather than a static limit. That requires a route management integration that does not exist today.
