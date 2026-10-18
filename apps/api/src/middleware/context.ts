import type { Request, Response, NextFunction } from "express";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { HttpError, hashToken, now, addMs, DAY } from "../lib/util.js";
import type { Role, UserStatus } from "@gradual/shared";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  role: Role;
  email: string;
  name: string;
  password_hash: string | null;
  status: UserStatus;
  failed_logins: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  invited_by: string | null;
  created_at: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant: TenantRow;
      user?: UserRow;
      sessionId?: string;
    }
  }
}

export const SESSION_COOKIE = "gradual_sid";

// ---------- Tenant (D8): resolved by domain; falls back to the default tenant ----------

const cache = new Map<string, { t: TenantRow; at: number }>();
const CACHE_MS = 60_000;

export function clearTenantCache() {
  cache.clear();
}

export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const rawHost = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]!.trim();
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    req.tenant = hit.t;
    return next();
  }
  let t: TenantRow | undefined = host ? await db("gradual_tenants").where({ domain: host }).first() : undefined;
  t ??= await db("gradual_tenants").where({ slug: env.DEFAULT_TENANT_SLUG }).first();
  if (!t) throw new HttpError(503, "La plataforma aún no está configurada.");
  cache.set(host, { t, at: Date.now() });
  req.tenant = t;
  next();
}

// ---------- Session ----------

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const row = await db("gradual_sessions as s")
    .join("gradual_users as u", "u.id", "s.user_id")
    .where("s.token_hash", hashToken(token))
    .andWhere("s.expires_at", ">", now())
    .andWhere("u.tenant_id", req.tenant.id)
    .andWhere("u.status", "active")
    .select("u.*", "s.id as session_id", "s.expires_at as session_expires_at")
    .first();
  if (row) {
    const { session_id, session_expires_at, ...user } = row;
    req.user = user as UserRow;
    req.sessionId = session_id;
    // Sliding renewal: extend the session when less than half of its lifetime remains.
    const life = env.SESSION_DAYS * DAY;
    if (new Date(session_expires_at).getTime() - Date.now() < life / 2) {
      await db("gradual_sessions").where({ id: session_id }).update({ expires_at: addMs(now(), life) });
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Debes iniciar sesión.");
  next();
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "Debes iniciar sesión.");
    if (req.user.role !== role) throw new HttpError(403, "No tienes permiso para esta acción.");
    next();
  };
}

// ---------- Consent (D24) ----------

export async function currentPolicy(tenantId: string) {
  return db("gradual_privacy_policies").where({ tenant_id: tenantId }).orderBy("version", "desc").first();
}

/** A client must accept the current version if they have not yet. Admins are exempt. */
export async function needsConsent(user: UserRow): Promise<boolean> {
  if (user.role !== "client") return false;
  const p = await currentPolicy(user.tenant_id);
  if (!p) return false;
  const c = await db("gradual_consents").where({ user_id: user.id, policy_id: p.id }).first();
  return !c;
}

/** Blocks client business routes until the current policy is accepted. */
export async function requireConsent(req: Request, _res: Response, next: NextFunction) {
  if (req.user && (await needsConsent(req.user))) {
    throw new HttpError(428, "Debes aceptar la política de privacidad vigente para continuar.");
  }
  next();
}
