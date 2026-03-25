// Prevents prerendering of auth pages — they depend on runtime env vars
// that aren't available at build time.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
