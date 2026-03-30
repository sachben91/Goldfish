import { describe, it, expect } from "vitest";
import { checkCompatibility, TankContext } from "./compatibility";
import type { CatalogItem } from "@/types/database";

const CATALOG: CatalogItem[] = [
  {
    sku: "FISH-TRG-001", product_name: "Bluejaw Trigger Juvenile", category: "fish",
    buyer_type_hint: "advanced-showpiece", tank_size_min_gallons: 180,
    temperature_sensitivity: "medium", compatibility_group: "aggressive-non-reef",
    delivery_sensitivity: "high", service_dependency: "manual-review",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "FISH-HWK-001", product_name: "Flame Hawkfish", category: "fish",
    buyer_type_hint: "showpiece-predator", tank_size_min_gallons: 40,
    temperature_sensitivity: "medium", compatibility_group: "semi-aggressive-predator",
    delivery_sensitivity: "high", service_dependency: "manual-review",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "INVT-SHR-001", product_name: "Cleaner Shrimp", category: "invertebrate",
    buyer_type_hint: "reef-cleanup", tank_size_min_gallons: 20,
    temperature_sensitivity: "medium", compatibility_group: "reef-invert",
    delivery_sensitivity: "high", service_dependency: "low",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "INVT-SNA-001", product_name: "Trochus Snail Pack", category: "invertebrate",
    buyer_type_hint: "cleanup-crew", tank_size_min_gallons: 10,
    temperature_sensitivity: "low", compatibility_group: "cleanup-crew",
    delivery_sensitivity: "medium", service_dependency: "low",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "CORL-ANO-001", product_name: "Bubble Tip Anemone", category: "coral",
    buyer_type_hint: "mature-reef", tank_size_min_gallons: 40,
    temperature_sensitivity: "high", compatibility_group: "anemone",
    delivery_sensitivity: "high", service_dependency: "manual-review",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "FISH-TNG-001", product_name: "Yellow Tang", category: "fish",
    buyer_type_hint: "display-reef", tank_size_min_gallons: 75,
    temperature_sensitivity: "medium", compatibility_group: "reef-safe-herbivore",
    delivery_sensitivity: "high", service_dependency: "medium",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "FISH-CLN-001", product_name: "Ocellaris Clown Pair", category: "fish",
    buyer_type_hint: "beginner-reef", tank_size_min_gallons: 20,
    temperature_sensitivity: "medium", compatibility_group: "reef-safe-community",
    delivery_sensitivity: "medium", service_dependency: "low",
    upsell_relationships: [], created_at: "",
  },
  {
    sku: "FISH-CRD-001", product_name: "Banggai Cardinal Pair", category: "fish",
    buyer_type_hint: "office-stable", tank_size_min_gallons: 30,
    temperature_sensitivity: "low", compatibility_group: "reef-safe-community",
    delivery_sensitivity: "medium", service_dependency: "low",
    upsell_relationships: [], created_at: "",
  },
];

const MATURE_REEF: TankContext = {
  customer_type: "hobbyist", segment_hint: "upgrade-cycle",
  existing_skus: [], tank_size_gallons: 100, tank_age_months: 18,
};

const NEW_TANK: TankContext = {
  customer_type: "hobbyist", segment_hint: "beginner-learning",
  existing_skus: [], tank_size_gallons: 60, tank_age_months: 3,
};

const OFFICE: TankContext = {
  customer_type: "office_service", segment_hint: "stable-contract",
  existing_skus: [], tank_size_gallons: 55, tank_age_months: 24,
};

const LARGE_TANK: TankContext = { ...MATURE_REEF, tank_size_gallons: 200 };

describe("checkCompatibility", () => {

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("passes a safe reef-community fish", () => {
    expect(checkCompatibility(["FISH-CLN-001"], MATURE_REEF, CATALOG).ok).toBe(true);
  });

  it("passes multiple safe items together", () => {
    expect(checkCompatibility(["FISH-CLN-001", "INVT-SNA-001"], MATURE_REEF, CATALOG).ok).toBe(true);
  });

  it("passes reef-safe fish with shrimp", () => {
    expect(checkCompatibility(["FISH-CLN-001", "INVT-SHR-001"], MATURE_REEF, CATALOG).ok).toBe(true);
  });

  it("ignores unknown SKUs without crashing", () => {
    expect(checkCompatibility(["UNKNOWN-999"], MATURE_REEF, CATALOG).ok).toBe(true);
  });

  // ── Rule 1: Office accounts ────────────────────────────────────────────────

  it("friction-gates fish for office accounts", () => {
    const r = checkCompatibility(["FISH-CRD-001"], OFFICE, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("office_livestock_mismatch");
      expect(r.concern.flagged_sku).toBe("FISH-CRD-001");
      expect(r.concern.sales_talking_point).toMatch(/office/i);
    }
  });

  it("friction-gates coral for office accounts", () => {
    const r = checkCompatibility(["CORL-ANO-001"], OFFICE, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") expect(r.concern.code).toBe("office_livestock_mismatch");
  });

  // ── Rule 2 & 3: Shrimp safety ──────────────────────────────────────────────

  it("friction-gates trigger + shrimp in same cart", () => {
    const r = checkCompatibility(["FISH-TRG-001", "INVT-SHR-001"], LARGE_TANK, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("predator_shrimp_same_cart");
      expect(r.concern.customer_message).toMatch(/same tank/i);
      expect(r.concern.sales_talking_point).toMatch(/eat/i);
    }
  });

  it("friction-gates hawkfish + shrimp in same cart", () => {
    const r = checkCompatibility(["FISH-HWK-001", "INVT-SHR-001"], MATURE_REEF, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") expect(r.concern.code).toBe("predator_shrimp_same_cart");
  });

  it("friction-gates shrimp when predator is in existing inventory", () => {
    const ctx: TankContext = { ...MATURE_REEF, existing_skus: ["FISH-TRG-001"] };
    const r = checkCompatibility(["INVT-SHR-001"], ctx, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("shrimp_with_predator_inventory");
      expect(r.concern.sales_talking_point).toMatch(/same tank/i);
    }
  });

  it("friction-gates predator when shrimp are in existing inventory", () => {
    const ctx: TankContext = { ...LARGE_TANK, existing_skus: ["INVT-SHR-001"] };
    const r = checkCompatibility(["FISH-TRG-001"], ctx, CATALOG);
    // Shrimp in inventory, predator in cart → friction via rule 2 predator_inventory path
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") expect(r.concern.rule).toBe("shrimp_incompatibility");
  });

  // ── Rule 4: Mature tank ────────────────────────────────────────────────────

  it("friction-gates mature-tank species for a new tank", () => {
    const r = checkCompatibility(["CORL-ANO-001"], NEW_TANK, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("mature_tank_requirement");
      expect(r.concern.customer_message).toMatch(/running for at least/i);
      expect(r.concern.sales_talking_point).toMatch(/consult/i);
    }
  });

  it("friction-gates mature-tank species when tank age is unknown", () => {
    const r = checkCompatibility(["CORL-ANO-001"], { ...MATURE_REEF, tank_age_months: null }, CATALOG);
    expect(r.ok).toBe("friction");
  });

  // ── Rule 5: Manual review ──────────────────────────────────────────────────

  // Trigger fish: hobbyist/collector → friction attestation; beginner → review
  it("friction-gates trigger fish for hobbyist segment with attestation concern", () => {
    const r = checkCompatibility(["FISH-TRG-001"], LARGE_TANK, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("aggressive_predator_setup");
      expect(r.concern.customer_message).toMatch(/180 gallons/i);
      expect(r.concern.sales_talking_point).toMatch(/FOWLR/i);
    }
  });

  it("routes trigger fish to review for beginner segment", () => {
    const r = checkCompatibility(["FISH-TRG-001"], { ...LARGE_TANK, segment_hint: "beginner-learning" }, CATALOG);
    expect(r.ok).toBe("review");
    if (r.ok === "review") expect(r.customer_message).toMatch(/one business day/i);
  });

  it("friction-gates hawkfish with small-fish risk concern", () => {
    const r = checkCompatibility(["FISH-HWK-001"], MATURE_REEF, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("hawkfish_small_fish_risk");
      expect(r.concern.customer_message).toMatch(/gobies/i);
      expect(r.concern.sales_talking_point).toMatch(/blennies/i);
    }
  });

  it("routes anemone to review in a mature tank", () => {
    expect(checkCompatibility(["CORL-ANO-001"], MATURE_REEF, CATALOG).ok).toBe("review");
  });

  it("review includes customer message", () => {
    const r = checkCompatibility(["CORL-ANO-001"], MATURE_REEF, CATALOG);
    if (r.ok === "review") expect(r.customer_message).toMatch(/one business day/i);
  });

  it("review includes flagged_sku", () => {
    const r = checkCompatibility(["CORL-ANO-001"], MATURE_REEF, CATALOG);
    if (r.ok === "review") expect(r.flagged_sku).toBe("CORL-ANO-001");
  });

  it("collector segment gets expert-to-expert review framing for anemone", () => {
    const r = checkCompatibility(["CORL-ANO-001"], { ...MATURE_REEF, segment_hint: "reef-invert-vip" }, CATALOG);
    if (r.ok === "review") expect(r.customer_message).toMatch(/livestock team will reach out/i);
  });

  it("beginner segment gets protective review framing for anemone", () => {
    const r = checkCompatibility(["CORL-ANO-001"], { ...MATURE_REEF, segment_hint: "beginner-learning" }, CATALOG);
    if (r.ok === "review") expect(r.customer_message).toMatch(/make sure your tank is ready/i);
  });

  it("shrimp friction fires before trigger attestation for trigger in same cart", () => {
    // Shrimp incompatibility rule fires before Rule 5 in all cases
    const r = checkCompatibility(["FISH-TRG-001", "INVT-SHR-001"], LARGE_TANK, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") expect(r.concern.code).toBe("predator_shrimp_same_cart");
  });

  it("anemone in immature tank is friction not review — customer can acknowledge", () => {
    expect(checkCompatibility(["CORL-ANO-001"], NEW_TANK, CATALOG).ok).toBe("friction");
  });

  // ── Rule 6: Tank size ──────────────────────────────────────────────────────

  it("friction-gates yellow tang into a tank under 75 gallons", () => {
    const r = checkCompatibility(["FISH-TNG-001"], { ...MATURE_REEF, tank_size_gallons: 40 }, CATALOG);
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") {
      expect(r.concern.code).toBe("tank_size_minimum");
      expect(r.concern.customer_message).toMatch(/75 gallons/i);
      expect(r.concern.sales_talking_point).toMatch(/75-gallon minimum/i);
    }
  });

  it("passes yellow tang into exactly 75 gallons", () => {
    expect(checkCompatibility(["FISH-TNG-001"], { ...MATURE_REEF, tank_size_gallons: 75 }, CATALOG).ok).toBe(true);
  });

  it("skips tank size check when size is unknown (0)", () => {
    expect(checkCompatibility(["FISH-CLN-001"], { ...MATURE_REEF, tank_size_gallons: 0 }, CATALOG).ok).toBe(true);
  });

  // ── Operator config toggles ────────────────────────────────────────────────

  it("master switch disabled passes everything through", () => {
    const cfg = { enabled: false, rules: { office_block: true, shrimp_incompatibility: true, mature_tank_requirement: true, tank_size_minimum: true, manual_review_hold: true } };
    expect(checkCompatibility(["FISH-TRG-001", "INVT-SHR-001"], MATURE_REEF, CATALOG, cfg).ok).toBe(true);
  });

  it("shrimp_incompatibility off allows trigger + shrimp through to friction attestation (hobbyist)", () => {
    const cfg = { enabled: true, rules: { office_block: true, shrimp_incompatibility: false, mature_tank_requirement: true, tank_size_minimum: true, manual_review_hold: true } };
    const r = checkCompatibility(["FISH-TRG-001", "INVT-SHR-001"], LARGE_TANK, CATALOG, cfg);
    // Shrimp rule is off; trigger fires as friction attestation for hobbyist segment
    expect(r.ok).toBe("friction");
    if (r.ok === "friction") expect(r.concern.code).toBe("aggressive_predator_setup");
  });

  it("shrimp_incompatibility off routes trigger + shrimp to review for beginner", () => {
    const cfg = { enabled: true, rules: { office_block: true, shrimp_incompatibility: false, mature_tank_requirement: true, tank_size_minimum: true, manual_review_hold: true } };
    const r = checkCompatibility(["FISH-TRG-001", "INVT-SHR-001"], { ...LARGE_TANK, segment_hint: "beginner-learning" }, CATALOG, cfg);
    expect(r.ok).toBe("review");
  });

  it("manual_review_hold off passes manual-review species through", () => {
    const cfg = { enabled: true, rules: { office_block: true, shrimp_incompatibility: true, mature_tank_requirement: true, tank_size_minimum: true, manual_review_hold: false } };
    expect(checkCompatibility(["FISH-HWK-001"], LARGE_TANK, CATALOG, cfg).ok).toBe(true);
  });

  it("office_block off allows fish for office accounts", () => {
    const cfg = { enabled: true, rules: { office_block: false, shrimp_incompatibility: true, mature_tank_requirement: true, tank_size_minimum: true, manual_review_hold: true } };
    expect(checkCompatibility(["FISH-CRD-001"], OFFICE, CATALOG, cfg).ok).toBe(true);
  });

  it("tank_size_minimum off allows undersized tank", () => {
    const cfg = { enabled: true, rules: { office_block: true, shrimp_incompatibility: true, mature_tank_requirement: true, tank_size_minimum: false, manual_review_hold: true } };
    expect(checkCompatibility(["FISH-TNG-001"], { ...MATURE_REEF, tank_size_gallons: 40 }, CATALOG, cfg).ok).toBe(true);
  });
});
