// Redirect to schedule for testing — auth disabled temporarily.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/schedule");
}
