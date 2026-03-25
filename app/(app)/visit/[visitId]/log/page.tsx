// Post-Visit Log — filled in by the technician after the visit.
// Designed to be completed in under 2 minutes in a parking lot.
// Draft is saved to localStorage so a lost connection doesn't lose the form.

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const DRAFT_KEY = (visitId: string) => `visit-log-draft-${visitId}`;

export default function VisitLogPage() {
  const { visitId } = useParams<{ visitId: string }>();
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

    const { error: visitError } = await supabase
      .from("service_visits")
      .update({
        logged_at: new Date().toISOString(),
        logged_issue: issueFound || null,
        logged_followup_required: followupRequired,
        logged_upsell_pitched: upsellPitched,
        logged_upsell_sku: upsellPitched && upsellSku ? upsellSku : null,
        logged_notes: notes || null,
        // If a followup was raised, create the followup record
        ...(followupRequired ? {
          followup_required: true,
          issue_found: issueFound || followupDescription || null,
          notes: followupDescription || null,
        } : {}),
      })
      .eq("id", visitId);

    // Mark the scheduled visit as completed
    if (!visitError) {
      await supabase
        .from("visit_schedule")
        .update({ status: "completed" })
        .eq("id", visitId);
    }

    setSubmitting(false);

    if (visitError) {
      setError(visitError.message);
    } else {
      localStorage.removeItem(DRAFT_KEY(visitId));  // clear draft on success
      router.push("/");
    }
  }

  return (
    <div className="max-w-lg mx-auto pb-16">

      {/* Top nav */}
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

        {/* Issue found */}
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

        {/* Followup required */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Followup required?
          </label>
          <div className="flex gap-3">
            <ToggleButton active={!followupRequired} onClick={() => setFollowupRequired(false)}>
              No
            </ToggleButton>
            <ToggleButton active={followupRequired} onClick={() => setFollowupRequired(true)}>
              Yes
            </ToggleButton>
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

        {/* Upsell pitched */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Did you recommend a product?
          </label>
          <div className="flex gap-3">
            <ToggleButton active={!upsellPitched} onClick={() => setUpsellPitched(false)}>
              No
            </ToggleButton>
            <ToggleButton active={upsellPitched} onClick={() => setUpsellPitched(true)}>
              Yes
            </ToggleButton>
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

        {/* Notes */}
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

// Simple yes/no toggle button
function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-slate-600 border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
