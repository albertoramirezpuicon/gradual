import { Router } from "express";
import {
  createTenantSchema,
  updateTenantSchema,
  inviteTenantAdminSchema,
  type TenantSummaryDTO,
  type TenantDetailDTO,
  type TenantMetricsDTO,
  type TenantAdminDTO,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { HttpError, parse, newId, now, iso } from "../lib/util.js";
import { requireRole, clearTenantCache, type TenantRow, type UserRow } from "../middleware/context.js";
import { ensureTenant } from "../lib/bootstrap.js";
import { limaMonthStart } from "../lib/cv.js";
import { sendInvitation } from "./admin.js";
import { toMe } from "../lib/session.js";

/** Platform owner endpoints (D60–D68). Only the superadmin, never while impersonating. */
export const platformRouter = Router();
platformRouter.use(requireRole("superadmin"));

const isMain = (t: TenantRow) => t.slug === env.DEFAULT_TENANT_SLUG;

async function metrics(tenantId: string): Promise<TenantMetricsDTO> {
  const month = limaMonthStart();
  const [clients, routes, runsTotal, runsMonth, cost, last] = await Promise.all([
    db("gradual_users").where({ tenant_id: tenantId, role: "client" }).select("status").count({ n: "*" }).groupBy("status"),
    db("gradual_routes").where({ tenant_id: tenantId }).count({ n: "*" }).first(),
    db("gradual_cv_runs").where({ tenant_id: tenantId, status: "done" }).count({ n: "*" }).first(),
    db("gradual_cv_runs").where({ tenant_id: tenantId, status: "done" }).andWhere("created_at", ">=", month).count({ n: "*" }).first(),
    db("gradual_cv_runs").where({ tenant_id: tenantId }).andWhere("created_at", ">=", month).sum({ c: "cost_usd" }).first(),
    db("gradual_users").where({ tenant_id: tenantId }).max({ m: "last_login_at" }).first(),
  ]);
  const byStatus = Object.fromEntries((clients as unknown as { status: string; n: number }[]).map((r) => [r.status, Number(r.n)]));
  return {
    clientsActive: byStatus.active ?? 0,
    clientsInvited: byStatus.invited ?? 0,
    routes: Number(routes?.n ?? 0),
    cvRunsMonth: Number(runsMonth?.n ?? 0),
    cvRunsTotal: Number(runsTotal?.n ?? 0),
    llmCostMonthUsd: cost?.c == null ? null : Number(cost.c),
    lastActivityAt: iso(last?.m),
  };
}

async function summary(t: TenantRow & { created_at: Date }): Promise<TenantSummaryDTO> {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    domain: t.domain,
    status: t.status ?? "active",
    isMain: isMain(t),
    createdAt: iso(t.created_at)!,
    metrics: await metrics(t.id),
  };
}

async function getTenant(id: string) {
  const t = await db("gradual_tenants").where({ id }).first();
  if (!t) throw new HttpError(404, "Tenant no encontrado.");
  return t as TenantRow & { created_at: Date };
}

async function detail(t: TenantRow & { created_at: Date }): Promise<TenantDetailDTO> {
  const admins: UserRow[] = await db("gradual_users").where({ tenant_id: t.id, role: "admin" }).whereNot({ status: "deleted" }).orderBy("name");
  return {
    ...(await summary(t)),
    domainSuffix: env.PLATFORM_DOMAIN_SUFFIX,
    admins: admins.map((a): TenantAdminDTO => ({ id: a.id, name: a.name, email: a.email, status: a.status, lastLoginAt: iso(a.last_login_at) })),
  };
}

platformRouter.get("/tenants", async (_req, res) => {
  const rows = await db("gradual_tenants").orderBy("created_at");
  res.json(await Promise.all(rows.map(summary)));
});

platformRouter.get("/tenants/:id", async (req, res) => {
  res.json(await detail(await getTenant(req.params.id)));
});

/** Creates a tenant on <subdomain>.<suffix> with default branding/policy and invites its first admin (D60/D62). */
platformRouter.post("/tenants", async (req, res) => {
  const { name, subdomain, adminName, adminEmail } = parse(createTenantSchema, req.body);
  const domain = `${subdomain}.${env.PLATFORM_DOMAIN_SUFFIX}`;
  if (await db("gradual_tenants").where({ slug: subdomain }).orWhere({ domain }).first()) {
    throw new HttpError(409, "Ya existe un tenant con ese subdominio.");
  }
  const t = await ensureTenant(subdomain, name, domain);
  const admin: UserRow = {
    id: newId(),
    tenant_id: t.id,
    role: "admin",
    email: adminEmail,
    name: adminName,
    password_hash: null,
    status: "invited",
    failed_logins: 0,
    locked_until: null,
    last_login_at: null,
    invited_by: req.user!.id,
    deletion_requested_at: null,
    created_at: now(),
  };
  await db("gradual_users").insert(admin);
  await sendInvitation(t, admin);
  clearTenantCache();
  console.log(`[platform] ${req.user!.email} created tenant ${subdomain} (${domain}) and invited ${adminEmail}`);
  res.status(201).json(await detail(await getTenant(t.id)));
});

platformRouter.put("/tenants/:id", async (req, res) => {
  const t = await getTenant(req.params.id);
  const { name, status } = parse(updateTenantSchema, req.body);
  if (isMain(t) && status === "suspended") throw new HttpError(400, "El tenant principal no se puede suspender.");
  await db("gradual_tenants").where({ id: t.id }).update({ name, status });
  clearTenantCache();
  if (status !== t.status) console.log(`[platform] ${req.user!.email} set tenant ${t.slug} to ${status}`);
  res.json(await detail(await getTenant(t.id)));
});

/** Invites another admin to a tenant, or re-sends a pending invitation for the same email. */
platformRouter.post("/tenants/:id/admins", async (req, res) => {
  const t = await getTenant(req.params.id);
  const { name, email } = parse(inviteTenantAdminSchema, req.body);
  const existing: UserRow | undefined = await db("gradual_users").where({ tenant_id: t.id, email }).first();
  if (existing && (existing.role !== "admin" || existing.status !== "invited")) {
    throw new HttpError(409, "Ya existe un usuario con ese correo en este tenant.");
  }
  const admin: UserRow = existing ?? {
    id: newId(),
    tenant_id: t.id,
    role: "admin",
    email,
    name,
    password_hash: null,
    status: "invited",
    failed_logins: 0,
    locked_until: null,
    last_login_at: null,
    invited_by: req.user!.id,
    deletion_requested_at: null,
    created_at: now(),
  };
  if (!existing) await db("gradual_users").insert(admin);
  await sendInvitation(t, admin);
  res.status(existing ? 200 : 201).json(await detail(t));
});

/** Support mode (D66): the superadmin's session starts acting as one of the tenant's active admins. */
platformRouter.post("/tenants/:id/impersonate", async (req, res) => {
  const t = await getTenant(req.params.id);
  const adminId = String(req.body?.adminId ?? "");
  const admin: UserRow | undefined = await db("gradual_users").where({ id: adminId, tenant_id: t.id, role: "admin", status: "active" }).first();
  if (!admin) throw new HttpError(400, "Elige un administrador activo de este tenant.");
  await db("gradual_sessions").where({ id: req.sessionId! }).update({ acting_user_id: admin.id });
  console.log(`[support] ${req.user!.email} started acting as ${admin.email} (tenant ${t.slug})`);
  req.impersonator = req.user;
  req.tenant = t;
  res.json(await toMe(admin, req));
});
