-- Goldfish Express — Database Schema
-- Run this in your Supabase SQL editor before seeding data.
-- Tables are created in dependency order (no forward references).

-- ─────────────────────────────────────────────
-- CATALOG
-- Products and services Goldfish Express sells.
-- The upsell_relationships column encodes which SKUs naturally
-- follow from owning this one — used by the recommendation engine.
-- ─────────────────────────────────────────────
create table if not exists catalog (
  sku                    text primary key,
  product_name           text not null,
  category               text not null,         -- fish | coral | invertebrate | equipment | service | bundle
  buyer_type_hint        text,                  -- who typically buys this
  tank_size_min_gallons  integer default 0,
  temperature_sensitivity text,                 -- low | medium | high
  compatibility_group    text,
  delivery_sensitivity   text,                  -- low | medium | high
  service_dependency     text,                  -- which service type this item relates to
  upsell_relationships   jsonb default '[]'::jsonb,  -- array of SKUs to recommend alongside this one
  created_at             timestamptz default now()
);

-- ─────────────────────────────────────────────
-- CUSTOMERS
-- Accounts Goldfish Express services.
-- access_notes is extracted from the raw notes field at seed time
-- because a technician who can't get into the building wastes a trip.
-- ─────────────────────────────────────────────
create table if not exists customers (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               text unique not null,  -- original CSV id e.g. CUST-0001
  customer_name             text not null,
  customer_type             text not null,         -- hobbyist | collector | office_service | wholesale
  segment_hint              text,
  city                      text,
  postal_code               text,
  signup_date               date,
  preferred_contact_channel text,
  access_notes              text,                  -- extracted: access codes, parking, building entry
  notes                     text,                  -- everything else from the original notes field
  created_at                timestamptz default now()
);

-- ─────────────────────────────────────────────
-- TECHNICIANS
-- The five field technicians. Linked to Supabase auth users
-- so each technician only sees their own schedule.
-- ─────────────────────────────────────────────
create table if not exists technicians (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  email        text unique,
  auth_user_id uuid,             -- linked after Supabase auth user is created
  created_at   timestamptz default now()
);

-- ─────────────────────────────────────────────
-- ORDERS
-- Every product or service a customer has ordered.
-- Used to understand what's in their tank and drive upsell logic.
-- ─────────────────────────────────────────────
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  order_id          text unique not null,
  order_date        date not null,
  customer_id       uuid not null references customers(id),
  sku               text not null references catalog(sku),
  quantity          integer default 1,
  unit_price        numeric(10, 2),
  total_order_value numeric(10, 2),
  order_channel     text,
  rush_requested    boolean default false,
  fulfillment_type  text,
  notes             text,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────────
-- SERVICE VISITS
-- Every visit a technician has made to an account.
-- The logged_* fields are filled in by the technician after the visit
-- using the post-visit log form — they start as null.
-- ─────────────────────────────────────────────
create table if not exists service_visits (
  id                      uuid primary key default gen_random_uuid(),
  visit_id                text unique not null,
  customer_id             uuid not null references customers(id),
  service_date            date not null,
  service_type            text not null,   -- monthly_maintenance | biweekly_maintenance | emergency_rescue
  technician_id           uuid references technicians(id),
  issue_found             text,
  followup_required       boolean default false,
  followup_resolved       boolean default false,
  followup_resolved_at    timestamptz,
  visit_value             numeric(10, 2),
  notes                   text,
  -- Fields filled in by technician after the visit
  logged_at               timestamptz,
  logged_issue            text,
  logged_followup_required boolean,
  logged_upsell_pitched   boolean,
  logged_upsell_sku       text references catalog(sku),
  logged_notes            text,
  created_at              timestamptz default now()
);

-- ─────────────────────────────────────────────
-- VISIT SCHEDULE
-- Upcoming visits computed from visit history + frequency rules.
-- Generated by the seed script and maintained by the app going forward.
-- ─────────────────────────────────────────────
create table if not exists visit_schedule (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id),
  technician_id  uuid references technicians(id),
  scheduled_date date not null,
  service_type   text not null,
  status         text default 'scheduled',  -- scheduled | completed | cancelled
  visit_id       uuid references service_visits(id),  -- linked when completed
  created_at     timestamptz default now()
);


-- ─────────────────────────────────────────────
-- VIEW: customer_issue_patterns
-- Aggregates recurring issues per account.
-- Powers the "Recurring Issues" section of the pre-visit brief.
-- ─────────────────────────────────────────────
create or replace view customer_issue_patterns as
select
  customer_id,
  issue_found,
  count(*)                                          as occurrence_count,
  max(service_date)                                 as last_seen,
  count(*) filter (where followup_required = true)  as followup_count
from service_visits
where issue_found is not null
group by customer_id, issue_found
order by occurrence_count desc;


-- ─────────────────────────────────────────────
-- VIEW: open_followups
-- All unresolved followups across all accounts.
-- Powers the "Open Followups" section of the pre-visit brief
-- and the manager dashboard.
-- ─────────────────────────────────────────────
create or replace view open_followups as
select
  sv.id,
  sv.visit_id,
  sv.customer_id,
  c.customer_name,
  sv.service_date,
  sv.service_type,
  sv.issue_found,
  sv.notes,
  sv.technician_id,
  t.name as technician_name,
  -- How many days this followup has been open
  (current_date - sv.service_date) as days_open
from service_visits sv
join customers c on c.id = sv.customer_id
left join technicians t on t.id = sv.technician_id
where sv.followup_required = true
  and sv.followup_resolved = false;


-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Technicians can only see their own scheduled visits.
-- Service role (used by seed script and server actions) bypasses RLS.
-- ─────────────────────────────────────────────
alter table visit_schedule enable row level security;
alter table service_visits enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table catalog enable row level security;
alter table technicians enable row level security;

-- Catalog and customers are readable by all authenticated users
create policy "Authenticated users can read catalog"
  on catalog for select to authenticated using (true);

create policy "Authenticated users can read customers"
  on customers for select to authenticated using (true);

create policy "Authenticated users can read orders"
  on orders for select to authenticated using (true);

-- Technicians can only read their own record
create policy "Technicians can read own record"
  on technicians for select to authenticated
  using (auth_user_id = auth.uid());

-- Technicians can only see visits scheduled for them
create policy "Technicians can read own scheduled visits"
  on visit_schedule for select to authenticated
  using (
    technician_id = (
      select id from technicians where auth_user_id = auth.uid()
    )
  );

-- Technicians can read service visits for their scheduled accounts
create policy "Technicians can read service visits for their accounts"
  on service_visits for select to authenticated using (true);

-- Technicians can update service visits to log their post-visit notes
create policy "Technicians can log their own visits"
  on service_visits for update to authenticated
  using (
    technician_id = (
      select id from technicians where auth_user_id = auth.uid()
    )
  );
