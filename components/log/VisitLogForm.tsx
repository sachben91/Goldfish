// Post-visit log form.
// Shows the editable form for unlogged visits, or a read-only summary for completed ones.

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { ServiceVisit, VisitSchedule, Customer } from "@/types/database";

interface VisitLogFormProps {
  visitId: string;
  schedule: VisitSchedule & { customer: Pick<Customer, "customer_name"> };
  loggedVisit: ServiceVisit | null;
}

const DRAFT_KEY = (id: string) => `visit-log-draft-${id}`;

export function VisitLogForm({ visitId, schedule, loggedVisit }: VisitLogFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [issueFound, setIssueFound] = useState("");
  const [followupRequired, setFollowupRequired] = useState(false);
  const [followupDescription, setFollowupDescription] = useState("");
  const [upsellPitched, setUpsellPitched] = useState(false);
  const [upsellSku, setUpsellSku] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY(visitId));
    if (saved) {
      const draft = JSON.parse(saved);
      setIssueFound(draft.issueFound ?? "");
      setFollowupRequired(draft.followupRequired ?? false);
      setFollowupDescription(draft.followupDescription ?? "");
      setUpsellPitched(draft.upsellPitched ?? false);
      setUpsellSku(draft.upsellSku ?? "");
      setNotes(draft.notes ?? "");
    }
  }, [visitId]);

  // Auto-save draft to localStorage on every change
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(visitId), JSON.stringify({
      issueFound, followupRequired, followupDescription, upsellPitched, upsellSku, notes,
    }));
  }, [visitId, issueFound, followupRequired, followupDescription, upsellPitched, upsellSku, notes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Insert a new service visit record for this completed visit
    const { data: newVisit, error: insertError } = await supabase
      .from("service_visits")
      .insert({
        visit_id: `LOG-${visitId.slice(0, 8)}-${Date.now()}`,
        customer_id: schedule.customer_id,
        service_date: new Date().toISOString().split("T")[0],
        service_type: schedule.service_type,
        technician_id: schedule.technician_id,
        issue_found: followupRequired ? (issueFound || followupDescription || null) : null,
        followup_required: followupRequired,
        notes: followupDescription || null,
        logged_at: new Date().toISOString(),
        logged_issue: issueFound || null,
        logged_followup_required: followupRequired,
        logged_upsell_pitched: upsellPitched,
        logged_upsell_sku: upsellPitched && upsellSku ? upsellSku : null,
        logged_notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    // Mark the scheduled visit as completed and link it to the new service visit
    const { error: scheduleError } = await supabase
      .from("visit_schedule")
      .update({ status: "completed", visit_id: newVisit.id })
      .eq("id", visitId);

    setSubmitting(false);

    if (scheduleError) {
      setError(scheduleError.message);
    } else {
      localStorage.removeItem(DRAFT_KEY(visitId));
      router.push("/");
    }
  }

  // ── Read-only view for already-logged visits ──────────────────────────────

  if (loggedVisit) {
    return (
      <div className="max-w-lg mx-auto pb-16">
        <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href={`/visit/${visitId}/brief`} className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
            <div>
              <p className="font-semibold text-slate-900">{schedule.customer.customer_name}</p>
              <p className="text-xs text-slate-500">Visit log</p>
            </div>
            <span className="ml-auto text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full">
              ✓ Logged
            </span>
          </div>
        </div>

        <div className="px-4 pt-6 space-y-4">
          <LogField label="Issue found" value={loggedVisit.logged_issue ?? "None noted"} />
          <LogField
            label="Followup required"
            value={loggedVisit.logged_followup_required ? "Yes" : "No"}
          />
          {loggedVisit.logged_followup_required && loggedVisit.notes && (
            <LogField label="Followup description" value={loggedVisit.notes} />
          )}
          <LogField
            label="Product recommended"
            value={
              loggedVisit.logged_upsell_pitched
                ? loggedVisit.logged_upsell_sku ?? "Yes (no SKU recorded)"
                : "No"
            }
          />
          {loggedVisit.logged_notes && (
            <LogField label="Notes" value={loggedVisit.logged_notes} />
          )}
          <p className="text-xs text-slate-400 pt-2">
            Logged {new Date(loggedVisit.logged_at!).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );
  }

  // ── Editable form for new visits ─────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto pb-16">
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href={`/visit/${visitId}/brief`} className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
          <div>
            <p className="font-semibold text-slate-900">Log this visit</p>
            <p className="text-xs text-slate-500">Takes about 2 minutes</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-6 space-y-6">

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Issue found <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={issueFound}
            onChange={(e) => setIssueFound(e.target.value)}
            placeholder="e.g. filter sock clogged, top-off reservoir low"
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Followup required?
          </label>
          <div className="flex gap-3">
            <ToggleButton active={!followupRequired} onClick={() => setFollowupRequired(false)}>No</ToggleButton>
            <ToggleButton active={followupRequired} onClick={() => setFollowupRequired(true)}>Yes</ToggleButton>
          </div>
          {followupRequired && (
            <textarea
              value={followupDescription}
              onChange={(e) => setFollowupDescription(e.target.value)}
              placeholder="What needs to happen on the next visit?"
              rows={2}
              className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Did you recommend a product?
          </label>
          <div className="flex gap-3">
            <ToggleButton active={!upsellPitched} onClick={() => setUpsellPitched(false)}>No</ToggleButton>
            <ToggleButton active={upsellPitched} onClick={() => setUpsellPitched(true)}>Yes</ToggleButton>
          </div>
          {upsellPitched && (
            <input
              type="text"
              value={upsellSku}
              onChange={(e) => setUpsellSku(e.target.value)}
              placeholder="SKU e.g. EQUIP-ATO-001"
              className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else worth noting"
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save visit log"}
        </button>

      </form>
    </div>
  );
}

function ToggleButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
        active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function LogField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-4 py-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}
