import { Router } from "express";
import {
  cvUploadSchema,
  cvRunCreateSchema,
  cvStandardsSchema,
  cvSettingsSchema,
  CV_MAX_BYTES,
  type CvStandardsDTO,
  type ImprovedCv,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { HttpError, parse, newId, now, iso } from "../lib/util.js";
import { requireAuth, requireConsent, requireRole } from "../middleware/context.js";
import { presignPut, headObject, deleteObject, getObjectBytes, keys } from "../lib/s3.js";
import { currentPrompt, clientQuota, extractCvText, loadRun, runSummaryColumns, toRunDTO, toRunSummary } from "../lib/cv.js";
import { renderCvPdf, renderCvDocx, cvFileName } from "../lib/cv-documents.js";

/** CV improver endpoints (F2). Clients act on their own CV; the admin can act on behalf of any client (D18). */
export const cvRouter = Router();
cvRouter.use(requireAuth, requireConsent);

const isAdmin = (role: string) => role === "admin";

/** Resolves whose CV a request is about: the client themself, or `clientId` when the admin acts. */
async function targetClient(tenantId: string, viewer: { id: string; role: string }, clientId?: string) {
  if (!isAdmin(viewer.role)) return viewer.id;
  if (!clientId) throw new HttpError(400, "Elige el cliente.");
  const u = await db("gradual_users").where({ id: clientId, tenant_id: tenantId, role: "client" }).whereNot({ status: "deleted" }).first();
  if (!u) throw new HttpError(404, "Cliente no encontrado.");
  return u.id as string;
}

// ---------- Runs ----------

cvRouter.get("/quota", requireRole("client"), async (req, res) => {
  res.json(await clientQuota(req.user!.id));
});

cvRouter.post("/upload-url", async (req, res) => {
  const { mime, size } = parse(cvUploadSchema, req.body);
  const owner = await targetClient(req.tenant.id, req.user!, typeof req.body.clientId === "string" ? req.body.clientId : undefined);
  if (!isAdmin(req.user!.role) && (await clientQuota(owner)).remaining === 0) {
    throw new HttpError(429, "Ya usaste tus análisis de este mes. Podrás volver a intentarlo el próximo mes.");
  }
  const key = keys.cv(req.tenant.id, owner, newId());
  res.json({ key, url: await presignPut(key, mime, size) });
});

cvRouter.post("/runs", async (req, res) => {
  const { key, fileName, clientId } = parse(cvRunCreateSchema, req.body);
  const owner = await targetClient(req.tenant.id, req.user!, clientId);
  if (!key.startsWith(`t/${req.tenant.id}/cv/${owner}/`)) throw new HttpError(400, "Archivo no válido.");
  // Quota is checked again here, right before queuing (D30)
  if (!isAdmin(req.user!.role) && (await clientQuota(owner)).remaining === 0) {
    await deleteObject(key).catch(() => {});
    throw new HttpError(429, "Ya usaste tus análisis de este mes. Podrás volver a intentarlo el próximo mes.");
  }
  const head = await headObject(key).catch(() => null);
  if (!head) throw new HttpError(400, "No se encontró el archivo subido. Inténtalo de nuevo.");
  if (head.ContentType !== "application/pdf" || (head.ContentLength ?? 0) > CV_MAX_BYTES) {
    await deleteObject(key).catch(() => {});
    throw new HttpError(400, "Sube tu CV en formato PDF de hasta 5 MB.");
  }
  let text: string;
  try {
    text = await extractCvText(await getObjectBytes(key));
  } catch (e) {
    await deleteObject(key).catch(() => {});
    throw e;
  }
  const prompt = await currentPrompt(req.tenant.id);
  const id = newId();
  await db("gradual_cv_runs").insert({
    id,
    tenant_id: req.tenant.id,
    user_id: owner,
    started_by: req.user!.id,
    source_s3_key: key,
    source_file_name: fileName,
    extracted_text: text,
    prompt_id: prompt.id,
    status: "queued",
    created_at: now(),
  });
  res.status(201).json(toRunDTO(await loadRun(req.tenant.id, id, req.user!)));
});

/** History: a client sees their own runs (including admin-started ones, D51); the admin sees all or one client's. */
cvRouter.get("/runs", async (req, res) => {
  const q = db("gradual_cv_runs as r")
    .join("gradual_users as u", "u.id", "r.user_id")
    .where("r.tenant_id", req.tenant.id)
    .orderBy("r.created_at", "desc")
    .limit(200)
    .select(...runSummaryColumns);
  if (!isAdmin(req.user!.role)) q.andWhere("r.user_id", req.user!.id);
  else if (typeof req.query.clientId === "string") q.andWhere("r.user_id", req.query.clientId);
  res.json((await q).map(toRunSummary));
});

cvRouter.get("/runs/:id", async (req, res) => {
  res.json(toRunDTO(await loadRun(req.tenant.id, String(req.params.id), req.user!)));
});

async function improvedCvOf(tenantId: string, id: string, viewer: { id: string; role: string }): Promise<ImprovedCv> {
  const r = toRunDTO(await loadRun(tenantId, id, viewer));
  if (r.status !== "done" || !r.result) throw new HttpError(409, "El análisis aún no está listo.");
  return r.result.improvedCv;
}

async function footerText(tenantId: string): Promise<string> {
  const s = await db("gradual_tenant_settings").where({ tenant_id: tenantId }).first("cv_footer_text");
  return s?.cv_footer_text ?? "";
}

/** Documents are generated on demand from the stored result (D50). */
cvRouter.get("/runs/:id/pdf", async (req, res) => {
  const cv = await improvedCvOf(req.tenant.id, String(req.params.id), req.user!);
  const buf = await renderCvPdf(cv, await footerText(req.tenant.id));
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(cvFileName(cv, "pdf"))}`,
    "Cache-Control": "no-store",
  });
  res.send(buf);
});

cvRouter.get("/runs/:id/docx", async (req, res) => {
  const cv = await improvedCvOf(req.tenant.id, String(req.params.id), req.user!);
  const buf = await renderCvDocx(cv, await footerText(req.tenant.id));
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(cvFileName(cv, "docx"))}`,
    "Cache-Control": "no-store",
  });
  res.send(buf);
});

// ---------- Standards and CV settings (admin) ----------

cvRouter.get("/standards", requireRole("admin"), async (req, res) => {
  const current = await currentPrompt(req.tenant.id);
  const versions = await db("gradual_cv_prompts as p")
    .leftJoin("gradual_cv_runs as r", "r.prompt_id", "p.id")
    .where("p.tenant_id", req.tenant.id)
    .groupBy("p.id", "p.version", "p.created_at")
    .orderBy("p.version", "desc")
    .select("p.id", "p.version", "p.created_at", db.raw("count(r.id) as runs"));
  const body: CvStandardsDTO = {
    current: { id: current.id, version: current.version, standards: current.standards, createdAt: iso(current.created_at)! },
    versions: versions.map((v) => ({ id: v.id, version: v.version, createdAt: iso(v.created_at)!, runs: Number(v.runs) })),
    footerText: await footerText(req.tenant.id),
  };
  res.json(body);
});

/** Saving creates a new version; runs keep pointing at the version they used (D20). */
cvRouter.post("/standards", requireRole("admin"), async (req, res) => {
  const { standards } = parse(cvStandardsSchema, req.body);
  const current = await currentPrompt(req.tenant.id);
  if (current.standards.trim() === standards) throw new HttpError(400, "No hay cambios respecto a la versión vigente.");
  await db("gradual_cv_prompts").insert({
    id: newId(),
    tenant_id: req.tenant.id,
    version: current.version + 1,
    standards,
    created_by: req.user!.id,
    created_at: now(),
  });
  res.status(201).json({ version: current.version + 1 });
});

cvRouter.put("/settings", requireRole("admin"), async (req, res) => {
  const { footerText: text } = parse(cvSettingsSchema, req.body);
  await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).update({ cv_footer_text: text, updated_at: now() });
  res.json({ footerText: text });
});
