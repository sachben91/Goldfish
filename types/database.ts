// Goldfish Express — TypeScript types for every database table and view.
// These mirror the schema exactly so TypeScript catches mismatches at compile time.

export type CustomerType = "hobbyist" | "collector" | "office_service" | "wholesale";
export type ServiceType = "monthly_maintenance" | "biweekly_maintenance" | "emergency_rescue";
export type VisitStatus = "scheduled" | "completed" | "cancelled";
export type IssueSeverity = "critical" | "moderate" | "routine";
export type Category = "fish" | "coral" | "invertebrate" | "equipment" | "service" | "bundle";
export type ResolutionStatus = "fully_resolved" | "partially_handled" | "could_not_fix";
export type NextStepOwner = "field" | "office" | "customer";

// ─── Tables ───────────────────────────────────────

export interface CatalogItem {
  sku: string;
  product_name: string;
  category: Category;
  buyer_type_hint: string | null;
  tank_size_min_gallons: number;
  temperature_sensitivity: "low" | "medium" | "high" | null;
  compatibility_group: string | null;
  delivery_sensitivity: "low" | "medium" | "high" | null;
  service_dependency: string | null;
  upsell_relationships: string[];  // array of SKUs
  created_at: string;
}

export interface Customer {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_type: CustomerType;
  segment_hint: string | null;
  city: string | null;
  postal_code: string | null;
  signup_date: string | null;
  preferred_contact_channel: string | null;
  access_notes: string | null;
  notes: string | null;
  created_at: string;
}

export interface Technician {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  auth_user_id: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_id: string;
  order_date: string;
  customer_id: string;
  sku: string;
  quantity: number;
  unit_price: number | null;
  total_order_value: number | null;
  order_channel: string | null;
  rush_requested: boolean;
  fulfillment_type: string | null;
  notes: string | null;
  replacement_for_order_id?: string | null;  // set when this order is a replacement — triggers outcome recording
  created_at: string;
}

// ─── Knowledge capture tables ──────────────────────────────────────────────
// These tables accumulate the outcome data that feeds deriveRuleInsight,
// deriveZoneInsight, and deriveDeliveryOverrideInsight in lib/knowledge-capture.ts.
// Schema migration: supabase/migrations/001_knowledge_capture.sql

export interface DbDeliveryOutcome {
  id: string;
  order_id: string;
  customer_id: string;
  zone: string;
  delivery_date: string;
  was_rush: boolean;
  temperature_flag: string;
  delivered_on_time: boolean | null;
  resulted_in_replacement: boolean;
  replacement_reason: string | null;
  recorded_at: string;
}

export interface DbFrictionAcknowledgement {
  id: string;
  order_id: string;
  customer_id: string;
  acknowledged_at: string;
  channel: string;
  sales_rep_id: string | null;
  concern_code: string;
  flagged_sku: string;
  rule: string;
  warning_shown: string;
  customer_confirmation: string;
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
  outcome_notes: string | null;
  created_at: string;
}

export interface DbDeliveryWindowOverride {
  id: string;
  rep_id: string;
  order_id: string;
  customer_id: string;
  zone: string;
  block_reason: string;
  delivery_date: string;
  stop_count_at_override: number;
  overridden_at: string;
  checklist_answers: Record<string, boolean | string | null>;
  rep_note: string | null;
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
  outcome_notes: string | null;
  created_at: string;
}

export interface ServiceVisit {
  id: string;
  visit_id: string;
  customer_id: string;
  service_date: string;
  service_type: ServiceType;
  technician_id: string | null;
  issue_found: string | null;
  followup_required: boolean;
  followup_resolved: boolean;
  followup_resolved_at: string | null;
  visit_value: number | null;
  notes: string | null;
  // Filled in by technician after the visit
  logged_at: string | null;
  logged_issue: string | null;             // legacy — superseded by logged_work_completed
  logged_followup_required: boolean | null; // legacy — superseded by logged_resolution_status
  logged_upsell_pitched: boolean | null;
  logged_upsell_sku: string | null;
  logged_notes: string | null;
  // Structured outcome fields — schema migration required to add these columns
  logged_work_completed: string | null;
  logged_resolution_status: ResolutionStatus | null;
  logged_next_step: string | null;
  logged_next_step_owner: NextStepOwner | null;
  // Ops flag — creates an OpsQueueItem when set
  logged_ops_flag_kind: string | null;
  logged_ops_flag_observation: string | null;
  logged_ops_flag_sku: string | null;
  created_at: string;
}

export interface VisitSchedule {
  id: string;
  customer_id: string;
  technician_id: string | null;
  scheduled_date: string;
  service_type: ServiceType;
  status: VisitStatus;
  visit_id: string | null;
  created_at: string;
}

// ─── Views ────────────────────────────────────────

export interface CustomerIssuePattern {
  customer_id: string;
  issue_found: string;
  occurrence_count: number;
  last_seen: string;
  followup_count: number;
}

export interface OpenFollowup {
  id: string;
  visit_id: string;
  customer_id: string;
  customer_name: string;
  service_date: string;
  service_type: ServiceType;
  issue_found: string | null;
  notes: string | null;
  technician_id: string | null;
  technician_name: string | null;
  days_open: number;
}

// ─── Joined shapes used by the app ────────────────
// These are what the app actually works with after joining tables.

export interface ScheduledVisit extends VisitSchedule {
  customer: Customer;
  technician: Technician | null;
}

export interface UpsellRecommendation {
  sku: string;
  product_name: string;
  category: Category;
  reason: string;   // internal: why the engine surfaced this recommendation
  pitch: string;    // customer-facing: what the technician should say
  unit_price: number | null;
}
