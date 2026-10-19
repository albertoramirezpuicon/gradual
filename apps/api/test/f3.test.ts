import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

const deleted: string[] = [];
vi.mock("../src/lib/s3.js", async (orig) => {
  const real = await orig<typeof import("../src/lib/s3.js")>();
  return { ...real, deleteObject: async (key: string) => void deleted.push(key) };
});

const { app, db, outbox, resetDb, createAdmin, createClient } = await import("./helpers.js");
const { runMaintenance, CV_SOURCE_RETENTION_DAYS } = await import("../src/lib/maintenance.js");
const { currentPrompt } = await import("../src/lib/cv.js");
const { newId, now, DAY } = await import("../src/lib/util.js");

let tenantId: string;
let admin: request.Agent;
beforeEach(async () => {
  tenantId = (await resetDb()).id;
  deleted.length = 0;
  admin = await createAdmin(tenantId);
});
afterAll(async () => {
  await db.destroy();
});

/** Inserts a finished CV run directly (F2 behaviour is covered elsewhere). */
async function insertRun(userId: string, createdAt: Date, key: string | null = `t/${tenantId}/cv/${userId}/${newId()}.pdf`) {
  const p = await currentPrompt(tenantId);
  const id = newId();
  await db("gradual_cv_runs").insert({
    id, tenant_id: tenantId, user_id: userId, started_by: userId, source_s3_key: key, source_file_name: "cv.pdf",
    extracted_text: "x", prompt_id: p.id, status: "done", created_at: createdAt,
  });
  return { id, key };
}

describe("Deletion request (D52)", () => {
  it("client requests deletion, both sides are emailed, admin sees it, client can cancel", async () => {
    const { agent: client, id } = await createClient(admin);
    outbox.length = 0;
    const me = (await client.post("/api/v1/auth/deletion-request").expect(200)).body;
    expect(me.deletionRequestedAt).toBeTruthy();
    expect(outbox.map((m) => m.to).sort()).toEqual(["admin@test.pe", "maria@test.pe"]);
    expect(outbox.find((m) => m.to === "admin@test.pe")!.text).toContain(`/admin/clients/${id}`);

    // Requesting twice does not send more emails
    await client.post("/api/v1/auth/deletion-request").expect(200);
    expect(outbox).toHaveLength(2);

    const list = (await admin.get("/api/v1/admin/clients")).body;
    expect(list[0].deletionRequestedAt).toBeTruthy();
    expect((await admin.get(`/api/v1/admin/clients/${id}`)).body.deletionRequestedAt).toBeTruthy();

    const cancelled = (await client.delete("/api/v1/auth/deletion-request").expect(200)).body;
    expect(cancelled.deletionRequestedAt).toBeNull();
  });

  it("only clients can request deletion", async () => {
    await admin.post("/api/v1/auth/deletion-request").expect(403);
  });
});

describe("Delete client (D53)", () => {
  it("requires the exact name, then removes the account, related rows and CV files", async () => {
    const { agent: client, id } = await createClient(admin);
    const route = (await admin.post("/api/v1/admin/routes").send({ title: "R" })).body;
    const stage = (await admin.post(`/api/v1/admin/routes/${route.id}/stages`).send({ title: "E" })).body.stages[0];
    await admin.put(`/api/v1/admin/clients/${id}/routes`).send({ routeIds: [route.id] }).expect(200);
    await admin.put(`/api/v1/admin/clients/${id}/stages/${stage.id}/completion`).send({ done: true }).expect(200);
    const run = await insertRun(id, now());

    await admin.delete(`/api/v1/admin/clients/${id}`).send({ confirmName: "Otra Persona" }).expect(400);
    const r = await admin.delete(`/api/v1/admin/clients/${id}`).send({ confirmName: "maría lópez" }).expect(200);
    expect(r.body.filesRemoved).toBe(1);
    expect(deleted).toEqual([run.key]);

    expect(await db("gradual_users").where({ id })).toHaveLength(0);
    for (const t of ["gradual_sessions", "gradual_consents", "gradual_route_assignments", "gradual_stage_completions", "gradual_cv_runs"]) {
      expect(await db(t).where({ user_id: id })).toHaveLength(0);
    }
    // The route itself stays
    expect(await db("gradual_routes")).toHaveLength(1);
    // The deleted client's session no longer works
    await client.get("/api/v1/auth/me").expect(401);
    await admin.delete(`/api/v1/admin/clients/${id}`).send({ confirmName: "x" }).expect(404);
  });

  it("cannot delete admins or other tenants' users through this endpoint", async () => {
    const adminRow = await db("gradual_users").where({ role: "admin" }).first();
    await admin.delete(`/api/v1/admin/clients/${adminRow.id}`).send({ confirmName: "Admin" }).expect(404);
  });
});

describe("Daily maintenance (D28 / D54)", () => {
  it(`purges CV sources older than ${CV_SOURCE_RETENTION_DAYS} days but keeps results; cleans sessions and tokens`, async () => {
    const { id } = await createClient(admin);
    const old = await insertRun(id, new Date(Date.now() - (CV_SOURCE_RETENTION_DAYS + 1) * DAY));
    const recent = await insertRun(id, new Date(Date.now() - 10 * DAY));
    await db("gradual_sessions").insert({ id: newId(), user_id: id, token_hash: "a".repeat(64), expires_at: new Date(Date.now() - DAY), created_at: new Date(Date.now() - 40 * DAY) });

    const report = await runMaintenance();
    expect(report.cvSourcesPurged).toBe(1);
    expect(report.sessionsDeleted).toBe(1);
    expect(report.tokensDeleted).toBeGreaterThanOrEqual(0);
    expect(deleted).toEqual([old.key]);
    expect((await db("gradual_cv_runs").where({ id: old.id }).first()).source_s3_key).toBeNull();
    expect((await db("gradual_cv_runs").where({ id: old.id }).first()).status).toBe("done");
    expect((await db("gradual_cv_runs").where({ id: recent.id }).first()).source_s3_key).toBe(recent.key);

    // Idempotent
    expect((await runMaintenance()).cvSourcesPurged).toBe(0);
  });

  it("removes used and expired auth tokens older than a day, keeps valid ones", async () => {
    const { id } = await createClient(admin);
    const mk = (over: object) => ({ id: newId(), user_id: id, type: "reset", token_hash: newId().padEnd(64, "x"), expires_at: new Date(Date.now() + DAY), used_at: null, created_at: new Date(Date.now() - 3 * DAY), ...over });
    await db("gradual_auth_tokens").delete();
    await db("gradual_auth_tokens").insert([mk({ used_at: new Date(Date.now() - 2 * DAY) }), mk({ expires_at: new Date(Date.now() - DAY) }), mk({})]);
    const r = await runMaintenance();
    expect(r.tokensDeleted).toBe(2);
    expect(await db("gradual_auth_tokens")).toHaveLength(1);
  });
});

describe("Health", () => {
  it("responds without tenant or DB-dependent routing", async () => {
    await request(app).get("/health").expect(200, { ok: true });
  });
});
