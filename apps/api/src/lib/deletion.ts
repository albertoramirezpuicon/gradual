import { db } from "../db/knex.js";
import { deleteObject } from "./s3.js";

/**
 * Hard-deletes a client and everything that belongs to them (D25 / D53):
 * sessions, tokens, consents, route assignments, stage completions and CV runs cascade from the user row;
 * the original CV PDFs are removed from S3. Returns the number of S3 objects removed.
 */
export async function deleteClientData(tenantId: string, userId: string): Promise<number> {
  const cvKeys: string[] = await db("gradual_cv_runs")
    .where({ tenant_id: tenantId, user_id: userId })
    .whereNotNull("source_s3_key")
    .pluck("source_s3_key");
  await db("gradual_users").where({ id: userId, tenant_id: tenantId, role: "client" }).delete();
  // S3 deletes run after the DB delete; a failed object delete must not resurrect the account.
  const results = await Promise.allSettled(cvKeys.map((k) => deleteObject(k)));
  return results.filter((r) => r.status === "fulfilled").length;
}
