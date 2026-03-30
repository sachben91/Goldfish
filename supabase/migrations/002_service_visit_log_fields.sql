-- Service visit structured log fields.
--
-- The visit log form was rewritten to capture outcome shape rather than
-- binary yes/no. These columns store the structured output.
--
-- Legacy fields (logged_issue, logged_followup_required) are preserved —
-- they remain in the insert for backwards compatibility and historical records.
-- New fields are null for all visits logged before this migration.
--
-- Resolution status: fully_resolved | partially_handled | could_not_fix
-- Next step owner:   field | office | customer

alter table service_visits
  add column if not exists logged_work_completed   text,
  add column if not exists logged_resolution_status text,  -- fully_resolved | partially_handled | could_not_fix
  add column if not exists logged_next_step        text,
  add column if not exists logged_next_step_owner  text,   -- field | office | customer
  add column if not exists logged_ops_flag_kind    text,   -- upsell_opportunity | return_visit_needed | pattern_alert | customer_escalation | service_cadence_review
  add column if not exists logged_ops_flag_observation text,
  add column if not exists logged_ops_flag_sku     text references catalog(sku);
