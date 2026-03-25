// Tank Inventory — what the customer has ordered in the last 12 months.
// Helps the technician understand what's in the tank without asking.

"use client";

import { useState } from "react";
import type { Order } from "@/types/database";

interface TankInventoryProps {
  orders: (Order & { catalog: { product_name: string; category: string } | null })[];
}

export function TankInventory({ orders }: TankInventoryProps) {
  const [expanded, setExpanded] = useState(false);

  // Group by category so it's easier to scan
  const byCategory = orders.reduce<Record<string, typeof orders>>((acc, order) => {
    const cat = order.catalog?.category ?? "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(order);
    return acc;
  }, {});

  const categoryOrder = ["fish", "coral", "invertebrate", "equipment", "service", "bundle", "other"];
  const sortedCategories = categoryOrder.filter((c) => byCategory[c]);

  const CATEGORY_LABELS: Record<string, string> = {
    fish: "Fish",
    coral: "Coral",
    invertebrate: "Invertebrates",
    equipment: "Equipment",
    service: "Services",
    bundle: "Bundles",
    other: "Other",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          In their tank
          <span className="ml-2 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full font-normal normal-case">
            {orders.length} items
          </span>
        </p>
        <span className="text-slate-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-4">
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders in the last 12 months.</p>
          ) : (
            sortedCategories.map((category) => (
              <div key={category}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="space-y-1.5">
                  {byCategory[category].map((order) => (
                    <div key={order.id} className="flex items-center justify-between text-sm">
                      <p className="text-slate-700">
                        {order.catalog?.product_name ?? order.sku}
                        {order.quantity > 1 && (
                          <span className="text-slate-400 ml-1">×{order.quantity}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(order.order_date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short", day: "numeric"
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
