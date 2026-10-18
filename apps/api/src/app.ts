import express, { Router } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler, HttpError } from "./lib/util.js";
import { resolveTenant, loadSession } from "./middleware/context.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { adminRoutesRouter } from "./routes/admin-routes.js";
import { meRouter, assertClientRouteAccess } from "./routes/me.js";
import { getResource } from "./lib/routes.js";
import { requireAuth, requireConsent } from "./middleware/context.js";
import { getBranding } from "./lib/branding.js";
import { presignGet } from "./lib/s3.js";
import { db } from "./db/knex.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const v1 = Router();
  v1.use(resolveTenant, loadSession);

  // Public endpoints
  v1.get("/public/branding", async (req, res) => {
    res.json(await getBranding(req.tenant.id));
  });
  v1.get("/public/logo", async (req, res) => {
    const s = await db("gradual_tenant_settings").where({ tenant_id: req.tenant.id }).first();
    if (!s?.logo_s3_key) throw new HttpError(404, "Sin logo.");
    res.set("Cache-Control", "public, max-age=240");
    res.redirect(302, await presignGet(s.logo_s3_key));
  });

  // File download for both roles: admins see every resource of their tenant;
  // clients only resources of routes assigned to them and published (D38/D39).
  v1.get("/resources/:id/download", requireAuth, requireConsent, async (req, res) => {
    const r = await getResource(req.tenant.id, String(req.params.id));
    if (req.user!.role === "client") await assertClientRouteAccess(req.tenant.id, req.user!.id, r.route_id);
    if (r.type !== "file" || !r.s3_key) throw new HttpError(404, "Este recurso no tiene archivo.");
    res.set("Cache-Control", "no-store");
    res.redirect(302, await presignGet(r.s3_key, { fileName: r.file_name ?? "archivo", inline: r.mime === "application/pdf" }));
  });

  v1.use("/auth", authRouter);
  v1.use("/admin", adminRouter, adminRoutesRouter);
  v1.use("/me", meRouter);

  v1.use((_req, _res) => {
    throw new HttpError(404, "Ruta no encontrada.");
  });

  app.use("/api/v1", v1);
  app.use(errorHandler);
  return app;
}
