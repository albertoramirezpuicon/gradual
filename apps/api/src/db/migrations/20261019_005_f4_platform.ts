import type { Knex } from "knex";

/**
 * F4 — superadmin role, tenant suspension, impersonation sessions and editable email templates.
 * Only ALTERs on existing gradual_* tables, so no new GRANT is needed (D64).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("gradual_users", (t) => {
    t.enum("role", ["superadmin", "admin", "client"]).notNullable().alter();
  });
  await knex.schema.alterTable("gradual_tenants", (t) => {
    t.enum("status", ["active", "suspended"]).notNullable().defaultTo("active");
  });
  await knex.schema.alterTable("gradual_sessions", (t) => {
    // When set, the session's superadmin is acting as this (admin) user — support mode (D66)
    t.specificType("acting_user_id", "char(26)").nullable();
  });
  await knex.schema.alterTable("gradual_tenant_settings", (t) => {
    // JSON: { [templateKey]: { subject, body, buttonLabel } } — only customized templates are stored (D57)
    t.text("email_templates", "mediumtext").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("gradual_tenant_settings", (t) => t.dropColumn("email_templates"));
  await knex.schema.alterTable("gradual_sessions", (t) => t.dropColumn("acting_user_id"));
  await knex.schema.alterTable("gradual_tenants", (t) => t.dropColumn("status"));
  await knex("gradual_users").where({ role: "superadmin" }).update({ role: "admin" });
  await knex.schema.alterTable("gradual_users", (t) => {
    t.enum("role", ["admin", "client"]).notNullable().alter();
  });
}
