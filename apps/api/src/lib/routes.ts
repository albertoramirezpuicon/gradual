import type { Knex } from "knex";
import type { ResourceDTO, RouteDetailDTO, StageDTO, StageCompletionDTO } from "@gradual/shared";
import { db } from "../db/knex.js";
import { HttpError, iso } from "./util.js";

// ---------- Row types ----------

export interface RouteRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  published: number | boolean;
  position: number;
  created_at: Date;
  updated_at: Date;
}

export interface StageRow {
  id: string;
  route_id: string;
  title: string;
  description: string;
  position: number;
}

export interface ResourceRow {
  id: string;
  stage_id: string;
  type: ResourceDTO["type"];
  title: string;
  description: string;
  s3_key: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  url: string | null;
  youtube_id: string | null;
  content_html: string | null;
  position: number;
}

// ---------- Tenant-scoped lookups (stages/resources are scoped through their route) ----------

export async function getRoute(tenantId: string, routeId: string): Promise<RouteRow> {
  const r = await db("gradual_routes").where({ id: routeId, tenant_id: tenantId }).first();
  if (!r) throw new HttpError(404, "Ruta no encontrada.");
  return r;
}

export async function getStage(tenantId: string, stageId: string): Promise<StageRow & { tenant_id: string }> {
  const s = await db("gradual_stages as s")
    .join("gradual_routes as r", "r.id", "s.route_id")
    .where({ "s.id": stageId, "r.tenant_id": tenantId })
    .select("s.*", "r.tenant_id")
    .first();
  if (!s) throw new HttpError(404, "Etapa no encontrada.");
  return s;
}

export async function getResource(tenantId: string, resourceId: string): Promise<ResourceRow & { route_id: string }> {
  const r = await db("gradual_resources as x")
    .join("gradual_stages as s", "s.id", "x.stage_id")
    .join("gradual_routes as r", "r.id", "s.route_id")
    .where({ "x.id": resourceId, "r.tenant_id": tenantId })
    .select("x.*", "s.route_id")
    .first();
  if (!r) throw new HttpError(404, "Recurso no encontrado.");
  return r;
}

/** Next position at the end of a list (max + 1). */
export async function nextPosition(table: string, where: Record<string, string>): Promise<number> {
  const row = await db(table).where(where).max({ m: "position" }).first();
  return (Number(row?.m) || 0) + 1;
}

/**
 * Swaps an item with its neighbour above/below within the same parent (D36).
 * No-op when already at the edge.
 */
export async function moveItem(table: string, parent: Record<string, string>, id: string, direction: "up" | "down") {
  await db.transaction(async (trx: Knex.Transaction) => {
    const item = await trx(table).where({ id, ...parent }).first();
    if (!item) throw new HttpError(404, "Elemento no encontrado.");
    const neighbour = await trx(table)
      .where(parent)
      .andWhere("position", direction === "up" ? "<" : ">", item.position)
      .orderBy("position", direction === "up" ? "desc" : "asc")
      .first();
    if (!neighbour) return;
    await trx(table).where({ id: item.id }).update({ position: neighbour.position });
    await trx(table).where({ id: neighbour.id }).update({ position: item.position });
  });
}

// ---------- DTO builders ----------

export const toResourceDTO = (r: ResourceRow): ResourceDTO => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  position: r.position,
  fileName: r.file_name,
  mime: r.mime,
  sizeBytes: r.size_bytes,
  url: r.url,
  youtubeId: r.youtube_id,
  html: r.content_html,
});

/** Loads a route with all stages and resources, ordered by position. */
export async function loadRouteDetail(route: RouteRow): Promise<RouteDetailDTO> {
  const stages: StageRow[] = await db("gradual_stages").where({ route_id: route.id }).orderBy("position");
  const resources: ResourceRow[] = stages.length
    ? await db("gradual_resources")
        .whereIn(
          "stage_id",
          stages.map((s) => s.id),
        )
        .orderBy("position")
    : [];
  const byStage = new Map<string, ResourceDTO[]>();
  for (const r of resources) {
    const list = byStage.get(r.stage_id) ?? [];
    list.push(toResourceDTO(r));
    byStage.set(r.stage_id, list);
  }
  return {
    id: route.id,
    title: route.title,
    description: route.description,
    published: Boolean(route.published),
    position: route.position,
    stages: stages.map(
      (s): StageDTO => ({
        id: s.id,
        title: s.title,
        description: s.description,
        position: s.position,
        resources: byStage.get(s.id) ?? [],
      }),
    ),
  };
}

/** Completions of one user over the given stages, tagged with who marked them. */
export async function loadCompletions(userId: string, stageIds: string[]): Promise<StageCompletionDTO[]> {
  if (!stageIds.length) return [];
  const rows = await db("gradual_stage_completions").where({ user_id: userId }).whereIn("stage_id", stageIds);
  return rows.map((c) => ({
    stageId: c.stage_id,
    markedBy: c.marked_by === userId ? "client" : "admin",
    markedAt: iso(c.marked_at)!,
  }));
}
