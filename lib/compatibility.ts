// Compatibility check engine.
//
// Determines whether a set of SKUs can be safely ordered together given
// a customer's existing inventory and tank context.
//
// Returns one of three outcomes:
//   ok: true      — safe to proceed
//   ok: "friction" — concern flagged; customer must explicitly acknowledge before
//                    proceeding. The concern includes a customer-facing message (web)
//                    and a sales talking point (phone/email/concierge). Both the
//                    concern and any override are recorded so outcomes can be tracked
//                    and rules refined over time.
//   ok: "review"  — held for livestock team review before fulfillment; customer is
//                    informed why and what happens next; reviewer decision is recorded.
//
// There are no hard blocks. Every concern can be acknowledged and overridden.
// The system's job is to make the risk visible and legible — not to own the decision.

import type { CatalogItem, CustomerType } from "@/types/database";
import { type CompatibilityConfig, DEFAULT_OPERATOR_CONFIG } from "./operator-config";

const SHRIMP_UNSAFE_GROUPS = new Set([
  "aggressive-non-reef",
  "semi-aggressive-predator",
]);

const SHRIMP_GROUPS = new Set([
  "reef-invert",
  "cleanup-crew",
]);

const MATURE_TANK_BUYER_HINTS = new Set([
  "mature-reef",
  "collector-reef",
  "sps-step-up",
  "advanced-showpiece",
]);

const MATURE_TANK_MIN_MONTHS = 12;

export interface TankContext {
  customer_type: CustomerType;
  segment_hint: string | null;
  existing_skus: string[];
  tank_size_gallons: number;
  tank_age_months: number | null;
}

// A structured concern — machine-readable code for tracking, plus two human-readable
// surfaces: one for web customers, one for sales reps handling the order by phone/email.
export interface CompatibilityConcern {
  code: string;                 // e.g. "predator_shrimp_same_cart", "tank_size_minimum"
  flagged_sku: string;
  rule: string;                 // which rule fired — used for knowledge-capture grouping
  summary: string;              // one-line internal description
  customer_message: string;     // shown to the customer on web checkout
  sales_talking_point: string;  // what a rep says to the customer on phone/email/concierge
}

export type CompatibilityResult =
  | { ok: true }
  | { ok: "friction"; concern: CompatibilityConcern }
  | { ok: "review"; flagged_sku: string; rule: string; customer_message: string };

// ─── Segment helpers ──────────────────────────────────────────────────────────

const COLLECTOR_SEGMENTS = new Set([
  "reef-vip", "reef-invert-vip", "rare-coral",
  "mixed-reef-stable", "sps-step-up", "showpiece-hunter",
]);

const BEGINNER_SEGMENTS = new Set([
  "beginner-learning", "aspirational-new-reef",
  "freshwater-convert", "cleanup-crew-repeat",
]);

function segmentTier(segment_hint: string | null): "collector" | "hobbyist" | "beginner" {
  if (segment_hint && COLLECTOR_SEGMENTS.has(segment_hint)) return "collector";
  if (segment_hint && BEGINNER_SEGMENTS.has(segment_hint)) return "beginner";
  return "hobbyist";
}

// ─── Review messaging ─────────────────────────────────────────────────────────

type SegmentedMessage = { collector: string; hobbyist: string; beginner: string };

const REVIEW_MESSAGING: Record<string, SegmentedMessage> = {
  "FISH-TRG-001": {
    collector: "Our livestock team wants a quick conversation about your current setup before we ship — triggers can be interesting in mixed systems and we'd rather get it right. We'll reach out within one business day.",
    hobbyist:  "A few quick questions from our team before we confirm — triggers need the right environment to thrive. We'll be in touch within one business day.",
    beginner:  "Trigger fish can be aggressive toward other tank residents. Our team will check your setup before we ship. We'll get back to you within one business day.",
  },
  "FISH-HWK-001": {
    collector: "Our livestock team will reach out to confirm compatibility with your invertebrates — hawkfish keep things interesting but the details matter. Expect a response within one business day.",
    hobbyist:  "Quick check from our team on your current tank inhabitants before we confirm. We'll be in touch within one business day.",
    beginner:  "Hawkfish are predatory toward small invertebrates like shrimp. Our team will review what's already in your tank before we ship. We'll get back to you within one business day.",
  },
  "CORL-ANO-001": {
    collector: "Our livestock team will reach out to confirm flow, lighting, and system maturity — bubble tips are worth getting right. We'll be in touch within one business day.",
    hobbyist:  "Bubble tip anemones need a stable system to settle in. A quick check from our team before we ship. We'll confirm within one business day.",
    beginner:  "Anemones need specific conditions to survive long-term. Our team will make sure your tank is ready before we ship — this protects your investment as much as the animal. We'll be in touch within one business day.",
  },
};

function getReviewMessage(sku: string, segment_hint: string | null): string {
  const tier = segmentTier(segment_hint);
  return REVIEW_MESSAGING[sku]?.[tier]
    ?? "This item needs a quick review from our livestock team before we confirm. We'll be in touch within one business day.";
}

// ─── Friction concern builders ────────────────────────────────────────────────
//
// Each concern has a customer_message (web) and a sales_talking_point (phone/email).
// The talking point is slightly more direct — the rep can have a real conversation,
// ask clarifying questions, and make a judgment call with context the web form can't get.

function predatorShrimpSameCartConcern(predatorName: string, sku: string): CompatibilityConcern {
  return {
    code: "predator_shrimp_same_cart",
    flagged_sku: sku,
    rule: "shrimp_incompatibility",
    summary: `${predatorName} ordered in same cart as ornamental shrimp`,
    customer_message: `${predatorName} is known to predate ornamental shrimp. Both items are in your cart — if you intend to keep them in the same tank, the shrimp are unlikely to survive. Please confirm you have separate systems before proceeding.`,
    sales_talking_point: `${predatorName} will eat ornamental shrimp in the same tank — it's not a maybe. Ask the customer whether these are going into separate systems. If yes, fine to proceed. If the same tank, explain the shrimp won't last and offer an alternative cleanup crew like snails or emerald crabs.`,
  };
}

function predatorInventoryConcern(predatorName: string, sku: string): CompatibilityConcern {
  return {
    code: "predator_in_inventory",
    flagged_sku: sku,
    rule: "shrimp_incompatibility",
    summary: `${predatorName} in recent orders; shrimp being added`,
    customer_message: `You have ${predatorName} in your recent orders. If it's in the same tank, ornamental shrimp are unlikely to survive. Please confirm this order is for a separate system or that the predator is no longer in your setup.`,
    sales_talking_point: `Customer has ${predatorName} in their order history. Ask directly: is the predator still in their tank? If yes, shrimp won't last — offer snails or emerald crab instead. If the predator is gone or in a different tank, fine to proceed, and note it on the order.`,
  };
}

function shrimpWithInventoryPredatorConcern(shrimpName: string, sku: string): CompatibilityConcern {
  return {
    code: "shrimp_with_predator_inventory",
    flagged_sku: sku,
    rule: "shrimp_incompatibility",
    summary: `Shrimp being added; predatory fish in recent orders`,
    customer_message: `You have a predatory fish in your recent orders that may not be compatible with ${shrimpName}. Please confirm this is going into a separate tank, or that the predator is no longer in your system.`,
    sales_talking_point: `Customer has a predatory fish in their order history and is adding shrimp. Ask whether they're going in the same tank. If so, the shrimp are at risk — talk through whether a snail pack would do the same job more safely. If separate tanks, proceed and note it.`,
  };
}

function maturetankConcern(productName: string, sku: string, age: number | null): CompatibilityConcern {
  const ageNote = age === null
    ? "We don't have your tank age on file."
    : `Your tank appears to be around ${age} months old.`;
  return {
    code: "mature_tank_requirement",
    flagged_sku: sku,
    rule: "mature_tank_requirement",
    summary: `${productName} recommended for tanks ${MATURE_TANK_MIN_MONTHS}+ months established`,
    customer_message: `${productName} does best in a tank that has been running for at least ${MATURE_TANK_MIN_MONTHS} months. ${ageNote} If your system is stable and established, confirm before proceeding — or consider a Remote Compatibility Consult (SERV-CNS-001) if you're unsure.`,
    sales_talking_point: `${productName} needs a stable, established system — ideally 12+ months. Ask the customer how long their tank has been running and whether parameters are stable. If they're confident and experienced, fine to proceed with a note. If they're newer, suggest a consult first (SERV-CNS-001) — it's a selling opportunity and protects the animal.`,
  };
}

function tankSizeConcern(productName: string, sku: string, minGallons: number, actualGallons: number): CompatibilityConcern {
  return {
    code: "tank_size_minimum",
    flagged_sku: sku,
    rule: "tank_size_minimum",
    summary: `${productName} needs ${minGallons}g minimum; tank is ${actualGallons}g`,
    customer_message: `${productName} needs at least ${minGallons} gallons to thrive long-term. Your tank appears to be ${actualGallons} gallons. If you have a larger system in mind, please confirm the tank size before proceeding.`,
    sales_talking_point: `${productName} has a ${minGallons}-gallon minimum. We have ${actualGallons}g on file for this customer. Ask directly — are they buying for a different, larger tank? If yes, update the record and proceed. If no, this fish will be chronically stressed and the customer will likely be unhappy. Suggest species that fit their current setup.`,
  };
}

function triggerFishAttestationConcern(sku: string): CompatibilityConcern {
  return {
    code: "aggressive_predator_setup",
    flagged_sku: sku,
    rule: "manual_review",
    summary: "Trigger fish requires species-appropriate setup confirmation",
    customer_message: "Trigger fish are aggressive predators that cannot be kept in reef tanks or with most invertebrates. Before proceeding, please confirm: (1) your tank is 180 gallons or larger, (2) it is a fish-only or FOWLR setup — no coral or ornamental invertebrates, and (3) you understand this fish will not tolerate most tankmates it can outcompete.",
    sales_talking_point: "Ask directly: how big is the tank, is it reef or FOWLR, and what's currently in it? Triggers need 180g+ and cannot go into reef systems — they'll eat invertebrates and harass most other fish. If the setup checks out, proceed and note it. If the customer isn't sure what FOWLR means or hasn't thought through tankmates, route to review instead.",
  };
}

function hawkfishSmallFishConcern(productName: string, sku: string): CompatibilityConcern {
  return {
    code: "hawkfish_small_fish_risk",
    flagged_sku: sku,
    rule: "manual_review",
    summary: `${productName} predatory toward small gobies, blennies, and dragonets`,
    customer_message: `${productName} are predatory toward small gobies, blennies, dragonets, and other shrimp-sized fish. If any of these are in your tank, they are at risk. Please confirm you have checked your current inhabitants before proceeding.`,
    sales_talking_point: `Ask the customer: do you have small gobies, blennies, dragonets, or pistol shrimp in this tank? If yes, the hawkfish will likely predate them — discuss whether that's acceptable or offer an alternative. If the tank is clear of small bottom-dwellers, fine to proceed with a note on the order.`,
  };
}

function officeServiceConcern(productName: string, sku: string): CompatibilityConcern {
  return {
    code: "office_livestock_mismatch",
    flagged_sku: sku,
    rule: "office_block",
    summary: `${productName} ordered for an office display account`,
    customer_message: `Office display accounts are set up for stable, low-maintenance tanks. ${productName} is a live animal that requires specific care conditions. Please confirm this is intended for a personal system, or speak with our team about the right livestock for your display account.`,
    sales_talking_point: `This is an office/display account — they're paying for stability and aesthetics, not hobbyist livestock. Ask why they want this specific animal. Often it's impulse or a staff request. Redirect toward hardier species that suit a display tank: Banggai cardinals, watchman gobies, trochus snails. If they genuinely want live coral or a specific fish for a personal tank, that's a different conversation.`,
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export function checkCompatibility(
  cartSkus: string[],
  context: TankContext,
  catalogItems: CatalogItem[],
  config: CompatibilityConfig = DEFAULT_OPERATOR_CONFIG.compatibility
): CompatibilityResult {
  if (!config.enabled) return { ok: true };

  const catalogBySku = new Map(catalogItems.map((item) => [item.sku, item]));

  const cartItems = cartSkus
    .map((sku) => catalogBySku.get(sku))
    .filter((item): item is CatalogItem => item !== undefined);

  for (const item of cartItems) {
    // ── Rule 1: Office accounts ordering fish or coral ────────────────────
    if (
      config.rules.office_block &&
      context.customer_type === "office_service" &&
      (item.category === "fish" || item.category === "coral")
    ) {
      return { ok: "friction", concern: officeServiceConcern(item.product_name, item.sku) };
    }

    // ── Rule 2: Shrimp-unsafe fish — same cart or existing inventory ───────
    if (
      config.rules.shrimp_incompatibility &&
      item.compatibility_group &&
      SHRIMP_UNSAFE_GROUPS.has(item.compatibility_group)
    ) {
      const shrimpInCart = cartItems.some(
        (o) => o.sku !== item.sku && o.compatibility_group && SHRIMP_GROUPS.has(o.compatibility_group)
      );
      const shrimpInInventory = context.existing_skus.some((sku) => {
        const c = catalogBySku.get(sku);
        return c?.compatibility_group ? SHRIMP_GROUPS.has(c.compatibility_group) : false;
      });
      if (shrimpInCart) {
        return { ok: "friction", concern: predatorShrimpSameCartConcern(item.product_name, item.sku) };
      }
      if (shrimpInInventory) {
        return { ok: "friction", concern: predatorInventoryConcern(item.product_name, item.sku) };
      }
    }

    // ── Rule 3: Shrimp added when predatory fish is in inventory ───────────
    if (
      config.rules.shrimp_incompatibility &&
      item.compatibility_group &&
      SHRIMP_GROUPS.has(item.compatibility_group)
    ) {
      const predatorInCart = cartItems.some(
        (o) => o.sku !== item.sku && o.compatibility_group && SHRIMP_UNSAFE_GROUPS.has(o.compatibility_group)
      );
      const predatorInInventory = context.existing_skus.some((sku) => {
        const c = catalogBySku.get(sku);
        return c?.compatibility_group ? SHRIMP_UNSAFE_GROUPS.has(c.compatibility_group) : false;
      });
      if (predatorInCart) {
        return { ok: "friction", concern: shrimpWithInventoryPredatorConcern(item.product_name, item.sku) };
      }
      if (predatorInInventory) {
        return { ok: "friction", concern: shrimpWithInventoryPredatorConcern(item.product_name, item.sku) };
      }
    }

    // ── Rule 4: Mature-tank species ───────────────────────────────────────
    if (
      config.rules.mature_tank_requirement &&
      item.buyer_type_hint &&
      MATURE_TANK_BUYER_HINTS.has(item.buyer_type_hint)
    ) {
      const age = context.tank_age_months;
      if (age === null || age < MATURE_TANK_MIN_MONTHS) {
        return { ok: "friction", concern: maturetankConcern(item.product_name, item.sku, age) };
      }
    }

    // ── Rule 5: Manual-review species ────────────────────────────────────
    if (config.rules.manual_review_hold && item.service_dependency === "manual-review") {
      // Trigger fish: beginner segments go to review (they may not know what FOWLR means
      // or how to assess tankmate compatibility); collector/hobbyist can self-attest.
      if (item.sku === "FISH-TRG-001") {
        if (segmentTier(context.segment_hint) === "beginner") {
          return {
            ok: "review",
            flagged_sku: item.sku,
            rule: "manual_review",
            customer_message: getReviewMessage(item.sku, context.segment_hint),
          };
        }
        return { ok: "friction", concern: triggerFishAttestationConcern(item.sku) };
      }

      // Hawkfish: downgraded from review to friction. The shrimp incompatibility rule
      // already handles the invertebrate case; the remaining risk (small gobies/blennies)
      // is customer-answerable with a direct question.
      if (item.sku === "FISH-HWK-001") {
        return { ok: "friction", concern: hawkfishSmallFishConcern(item.product_name, item.sku) };
      }

      // All other manual-review species (e.g. BTA) go to review —
      // their risk assessment requires expertise the customer cannot reliably self-attest.
      return {
        ok: "review",
        flagged_sku: item.sku,
        rule: "manual_review",
        customer_message: getReviewMessage(item.sku, context.segment_hint),
      };
    }

    // ── Rule 6: Tank size minimum ─────────────────────────────────────────
    if (
      config.rules.tank_size_minimum &&
      item.tank_size_min_gallons > 0 &&
      context.tank_size_gallons > 0 &&
      context.tank_size_gallons < item.tank_size_min_gallons
    ) {
      return { ok: "friction", concern: tankSizeConcern(item.product_name, item.sku, item.tank_size_min_gallons, context.tank_size_gallons) };
    }
  }

  return { ok: true };
}
