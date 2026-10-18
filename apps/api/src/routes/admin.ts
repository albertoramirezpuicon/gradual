import { Router } from "express";
import {
  inviteClientSchema,
  brandingSchema,
  logoUploadSchema,
  logoConfirmSchema,
  publishPolicySchema,
  type ClientDTO,
  type PolicyVersionDTO,
  LOGO_MAX_BYTES,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { HttpError, parse, newId, newToken, now, addMs, DAY, iso } from "../lib/util.js";
import { requireRole, currentPolicy, type UserRow } from "../middleware/context.js";
import { sendMail, invitationMail } from "../lib/mail.js";
import { getBranding } from "../lib/branding.js";
import { presignPut, headObject, deleteObject, keys } from "../lib/s3.js";
import { toPolicyDTO } from "./auth.js";

export const adminRouter = Router();
adminRouter.use(requireRole("admin"));

const toClientDTO = (u: UserRow): ClientDTO => ({
  id: u.id,
  email: u.email,
  name: u.name,
  status: u.status,
  createdAt: iso(u.created_at)!,
  lastLoginAt: iso(u.last_login_at),
});

// ---------- Clients ----------

adminRouter.get("/clients", async (req, res) => {
  const rows: UserRow[] = await db("gradual_users")
    .where({ tenant_id: req.tenant.id, role: "client" })
    .whereNot({ status: "deleted" })
    .orderBy("name");
  res.json(rows.map(toClientDTO));
});

/** Invalidates any pending invitation for the user and emails a new one (valid 7 days). */
async function sendInvitation(tenantId: string, u: UserRow) {
  await db("gradual_auth_tokens").where({ user_id: u.id, type: "invitation" }).whereNull("used_at").update({ used_at: now() });
  const { token, hash } = newToken();
  await db("gradual_auth_tokens").insert({
    id: newId(),
    user_id: u.id,
    type: "invitation",
    token_hash: hash,
    expires_at: addMs(now(), 7 * DAY),
    created_at: now(),
  });
  const b = await getBranding(tenantId);
  await sendMail(
    invitationMail({
      to: u.email,
      name: u.name,
      brand: b.brandName,
      color: b.primaryColor,
      url: `${env.APP_BASE_URL}/invitation?token=${token}`,
    }),
  );
}

adminRouter.post("/clients", async (req, res) => {
  const { email, name } = parse(inviteClientSchema, req.body);
  const existing: UserRow | undefined = await db("gradual_users").where({ tenant_id: req.tenant.id, email }).first();
  if (existing) {
    throw new HttpError(
      409,
      existing.status === "invited"
        ? "Ya existe una invitación pendiente para este correo. Puedes reenviarla desde la lista."
        : "Ya existe un usuario con este correo.",
    );
  }
  const u: UserRow = {
    id: newId(),
    tenant_id: req.tenant.id,
    role: "client",
    email,
    name,
    password_hash: null,
    status: "invited",
    failed_logins: 0,
    locked_until: null,
    last_login_at: null,
    invited_by: req.user!.id,
    created_at: now(),
  };
  await db("gradual_users").insert(u);
  await sendInvitation(req.tenant.id, u);
  res.status(201).json(toClientDTO(u));
});

adminRouter.post("/clients/:id/resend-invitation", async (req, res) => {
  const u: UserRow | undefined = await db("gradual_users")
    .where({ id: req.params.id, tenant_id: req.tenant.id, role: "client" })
    .first();
  if (!u) throw new HttpError(404, "Cliente no encontrado.");
  if (u.status !== "invited") throw new HttpError(409, "Este cliente ya activó su cuenta.");
  await sendInvitation(req.tenant.id, u);
  res.json({ ok: true });
});

// ---------- Branding (D3) ----------

adminRouter.get("/branding", async (req, res) => {
  res.json(await getBranding(req.tenant.id));
});

adminRouter.put("/branding", async (req, res) => {
  const s = parse(brandingSchema, req.body);
  await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).update({
    brand_name: s.brandName,
    primary_color: s.primaryColor.toUpperCase(),
    secondary_color: s.secondaryColor.toUpperCase(),
    font: s.font,
    updated_at: now(),
  });
  res.json(await getBranding(req.tenant.id));
});

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" };

/** Step 1: the browser requests a signed URL and uploads the file straight to S3. */
adminRouter.post("/branding/logo/upload-url", async (req, res) => {
  const { mime, size } = parse(logoUploadSchema, req.body);
  const key = keys.logo(req.tenant.id, newId(), EXT[mime]!);
  res.json({ key, url: await presignPut(key, mime, size) });
});

/** Step 2: confirm the upload; verifies the object exists and respects the size limit. */
adminRouter.post("/branding/logo/confirm", async (req, res) => {
  const { key } = parse(logoConfirmSchema, req.body);
  if (!key.startsWith(`t/${req.tenant.id}/branding/`)) throw new HttpError(400, "Clave no válida.");
  const head = await headObject(key).catch(() => null);
  if (!head) throw new HttpError(400, "No se encontró el archivo subido. Inténtalo de nuevo.");
  if ((head.ContentLength ?? 0) > LOGO_MAX_BYTES) {
    await deleteObject(key);
    throw new HttpError(400, "El logo no puede superar 2 MB.");
  }
  const prev = await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).first();
  await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).update({ logo_s3_key: key, updated_at: now() });
  if (prev?.logo_s3_key && prev.logo_s3_key !== key) await deleteObject(prev.logo_s3_key).catch(() => {});
  res.json(await getBranding(req.tenant.id));
});

adminRouter.delete("/branding/logo", async (req, res) => {
  const prev = await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).first();
  await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).update({ logo_s3_key: null, updated_at: now() });
  if (prev?.logo_s3_key) await deleteObject(prev.logo_s3_key).catch(() => {});
  res.json(await getBranding(req.tenant.id));
});

// ---------- Privacy policy (D24 / D32) ----------

adminRouter.get("/policies", async (req, res) => {
  const rows = await db("gradual_privacy_policies as p")
    .leftJoin("gradual_consents as c", "c.policy_id", "p.id")
    .where("p.tenant_id", req.tenant.id)
    .groupBy("p.id", "p.version", "p.published_at")
    .orderBy("p.version", "desc")
    .select("p.id", "p.version", "p.published_at", db.raw("count(c.id) as acceptances"));
  const body: PolicyVersionDTO[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    publishedAt: iso(r.published_at)!,
    acceptances: Number(r.acceptances),
  }));
  res.json(body);
});

adminRouter.get("/policies/current", async (req, res) => {
  const p = await currentPolicy(req.tenant.id);
  res.json(p ? toPolicyDTO(p) : null);
});

/** Publishing creates a new version; clients must accept it on their next visit. */
adminRouter.post("/policies", async (req, res) => {
  const { content } = parse(publishPolicySchema, req.body);
  const p = await currentPolicy(req.tenant.id);
  if (p && p.content.trim() === content) throw new HttpError(400, "No hay cambios respecto a la versión vigente.");
  const row = {
    id: newId(),
    tenant_id: req.tenant.id,
    version: (p?.version ?? 0) + 1,
    content,
    published_by: req.user!.id,
    published_at: now(),
  };
  await db("gradual_privacy_policies").insert(row);
  res.status(201).json(toPolicyDTO(row));
});
