// POST /api/insights/reset
//
// Clears all pattern_alerts and cron_runs rows — used to reset the
// insights page to a blank state before a demo run.

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await service.from("pattern_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await service.from("cron_runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  return Response.json({ ok: true });
}
