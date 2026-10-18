import type { Knex } from "knex";

/**
 * F1 — routes, stages, resources, route assignments and stage completions.
 * Grants for all five tables already exist in docs/sql/001_gradual_user.sql (D34).
 * Stages and resources are tenant-scoped through their route (route.tenant_id).
 */
export async function up(knex: Knex): Promise<void> {
  const id = (t: Knex.CreateTableBuilder) => t.specificType("id", "char(26)").primary();
  const ref = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "char(26)");
  const ts = (t: Knex.CreateTableBuilder, name: string) => t.specificType(name, "datetime(3)");

  await knex.schema.createTable("gradual_routes", (t) => {
    id(t);
    ref(t, "tenant_id").notNullable().references("gradual_tenants.id");
    t.string("title", 160).notNullable();
    t.text("description").notNullable();
    // Draft routes are invisible to clients (D39)
    t.boolean("published").notNullable().defaultTo(false);
    t.integer("position").notNullable();
    ts(t, "created_at").notNullable();
    ts(t, "updated_at").notNullable();
    t.index(["tenant_id", "position"]);
  });

  await knex.schema.createTable("gradual_stages", (t) => {
    id(t);
    ref(t, "route_id").notNullable().references("gradual_routes.id").onDelete("CASCADE");
    t.string("title", 160).notNullable();
    t.text("description").notNullable();
    t.integer("position").notNullable();
    ts(t, "created_at").notNullable();
    t.index(["route_id", "position"]);
  });

  await knex.schema.createTable("gradual_resources", (t) => {
    id(t);
    ref(t, "stage_id").notNullable().references("gradual_stages.id").onDelete("CASCADE");
    t.enum("type", ["file", "link", "video", "text"]).notNullable();
    t.string("title", 160).notNullable();
    t.text("description").notNullable();
    // file
    t.string("s3_key", 300).nullable();
    t.string("file_name", 200).nullable();
    t.string("mime", 120).nullable();
    t.integer("size_bytes").nullable();
    // link / video
    t.string("url", 2000).nullable();
    t.string("youtube_id", 11).nullable();
    // text (sanitized on write, D37)
    t.text("content_html", "mediumtext").nullable();
    t.integer("position").notNullable();
    ts(t, "created_at").notNullable();
    ts(t, "updated_at").notNullable();
    t.index(["stage_id", "position"]);
  });

  await knex.schema.createTable("gradual_route_assignments", (t) => {
    id(t);
    ref(t, "route_id").notNullable().references("gradual_routes.id").onDelete("CASCADE");
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    ref(t, "assigned_by").nullable();
    ts(t, "assigned_at").notNullable();
    t.unique(["route_id", "user_id"]);
  });

  await knex.schema.createTable("gradual_stage_completions", (t) => {
    id(t);
    ref(t, "stage_id").notNullable().references("gradual_stages.id").onDelete("CASCADE");
    ref(t, "user_id").notNullable().references("gradual_users.id").onDelete("CASCADE");
    // Who marked it: the client themself or the admin (D16)
    ref(t, "marked_by").notNullable();
    ts(t, "marked_at").notNullable();
    t.unique(["stage_id", "user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const t of [
    "gradual_stage_completions",
    "gradual_route_assignments",
    "gradual_resources",
    "gradual_stages",
    "gradual_routes",
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
}
