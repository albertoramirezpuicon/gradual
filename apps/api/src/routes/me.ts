import { Router } from "express";
import { completionSchema, type ClientRouteDTO, type ClientRouteSummaryDTO } from "@gradual/shared";
import { db } from "../db/knex.js";
import { HttpError, parse } from "../lib/util.js";
import { requireRole, requireConsent } from "../middleware/context.js";
import { getRoute, getStage, loadRouteDetail, loadCompletions } from "../lib/routes.js";
import { setCompletion } from "./admin-routes.js";

/** Client endpoints: their assigned, published routes and stage completion (F1). */
export const meRouter = Router();
meRouter.use(requireRole("client"), requireConsent);

/** A client can only access a route that is assigned to them AND published (D39). */
export async function assertClientRouteAccess(tenantId: string, userId: string, routeId: string) {
  const route = await getRoute(tenantId, routeId);
  const assigned = await db("gradual_route_assignments").where({ route_id: route.id, user_id: userId }).first();
  if (!assigned || !route.published) throw new HttpError(404, "Ruta no encontrada.");
  return route;
}

meRouter.get("/routes", async (req, res) => {
  const routes = await db("gradual_route_assignments as a")
    .join("gradual_routes as r", "r.id", "a.route_id")
    .where({ "a.user_id": req.user!.id, "r.tenant_id": req.tenant.id, "r.published": true })
    .orderBy("r.position")
    .select("r.id", "r.title", "r.description");
  const stages = routes.length
    ? await db("gradual_stages")
        .whereIn(
          "route_id",
          routes.map((r) => r.id),
        )
        .select("id", "route_id")
    : [];
  const done = new Set(
    (
      await loadCompletions(
        req.user!.id,
        stages.map((s) => s.id),
      )
    ).map((c) => c.stageId),
  );
  const body: ClientRouteSummaryDTO[] = routes.map((r) => {
    const own = stages.filter((s) => s.route_id === r.id);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      stageCount: own.length,
      doneCount: own.filter((s) => done.has(s.id)).length,
    };
  });
  res.json(body);
});

meRouter.get("/routes/:id", async (req, res) => {
  const route = await assertClientRouteAccess(req.tenant.id, req.user!.id, req.params.id);
  const detail = await loadRouteDetail(route);
  const body: ClientRouteDTO = {
    ...detail,
    completions: await loadCompletions(
      req.user!.id,
      detail.stages.map((s) => s.id),
    ),
  };
  res.json(body);
});

meRouter.put("/stages/:id/completion", async (req, res) => {
  const stage = await getStage(req.tenant.id, req.params.id);
  await assertClientRouteAccess(req.tenant.id, req.user!.id, stage.route_id);
  const { done } = parse(completionSchema, req.body);
  await setCompletion(stage.id, req.user!.id, req.user!.id, done);
  res.json({ ok: true });
});
