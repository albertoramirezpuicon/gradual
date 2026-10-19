import knexFactory, { type Knex } from "knex";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { env } from "../lib/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, "migrations");
const MIGRATIONS_TABLE = "gradual_knex_migrations";

/**
 * Migration names are recorded WITHOUT their extension, so the same history works whether migrations
 * run from TypeScript sources (development, tsx) or compiled JavaScript (production, dist/).
 */
const migrationSource: Knex.MigrationSource<string> = {
  async getMigrations() {
    const files = await readdir(MIGRATIONS_DIR);
    return files.filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts")).sort();
  },
  getMigrationName: (file) => file.replace(/\.(ts|js)$/, ""),
  getMigration: (file) => import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href),
};

/**
 * Convention (D33): EVERY table uses the `gradual_` prefix, including the migrations table,
 * because the database is shared with other projects. A test enforces this.
 */
export const knexConfig: Knex.Config = {
  client: "mysql2",
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: "utf8mb4",
    // Everything is stored in UTC (D7)
    timezone: "Z",
    dateStrings: false,
  },
  pool: { min: 0, max: 10 },
  migrations: {
    tableName: MIGRATIONS_TABLE,
    migrationSource,
  },
};

export const db = knexFactory(knexConfig);

/**
 * Applies pending migrations. First strips ".ts"/".js" from names recorded by older versions
 * (which used file names with extensions), so existing databases keep a consistent history.
 */
export async function migrateLatest() {
  if (await db.schema.hasTable(MIGRATIONS_TABLE)) {
    const rows: { id: number; name: string }[] = await db(MIGRATIONS_TABLE).select("id", "name");
    for (const r of rows) {
      const clean = r.name.replace(/\.(ts|js)$/, "");
      if (clean !== r.name) await db(MIGRATIONS_TABLE).where({ id: r.id }).update({ name: clean });
    }
  }
  return db.migrate.latest();
}
