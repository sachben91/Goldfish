// Goldfish Express — Database Seed Script
//
// Loads all four CSV files into Supabase.
// Run once before using the app:
//
// Load .env.local so the script has the Supabase credentials
import "dotenv/config";
//
//   npx ts-node --project tsconfig.seed.json scripts/seed.ts
//
// The script is idempotent — running it twice won't create duplicates.
// It uses the service-role key to bypass Row Level Security.

import * as fs from "fs";
import * as path from "path";
import * as Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { nextVisitDate } from "../lib/schedule";
import type { ServiceType } from "../types/database";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  console.error("Copy .env.local.example to .env.local and fill in your Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const CSV_DIR = path.join(__dirname, "../data");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadCsv<T>(filename: string): T[] {
  const filePath = path.join(CSV_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true });
  console.log(`  Loaded ${result.data.length} rows from ${filename}`);
  return result.data;
}

// Splits a customer notes string into access-specific notes and general notes.
// Access notes contain things a technician needs before arrival:
// entry codes, parking, building contacts, key boxes, etc.
function splitCustomerNotes(notes: string): { access_notes: string | null; general_notes: string | null } {
  if (!notes) return { access_notes: null, general_notes: null };

  const ACCESS_KEYWORDS = ["access", "key", "code", "buzz", "parking", "entry", "door", "building", "window", "weekday", "weekend"];

  const sentences = notes.split(/[.;]/).map((s) => s.trim()).filter(Boolean);
  const accessSentences: string[] = [];
  const generalSentences: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (ACCESS_KEYWORDS.some((kw) => lower.includes(kw))) {
      accessSentences.push(sentence);
    } else {
      generalSentences.push(sentence);
    }
  }

  return {
    access_notes: accessSentences.length > 0 ? accessSentences.join(". ") : null,
    general_notes: generalSentences.length > 0 ? generalSentences.join(". ") : null,
  };
}

// Parses the upsell_relationships field from the catalog CSV.
// CSV value: "EQUIP-ALR-001|INVT-SHR-001" → ["EQUIP-ALR-001", "INVT-SHR-001"]
function parseUpsellRelationships(value: string): string[] {
  if (!value || value.trim() === "none") return [];
  return value.split("|").map((s) => s.trim()).filter(Boolean);
}

async function upsert(table: string, rows: object[], conflictColumn: string) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictColumn });
  if (error) {
    console.error(`  Error upserting into ${table}:`, error.message);
    throw error;
  }
  console.log(`  ✓ ${rows.length} rows upserted into ${table}`);
}

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedCatalog() {
  console.log("\n── Catalog ──");
  const rows = loadCsv<Record<string, string>>("catalog.csv");

  const records = rows.map((row) => ({
    sku:                    row.sku,
    product_name:           row.product_name,
    category:               row.category,
    buyer_type_hint:        row.buyer_type_hint || null,
    tank_size_min_gallons:  parseInt(row.tank_size_min_gallons) || 0,
    temperature_sensitivity: row.temperature_sensitivity || null,
    compatibility_group:    row.compatibility_group || null,
    delivery_sensitivity:   row.delivery_sensitivity || null,
    service_dependency:     row.service_dependency || null,
    upsell_relationships:   parseUpsellRelationships(row.upsell_relationships),
  }));

  await upsert("catalog", records, "sku");
}

async function seedCustomers() {
  console.log("\n── Customers ──");
  const rows = loadCsv<Record<string, string>>("customers.csv");

  const records = rows.map((row) => {
    const { access_notes, general_notes } = splitCustomerNotes(row.notes);
    return {
      customer_id:               row.customer_id,
      customer_name:             row.customer_name,
      customer_type:             row.customer_type,
      segment_hint:              row.segment_hint || null,
      city:                      row.city || null,
      postal_code:               row.postal_code || null,
      signup_date:               row.signup_date || null,
      preferred_contact_channel: row.preferred_contact_channel || null,
      access_notes,
      notes:                     general_notes,
    };
  });

  await upsert("customers", records, "customer_id");
}

async function seedTechnicians() {
  console.log("\n── Technicians ──");
  // Technicians are known from the service_visits CSV — not a separate file.
  const knownTechnicians = [
    { name: "Mei Chen" },
    { name: "Ari Patel" },
    { name: "Luis Mendez" },
    { name: "Rosa Kim" },
    { name: "Nora Bell" },
  ];

  // We upsert by name — if the record already exists, nothing changes.
  const { error } = await supabase.from("technicians").upsert(knownTechnicians, {
    onConflict: "name",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  console.log(`  ✓ ${knownTechnicians.length} technicians seeded`);
}

async function seedOrders() {
  console.log("\n── Orders ──");
  const rows = loadCsv<Record<string, string>>("orders.csv");

  // Build a customer_id (text) → uuid map
  const { data: customers } = await supabase.from("customers").select("id, customer_id");
  const customerIdMap = new Map(customers!.map((c) => [c.customer_id, c.id]));

  const records = rows
    .map((row) => {
      const customerId = customerIdMap.get(row.customer_id);
      if (!customerId) {
        console.warn(`  Warning: no customer found for ${row.customer_id} — skipping order ${row.order_id}`);
        return null;
      }
      return {
        order_id:          row.order_id,
        order_date:        row.order_date,
        customer_id:       customerId,
        sku:               row.sku,
        quantity:          parseInt(row.quantity) || 1,
        unit_price:        parseFloat(row.unit_price) || null,
        total_order_value: parseFloat(row.total_order_value) || null,
        order_channel:     row.order_channel || null,
        rush_requested:    row.rush_requested === "true",
        fulfillment_type:  row.fulfillment_type || null,
        notes:             row.notes || null,
      };
    })
    .filter(Boolean);

  // Insert in batches to avoid request size limits
  const BATCH_SIZE = 500;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await upsert("orders", batch as object[], "order_id");
  }
}

async function seedServiceVisits() {
  console.log("\n── Service Visits ──");
  const rows = loadCsv<Record<string, string>>("service_visits.csv");

  const { data: customers } = await supabase.from("customers").select("id, customer_id");
  const { data: technicians } = await supabase.from("technicians").select("id, name");

  const customerIdMap = new Map(customers!.map((c) => [c.customer_id, c.id]));
  const technicianIdMap = new Map(technicians!.map((t) => [t.name, t.id]));

  const records = rows
    .map((row) => {
      const customerId = customerIdMap.get(row.customer_id);
      const technicianId = technicianIdMap.get(row.technician_name) ?? null;

      if (!customerId) {
        console.warn(`  Warning: no customer for ${row.customer_id} — skipping visit ${row.visit_id}`);
        return null;
      }
      if (!technicianId) {
        console.warn(`  Warning: no technician named "${row.technician_name}" — visit ${row.visit_id} will have null technician`);
      }

      return {
        visit_id:         row.visit_id,
        customer_id:      customerId,
        service_date:     row.service_date,
        service_type:     row.service_type as ServiceType,
        technician_id:    technicianId,
        issue_found:      row.issue_found || null,
        followup_required: row.followup_required === "true",
        visit_value:      parseFloat(row.visit_value) || null,
        notes:            row.notes || null,
      };
    })
    .filter(Boolean);

  const BATCH_SIZE = 500;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await upsert("service_visits", batch as object[], "visit_id");
  }
}

async function seedVisitSchedule() {
  console.log("\n── Visit Schedule (computed from visit history) ──");

  // For each customer, find their most recent visit and compute the next one.
  const { data: visits } = await supabase
    .from("service_visits")
    .select("customer_id, service_date, service_type, technician_id")
    .order("service_date", { ascending: false });

  if (!visits) return;

  // Keep only the most recent visit per customer
  const latestByCustomer = new Map<string, typeof visits[0]>();
  for (const visit of visits) {
    if (!latestByCustomer.has(visit.customer_id)) {
      latestByCustomer.set(visit.customer_id, visit);
    }
  }

  const scheduleRows = [];
  for (const [customerId, latestVisit] of latestByCustomer) {
    const lastDate = new Date(latestVisit.service_date);
    const serviceType = latestVisit.service_type as ServiceType;
    const nextDate = nextVisitDate(lastDate, serviceType);

    if (!nextDate) continue;  // emergency rescues are not auto-scheduled

    scheduleRows.push({
      customer_id:    customerId,
      technician_id:  latestVisit.technician_id,
      scheduled_date: nextDate.toISOString().split("T")[0],
      service_type:   serviceType,
      status:         "scheduled",
    });
  }

  if (scheduleRows.length > 0) {
    const { error } = await supabase.from("visit_schedule").insert(scheduleRows);
    if (error) {
      console.error("  Error inserting schedule:", error.message);
      throw error;
    }
    console.log(`  ✓ ${scheduleRows.length} upcoming visits scheduled`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Goldfish Express — Seeding database\n");
  console.log("Supabase URL:", SUPABASE_URL);

  // Seeding order matters — respect foreign key dependencies
  await seedCatalog();
  await seedCustomers();
  await seedTechnicians();
  await seedOrders();
  await seedServiceVisits();
  await seedVisitSchedule();

  console.log("\n✓ Seed complete.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
