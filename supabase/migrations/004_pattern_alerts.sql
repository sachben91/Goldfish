-- Pattern alerts table — output of the nightly insights cron.
--
-- The cron runs deriveRecurringPatterns for every account and writes
-- results here. The insights page reads from this table. Results are
-- replaced on each run so the table always reflects current state.
--
-- cron_runs tracks when the job ran and what it found — useful for
-- confirming the cron is healthy and for the "last run" timestamp on
-- the insights page.

create table if not exists pattern_alerts (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers(id),
  customer_name        text not null,
  issue                text not null,
  occurrences          integer not null,
  last_seen            date not null,
  suggested_ops_action text not null,
  generated_at         timestamptz not null default now()
);

create table if not exists cron_runs (
  id                  uuid primary key default gen_random_uuid(),
  job_name            text not null,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  accounts_processed  integer,
  patterns_found      integer,
  status              text not null default 'running'   -- running | completed | failed
);

alter table pattern_alerts enable row level security;
alter table cron_runs enable row level security;

create policy "Authenticated users can read pattern alerts"
  on pattern_alerts for select to authenticated using (true);

create policy "Authenticated users can read cron runs"
  on cron_runs for select to authenticated using (true);
