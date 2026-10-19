import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInvitationSchema,
  acceptConsentSchema,
  changePasswordSchema,
  type InvitationDTO,
  type PolicyDTO,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { HttpError, parse, hashToken, newId, newToken, now, addMs, iso, HOUR } from "../lib/util.js";
import { requireAuth, currentPolicy, type UserRow } from "../middleware/context.js";
import { hashPassword, verifyPassword, dummyVerify, startSession, clearSessionCookie, toMe } from "../lib/session.js";
import { sendMail, resetPasswordMail, deletionRequestedMail, deletionRequestAdminMail } from "../lib/mail.js";
import { getBranding } from "../lib/branding.js";

export const authRouter = Router();

const skip = () => env.NODE_ENV === "test";
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, skip, message: { error: "Demasiados intentos. Espera unos minutos." } });
const forgotLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, skip, message: { error: "Demasiadas solicitudes. Espera unos minutos." } });

const MAX_FAILED_LOGINS = 10;
const LOCK_MS = 15 * 60_000;
const BAD_CREDENTIALS = "Correo o contraseña incorrectos.";

export const toPolicyDTO = (p: { id: string; version: number; content: string; published_at: Date }): PolicyDTO => ({
  id: p.id,
  version: p.version,
  content: p.content,
  publishedAt: iso(p.published_at)!,
});

// ---------- Login / logout / me ----------

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const u: UserRow | undefined = await db("gradual_users").where({ tenant_id: req.tenant.id, email }).first();

  if (!u || u.status !== "active" || !u.password_hash) {
    await dummyVerify(password);
    throw new HttpError(401, BAD_CREDENTIALS);
  }
  if (u.locked_until && new Date(u.locked_until) > now()) {
    throw new HttpError(423, "Tu cuenta está bloqueada temporalmente por varios intentos fallidos. Inténtalo en 15 minutos.");
  }
  const ok = await verifyPassword(u.password_hash, password);
  if (!ok) {
    const fails = u.failed_logins + 1;
    await db("gradual_users")
      .where({ id: u.id })
      .update(
        fails >= MAX_FAILED_LOGINS ? { failed_logins: 0, locked_until: addMs(now(), LOCK_MS) } : { failed_logins: fails },
      );
    throw new HttpError(401, BAD_CREDENTIALS);
  }
  await db("gradual_users").where({ id: u.id }).update({ failed_logins: 0, locked_until: null });
  await startSession(req, res, u.id);
  res.json(await toMe(u));
});

authRouter.post("/logout", async (req, res) => {
  if (req.sessionId) await db("gradual_sessions").where({ id: req.sessionId }).delete();
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await toMe(req.user!));
});

// ---------- Password recovery ----------

authRouter.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const u: UserRow | undefined = await db("gradual_users")
    .where({ tenant_id: req.tenant.id, email, status: "active" })
    .first();
  if (u) {
    await db("gradual_auth_tokens").where({ user_id: u.id, type: "reset" }).whereNull("used_at").update({ used_at: now() });
    const { token, hash } = newToken();
    await db("gradual_auth_tokens").insert({
      id: newId(),
      user_id: u.id,
      type: "reset",
      token_hash: hash,
      expires_at: addMs(now(), HOUR),
      created_at: now(),
    });
    const b = await getBranding(req.tenant.id);
    await sendMail(
      resetPasswordMail({
        to: u.email,
        name: u.name,
        brand: b.brandName,
        color: b.primaryColor,
        url: `${env.APP_BASE_URL}/reset-password?token=${token}`,
      }),
    );
  }
  // Same response whether or not the email exists.
  res.json({ ok: true });
});

async function consumableToken(tenantId: string, token: string, type: "invitation" | "reset") {
  const row = await db("gradual_auth_tokens as t")
    .join("gradual_users as u", "u.id", "t.user_id")
    .where({ "t.token_hash": hashToken(token), "t.type": type, "u.tenant_id": tenantId })
    .whereNull("t.used_at")
    .andWhere("t.expires_at", ">", now())
    .select("t.id as token_id", "u.*")
    .first();
  if (!row) {
    throw new HttpError(
      410,
      type === "invitation"
        ? "Esta invitación no es válida o ya venció. Pide a tu consultora que te envíe una nueva."
        : "Este enlace no es válido o ya venció. Solicita uno nuevo.",
    );
  }
  const { token_id, ...user } = row;
  return { tokenId: token_id as string, user: user as UserRow };
}

authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const { tokenId, user } = await consumableToken(req.tenant.id, token, "reset");
  if (user.status !== "active") throw new HttpError(410, "Este enlace no es válido o ya venció.");
  await db.transaction(async (trx) => {
    await trx("gradual_users")
      .where({ id: user.id })
      .update({ password_hash: await hashPassword(password), failed_logins: 0, locked_until: null });
    await trx("gradual_auth_tokens").where({ id: tokenId }).update({ used_at: now() });
    await trx("gradual_sessions").where({ user_id: user.id }).delete();
  });
  await startSession(req, res, user.id);
  res.json(await toMe(user));
});

// ---------- Invitation (D11 / D27) ----------

authRouter.get("/invitation/:token", async (req, res) => {
  const { user } = await consumableToken(req.tenant.id, req.params.token, "invitation");
  if (user.status !== "invited") throw new HttpError(410, "Esta invitación ya fue utilizada.");
  const p = await currentPolicy(req.tenant.id);
  const body: InvitationDTO = { email: user.email, name: user.name, policy: p ? toPolicyDTO(p) : null };
  res.json(body);
});

authRouter.post("/invitation/accept", async (req, res) => {
  const body = parse(acceptInvitationSchema, req.body);
  const { tokenId, user } = await consumableToken(req.tenant.id, body.token, "invitation");
  if (user.status !== "invited") throw new HttpError(410, "Esta invitación ya fue utilizada.");
  const p = await currentPolicy(req.tenant.id);
  const passwordHash = await hashPassword(body.password);
  await db.transaction(async (trx) => {
    await trx("gradual_users").where({ id: user.id }).update({ name: body.name, password_hash: passwordHash, status: "active" });
    await trx("gradual_auth_tokens").where({ id: tokenId }).update({ used_at: now() });
    if (p) {
      await trx("gradual_consents").insert({
        id: newId(),
        user_id: user.id,
        policy_id: p.id,
        accepted_at: now(),
        ip: req.ip?.slice(0, 45) ?? null,
      });
    }
  });
  await startSession(req, res, user.id);
  res.json(await toMe({ ...user, name: body.name, status: "active" }));
});

// ---------- Consent to a new policy version (D24) ----------

authRouter.get("/policy", async (req, res) => {
  const p = await currentPolicy(req.tenant.id);
  if (!p) throw new HttpError(404, "No hay política publicada.");
  res.json(toPolicyDTO(p));
});

authRouter.post("/consent", requireAuth, async (req, res) => {
  const { policyId } = parse(acceptConsentSchema, req.body);
  const p = await currentPolicy(req.tenant.id);
  if (!p || p.id !== policyId) {
    throw new HttpError(409, "La política cambió mientras la leías. Recarga la página y revísala de nuevo.");
  }
  await db("gradual_consents")
    .insert({ id: newId(), user_id: req.user!.id, policy_id: p.id, accepted_at: now(), ip: req.ip?.slice(0, 45) ?? null })
    .onConflict(["user_id", "policy_id"])
    .ignore();
  res.json(await toMe(req.user!));
});

// ---------- Change password ----------

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const u = req.user!;
  if (!u.password_hash || !(await verifyPassword(u.password_hash, currentPassword))) {
    throw new HttpError(400, "La contraseña actual no es correcta.");
  }
  await db("gradual_users").where({ id: u.id }).update({ password_hash: await hashPassword(newPassword) });
  // Sign out all other open sessions
  await db("gradual_sessions").where({ user_id: u.id }).whereNot({ id: req.sessionId! }).delete();
  res.json({ ok: true });
});

// ---------- Account deletion request (D25 / D52) ----------

/** The client asks to delete their account; the admin is notified and performs the deletion. */
authRouter.post("/deletion-request", requireAuth, async (req, res) => {
  const u = req.user!;
  if (u.role !== "client") throw new HttpError(403, "Solo los clientes pueden solicitar la eliminación de su cuenta.");
  if (!u.deletion_requested_at) {
    const at = now();
    await db("gradual_users").where({ id: u.id }).update({ deletion_requested_at: at });
    u.deletion_requested_at = at;
    const b = await getBranding(req.tenant.id);
    await sendMail(
      deletionRequestedMail({ to: u.email, name: u.name, brand: b.brandName, color: b.primaryColor, url: `${env.APP_BASE_URL}/app/profile` }),
    );
    const admins: UserRow[] = await db("gradual_users").where({ tenant_id: req.tenant.id, role: "admin", status: "active" });
    for (const a of admins) {
      await sendMail(
        deletionRequestAdminMail({
          to: a.email,
          name: a.name,
          brand: b.brandName,
          color: b.primaryColor,
          url: `${env.APP_BASE_URL}/admin/clients/${u.id}`,
          clientName: u.name,
          clientEmail: u.email,
        }),
      );
    }
  }
  res.json(await toMe(u));
});

authRouter.delete("/deletion-request", requireAuth, async (req, res) => {
  const u = req.user!;
  await db("gradual_users").where({ id: u.id }).update({ deletion_requested_at: null });
  u.deletion_requested_at = null;
  res.json(await toMe(u));
});
