import type { Request, Response } from "express";
import { hash, verify } from "@node-rs/argon2";
import { db } from "../db/knex.js";
import { env } from "./env.js";
import { newId, newToken, now, addMs, DAY } from "./util.js";
import { SESSION_COOKIE, type UserRow, needsConsent } from "../middleware/context.js";
import type { Me } from "@gradual/shared";

// argon2id with OWASP parameters (m=19 MiB, t=2, p=1)
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (p: string) => hash(p, ARGON);
export const verifyPassword = (h: string, p: string) => verify(h, p).catch(() => false);

/** Fixed hash used to equalize timing when the email does not exist (prevents timing-based enumeration). */
let dummyHash: string | null = null;
export async function dummyVerify(p: string) {
  dummyHash ??= await hashPassword("dummy-password-to-equalize-timing");
  await verifyPassword(dummyHash, p);
}

export async function startSession(req: Request, res: Response, userId: string) {
  const { token, hash } = newToken();
  const life = env.SESSION_DAYS * DAY;
  await db("gradual_sessions").insert({
    id: newId(),
    user_id: userId,
    token_hash: hash,
    expires_at: addMs(now(), life),
    ip: req.ip?.slice(0, 45) ?? null,
    user_agent: req.get("user-agent")?.slice(0, 300) ?? null,
    created_at: now(),
  });
  await db("gradual_users").where({ id: userId }).update({ last_login_at: now() });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: life,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function toMe(u: UserRow): Promise<Me> {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    deletionRequestedAt: u.deletion_requested_at ? new Date(u.deletion_requested_at).toISOString() : null,
    requiresConsent: await needsConsent(u),
  };
}
