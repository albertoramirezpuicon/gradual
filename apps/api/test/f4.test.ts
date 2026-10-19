import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, db, outbox, resetDb, createAdmin, createClient, lastToken } from "./helpers.js";
import { hashPassword } from "../src/lib/session.js";
import { newId, now } from "../src/lib/util.js";

let tenantId: string;
let admin: request.Agent;
beforeEach(async () => {
  tenantId = (await resetDb()).id;
  admin = await createAdmin(tenantId);
});
afterAll(async () => {
  await db.destroy();
});

async function createSuperadmin() {
  await db("gradual_users").insert({
    id: newId(), tenant_id: tenantId, role: "superadmin", email: "owner@test.pe", name: "Owner",
    password_hash: await hashPassword("owner-secret-123"), status: "active", created_at: now(),
  });
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email: "owner@test.pe", password: "owner-secret-123" }).expect(200);
  return agent;
}

describe("Email templates (D57–D59)", () => {
  it("lists defaults, saves an override used by real emails, restores it", async () => {
    const list = (await admin.get("/api/v1/admin/email-templates").expect(200)).body;
    expect(list.map((t: { key: string }) => t.key)).toContain("invitation");
    expect(list.every((t: { isCustom: boolean }) => !t.isCustom)).toBe(true);

    const custom = { subject: "Hola {{nombre}}, bienvenida a {{marca}}", body: "Te esperamos.\n\nSaludos.", buttonLabel: "Entrar ya" };
    await admin.put("/api/v1/admin/email-templates/invitation").send(custom).expect(200);
    outbox.length = 0;
    await admin.post("/api/v1/admin/clients").send({ email: "ana@test.pe", name: "Ana" }).expect(201);
    expect(outbox[0]!.subject).toBe("Hola Ana, bienvenida a Gradual");
    expect(outbox[0]!.html).toContain("Entrar ya");
    expect(outbox[0]!.html).toContain("Te esperamos.<br><br>Saludos.");
    expect(outbox[0]!.text).toMatch(/invitation\?token=/);

    const restored = (await admin.delete("/api/v1/admin/email-templates/invitation").expect(200)).body;
    expect(restored.subject).not.toBe(custom.subject);
    const after = (await admin.get("/api/v1/admin/email-templates")).body.find((t: { key: string }) => t.key === "invitation");
    expect(after.isCustom).toBe(false);
  });

  it("rejects unknown variables and escapes HTML", async () => {
    const bad = await admin.put("/api/v1/admin/email-templates/invitation").send({ subject: "Hola {{cliente}}", body: "x", buttonLabel: "y" }).expect(400);
    expect(bad.body.error).toContain("{{cliente}}");
    const prev = (await admin.post("/api/v1/admin/email-templates/invitation/preview").send({ subject: "S", body: "<script>x</script>", buttonLabel: "B" }).expect(200)).body;
    expect(prev.html).not.toContain("<script>");
  });

  it("sends a test to the admin and is admin-only", async () => {
    outbox.length = 0;
    await admin.post("/api/v1/admin/email-templates/reset_password/test").send({ subject: "Clave", body: "Hola {{nombre}}", buttonLabel: "Cambiar" }).expect(200);
    expect(outbox[0]!.to).toBe("admin@test.pe");
    expect(outbox[0]!.subject).toBe("[Prueba] Clave");
    const { agent: client } = await createClient(admin);
    await client.get("/api/v1/admin/email-templates").expect(403);
    await admin.get("/api/v1/admin/email-templates/nope").expect(404);
  });
});

describe("Platform (D60–D68)", () => {
  it("only the superadmin can use it", async () => {
    await admin.get("/api/v1/platform/tenants").expect(403);
    const owner = await createSuperadmin();
    const list = (await owner.get("/api/v1/platform/tenants").expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].isMain).toBe(true);
    expect(list[0].metrics.clientsActive).toBe(0);
  });

  it("creates a tenant with its first admin, who activates on the tenant's domain", async () => {
    const owner = await createSuperadmin();
    outbox.length = 0;
    const t = (await owner.post("/api/v1/platform/tenants").send({ name: "Acme", subdomain: "acme", adminName: "Lia", adminEmail: "lia@acme.pe" }).expect(201)).body;
    expect(t.domain).toBe("acme.genia.pro");
    expect(t.admins[0].status).toBe("invited");
    expect(outbox[0]!.to).toBe("lia@acme.pe");
    await owner.post("/api/v1/platform/tenants").send({ name: "Acme 2", subdomain: "acme", adminName: "Xavi", adminEmail: "x@acme.pe" }).expect(409);

    const token = lastToken();
    const lia = request.agent(app);
    await lia.post("/api/v1/auth/invitation/accept").set("Host", "acme.genia.pro").send({ token, name: "Lia", password: "lia-secret-1234", acceptPolicy: true }).expect(200);
    const me = (await lia.get("/api/v1/auth/me").set("Host", "acme.genia.pro").expect(200)).body;
    expect(me.role).toBe("admin");
    // Tenants are isolated: the main tenant's admin cannot log in on acme
    await request(app).post("/api/v1/auth/login").set("Host", "acme.genia.pro").send({ email: "admin@test.pe", password: "admin-secret-123" }).expect(401);
  });

  it("suspends a tenant (never the main one)", async () => {
    const owner = await createSuperadmin();
    const t = (await owner.post("/api/v1/platform/tenants").send({ name: "Acme", subdomain: "acme", adminName: "Lia", adminEmail: "lia@acme.pe" })).body;
    await request(app).get("/api/v1/auth/me").set("Host", "acme.genia.pro").expect(401);
    await owner.put(`/api/v1/platform/tenants/${t.id}`).send({ name: "Acme", status: "suspended" }).expect(200);
    await request(app).get("/api/v1/auth/me").set("Host", "acme.genia.pro").expect(503);
    await owner.put(`/api/v1/platform/tenants/${tenantId}`).send({ name: "Gradual", status: "suspended" }).expect(400);
  });

  it("impersonates an admin and comes back", async () => {
    const owner = await createSuperadmin();
    const { id: clientId } = await createClient(admin);
    const detail = (await owner.get(`/api/v1/platform/tenants/${tenantId}`).expect(200)).body;
    expect(detail.metrics.clientsActive).toBe(1);
    const adminId = detail.admins[0].id;

    const me = (await owner.post(`/api/v1/platform/tenants/${tenantId}/impersonate`).send({ adminId }).expect(200)).body;
    expect(me.role).toBe("admin");
    expect(me.impersonation.superadminName).toBe("Owner");
    const clients = (await owner.get("/api/v1/admin/clients").expect(200)).body;
    expect(clients[0].id).toBe(clientId);
    // While acting as an admin: no platform access and no password change
    await owner.get("/api/v1/platform/tenants").expect(403);
    await owner.post("/api/v1/auth/change-password").send({ currentPassword: "admin-secret-123", newPassword: "something-new-123" }).expect(403);

    const back = (await owner.post("/api/v1/auth/stop-impersonation").expect(200)).body;
    expect(back.role).toBe("superadmin");
    expect(back.impersonation).toBeNull();
    await owner.get("/api/v1/platform/tenants").expect(200);
  });

  it("invites an extra admin and re-sends a pending invitation", async () => {
    const owner = await createSuperadmin();
    outbox.length = 0;
    await owner.post(`/api/v1/platform/tenants/${tenantId}/admins`).send({ name: "Bea", email: "bea@test.pe" }).expect(201);
    await owner.post(`/api/v1/platform/tenants/${tenantId}/admins`).send({ name: "Bea", email: "bea@test.pe" }).expect(200);
    expect(outbox).toHaveLength(2);
    await owner.post(`/api/v1/platform/tenants/${tenantId}/admins`).send({ name: "Ana", email: "admin@test.pe" }).expect(409);
  });
});
