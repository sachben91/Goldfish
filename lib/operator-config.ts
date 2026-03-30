// Operator configuration for compatibility and delivery rules.
//
// These toggles let HQ adjust rule behaviour without a code change.
// All rules default to enforced. Operators can loosen specific rules
// when they have context the system doesn't — a trusted customer, a
// known-good tank, a route exception, a seasonal adjustment.
//
// In a production system these would be stored in the database and
// editable through an admin UI. Here they are typed and defaulted so
// the functions that consume them are testable and the shape is clear.

export interface CompatibilityConfig {
  // Master switch — set false to pass all orders through without checking.
  // Useful during rollout or if the rules need a temporary pause.
  enabled: boolean;

  // Rule-level toggles
  rules: {
    // Block fish and coral orders for office_service accounts.
    office_block: boolean;

    // Block shrimp-unsafe fish (triggers, hawkfish) when shrimp are present
    // in the cart or existing inventory.
    shrimp_incompatibility: boolean;

    // Block mature-tank species (anemones, SPS) into tanks under 12 months old.
    mature_tank_requirement: boolean;

    // Block orders where tank size is below the species minimum.
    tank_size_minimum: boolean;

    // Route manual-review species to the review queue rather than auto-approving.
    // If set to false, manual-review species are treated as normal orders.
    // This should only be disabled if a dedicated review workflow is not yet live.
    manual_review_hold: boolean;
  };
}

export interface DeliveryWindowConfig {
  // Master switch — set false to skip all window checks and allow any same-day.
  enabled: boolean;

  // Heat sensitivity by zone. Zones in this map with heat_block: true will
  // refuse same-day delivery on warm/high_heat days.
  // Operators can remove a zone from heat blocking if they have a cold-chain
  // solution for it, or add a zone if conditions change.
  zone_overrides: Record<string, {
    heat_block?: boolean;    // overrides the default HEAT_SENSITIVE_ZONES set
    capacity?: number;       // overrides the default ZONE_CAPACITY value
  }>;

  // Allow live deliveries on weekends. Off by default — no livestock runs Sat/Sun.
  allow_weekend_delivery: boolean;
}

export interface OperatorConfig {
  compatibility: CompatibilityConfig;
  delivery_windows: DeliveryWindowConfig;
}

export const DEFAULT_OPERATOR_CONFIG: OperatorConfig = {
  compatibility: {
    enabled: true,
    rules: {
      office_block:            true,
      shrimp_incompatibility:  true,
      mature_tank_requirement: true,
      tank_size_minimum:       true,
      manual_review_hold:      true,
    },
  },
  delivery_windows: {
    enabled: true,
    zone_overrides: {},
    allow_weekend_delivery: false,
  },
};
