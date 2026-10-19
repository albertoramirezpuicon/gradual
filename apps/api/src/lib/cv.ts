import { extractText, getDocumentProxy } from "unpdf";
import {
  CV_MONTHLY_LIMIT,
  cvResultSchema,
  type CvQuotaDTO,
  type CvResult,
  type CvRunDTO,
  type CvRunSummaryDTO,
  type CvRunStatus,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { env } from "./env.js";
import { HttpError, newId, now, iso, HOUR } from "./util.js";
import { CV_STANDARDS_V1 } from "../db/seeds/cv-standards-v1.js";
import { buildSystemPrompt, buildUserPrompt } from "./cv-prompt.js";
import { providers, costUsd, extractJson, type LlmResponse } from "./llm.js";

// =====================================================================
// Standards prompt (D20): highest version is active; v1 is seeded lazily
// =====================================================================

export async function currentPrompt(tenantId: string) {
  let p = await db("gradual_cv_prompts").where({ tenant_id: tenantId }).orderBy("version", "desc").first();
  if (!p) {
    p = { id: newId(), tenant_id: tenantId, version: 1, standards: CV_STANDARDS_V1, created_by: null, created_at: now() };
    await db("gradual_cv_prompts").insert(p).onConflict(["tenant_id", "version"]).ignore();
    p = await db("gradual_cv_prompts").where({ tenant_id: tenantId }).orderBy("version", "desc").first();
  }
  return p as { id: string; version: number; standards: string; created_at: Date };
}

// =====================================================================
// Monthly quota (D30): runs started by the client, not failed, in the current Lima calendar month
// =====================================================================

/** Start of the current calendar month in America/Lima (UTC-5, no DST), as a UTC Date. */
export function limaMonthStart(at = new Date()): Date {
  const lima = new Date(at.getTime() - 5 * HOUR);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), 1, 5, 0, 0));
}

export async function clientQuota(userId: string): Promise<CvQuotaDTO> {
  const row = await db("gradual_cv_runs")
    .where({ user_id: userId, started_by: userId })
    .whereNot({ status: "failed" })
    .andWhere("created_at", ">=", limaMonthStart())
    .count({ n: "*" })
    .first();
  const used = Number(row?.n ?? 0);
  return { used, limit: CV_MONTHLY_LIMIT, remaining: Math.max(0, CV_MONTHLY_LIMIT - used) };
}

// =====================================================================
// PDF text extraction (D19)
// =====================================================================

/** Minimum characters of extractable text; below this the PDF is treated as a scanned image. */
const MIN_TEXT_CHARS = 200;
const MAX_TEXT_CHARS = 30_000;

export async function extractCvText(bytes: Uint8Array): Promise<string> {
  let text: string;
  try {
    // pdf.js may transfer (detach) the buffer it receives, so it gets its own copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > 6) throw new HttpError(400, "Tu CV tiene más de 6 páginas. Sube una versión más corta.");
    const r = await extractText(pdf, { mergePages: true });
    text = String(r.text);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "No pudimos leer el PDF. Verifica que no esté dañado ni protegido con contraseña.");
  }
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < MIN_TEXT_CHARS) {
    throw new HttpError(
      400,
      "Tu PDF parece ser una imagen escaneada y no tiene texto que podamos leer. Exporta tu CV a PDF desde Word o Google Docs e inténtalo de nuevo.",
    );
  }
  return clean.slice(0, MAX_TEXT_CHARS);
}

// =====================================================================
// Queue + worker (D49)
// =====================================================================

const MAX_ATTEMPTS = 3;
/** Shown to users when a run fails; internal details go to the `error` column only. */
export const FAILED_MESSAGE = "No pudimos analizar tu CV en este momento. Inténtalo de nuevo; este intento no cuenta para tu límite mensual.";

/** Atomically claims a queued run so it is processed only once. */
async function claim(id: string): Promise<boolean> {
  const n = await db("gradual_cv_runs")
    .where({ id, status: "queued" })
    .update({ status: "processing", started_at: now(), attempts: db.raw("attempts + 1") });
  return n === 1;
}

/**
 * Calls providers in order. Each provider gets two tries (the second after an invalid/failed reply),
 * then the next provider is used (D21 / D44).
 */
async function generate(system: string, user: string): Promise<{ res: LlmResponse; result: CvResult }> {
  const list = providers();
  if (!list.length) throw new Error("No LLM provider configured (set at least one *_API_KEY)");
  const errors: string[] = [];
  for (const p of list) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await p.complete({ system, user, maxTokens: 8000 });
        const parsed = cvResultSchema.safeParse(extractJson(res.text));
        if (!parsed.success) throw new Error(`Invalid output: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
        return { res, result: parsed.data };
      } catch (e) {
        errors.push(`${p.name}#${attempt}: ${(e as Error).message}`);
      }
    }
  }
  throw new Error(errors.join(" | ").slice(0, 4000));
}

export async function processRun(id: string): Promise<void> {
  if (!(await claim(id))) return;
  const run = await db("gradual_cv_runs").where({ id }).first();
  const prompt = await db("gradual_cv_prompts").where({ id: run.prompt_id }).first();
  try {
    const { res, result } = await generate(buildSystemPrompt(prompt.standards), buildUserPrompt(run.extracted_text));
    await db("gradual_cv_runs").where({ id }).update({
      status: "done",
      provider: res.provider,
      model: res.model,
      result_json: JSON.stringify(result),
      initial_score: result.initialScore,
      final_score: result.finalScore,
      tokens_in: res.tokensIn,
      tokens_out: res.tokensOut,
      cost_usd: costUsd(res.model, res.tokensIn, res.tokensOut),
      error: null,
      finished_at: now(),
    });
  } catch (e) {
    await db("gradual_cv_runs").where({ id }).update({ status: "failed", error: (e as Error).message.slice(0, 4000), finished_at: now() });
  }
}

let timer: NodeJS.Timeout | null = null;
let busy = false;

/** Polls the queue every 2 s and processes runs one at a time (single EC2 instance, ~30 users). */
export function startCvWorker() {
  if (!env.CV_WORKER || timer) return;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Crash recovery: runs stuck in "processing" for over 10 minutes go back to the queue (or fail).
      const stuckBefore = new Date(Date.now() - 10 * 60_000);
      await db("gradual_cv_runs").where({ status: "processing" }).andWhere("started_at", "<", stuckBefore).andWhere("attempts", "<", MAX_ATTEMPTS).update({ status: "queued" });
      await db("gradual_cv_runs")
        .where({ status: "processing" })
        .andWhere("started_at", "<", stuckBefore)
        .update({ status: "failed", error: "Exceeded max attempts", finished_at: now() });
      const next = await db("gradual_cv_runs").where({ status: "queued" }).orderBy("created_at").first("id");
      if (next) await processRun(next.id);
    } catch (e) {
      console.error("CV worker error:", e);
    } finally {
      busy = false;
    }
  };
  timer = setInterval(tick, 2000);
  console.log("CV worker started");
}

// =====================================================================
// DTOs
// =====================================================================

type RunRow = {
  id: string;
  user_id: string;
  started_by: string;
  status: CvRunStatus;
  source_file_name: string;
  initial_score: number | null;
  final_score: number | null;
  created_at: Date;
  result_json: string | null;
  prompt_version?: number;
  client_name: string;
};

export const runSummaryColumns = [
  "r.id",
  "r.user_id",
  "r.started_by",
  "r.status",
  "r.source_file_name",
  "r.initial_score",
  "r.final_score",
  "r.created_at",
  "u.name as client_name",
];

export function toRunSummary(r: RunRow): CvRunSummaryDTO {
  return {
    id: r.id,
    clientId: r.user_id,
    clientName: r.client_name,
    status: r.status,
    sourceFileName: r.source_file_name,
    startedBy: r.started_by === r.user_id ? "client" : "admin",
    initialScore: r.initial_score,
    finalScore: r.final_score,
    createdAt: iso(r.created_at)!,
  };
}

export function toRunDTO(r: RunRow): CvRunDTO {
  return {
    ...toRunSummary(r),
    result: r.result_json ? (JSON.parse(r.result_json) as CvResult) : null,
    error: r.status === "failed" ? FAILED_MESSAGE : null,
    promptVersion: r.prompt_version ?? 0,
  };
}

/** Loads one run within the tenant; clients may only load their own runs (D51). */
export async function loadRun(tenantId: string, id: string, viewer: { id: string; role: string }) {
  const q = db("gradual_cv_runs as r")
    .join("gradual_users as u", "u.id", "r.user_id")
    .join("gradual_cv_prompts as p", "p.id", "r.prompt_id")
    .where({ "r.id": id, "r.tenant_id": tenantId })
    .select(...runSummaryColumns, "r.result_json", "p.version as prompt_version");
  if (viewer.role === "client") q.andWhere("r.user_id", viewer.id);
  const r = await q.first();
  if (!r) throw new HttpError(404, "Análisis no encontrado.");
  return r as RunRow;
}
