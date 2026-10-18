import { db } from "../db/knex.js";

// Usage: npm run migrate             → apply pending migrations
//        npm run migrate -- rollback → roll back the last batch
const cmd = process.argv[2] ?? "latest";
try {
  if (cmd === "rollback") {
    const [batch, files] = await db.migrate.rollback();
    console.log(`Rolled back batch ${batch}:`, files);
  } else {
    const [batch, files] = await db.migrate.latest();
    console.log(files.length ? `Applied batch ${batch}:` : "No pending migrations.", files);
  }
} finally {
  await db.destroy();
}
