import "server-only";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_BRANDING, type Branding, type Me, type Role } from "@gradual/shared";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

/** Calls the API from server components, forwarding the cookie and host (the host selects the tenant). */
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const h = await headers();
  const c = await cookies();
  return fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...init?.headers,
      cookie: c.toString(),
      "x-forwarded-host": h.get("x-forwarded-host") ?? h.get("host") ?? "",
    },
  });
}

export async function getBranding(): Promise<Branding> {
  try {
    const r = await serverFetch("/public/branding");
    if (r.ok) return (await r.json()) as Branding;
  } catch {
    /* API unreachable: fall back to defaults */
  }
  return { ...DEFAULT_BRANDING, logoUrl: null };
}

export async function getMe(): Promise<Me | null> {
  const r = await serverFetch("/auth/me");
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`API /auth/me: ${r.status}`);
  return (await r.json()) as Me;
}

/** Landing area for each role (D61). */
export const homeFor = (role: Role) => ({ superadmin: "/platform", admin: "/admin", client: "/app" })[role];

/** Section guard: requires a session, the given role and (for clients) consent to the current policy. */
export async function requireUser(role: Role): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== role) redirect(homeFor(me.role));
  if (me.requiresConsent) redirect("/consent");
  return me;
}
