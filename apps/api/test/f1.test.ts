import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

// ---------- S3 mock: uploaded objects live in this map ----------
const objects = new Map<string, { ContentType: string; ContentLength: number }>();
const deleted: string[] = [];
vi.mock("../src/lib/s3.js", async (orig) => {
  const real = await orig<typeof import("../src/lib/s3.js")>();
  return {
    ...real,
    presignPut: async (key: string) => `https://s3.test/${key}?X-Amz-Signature=x`,
    presignGet: async (key: string, opts?: { fileName?: string; inline?: boolean }) =>
      `https://s3.test/${key}?disposition=${opts?.inline ? "inline" : "attachment"}&name=${encodeURIComponent(opts?.fileName ?? "")}`,
    headObject: async (key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error("NotFound");
      return o;
    },
    deleteObject: async (key: string) => {
      deleted.push(key);
      objects.delete(key);
    },
  };
});

const { app, db, resetDb, createAdmin, createClient } = await import("./helpers.js");

const PDF = "application/pdf";
let tenantId: string;
let admin: request.Agent;

beforeEach(async () => {
  tenantId = (await resetDb()).id;
  objects.clear();
  deleted.length = 0;
  admin = await createAdmin(tenantId);
});
afterAll(async () => {
  await db.destroy();
});

/** Simulates the browser uploading a file through the signed URL. */
async function uploadFile(mime = PDF, size = 1000) {
  const r = await admin.post("/api/v1/admin/resources/upload-url").send({ mime, size, fileName: "guia.pdf" }).expect(200);
  objects.set(r.body.key, { ContentType: mime, ContentLength: size });
  return r.body.key as string;
}

/** Builds a route with one stage per resource type. */
async function buildRoute() {
  const route = (await admin.post("/api/v1/admin/routes").send({ title: "Ruta Empleabilidad", description: "Desc" }).expect(201)).body;
  let detail = (await admin.post(`/api/v1/admin/routes/${route.id}/stages`).send({ title: "Mis fortalezas" }).expect(201)).body;
  detail = (await admin.post(`/api/v1/admin/routes/${route.id}/stages`).send({ title: "Mi CV" }).expect(201)).body;
  const [s1, s2] = detail.stages;
  const key = await uploadFile();
  const file = (await admin.post(`/api/v1/admin/stages/${s1.id}/resources`).send({ type: "file", title: "Guía", key, fileName: "Guía de CV.pdf" }).expect(201)).body;
  await admin.post(`/api/v1/admin/stages/${s1.id}/resources`).send({ type: "link", title: "LinkedIn", url: "https://linkedin.com/learning" }).expect(201);
  const video = (await admin.post(`/api/v1/admin/stages/${s2.id}/resources`).send({ type: "video", title: "Video", url: "https://youtu.be/dQw4w9WgXcQ" }).expect(201)).body;
  const text = (
    await admin
      .post(`/api/v1/admin/stages/${s2.id}/resources`)
      .send({ type: "text", title: "Tips", html: '<p onclick="x()">Hola <script>alert(1)</script><a href="javascript:x">mal</a><a href="https://ok.pe">bien</a></p>' })
      .expect(201)
  ).body;
  return { route, s1, s2, file, video, text, key };
}

describe("F1 — acceptance criterion", () => {
  it("admin builds a route with 4 resource types and assigns it; client sees it, downloads, marks stages; admin sees progress", async () => {
    const { route, s1, s2, file, video, text } = await buildRoute();
    expect(video.youtubeId).toBe("dQw4w9WgXcQ");
    // Rich text is sanitized on write (D37)
    expect(text.html).not.toMatch(/script|onclick|javascript:/);
    expect(text.html).toContain('<a href="https://ok.pe" target="_blank" rel="noopener noreferrer">bien</a>');

    const { agent: client, id: clientId } = await createClient(admin);

    // Draft routes are invisible even when assigned (D39)
    await admin.put(`/api/v1/admin/clients/${clientId}/routes`).send({ routeIds: [route.id] }).expect(200);
    expect((await client.get("/api/v1/me/routes").expect(200)).body).toEqual([]);
    await client.get(`/api/v1/me/routes/${route.id}`).expect(404);

    await admin.put(`/api/v1/admin/routes/${route.id}`).send({ title: route.title, description: route.description, published: true }).expect(200);
    const list = (await client.get("/api/v1/me/routes").expect(200)).body;
    expect(list).toEqual([{ id: route.id, title: "Ruta Empleabilidad", description: "Desc", stageCount: 2, doneCount: 0 }]);

    const detail = (await client.get(`/api/v1/me/routes/${route.id}`).expect(200)).body;
    expect(detail.stages.map((s: { resources: unknown[] }) => s.resources.length)).toEqual([2, 2]);

    // Download: PDF opens inline with its original name (D38)
    const dl = await client.get(`/api/v1/resources/${file.id}/download`).expect(302);
    expect(dl.headers.location).toContain("disposition=inline");
    expect(dl.headers.location).toContain(encodeURIComponent("Guía de CV.pdf"));

    // Client marks stage 1; admin marks stage 2 (D16)
    await client.put(`/api/v1/me/stages/${s1.id}/completion`).send({ done: true }).expect(200);
    await admin.put(`/api/v1/admin/clients/${clientId}/stages/${s2.id}/completion`).send({ done: true }).expect(200);
    const after = (await client.get(`/api/v1/me/routes/${route.id}`).expect(200)).body;
    expect(after.completions.map((c: { stageId: string; markedBy: string }) => [c.stageId, c.markedBy]).sort()).toEqual(
      [[s1.id, "client"], [s2.id, "admin"]].sort(),
    );

    // Admin progress views (D41)
    const progress = (await admin.get(`/api/v1/admin/routes/${route.id}/progress`).expect(200)).body;
    expect(progress.clients[0].doneStageIds.sort()).toEqual([s1.id, s2.id].sort());
    const cd = (await admin.get(`/api/v1/admin/clients/${clientId}`).expect(200)).body;
    expect(cd.routes[0].stages.every((s: { done: unknown }) => s.done)).toBe(true);

    // Unmark
    await client.put(`/api/v1/me/stages/${s1.id}/completion`).send({ done: false }).expect(200);
    expect((await client.get("/api/v1/me/routes")).body[0].doneCount).toBe(1);
  });
});

describe("Access control", () => {
  it("clients cannot use admin endpoints, unassigned routes, or other routes' files", async () => {
    const { route, file, s1 } = await buildRoute();
    await admin.put(`/api/v1/admin/routes/${route.id}`).send({ title: "R", description: "", published: true }).expect(200);
    const { agent: client } = await createClient(admin);
    await client.get("/api/v1/admin/routes").expect(403);
    await client.get(`/api/v1/me/routes/${route.id}`).expect(404);
    await client.get(`/api/v1/resources/${file.id}/download`).expect(404);
    await client.put(`/api/v1/me/stages/${s1.id}/completion`).send({ done: true }).expect(404);
    await request(app).get(`/api/v1/resources/${file.id}/download`).expect(401);
  });

  it("admin cannot mark a stage for a client that does not have the route", async () => {
    const { s1 } = await buildRoute();
    const { id } = await createClient(admin);
    await admin.put(`/api/v1/admin/clients/${id}/stages/${s1.id}/completion`).send({ done: true }).expect(409);
  });
});

describe("Resources", () => {
  it("validates links, YouTube URLs and uploaded files", async () => {
    const route = (await admin.post("/api/v1/admin/routes").send({ title: "R" }).expect(201)).body;
    const s = (await admin.post(`/api/v1/admin/routes/${route.id}/stages`).send({ title: "E" }).expect(201)).body.stages[0];
    const post = (body: object) => admin.post(`/api/v1/admin/stages/${s.id}/resources`).send(body);
    await post({ type: "link", title: "x", url: "javascript:alert(1)" }).expect(400);
    await post({ type: "video", title: "x", url: "https://vimeo.com/123" }).expect(400);
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"]) {
      expect((await post({ type: "video", title: "x", url }).expect(201)).body.youtubeId).toBe("dQw4w9WgXcQ");
    }
    // Disallowed type or size at upload-url time
    await admin.post("/api/v1/admin/resources/upload-url").send({ mime: "image/png", size: 10, fileName: "a.png" }).expect(400);
    await admin.post("/api/v1/admin/resources/upload-url").send({ mime: PDF, size: 21 * 1024 * 1024, fileName: "a.pdf" }).expect(400);
    // Key from another tenant, or never uploaded
    await post({ type: "file", title: "x", key: "t/otro/resources/x.pdf", fileName: "x.pdf" }).expect(400);
    const r = await admin.post("/api/v1/admin/resources/upload-url").send({ mime: PDF, size: 10, fileName: "a.pdf" });
    await post({ type: "file", title: "x", key: r.body.key, fileName: "a.pdf" }).expect(400);
    // Uploaded object whose real type differs from what was declared is rejected and removed
    objects.set(r.body.key, { ContentType: "text/html", ContentLength: 10 });
    await post({ type: "file", title: "x", key: r.body.key, fileName: "a.pdf" }).expect(400);
    expect(deleted).toContain(r.body.key);
  });

  it("replacing or deleting a file removes the old S3 object; changing type clears file columns", async () => {
    const { file, key } = await buildRoute();
    const key2 = await uploadFile();
    await admin.put(`/api/v1/admin/resources/${file.id}`).send({ type: "file", title: "Guía 2", key: key2, fileName: "v2.pdf" }).expect(200);
    expect(deleted).toContain(key);
    // Keep current file when no new key is sent
    const kept = (await admin.put(`/api/v1/admin/resources/${file.id}`).send({ type: "file", title: "Guía 3" }).expect(200)).body;
    expect(kept.fileName).toBe("v2.pdf");
    const asLink = (await admin.put(`/api/v1/admin/resources/${file.id}`).send({ type: "link", title: "L", url: "https://a.pe" }).expect(200)).body;
    expect(asLink).toMatchObject({ type: "link", fileName: null, mime: null });
    expect(deleted).toContain(key2);
  });

  it("deleting a route cascades to stages, resources, assignments and completions, and removes files (D40)", async () => {
    const { route, s1, key } = await buildRoute();
    const { agent: client, id } = await createClient(admin);
    await admin.put(`/api/v1/admin/routes/${route.id}`).send({ title: "R", description: "", published: true });
    await admin.put(`/api/v1/admin/clients/${id}/routes`).send({ routeIds: [route.id] });
    await client.put(`/api/v1/me/stages/${s1.id}/completion`).send({ done: true }).expect(200);
    await admin.delete(`/api/v1/admin/routes/${route.id}`).expect(200);
    for (const t of ["gradual_stages", "gradual_resources", "gradual_route_assignments", "gradual_stage_completions"]) {
      expect(await db(t)).toHaveLength(0);
    }
    expect(deleted).toContain(key);
  });
});

describe("Ordering (D36)", () => {
  it("moves stages and resources up and down, ignoring moves past the edges", async () => {
    const route = (await admin.post("/api/v1/admin/routes").send({ title: "R" }).expect(201)).body;
    for (const t of ["A", "B", "C"]) await admin.post(`/api/v1/admin/routes/${route.id}/stages`).send({ title: t });
    let d = (await admin.get(`/api/v1/admin/routes/${route.id}`)).body;
    const [a, , c] = d.stages;
    d = (await admin.post(`/api/v1/admin/stages/${c.id}/move`).send({ direction: "up" }).expect(200)).body;
    expect(d.stages.map((s: { title: string }) => s.title)).toEqual(["A", "C", "B"]);
    d = (await admin.post(`/api/v1/admin/stages/${a.id}/move`).send({ direction: "up" }).expect(200)).body;
    expect(d.stages.map((s: { title: string }) => s.title)).toEqual(["A", "C", "B"]);

    const sid = d.stages[0].id;
    const r1 = (await admin.post(`/api/v1/admin/stages/${sid}/resources`).send({ type: "link", title: "1", url: "https://a.pe" })).body;
    await admin.post(`/api/v1/admin/stages/${sid}/resources`).send({ type: "link", title: "2", url: "https://b.pe" });
    await admin.post(`/api/v1/admin/resources/${r1.id}/move`).send({ direction: "down" }).expect(200);
    d = (await admin.get(`/api/v1/admin/routes/${route.id}`)).body;
    expect(d.stages[0].resources.map((r: { title: string }) => r.title)).toEqual(["2", "1"]);
  });
});

describe("Assignments", () => {
  it("replaces the assigned set and rejects unknown routes", async () => {
    const a = (await admin.post("/api/v1/admin/routes").send({ title: "A" })).body;
    const b = (await admin.post("/api/v1/admin/routes").send({ title: "B" })).body;
    const { id } = await createClient(admin);
    await admin.put(`/api/v1/admin/clients/${id}/routes`).send({ routeIds: [a.id, b.id] }).expect(200);
    await admin.put(`/api/v1/admin/clients/${id}/routes`).send({ routeIds: [b.id] }).expect(200);
    const cd = (await admin.get(`/api/v1/admin/clients/${id}`)).body;
    expect(cd.routes.map((r: { title: string }) => r.title)).toEqual(["B"]);
    expect(cd.availableRoutes).toHaveLength(2);
    await admin.put(`/api/v1/admin/clients/${id}/routes`).send({ routeIds: ["01JZZZZZZZZZZZZZZZZZZZZZZZ"] }).expect(400);
    const list = (await admin.get("/api/v1/admin/routes")).body;
    expect(list.map((r: { title: string; assignedCount: number }) => [r.title, r.assignedCount])).toEqual([["A", 0], ["B", 1]]);
  });
});
