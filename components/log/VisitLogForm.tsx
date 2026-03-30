// Post-visit log form.
//
// Priority order matches what Dana and Luis said matters:
//   1. What did you do — the primary record of the visit
//   2. Is it fully resolved — determines whether anything still needs to happen
//   3. If not resolved — what's next and who owns it
//   4. Anything to flag for office — upsell opportunity, escalation, etc.
//   5. Notes — catch-all for anything that doesn't fit above
//
// The upsell question is no longer a direct prompt in the main flow.
// If the tech noticed something worth acting on, they flag it for office.
// Office quotes it, gets approval, and closes that loop — not the tech in the parking lot.

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { ServiceVisit, VisitSchedule, Customer, ResolutionStatus, NextStepOwner } from "@/types/database";
import type { OpsItemKind } from "@/lib/ops-queue";

interface VisitLogFormProps {
  visitId: string;
  schedule: VisitSchedule & { customer: Pick<Customer, "customer_name"> };
  loggedVisit: ServiceVisit | null;
}

const DRAFT_KEY = (id: string) => `visit-log-draft-${id}`;

const RESOLUTION_OPTIONS: { value: ResolutionStatus; label: string; sub: string }[] = [
  { value: "fully_resolved",    label: "Done",           sub: "Fixed and complete" },
  { value: "partially_handled", label: "Partial",        sub: "Did my part, more needed" },
  { value: "could_not_fix",     label: "Couldn't fix",   sub: "Needs a different approach" },
];

const OWNER_OPTIONS: { value: NextStepOwner; label: string; sub: string }[] = [
  { value: "field",    label: "Field return",  sub: "Tech comes back with part or time" },
  { value: "office",   label: "Office",        sub: "Schedule, approve, or contact customer" },
  { value: "customer", label: "Customer",      sub: "Customer behaviour or decision" },
];

const OPS_FLAG_OPTIONS: { value: OpsItemKind; label: string }[] = [
  { value: "upsell_opportunity",     label: "Equipment or service opportunity" },
  { value: "return_visit_needed",    label: "Return visit needed (can't schedule myself)" },
  { value: "pattern_alert",          label: "Same issue keeps coming back" },
  { value: "customer_escalation",    label: "Customer expressed a concern" },
  { value: "service_cadence_review", label: "Visit frequency seems wrong for this account" },
];

export function VisitLogForm({ visitId, schedule, loggedVisit }: VisitLogFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [workCompleted, setWorkCompleted] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>("fully_resolved");
  const [nextStep, setNextStep] = useState("");
  const [nextStepOwner, setNextStepOwner] = useState<NextStepOwner>("office");
  const [flagForOffice, setFlagForOffice] = useState(false);
  const [opsFlagKind, setOpsFlagKind] = useState<OpsItemKind>("upsell_opportunity");
  const [opsFlagObservation, setOpsFlagObservation] = useState("");
  const [opsFlagSku, setOpsFlagSku] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore draft
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY(visitId));
    if (saved) {
      const d = JSON.parse(saved);
      setWorkCompleted(d.workCompleted ?? "");
      setResolutionStatus(d.resolutionStatus ?? "fully_resolved");
      setNextStep(d.nextStep ?? "");
      setNextStepOwner(d.nextStepOwner ?? "office");
      setFlagForOffice(d.flagForOffice ?? false);
      setOpsFlagKind(d.opsFlagKind ?? "upsell_opportunity");
      setOpsFlagObservation(d.opsFlagObservation ?? "");
      setOpsFlagSku(d.opsFlagSku ?? "");
      setNotes(d.notes ?? "");
    }
  }, [visitId]);

  // Auto-save draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(visitId), JSON.stringify({
      workCompleted, resolutionStatus, nextStep, nextStepOwner,
      flagForOffice, opsFlagKind, opsFlagObservation, opsFlagSku, notes,
    }));
  }, [visitId, workCompleted, resolutionStatus, nextStep, nextStepOwner,
      flagForOffice, opsFlagKind, opsFlagObservation, opsFlagSku, notes]);

  const needsNextStep = resolutionStatus !== "fully_resolved";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workCompleted.trim()) return;
    setSubmitting(true);
    setError(null);

    const { data: newVisit, error: insertError } = await supabase
      .from("service_visits")
      .insert({
        visit_id: `LOG-${visitId.slice(0, 8)}-${Date.now()}`,
        customer_id: schedule.customer_id,
        service_date: new Date().toISOString().split("T")[0],
        service_type: schedule.service_type,
        technician_id: schedule.technician_id,
        followup_required: needsNextStep,
        logged_at: new Date().toISOString(),
        // Structured outcome
        logged_work_completed: workCompleted,
        logged_resolution_status: resolutionStatus,
        logged_next_step: needsNextStep ? nextStep || null : null,
        logged_next_step_owner: needsNextStep ? nextStepOwner : null,
        // Ops flag
        logged_ops_flag_kind: flagForOffice ? opsFlagKind : null,
        logged_ops_flag_observation: flagForOffice ? opsFlagObservation || null : null,
        logged_ops_flag_sku: flagForOffice && opsFlagKind === "upsell_opportunity" ? opsFlagSku || null : null,
        // Legacy fields — kept for backwards compat with existing queries
        logged_issue: needsNextStep ? workCompleted : null,
        logged_followup_required: needsNextStep,
        logged_notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

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

  // ── Read-only view ────────────────────────────────────────────────────────

  if (loggedVisit) {
    const resolution = loggedVisit.logged_resolution_status;
    const resolutionLabel = RESOLUTION_OPTIONS.find((o) => o.value === resolution)?.label
      ?? (loggedVisit.logged_followup_required ? "Follow-up required" : "Done");

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
          <LogField label="What was done" value={loggedVisit.logged_work_completed ?? loggedVisit.logged_issue ?? "Not recorded"} />
          <LogField label="Outcome" value={resolutionLabel} />
          {loggedVisit.logged_next_step && (
            <LogField
              label={`Next step — ${OWNER_OPTIONS.find((o) => o.value === loggedVisit.logged_next_step_owner)?.label ?? "owner unknown"}`}
              value={loggedVisit.logged_next_step}
            />
          )}
          {loggedVisit.logged_ops_flag_kind && (
            <LogField
              label="Flagged for office"
              value={`${OPS_FLAG_OPTIONS.find((o) => o.value === loggedVisit.logged_ops_flag_kind)?.label ?? loggedVisit.logged_ops_flag_kind}${loggedVisit.logged_ops_flag_observation ? `: ${loggedVisit.logged_ops_flag_observation}` : ""}`}
            />
          )}
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

  // ── Editable form ─────────────────────────────────────────────────────────

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

        {/* 1. What was done — required, primary record */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            What did you do today? <span className="text-red-400">*</span>
          </label>
          <textarea
            value={workCompleted}
            onChange={(e) => setWorkCompleted(e.target.value)}
            placeholder="e.g. Replaced filter sock, topped off ATO reservoir, checked parameters — all normal"
            rows={3}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* 2. Resolution status */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Is this fully resolved?
          </label>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResolutionStatus(opt.value)}
                className={`flex-1 py-2.5 px-2 rounded-lg border text-xs font-medium transition-colors text-center ${
                  resolutionStatus === opt.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                <div>{opt.label}</div>
                <div className={`mt-0.5 font-normal ${resolutionStatus === opt.value ? "text-blue-100" : "text-slate-400"}`}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Next step — only when not fully resolved */}
        {needsNextStep && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">What still needs to happen?</p>

            <div>
              <textarea
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="e.g. Return with replacement pump — part not on truck today"
                rows={2}
                className="w-full border border-amber-300 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-amber-800 mb-2">Who handles it?</p>
              <div className="space-y-2">
                {OWNER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNextStepOwner(opt.value)}
                    className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-lg border text-left text-sm transition-colors ${
                      nextStepOwner === opt.value
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-white text-slate-700 border-amber-200"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className={`text-xs ${nextStepOwner === opt.value ? "text-amber-100" : "text-slate-400"}`}>
                      {opt.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. Flag for office — optional */}
        <div>
          <button
            type="button"
            onClick={() => setFlagForOffice((f) => !f)}
            className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border text-sm font-medium transition-colors ${
              flagForOffice
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-300"
            }`}
          >
            <span>Flag something for office</span>
            <span className={flagForOffice ? "text-slate-300" : "text-slate-400"}>
              {flagForOffice ? "▲" : "▼"}
            </span>
          </button>

          {flagForOffice && (
            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">What kind of flag?</p>
                <div className="space-y-1.5">
                  {OPS_FLAG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOpsFlagKind(opt.value)}
                      className={`w-full text-left py-2 px-3 rounded-lg border text-sm transition-colors ${
                        opsFlagKind === opt.value
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">What did you observe?</label>
                <textarea
                  value={opsFlagObservation}
                  onChange={(e) => setOpsFlagObservation(e.target.value)}
                  placeholder="e.g. Top-off runs dry every visit — this account probably needs an ATO unit"
                  rows={2}
                  className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
                />
              </div>

              {opsFlagKind === "upsell_opportunity" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">SKU <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    type="text"
                    value={opsFlagSku}
                    onChange={(e) => setOpsFlagSku(e.target.value)}
                    placeholder="e.g. EQUIP-ATO-001"
                    className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. Notes — catch-all */}
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
          disabled={submitting || !workCompleted.trim()}
          className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save visit log"}
        </button>

      </form>
    </div>
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
