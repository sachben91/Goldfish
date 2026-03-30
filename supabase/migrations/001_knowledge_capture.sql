-- Knowledge capture tables.
--
-- These accumulate the outcome data that feeds deriveRuleInsight,
-- deriveZoneInsight, and deriveDeliveryOverrideInsight in
-- lib/knowledge-capture.ts.
--
-- The insight functions are already written. The data has to accumulate.
-- This migration creates the tables that receive it.

-- ─── Orders: replacement linkage ─────────────────────────────────────────────
-- When a replacement order is created, replacement_for_order_id is set to the
-- original order_id. The replacement hook reads this and fires outcome recording
-- automatically — no manual step required.

alter table orders
  add column if not exists replacement_for_order_id text;

-- ─── Delivery outcomes ────────────────────────────────────────────────────────
-- Written after every delivery completes — replacement or fulfilled.
-- This is the ground-truth signal for deriveZoneInsight.
-- Written by lib/replacement-hook.ts on replacement order creation,
-- and by POST /api/orders/[orderId]/fulfil on clean delivery.

create table if not exists delivery_outcomes (
  id                      uuid primary key default gen_random_uuid(),
  order_id                text not null,
  customer_id             text not null,
  zone                    text not null,
  delivery_date           date not null,
  was_rush                boolean not null default false,
  temperature_flag        text not null default 'stable',  -- stable | warm | high_heat | cold_snap
  delivered_on_time       boolean,
  resulted_in_replacement boolean not null,
  replacement_reason      text,                            -- late_delivery | doa | temperature_stress
  recorded_at             timestamptz not null default now()
);

-- ─── Friction acknowledgements ────────────────────────────────────────────────
-- Written when a customer acknowledges a compatibility friction warning and
-- proceeds with the order. The resulted_in_replacement field starts null and
-- is filled in by the replacement hook when outcome is known.
--
-- The outcome field is what makes deriveRuleInsight useful — it lets the system
-- answer "is this friction gate preventing bad outcomes, or just creating friction?"

create table if not exists friction_acknowledgements (
  id                      uuid primary key default gen_random_uuid(),
  order_id                text not null,
  customer_id             text not null,
  acknowledged_at         timestamptz not null,
  channel                 text not null,                   -- web | phone | email | concierge | account_manager
  sales_rep_id            text,                            -- null for web (self-serve)
  concern_code            text not null,                   -- e.g. predator_shrimp_same_cart
  flagged_sku             text not null,
  rule                    text not null,
  warning_shown           text not null,
  customer_confirmation   text not null,
  resulted_in_replacement boolean,                         -- null until outcome recorded
  outcome_recorded_at     timestamptz,
  outcome_notes           text,
  created_at              timestamptz default now()
);

-- ─── Delivery window overrides ────────────────────────────────────────────────
-- Written when a rep overrides a capacity block on a same-day delivery.
-- Heat blocks are not overridable — only capacity blocks generate this record.
--
-- The checklist_answers field is the knowledge capture payload. Over time,
-- answer patterns start predicting outcomes — feeding deriveDeliveryOverrideInsight.

create table if not exists delivery_window_overrides (
  id                      uuid primary key default gen_random_uuid(),
  rep_id                  text not null,
  order_id                text not null,
  customer_id             text not null,
  zone                    text not null,
  block_reason            text not null default 'capacity',
  delivery_date           date not null,
  stop_count_at_override  integer not null,
  overridden_at           timestamptz not null,
  checklist_answers       jsonb not null default '{}'::jsonb,
  rep_note                text,
  resulted_in_replacement boolean,
  outcome_recorded_at     timestamptz,
  outcome_notes           text,
  created_at              timestamptz default now()
);

-- ─── Row level security ───────────────────────────────────────────────────────

alter table delivery_outcomes enable row level security;
alter table friction_acknowledgements enable row level security;
alter table delivery_window_overrides enable row level security;

create policy "Authenticated users can insert delivery outcomes"
  on delivery_outcomes for insert to authenticated with check (true);

create policy "Authenticated users can read delivery outcomes"
  on delivery_outcomes for select to authenticated using (true);

create policy "Authenticated users can insert friction acknowledgements"
  on friction_acknowledgements for insert to authenticated with check (true);

create policy "Authenticated users can read friction acknowledgements"
  on friction_acknowledgements for select to authenticated using (true);

create policy "Authenticated users can update friction acknowledgement outcomes"
  on friction_acknowledgements for update to authenticated using (true);

create policy "Authenticated users can insert delivery window overrides"
  on delivery_window_overrides for insert to authenticated with check (true);

create policy "Authenticated users can read delivery window overrides"
  on delivery_window_overrides for select to authenticated using (true);

create policy "Authenticated users can update delivery window override outcomes"
  on delivery_window_overrides for update to authenticated using (true);
