// Account Snapshot — always expanded, always first.
// Access notes appear in a yellow callout at the very top.
// A technician who can't get into the building wastes a trip.

import { getSegmentLabel } from "@/lib/segments";
import type { Customer } from "@/types/database";

interface AccountSnapshotProps {
  customer: Customer;
}

export function AccountSnapshot({ customer }: AccountSnapshotProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</p>
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* Access notes — yellow callout, always first if present */}
        {customer.access_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Access</p>
            <p className="text-sm text-amber-900">{customer.access_notes}</p>
          </div>
        )}

        {/* Core account details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-slate-400">Type</p>
            <p className="text-slate-800 capitalize">{customer.customer_type.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Segment</p>
            <p className="text-slate-800">{getSegmentLabel(customer.segment_hint)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">City</p>
            <p className="text-slate-800">{customer.city ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Contact via</p>
            <p className="text-slate-800 capitalize">{customer.preferred_contact_channel ?? "—"}</p>
          </div>
        </div>

        {/* General notes */}
        {customer.notes && (
          <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">{customer.notes}</p>
        )}

      </div>
    </div>
  );
}
