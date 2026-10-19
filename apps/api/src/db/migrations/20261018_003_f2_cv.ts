import type { Knex } from "knex";

/**
 * F2 — CV improver: versioned standards prompts, runs (queue + results) and the CV footer setting.
 * Grants for gradual_cv_prompts and gradual_cv_runs already exist in docs/sql/001_gradual_user.sql (D34);
 * gradual_tenant_settings is altered, which ALL PRIVILEGES on that table already allows.
 */
export async function up(knex: Knex): Promise<void> {
  const id = (t: Knex.CreateTableBuilder) => t.specificType("id", "char(26)").primary();
  const ref = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "char(26)");
  const ts = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "datetime(3)");

  // Each save creates a new version; the highest version is the active one (D20).
  await knex.schema.createTable("gradual_cv_prompts", (t) => {
    id(t);
    ref(t, "tenant_id").notNullable().references("gradual_tenants.id");
    t.integer("version").notNullable();
    t.text("standards", "mediumtext").notNullable();
    ref(t, "created_by").nullable();
    ts(t, "created_at").notNullable();
    t.unique(["tenant_id", "version"]);
  });

  await knex.schema.createTable("gradual_cv_runs", (t) => {
    id(t);
    ref(t, "tenant_id").notNullable().references("gradual_tenants.id");
    // The client whose CV this is
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    // Who started it: the client or the admin (admin runs do not count toward the quota, D30)
    ref(t, "started_by").notNullable();
    // Original PDF; purged after 180 days (D28), so it may become null
    t.string("source_s3_key", 300).nullable();
    t.string("source_file_name", 200).notNullable();
    t.text("extracted_text", "mediumtext").notNullable();
    ref(t, "prompt_id").notNullable().references("gradual_cv_prompts.id");
    t.enum("status", ["queued", "processing", "done", "failed"]).notNullable();
    t.integer("attempts").notNullable().defaultTo(0);
    t.string("provider", 30).nullable();
    t.string("model", 80).nullable();
    t.text("result_json", "mediumtext").nullable();
    t.integer("initial_score").nullable();
    t.integer("final_score").nullable();
    t.integer("tokens_in").nullable();
    t.integer("tokens_out").nullable();
    t.decimal("cost_usd", 10, 5).nullable();
    // Internal error detail (provider messages); never shown to users
    t.text("error").nullable();
    ts(t, "created_at").notNullable();
    ts(t, "started_at").nullable();
    ts(t, "finished_at").nullable();
    t.index(["tenant_id", "status", "created_at"]);
    t.index(["user_id", "created_at"]);
  });

  await knex.schema.alterTable("gradual_tenant_settings", (t) => {
    // Footer printed on generated CVs; empty string hides it (D47)
    t.string("cv_footer_text", 120).notNullable().defaultTo("Creado con la ayuda de Gradual");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("gradual_tenant_settings", (t) => t.dropColumn("cv_footer_text"));
  await knex.schema.dropTableIfExists("gradual_cv_runs");
  await knex.schema.dropTableIfExists("gradual_cv_prompts");
}
