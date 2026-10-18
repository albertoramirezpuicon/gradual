import type { Knex } from "knex";

/**
 * F0 — tenants, branding settings, users, auth tokens, sessions, privacy policy versions and consents.
 * IDs: ULID (char 26). Timestamps: DATETIME(3) in UTC.
 * Every table must be listed in docs/sql/001_gradual_user.sql (D34).
 */
export async function up(knex: Knex): Promise<void> {
  const id = (t: Knex.CreateTableBuilder) => t.specificType("id", "char(26)").primary();
  const ref = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "char(26)");
  const ts = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "datetime(3)");

  await knex.schema.createTable("gradual_tenants", (t) => {
    id(t);
    t.string("slug", 60).notNullable().unique();
    t.string("name", 120).notNullable();
    t.string("domain", 190).nullable().unique();
    ts(t, "created_at").notNullable();
  });

  await knex.schema.createTable("gradual_tenant_settings", (t) => {
    ref(t, "tenant_id").primary().references("gradual_tenants.id").onDelete("CASCADE");
    t.string("brand_name", 80).notNullable();
    t.string("primary_color", 7).notNullable();
    t.string("secondary_color", 7).notNullable();
    t.string("font", 60).notNullable();
    t.string("logo_s3_key", 300).nullable();
    ts(t, "updated_at").notNullable();
  });

  await knex.schema.createTable("gradual_users", (t) => {
    id(t);
    ref(t, "tenant_id").notNullable().references("gradual_tenants.id");
    t.enum("role", ["admin", "client"]).notNullable();
    t.string("email", 254).notNullable();
    t.string("name", 120).notNullable();
    t.string("password_hash", 255).nullable();
    t.enum("status", ["invited", "active", "deleted"]).notNullable();
    t.integer("failed_logins").notNullable().defaultTo(0);
    ts(t, "locked_until").nullable();
    ts(t, "last_login_at").nullable();
    ref(t, "invited_by").nullable();
    ts(t, "created_at").notNullable();
    t.unique(["tenant_id", "email"]);
  });

  await knex.schema.createTable("gradual_auth_tokens", (t) => {
    id(t);
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    t.enum("type", ["invitation", "reset"]).notNullable();
    t.string("token_hash", 64).notNullable().unique();
    ts(t, "expires_at").notNullable();
    ts(t, "used_at").nullable();
    ts(t, "created_at").notNullable();
  });

  await knex.schema.createTable("gradual_sessions", (t) => {
    id(t);
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    t.string("token_hash", 64).notNullable().unique();
    ts(t, "expires_at").notNullable();
    t.string("ip", 45).nullable();
    t.string("user_agent", 300).nullable();
    ts(t, "created_at").notNullable();
  });

  await knex.schema.createTable("gradual_privacy_policies", (t) => {
    id(t);
    ref(t, "tenant_id").notNullable().references("gradual_tenants.id");
    t.integer("version").notNullable();
    t.text("content", "mediumtext").notNullable();
    ref(t, "published_by").nullable();
    ts(t, "published_at").notNullable();
    t.unique(["tenant_id", "version"]);
  });

  await knex.schema.createTable("gradual_consents", (t) => {
    id(t);
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    ref(t, "policy_id").notNullable().references("gradual_privacy_policies.id");
    ts(t, "accepted_at").notNullable();
    t.string("ip", 45).nullable();
    t.unique(["user_id", "policy_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const t of [
    "gradual_consents",
    "gradual_privacy_policies",
    "gradual_sessions",
    "gradual_auth_tokens",
    "gradual_users",
    "gradual_tenant_settings",
    "gradual_tenants",
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
}
