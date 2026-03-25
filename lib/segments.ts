// Segment display labels.
// The raw segment_hint values from the CSV are database identifiers.
// We never show raw database values in the UI — this map converts them
// to the human-readable labels a technician would understand.

const SEGMENT_LABELS: Record<string, string> = {
  "reef-vip":                "Reef VIP",
  "rare-coral":              "Rare Coral Collector",
  "aspirational-new-reef":   "New Reef",
  "high-spend-high-support": "High Value / High Support",
  "stable-contract":         "Stable Contract",
  "strict-window":           "Strict Access Window",
  "event-sensitive":         "Event Sensitive",
  "margin-sensitive":        "Margin Sensitive",
  "install-partner":         "Install Partner",
  "reef-invert-vip":         "Reef & Invert VIP",
  "beginner-learning":       "Beginner",
  "biweekly-contract":       "Biweekly Contract",
  "showpiece-hunter":        "Showpiece Hunter",
  "mixed-reef-stable":       "Mixed Reef",
  "sps-step-up":             "SPS Step-Up",
  "upgrade-cycle":           "Upgrade Cycle",
  "freshwater-convert":      "Freshwater Convert",
  "cleanup-crew-repeat":     "Cleanup Crew Regular",
  "hospitality-display":     "Hospitality Display",
  "property-manager":        "Property Manager",
  "service-pass-through":    "Service Pass-Through",
  "livestock-reseller":      "Livestock Reseller",
  "dry-goods-bulk":          "Dry Goods Bulk Buyer",
};

// Returns a display label for a segment hint.
// Falls back to title-casing the raw value if we haven't mapped it yet.
export function getSegmentLabel(segmentHint: string | null): string {
  if (!segmentHint) return "—";
  return SEGMENT_LABELS[segmentHint] ?? toTitleCase(segmentHint.replace(/-/g, " "));
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
