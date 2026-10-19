import { Router } from "express";
import {
  routeCreateSchema,
  routeUpdateSchema,
  stageSchema,
  moveSchema,
  resourceSchema,
  resourceUpdateSchema,
  resourceUploadSchema,
  completionSchema,
  clientRoutesSchema,
  deleteClientSchema,
  parseYouTubeId,
  RESOURCE_MIME,
  RESOURCE_MAX_BYTES,
  type ResourceMime,
  type RouteSummaryDTO,
  type RouteProgressDTO,
  type ClientDetailDTO,
} from "@gradual/shared";
import { db } from "../db/knex.js";
import { HttpError, parse, newId, now, iso } from "../lib/util.js";
import { requireRole, type UserRow } from "../middleware/context.js";
import { presignPut, headObject, deleteObject, keys } from "../lib/s3.js";
import { sanitizeRichText } from "../lib/sanitize.js";
import { deleteClientData } from "../lib/deletion.js";
import {
  getRoute,
  getStage,
  getResource,
  nextPosition,
  moveItem,
  loadRouteDetail,
  loadCompletions,
  toResourceDTO,
  type ResourceRow,
} from "../lib/routes.js";

/** Admin endpoints for routes, stages, resources, assignments and progress (F1). */
export const adminRoutesRouter = Router();
adminRoutesRouter.use(requireRole("admin"));

/** Deletes S3 objects best-effort; a failed delete must not block removing the DB rows. */
async function deleteObjects(keysToDelete: (string | null)[]) {
  await Promise.all(keysToDelete.filter((k): k is string => !!k).map((k) => deleteObject(k).catch(() => {})));
}

// =====================================================================
// Routes
// =====================================================================

adminRoutesRouter.get("/routes", async (req, res) => {
  const rows = await db("gradual_routes as r")
    .where("r.tenant_id", req.tenant.id)
    .orderBy("r.position")
    .select(
      "r.*",
      db("gradual_stages").count("*").whereRaw("route_id = r.id").as("stage_count"),
      db("gradual_route_assignments").count("*").whereRaw("route_id = r.id").as("assigned_count"),
    );
  const body: RouteSummaryDTO[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    published: Boolean(r.published),
    position: r.position,
    stageCount: Number(r.stage_count),
    assignedCount: Number(r.assigned_count),
  }));
  res.json(body);
});

adminRoutesRouter.post("/routes", async (req, res) => {
  const { title, description } = parse(routeCreateSchema, req.body);
  const row = {
    id: newId(),
    tenant_id: req.tenant.id,
    title,
    description,
    published: false,
    position: await nextPosition("gradual_routes", { tenant_id: req.tenant.id }),
    created_at: now(),
    updated_at: now(),
  };
  await db("gradual_routes").insert(row);
  res.status(201).json(await loadRouteDetail(row));
});

adminRoutesRouter.get("/routes/:id", async (req, res) => {
  res.json(await loadRouteDetail(await getRoute(req.tenant.id, req.params.id)));
});

adminRoutesRouter.put("/routes/:id", async (req, res) => {
  const route = await getRoute(req.tenant.id, req.params.id);
  const { title, description, published } = parse(routeUpdateSchema, req.body);
  await db("gradual_routes").where({ id: route.id }).update({ title, description, published, updated_at: now() });
  res.json(await loadRouteDetail(await getRoute(req.tenant.id, route.id)));
});

adminRoutesRouter.delete("/routes/:id", async (req, res) => {
  const route = await getRoute(req.tenant.id, req.params.id);
  const files = await db("gradual_resources as x")
    .join("gradual_stages as s", "s.id", "x.stage_id")
    .where("s.route_id", route.id)
    .pluck("x.s3_key");
  // Stages, resources, assignments and completions cascade (D40)
  await db("gradual_routes").where({ id: route.id }).delete();
  await deleteObjects(files);
  res.json({ ok: true });
});

adminRoutesRouter.post("/routes/:id/move", async (req, res) => {
  const { direction } = parse(moveSchema, req.body);
  await moveItem("gradual_routes", { tenant_id: req.tenant.id }, req.params.id, direction);
  res.json({ ok: true });
});

// =====================================================================
// Stages
// =====================================================================

adminRoutesRouter.post("/routes/:id/stages", async (req, res) => {
  const route = await getRoute(req.tenant.id, req.params.id);
  const { title, description } = parse(stageSchema, req.body);
  await db("gradual_stages").insert({
    id: newId(),
    route_id: route.id,
    title,
    description,
    position: await nextPosition("gradual_stages", { route_id: route.id }),
    created_at: now(),
  });
  res.status(201).json(await loadRouteDetail(route));
});

adminRoutesRouter.put("/stages/:id", async (req, res) => {
  const stage = await getStage(req.tenant.id, req.params.id);
  const { title, description } = parse(stageSchema, req.body);
  await db("gradual_stages").where({ id: stage.id }).update({ title, description });
  res.json(await loadRouteDetail(await getRoute(req.tenant.id, stage.route_id)));
});

adminRoutesRouter.delete("/stages/:id", async (req, res) => {
  const stage = await getStage(req.tenant.id, req.params.id);
  const files = await db("gradual_resources").where({ stage_id: stage.id }).pluck("s3_key");
  await db("gradual_stages").where({ id: stage.id }).delete();
  await deleteObjects(files);
  res.json(await loadRouteDetail(await getRoute(req.tenant.id, stage.route_id)));
});

adminRoutesRouter.post("/stages/:id/move", async (req, res) => {
  const stage = await getStage(req.tenant.id, req.params.id);
  const { direction } = parse(moveSchema, req.body);
  await moveItem("gradual_stages", { route_id: stage.route_id }, stage.id, direction);
  res.json(await loadRouteDetail(await getRoute(req.tenant.id, stage.route_id)));
});

// =====================================================================
// Resources
// =====================================================================

/** Step 1 of a file upload: signed PUT URL for a tenant-scoped key. */
adminRoutesRouter.post("/resources/upload-url", async (req, res) => {
  const { mime, size } = parse(resourceUploadSchema, req.body);
  const key = keys.resource(req.tenant.id, newId(), RESOURCE_MIME[mime]);
  res.json({ key, url: await presignPut(key, mime, size) });
});

/** Verifies an uploaded object belongs to the tenant, exists, and has an allowed type and size. */
async function verifyUploadedFile(tenantId: string, key: string) {
  if (!key.startsWith(`t/${tenantId}/resources/`)) throw new HttpError(400, "Archivo no válido.");
  const head = await headObject(key).catch(() => null);
  if (!head) throw new HttpError(400, "No se encontró el archivo subido. Inténtalo de nuevo.");
  const mime = (head.ContentType ?? "") as ResourceMime;
  const size = head.ContentLength ?? 0;
  if (!(mime in RESOURCE_MIME) || size > RESOURCE_MAX_BYTES) {
    await deleteObject(key).catch(() => {});
    throw new HttpError(400, "El archivo no es válido. Usa PDF, DOCX o PPTX de hasta 20 MB.");
  }
  return { mime, size };
}

/** Maps a validated payload to the type-specific columns; all other type columns are cleared. */
async function typeColumns(tenantId: string, input: ReturnType<typeof parseResource>, current?: ResourceRow) {
  const empty = { s3_key: null, file_name: null, mime: null, size_bytes: null, url: null, youtube_id: null, content_html: null };
  switch (input.type) {
    case "file": {
      if (!input.key) {
        if (current?.type !== "file") throw new HttpError(400, "Sube un archivo.");
        return { ...empty, s3_key: current.s3_key, file_name: input.fileName ?? current.file_name, mime: current.mime, size_bytes: current.size_bytes };
      }
      const { mime, size } = await verifyUploadedFile(tenantId, input.key);
      return { ...empty, s3_key: input.key, file_name: input.fileName ?? "archivo", mime, size_bytes: size };
    }
    case "link":
      return { ...empty, url: input.url };
    case "video":
      return { ...empty, url: input.url, youtube_id: parseYouTubeId(input.url) };
    case "text":
      return { ...empty, content_html: sanitizeRichText(input.html) };
  }
}

const parseResource = (body: unknown) => parse(resourceUpdateSchema, body);

adminRoutesRouter.post("/stages/:id/resources", async (req, res) => {
  const stage = await getStage(req.tenant.id, req.params.id);
  const input = parse(resourceSchema, req.body);
  const row = {
    id: newId(),
    stage_id: stage.id,
    type: input.type,
    title: input.title,
    description: input.description,
    ...(await typeColumns(req.tenant.id, input)),
    position: await nextPosition("gradual_resources", { stage_id: stage.id }),
    created_at: now(),
    updated_at: now(),
  };
  await db("gradual_resources").insert(row);
  res.status(201).json(toResourceDTO(row as ResourceRow));
});

adminRoutesRouter.put("/resources/:id", async (req, res) => {
  const current = await getResource(req.tenant.id, req.params.id);
  const input = parseResource(req.body);
  const cols = await typeColumns(req.tenant.id, input, current);
  await db("gradual_resources")
    .where({ id: current.id })
    .update({ type: input.type, title: input.title, description: input.description, ...cols, updated_at: now() });
  // Remove the previous file if it was replaced or the resource changed type
  if (current.s3_key && current.s3_key !== cols.s3_key) await deleteObjects([current.s3_key]);
  res.json(toResourceDTO((await db("gradual_resources").where({ id: current.id }).first()) as ResourceRow));
});

adminRoutesRouter.delete("/resources/:id", async (req, res) => {
  const r = await getResource(req.tenant.id, req.params.id);
  await db("gradual_resources").where({ id: r.id }).delete();
  await deleteObjects([r.s3_key]);
  res.json({ ok: true });
});

adminRoutesRouter.post("/resources/:id/move", async (req, res) => {
  const r = await getResource(req.tenant.id, req.params.id);
  const { direction } = parse(moveSchema, req.body);
  await moveItem("gradual_resources", { stage_id: r.stage_id }, r.id, direction);
  res.json({ ok: true });
});

// =====================================================================
// Assignments and progress (D13, D16, D41)
// =====================================================================

async function getClient(tenantId: string, id: string): Promise<UserRow> {
  const u = await db("gradual_users").where({ id, tenant_id: tenantId, role: "client" }).whereNot({ status: "deleted" }).first();
  if (!u) throw new HttpError(404, "Cliente no encontrado.");
  return u;
}

adminRoutesRouter.get("/clients/:id", async (req, res) => {
  const u = await getClient(req.tenant.id, req.params.id);
  const assigned = await db("gradual_route_assignments as a")
    .join("gradual_routes as r", "r.id", "a.route_id")
    .where({ "a.user_id": u.id, "r.tenant_id": req.tenant.id })
    .orderBy("r.position")
    .select("r.id", "r.title", "r.published");
  const stages = assigned.length
    ? await db("gradual_stages")
        .whereIn(
          "route_id",
          assigned.map((r) => r.id),
        )
        .orderBy("position")
    : [];
  const completions = await loadCompletions(
    u.id,
    stages.map((s) => s.id),
  );
  const doneBy = new Map(completions.map((c) => [c.stageId, c]));
  const all = await db("gradual_routes").where({ tenant_id: req.tenant.id }).orderBy("position").select("id", "title", "published");
  const body: ClientDetailDTO = {
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    createdAt: iso(u.created_at)!,
    lastLoginAt: iso(u.last_login_at),
    deletionRequestedAt: iso(u.deletion_requested_at),
    routes: assigned.map((r) => ({
      id: r.id,
      title: r.title,
      published: Boolean(r.published),
      stages: stages
        .filter((s) => s.route_id === r.id)
        .map((s) => ({ id: s.id, title: s.title, done: doneBy.get(s.id) ?? null })),
    })),
    availableRoutes: all.map((r) => ({ id: r.id, title: r.title, published: Boolean(r.published) })),
  };
  res.json(body);
});

/**
 * Permanently deletes a client and all their data (D25 / D53).
 * The admin must type the client's exact name to confirm.
 */
adminRoutesRouter.delete("/clients/:id", async (req, res) => {
  const u = await getClient(req.tenant.id, req.params.id);
  const { confirmName } = parse(deleteClientSchema, req.body);
  if (confirmName.trim().toLowerCase() !== u.name.trim().toLowerCase()) {
    throw new HttpError(400, "El nombre no coincide. Escríbelo exactamente como aparece para confirmar.");
  }
  const filesRemoved = await deleteClientData(req.tenant.id, u.id);
  res.json({ ok: true, filesRemoved });
});

/** Replaces the set of routes assigned to a client. Progress is kept if a route is re-assigned later. */
adminRoutesRouter.put("/clients/:id/routes", async (req, res) => {
  const u = await getClient(req.tenant.id, req.params.id);
  const { routeIds } = parse(clientRoutesSchema, req.body);
  const unique = [...new Set(routeIds)];
  const valid = unique.length
    ? await db("gradual_routes").where({ tenant_id: req.tenant.id }).whereIn("id", unique).pluck("id")
    : [];
  if (valid.length !== unique.length) throw new HttpError(400, "Alguna de las rutas no existe.");
  await db.transaction(async (trx) => {
    await trx("gradual_route_assignments").where({ user_id: u.id }).whereNotIn("route_id", unique).delete();
    const existing: string[] = await trx("gradual_route_assignments").where({ user_id: u.id }).pluck("route_id");
    const toAdd = unique.filter((id) => !existing.includes(id));
    if (toAdd.length) {
      await trx("gradual_route_assignments").insert(
        toAdd.map((route_id) => ({ id: newId(), route_id, user_id: u.id, assigned_by: req.user!.id, assigned_at: now() })),
      );
    }
  });
  res.json({ ok: true });
});

/** The admin marks or unmarks a stage as done on behalf of a client. */
adminRoutesRouter.put("/clients/:clientId/stages/:stageId/completion", async (req, res) => {
  const u = await getClient(req.tenant.id, req.params.clientId);
  const stage = await getStage(req.tenant.id, req.params.stageId);
  const { done } = parse(completionSchema, req.body);
  const assigned = await db("gradual_route_assignments").where({ route_id: stage.route_id, user_id: u.id }).first();
  if (!assigned) throw new HttpError(409, "Esta ruta no está asignada al cliente.");
  await setCompletion(stage.id, u.id, req.user!.id, done);
  res.json({ ok: true });
});

export async function setCompletion(stageId: string, userId: string, markedBy: string, done: boolean) {
  if (done) {
    await db("gradual_stage_completions")
      .insert({ id: newId(), stage_id: stageId, user_id: userId, marked_by: markedBy, marked_at: now() })
      .onConflict(["stage_id", "user_id"])
      .ignore();
  } else {
    await db("gradual_stage_completions").where({ stage_id: stageId, user_id: userId }).delete();
  }
}

/** Client × stage matrix for one route. */
adminRoutesRouter.get("/routes/:id/progress", async (req, res) => {
  const route = await getRoute(req.tenant.id, req.params.id);
  const stages = await db("gradual_stages").where({ route_id: route.id }).orderBy("position").select("id", "title");
  const clients = await db("gradual_route_assignments as a")
    .join("gradual_users as u", "u.id", "a.user_id")
    .where({ "a.route_id": route.id })
    .whereNot("u.status", "deleted")
    .orderBy("u.name")
    .select("u.id", "u.name", "u.email");
  const done = stages.length
    ? await db("gradual_stage_completions")
        .whereIn(
          "stage_id",
          stages.map((s) => s.id),
        )
        .select("stage_id", "user_id")
    : [];
  const body: RouteProgressDTO = {
    stages,
    clients: clients.map((c) => ({
      ...c,
      doneStageIds: done.filter((d) => d.user_id === c.id).map((d) => d.stage_id),
    })),
  };
  res.json(body);
});
