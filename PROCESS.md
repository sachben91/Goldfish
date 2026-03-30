# Goldfish Express — Decision Logic and Business Rationale

## The Core Tension: ETTO

Every operational system faces the Efficiency-Thoroughness Trade-Off (ETTO). You cannot be fully efficient and fully thorough at the same time. Every decision about speed is implicitly a decision about risk, and vice versa.

At Goldfish Express, this tension is structural and cross-functional:

- **Sales** optimises for efficiency — say yes fast, close the order, don't lose the moment. A customer asking about a trigger fish or a same-day delivery wants an answer now. "We'll get back to you tomorrow" ends the sale.
- **Operations** optimises for thoroughness — verify route capacity, check species compatibility, confirm tank maturity. A wrong yes costs time, money, and customer trust.
- **Support** inherits the consequences of every bad yes that made it through.

Neither side is wrong. They are optimising for different failure modes under the same time pressure. The problem is that the cost of a bad decision made by sales is paid by operations and support — not by the person who made it. The ETTO resolution happens silently, in Luis's head or Cam's helpdesk queue, after the damage is done.

The solution is not to make sales more thorough. That slows them down and costs orders. The solution is to **move thoroughness into the system** so that the right answer is as fast as the wrong one. Sales keeps their velocity. Operations keeps their quality. The constraint is encoded, not delegated.

---

## The Customer Context Problem

A core challenge running through all of these rules is that **customer context is always uncertain and always shifting**. The system cannot know with certainty what tank a customer has, what's in it, how long it has been running, or whether the fish they bought six months ago is still alive. Customers have multiple tanks, fish die, hobbies evolve, and order history is an imperfect proxy for current reality.

This has two implications:

**First, hard blocks based on assumed context are often wrong.** A customer buying shrimp who also bought a trigger fish eighteen months ago may have long since sold the predator, upgraded to a species-only system, or set up an entirely separate reef tank. Blocking them without asking is as likely to frustrate a legitimate purchase as prevent a bad one.

**Second, friction gates are not just warnings — they are the mechanism by which context gets updated.** When a rep asks "is the predator still in this tank?", the answer resolves the uncertainty. The friction gate and the acknowledgement together constitute a data collection event. The outcome recorded afterwards (replacement or no replacement) tells the system whether the context the customer provided was accurate. Over time this builds a ground-truth picture that no static database snapshot can provide.

The practical consequence: the system is designed to ask rather than assume. Rules fire based on signals that suggest a concern — not on certainty that a concern exists. The customer or rep resolves the ambiguity. The resolution is recorded. The pattern of resolutions improves the rules.

---

## Two Specific Problems, Two Specific Fixes

### Problem 1: Compatibility — the knowledge is in Priya's head

Species compatibility rules at Goldfish Express are informal. They live in Priya's memory, scattered notes, and old Slack threads. Sales asks operations for permission after the promise is already made — and asks in a way that assumes yes unless someone catches it in time.

The rules themselves are not ambiguous:
- Trigger fish with ornamental shrimp: the shrimp will be eaten. This is not a judgment call.
- Bubble tip anemone into a four-month-old tank: the anemone will not survive. The customer may be confident. It still won't survive.
- Yellow tang in a 40-gallon setup: the fish will be chronically stressed. Tank size minimums exist for welfare reasons, not preference.

**The fix:** encode these rules as friction gates and review holds in `lib/compatibility.ts`. There are no hard blocks. Every concern can be acknowledged and overridden. The system's job is to make the risk visible and legible — not to own the decision.

For species where context determines the answer, the system either routes to a friction gate (customer self-attests with a direct question) or a review hold (livestock team assesses because self-attestation is not reliable). The distinction matters and is covered below.

**Why friction gates, not blocks:** under sales velocity pressure, a warning is dismissed. A friction gate that requires explicit acknowledgement — with a specific question the customer must answer — is harder to dismiss and generates a data record. That record either confirms the decision was right (no replacement) or surfaces that it wasn't (replacement). Over time the pattern of records improves the rule.

### Problem 2: Same-day delivery — the promise is made before the route knows

Same-day delivery stops get added to routes after the van is already loaded. The route drifts. Delivery windows slip. Live livestock arrives late and stressed.

The data shows this is not a marginal effect:

| Condition | Replacement rate |
|-----------|-----------------|
| On-time delivery | 0.0% |
| Late delivery | 54.4% |
| Rush add-on orders | 53.5% |
| Standard orders | 11.4% |

**Every replacement came from a late delivery. Not one on-time delivery resulted in a replacement.**

Rush orders are 4.7× more likely to require a replacement than standard orders. The causal chain is direct: sales promises same-day → stop added after van is loaded → route runs late → replacement required.

South-belt is the worst-performing zone, with a 27% replacement rate — roughly double the average. Critically, this rate does not decrease with fewer stops. It holds at ~27–31% regardless of route load. This is not a capacity problem. It is a structural zone problem amplified by temperature: on warm and high-heat days, south-belt live delivery has a materially higher failure rate.

**The fix:** surface delivery window availability at point of sale. Before a same-day promise is made, the system checks current route load per zone and temperature conditions. If south-belt is warm, same-day is unavailable — the customer is offered the next viable slot instead. No Slack message to Luis, no van repacking, no late delivery.

---

## Friction vs Review: When Each Is Right

The system has three outcomes: pass, friction, review. Choosing between friction and review is a judgment call about what kind of uncertainty is present and who is best placed to resolve it.

**Friction is right when the customer's own knowledge resolves the uncertainty.** The question has a binary answer the customer knows: are these going in the same tank? Is the predator still in your system? Is your tank 180 gallons or larger? The customer answers, the system records it, and the risk is either resolved or surfaced. A well-written friction gate is a data collection event, not a speed bump.

**Review is right when expert judgment is needed to assess a situation the customer cannot reliably evaluate themselves.** A customer with a two-year-old tank may be confident their system is ready for a bubble tip anemone and still be wrong — because they have T5 lighting at insufficient PAR, or a calcium level that drifts, or flow that is direct rather than indirect. These are things Priya knows to ask about. They are not things the customer knows to volunteer.

The practical test: if you turned the review into a friction gate, would the acknowledgement text be a meaningful self-attestation or a legal-style disclaimer the customer clicks through? If it's the former, friction is appropriate. If it's the latter, the review is doing real work.

### How the rules apply this distinction

**Trigger fish (FISH-TRG-001):** The main risks are tank type (needs FOWLR or species-only) and size (180g minimum). These are questions the customer can answer accurately if they know their setup. For collector and hobbyist segments, a structured attestation is enough — confirm tank size, confirm no reef inhabitants, proceed with a note. For beginner segments, the same question may receive a confident but unreliable answer; review is retained.

**Hawkfish (FISH-HWK-001):** Predatory toward small gobies, blennies, dragonets, and shrimp-sized fish. The shrimp incompatibility rule already handles the invertebrate case. What remains is a direct, binary question: do you have small bottom-dwellers in this tank? The customer knows the answer. This was downgraded from review to friction.

**Bubble tip anemone (CORL-ANO-001):** Kept in review. Tank age is handled by the mature tank friction gate, but anemone readiness goes beyond age — lighting, flow, and parameter stability require Priya's assessment. A beginner-segment customer with a new tank is already caught by the mature tank gate before reaching review. The review queue is reserved for non-beginner customers where the tank age passes but the setup may still not be ready.

### Impact of these changes

Before: 547 orders routed to review — **13.2%** of all orders. At that volume, review is operationally unworkable without dedicated capacity; it becomes a bottleneck, not a quality gate.

After: 157 orders routed to review — **3.8%** of all orders. The queue is concentrated on the cases that genuinely require expertise. Hawkfish (126 orders) moved entirely to friction. Trigger fish (163 orders) moved to friction for non-beginner segments — and in practice, no beginner-segment customer has ordered a trigger fish in this dataset, which is expected. BTA beginner-segment orders (125) are already handled by the mature tank friction gate before reaching review.

At 3.8%, the livestock team has a manageable, high-signal queue. The friction gates they replaced are not doing less work — they are doing different work: surfacing uncertainty, collecting context, and building the outcome record that improves the rules over time.

---

## The Revenue Picture: Lost Orders vs Replacement Cost

The common objection to compatibility friction is that it slows orders. This is true in a narrow sense. It is not true when the full cost of a bad order is accounted for.

### Compatibility gates

Of the 690 orders that would be affected by the compatibility rules, 14.4% already resulted in replacements when historically delivered. These were provably bad orders that cost money to fulfil and then cost money again to replace.

The remaining ~85% are orders that delivered without incident. Many of these fall into two categories:

1. **Office accounts ordering fish/coral** — these accounts want stable tanks. The friction gate redirects toward an alternative, not a refusal.
2. **Shrimp-unsafe + shrimp combinations** — many of these occur because the system has no memory of what the customer currently owns. The friction gate resolves this by asking directly. Customers who confirm they have separate systems proceed; customers who hadn't thought about it are protected from a bad outcome.

### Delivery window gates

Rush orders account for significant gross revenue but carry a 53.5% replacement rate. At that rate, roughly half of all rush revenue is offset by replacement cost before any operational overhead is counted. Blocking the worst-case same-day scenarios — heat days on south-belt, routes already at capacity — removes transactions that are effectively break-even or loss-making once replacement cost is included.

Capacity-concern overrides by reps are tracked with a structured checklist (see `lib/delivery-windows.ts`). The checklist answers accumulate alongside outcomes, building a picture of which customer conditions actually predict successful delivery. Over time, this either validates the rep's discretion or reveals that certain override patterns are not producing good outcomes.

---

## What Gets Preserved

The rules are not designed to say no more often. They are designed to make the right answer as fast as the wrong one.

**Sales keeps their velocity.** The compatibility check and delivery window check are instant. For friction gates, the rep gets a talking point and asks one direct question — the answer either resolves the concern or routes to review. For review holds, the customer is told what is happening and why, in language tuned to their segment, and the livestock team has a prioritised queue to work through.

**Operations keeps route integrity.** Luis still owns route changes. The system does not assign routes or override his decisions. It stops the upstream damage — the same-day promise made before the route is consulted — so his routes are not disrupted by stops that were never viable.

**Support load decreases.** Every friction gate that catches a bad order before it ships is a support ticket that never gets created. The delivery window check directly attacks the late-delivery → replacement → frustrated customer pipeline.

**Knowledge accumulates.** Every friction acknowledgement, review decision, sales rep override, and delivery window override is recorded with its outcome. This is the mechanism by which tribal knowledge becomes encoded knowledge. Priya's judgment, made visible through reviewer notes. Rep discretion, made accountable through override outcomes. Customer context, made legible through friction acknowledgements. The system gets smarter with every order that passes through it.

---

## Operator Toggles

All rules are operator-adjustable via `lib/operator-config.ts`. This is intentional.

The rules encode the current best understanding of the business. That understanding will change. A new cold-chain solution might make south-belt heat-safe. A new driver might raise zone capacity. A trusted long-term collector might warrant a manual override that the system cannot model.

Operators can toggle rules at the master level or per-rule level for compatibility, and per-zone for delivery windows. The system does not own the decisions — it carries the encoded knowledge so the operator does not have to carry it in their head on every order.

This is the principle Nora articulated in the workflow review: **heuristics first, AI later, and the operator still owns the call.**

---

## What This Does Not Solve

**The review queue needs a lightweight UI.** The logic for building and sorting the queue is in `lib/review-queue.ts`. The queue sorts by urgency — rush orders and same-day deliveries first, then by earliest delivery date. But without a screen for Priya or the livestock team to act on, the queue is inert. Building that surface is the next natural step.

**Tank context is not yet captured at point of sale.** The compatibility rules that depend on tank age and tank size (`mature_tank_requirement`, `tank_size_minimum`) require knowing the customer's setup. This data is not consistently collected today. Until it is, these rules fire conservatively — unknown age is treated as immature, unknown size is skipped. A lightweight tank profile collected at signup or first order would significantly improve precision, and would allow the BTA review logic to make finer distinctions rather than relying on segment as a proxy for tank maturity.

**The recommendation system is not yet built.** When an order is blocked or friction-gated, the customer should be offered an alternative — a species that is compatible, a delivery window that is viable, a service that addresses the underlying need. The upsell engine in `lib/upsell.ts` has the graph logic to support this. The blocked-order recommendation surface is the next product layer.

**Insight derivation runs on accumulated data that does not yet exist.** The functions in `lib/knowledge-capture.ts` — `deriveRuleInsight`, `deriveDeliveryOverrideInsight`, `deriveSalesRepInsight` — will produce meaningful output once outcomes have been recorded at scale. Until then they return "monitor" for everything. The infrastructure is in place; the data has to accumulate. This is not a gap to fix — it is the system working as designed.
