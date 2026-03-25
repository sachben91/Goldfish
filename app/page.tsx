// Root page — redirects authenticated users to the schedule,
// unauthenticated users to login.

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // The schedule lives at / inside the (app) route group
  if (user) redirect("/schedule");  // will match (app)/schedule/page.tsx once created, for now stays at /
  else redirect("/login");
}
