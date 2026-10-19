import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/knex.js";
import { ensureTenant } from "../src/lib/bootstrap.js";
import { hashPassword } from "../src/lib/session.js";
import { newId, now } from "../src/lib/util.js";
import { outbox } from "../src/lib/mail.js";
import { clearTenantCache } from "../src/middleware/context.js";

export const app = createApp();
export { db, outbox };

const TABLES = [
  "gradual_cv_runs",
  "gradual_cv_prompts",
  "gradual_stage_completions",
  "gradual_route_assignments",
  "gradual_resources",
  "gradual_stages",
  "gradual_routes",
  "gradual_consents",
  "gradual_privacy_policies",
  "gradual_sessions",
  "gradual_auth_tokens",
  "gradual_users",
  "gradual_tenant_settings",
  "gradual_tenants",
];

export async function resetDb() {
  // Safety guard: tests empty the gradual_* tables, so never run them against a non-test database.
  if (!process.env.DB_NAME?.endsWith("_test")) {
    throw new Error(`Tests blocked: DB_NAME="${process.env.DB_NAME}" does not end with _test`);
  }
  await db.migrate.latest();
  await db.raw("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) await db(t).truncate();
  await db.raw("SET FOREIGN_KEY_CHECKS = 1");
  outbox.length = 0;
  clearTenantCache();
  return ensureTenant("gradual", "Gradual");
}

export async function createAdmin(tenantId: string, email = "admin@test.pe", password = "admin-secret-123") {
  await db("gradual_users").insert({
    id: newId(), tenant_id: tenantId, role: "admin", email, name: "Admin",
    password_hash: await hashPassword(password), status: "active", created_at: now(),
  });
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password }).expect(200);
  return agent;
}

/** Invites a client and activates the account; returns a logged-in agent and the client id. */
export async function createClient(admin: request.Agent, email = "maria@test.pe", password = "client-secret-123") {
  const c = await admin.post("/api/v1/admin/clients").send({ email, name: "María" }).expect(201);
  const token = lastToken();
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/invitation/accept").send({ token, name: "María López", password, acceptPolicy: true }).expect(200);
  return { agent, id: c.body.id as string };
}

/** Extracts the token from the last email sent. */
export function lastToken(): string {
  const m = outbox.at(-1)!.text.match(/token=([A-Za-z0-9_-]+)/);
  return m![1]!;
}
