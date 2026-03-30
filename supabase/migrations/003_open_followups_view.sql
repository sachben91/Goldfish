-- Update open_followups view to use structured log fields.
--
-- The new log form writes logged_work_completed (what the tech did) and
-- logged_next_step (what still needs to happen). The original view read
-- issue_found and notes — old pre-visit fields that are null for any visit
-- logged through the new form, causing "Unspecified" to appear.
--
-- Coalesce order:
--   issue_found  → logged_work_completed first (new), then logged_issue (legacy), then issue_found (old pre-visit)
--   notes        → logged_next_step first (new — what still needs to happen), then notes (old)
--
-- This covers all three states:
--   New-format visits:      logged_work_completed is set
--   Old-format logged:      logged_issue is set
--   Historical unlogged:    issue_found is set (pre-visit field from old system)

create or replace view open_followups as
select
  sv.id,
  sv.visit_id,
  sv.customer_id,
  c.customer_name,
  sv.service_date,
  sv.service_type,
  coalesce(sv.logged_work_completed, sv.logged_issue, sv.issue_found) as issue_found,
  coalesce(sv.logged_next_step, sv.notes)                              as notes,
  sv.technician_id,
  t.name as technician_name,
  (current_date - sv.service_date) as days_open
from service_visits sv
join customers c on c.id = sv.customer_id
left join technicians t on t.id = sv.technician_id
where sv.followup_required = true
  and sv.followup_resolved = false;
