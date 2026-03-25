// Issue severity classification.
// Drives visual indicators in the pre-visit brief and will power
// push notifications in a future version.
//
// critical  → top-off reservoir, water clarity — can kill fish within hours
// moderate  → filter sock, sump — degrade water quality over days
// routine   → feeding schedule, staff training — manageable but recurring

import type { IssueSeverity } from "@/types/database";

const ISSUE_SEVERITY_MAP: Record<string, IssueSeverity> = {
  "top-off reservoir running dry":                  "critical",
  "water clarity dipped before evening event":      "critical",
  "display fish looked stressed under event lighting": "critical",
  "staff fed tank twice and water looked cloudy":   "critical",
  "filter sock clogged":                            "moderate",
  "sump evaporation swings":                        "moderate",
  "return pump noise flagged during walkthrough":   "moderate",
  "restaurant manager escalated appearance concerns same day": "moderate",
  "feeding schedule drifted between staff":         "routine",
  "office manager asked for simpler weekly checklist": "routine",
  "building access delayed until front desk opened": "routine",
  "dry goods missing from install kit":             "routine",
  "install partner waiting for handoff details":    "routine",
};

// Returns the severity for a known issue, or "routine" as a safe default.
export function getIssueSeverity(issue: string): IssueSeverity {
  return ISSUE_SEVERITY_MAP[issue.toLowerCase().trim()] ?? "routine";
}

// Tailwind colour classes for each severity level.
export const SEVERITY_STYLES: Record<IssueSeverity, { badge: string; text: string }> = {
  critical: { badge: "bg-red-100 text-red-800 border-red-200",    text: "text-red-700" },
  moderate: { badge: "bg-amber-100 text-amber-800 border-amber-200", text: "text-amber-700" },
  routine:  { badge: "bg-slate-100 text-slate-700 border-slate-200", text: "text-slate-600" },
};
