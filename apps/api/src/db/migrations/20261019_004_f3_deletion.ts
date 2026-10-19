import type { Knex } from "knex";

/**
 * F3 — client deletion requests (D52).
 * Stored as a column on gradual_users (no new table, so no new GRANT is needed).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("gradual_users", (t) => {
    t.specificType("deletion_requested_at", "datetime(3)").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("gradual_users", (t) => t.dropColumn("deletion_requested_at"));
}
