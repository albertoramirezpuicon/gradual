import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { db } from "../db/knex.js";
import { env } from "../lib/env.js";
import { ensureTenant } from "../lib/bootstrap.js";
import { hashPassword } from "../lib/session.js";
import { newId, now } from "../lib/util.js";
import { PASSWORD_MIN } from "@gradual/shared";

/**
 * Creates the platform owner (superadmin) in the main tenant, or promotes an existing user (D65).
 * Usage: npm run create-superadmin -- --email you@example.com --name "First Last" [--password ...]
 * When promoting an existing account, the password is only changed if one is given.
 * Note: a promoted account stops being that tenant's admin; use support mode to work as an admin.
 */
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
  },
});

try {
  if (!values.email || !values.name) throw new Error("Missing --email and --name");
  const t = await ensureTenant(env.DEFAULT_TENANT_SLUG, "Gradual");
  const email = values.email.trim().toLowerCase();
  const existing = await db("gradual_users").where({ tenant_id: t.id, email }).first();

  let password = values.password;
  if (!password && !(existing?.password_hash)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password: ");
    rl.close();
  }
  if (password !== undefined && password.length < PASSWORD_MIN) {
    throw new Error(`Password must be at least ${PASSWORD_MIN} characters`);
  }
  const password_hash = password ? await hashPassword(password) : undefined;

  if (existing) {
    await db("gradual_users")
      .where({ id: existing.id })
      .update({ role: "superadmin", status: "active", name: values.name, ...(password_hash ? { password_hash } : {}) });
    console.log(`Promoted to superadmin: ${email} (previous role: ${existing.role})`);
  } else {
    await db("gradual_users").insert({
      id: newId(), tenant_id: t.id, role: "superadmin", email, name: values.name,
      password_hash, status: "active", created_at: now(),
    });
    console.log(`Superadmin created: ${email} (tenant ${t.slug})`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
