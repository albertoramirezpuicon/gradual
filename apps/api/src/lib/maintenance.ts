import { db } from "../db/knex.js";
import { deleteObject } from "./s3.js";
import { now, DAY } from "./util.js";

/** Original CV PDFs are kept this many days, then deleted; the analysis result stays (D28). */
export const CV_SOURCE_RETENTION_DAYS = 180;

export interface MaintenanceReport {
  cvSourcesPurged: number;
  sessionsDeleted: number;
  tokensDeleted: number;
}

/** Daily housekeeping (D54). Idempotent: safe to run any number of times. */
export async function runMaintenance(at = new Date()): Promise<MaintenanceReport> {
  const cutoff = new Date(at.getTime() - CV_SOURCE_RETENTION_DAYS * DAY);
  const old = await db("gradual_cv_runs").whereNotNull("source_s3_key").andWhere("created_at", "<", cutoff).select("id", "source_s3_key");
  let cvSourcesPurged = 0;
  for (const r of old) {
    try {
      await deleteObject(r.source_s3_key);
      await db("gradual_cv_runs").where({ id: r.id }).update({ source_s3_key: null });
      cvSourcesPurged++;
    } catch (e) {
      console.error(`Maintenance: could not delete ${r.source_s3_key}:`, (e as Error).message);
    }
  }
  const sessionsDeleted = await db("gradual_sessions").where("expires_at", "<", at).delete();
  // Used or expired auth tokens are useless after a day
  const tokensDeleted = await db("gradual_auth_tokens")
    .where((q) => q.whereNotNull("used_at").orWhere("expires_at", "<", at))
    .andWhere("created_at", "<", new Date(at.getTime() - DAY))
    .delete();
  return { cvSourcesPurged, sessionsDeleted, tokensDeleted };
}

let timer: NodeJS.Timeout | null = null;

/** Runs maintenance shortly after startup and then every 24 hours. */
export function startMaintenance() {
  if (timer) return;
  const run = () =>
    runMaintenance()
      .then((r) => console.log(`Maintenance done at ${now().toISOString()}:`, r))
      .catch((e) => console.error("Maintenance error:", e));
  setTimeout(run, 60_000);
  timer = setInterval(run, DAY);
}
