import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { ensureTenant } from "../lib/bootstrap.js";
import { hashPassword } from "../lib/session.js";
import { newId, now } from "../lib/util.js";
import { PASSWORD_MIN } from "@gradual/shared";

/**
 * Creates the admin account (or resets its password) and bootstraps the tenant.
 * Usage: npm run create-admin -- --email ana@example.pe --name "Ana Pérez" [--tenant "Consultancy X"] [--domain gradual.example.pe]
 * The password is prompted on the console (or passed with --password, not recommended).
 */
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    tenant: { type: "string", default: "Gradual" },
    domain: { type: "string" },
  },
});

try {
  if (!values.email || !values.name) throw new Error("Missing --email and --name");
  let password = values.password;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password: ");
    rl.close();
  }
  if (password.length < PASSWORD_MIN) throw new Error(`Password must be at least ${PASSWORD_MIN} characters`);

  const t = await ensureTenant(env.DEFAULT_TENANT_SLUG, values.tenant!, values.domain ?? null);
  if (values.domain && t.domain !== values.domain) await db("gradual_tenants").where({ id: t.id }).update({ domain: values.domain });

  const email = values.email.trim().toLowerCase();
  const existing = await db("gradual_users").where({ tenant_id: t.id, email }).first();
  const password_hash = await hashPassword(password);
  if (existing) {
    await db("gradual_users").where({ id: existing.id }).update({ role: "admin", status: "active", password_hash, name: values.name });
    console.log(`Admin updated: ${email}`);
  } else {
    await db("gradual_users").insert({
      id: newId(), tenant_id: t.id, role: "admin", email, name: values.name,
      password_hash, status: "active", created_at: now(),
    });
    console.log(`Admin created: ${email} (tenant ${t.slug})`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
