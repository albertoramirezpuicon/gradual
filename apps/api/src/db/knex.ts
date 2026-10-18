import knexFactory, { type Knex } from "knex";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../lib/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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
    directory: path.join(here, "migrations"),
    tableName: "gradual_knex_migrations",
    loadExtensions: [".ts", ".js"],
  },
};

export const db = knexFactory(knexConfig);
