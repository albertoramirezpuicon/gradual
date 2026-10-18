import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, db, outbox, resetDb, createAdmin, lastToken } from "./helpers.js";

let tenantId: string;
beforeEach(async () => {
  tenantId = (await resetDb()).id;
});
afterAll(async () => {
  await db.destroy();
});

const PASS = "client-secret-123";

async function inviteAndActivate(admin: request.Agent, email = "maria@test.pe") {
  await admin.post("/api/v1/admin/clients").send({ email, name: "María" }).expect(201);
  const token = lastToken();
  const client = request.agent(app);
  const inv = await client.get(`/api/v1/auth/invitation/${token}`).expect(200);
  await client
    .post("/api/v1/auth/invitation/accept")
    .send({ token, name: "María López", password: PASS, acceptPolicy: true })
    .expect(200);
  return { client, token, inv: inv.body };
}

describe("F0 — acceptance criterion", () => {
  it("admin invites; client activates, accepts the policy and signs in with branding applied", async () => {
    const admin = await createAdmin(tenantId);
    await admin
      .put("/api/v1/admin/branding")
      .send({ brandName: "Consultora Demo", primaryColor: "#112233", secondaryColor: "#aabbcc", font: "Lato" })
      .expect(200);

    const { client, inv } = await inviteAndActivate(admin);
    expect(outbox[0]!.subject).toBe("Activa tu cuenta en Consultora Demo");
    expect(outbox[0]!.text).toContain("/invitation?token=");
    expect(inv.email).toBe("maria@test.pe");
    expect(inv.policy.version).toBe(1);

    const me = await client.get("/api/v1/auth/me").expect(200);
    expect(me.body).toMatchObject({ role: "client", name: "María López", requiresConsent: false });

    expect(await db("gradual_consents")).toHaveLength(1);

    const b = await request(app).get("/api/v1/public/branding").expect(200);
    expect(b.body).toMatchObject({ brandName: "Consultora Demo", primaryColor: "#112233", secondaryColor: "#AABBCC", font: "Lato" });

    // Later login with the new password (email is case-insensitive)
    await request(app).post("/api/v1/auth/login").send({ email: "MARIA@test.pe", password: PASS }).expect(200);
  });
});

describe("Invitations", () => {
  it("no open sign-up and invitations cannot be reused", async () => {
    const admin = await createAdmin(tenantId);
    const { token } = await inviteAndActivate(admin);
    await request(app).get(`/api/v1/auth/invitation/${token}`).expect(410);
    await admin.post("/api/v1/admin/clients").send({ email: "maria@test.pe", name: "Other" }).expect(409);
  });

  it("resending invalidates the previous link", async () => {
    const admin = await createAdmin(tenantId);
    const c = await admin.post("/api/v1/admin/clients").send({ email: "j@test.pe", name: "Juan" }).expect(201);
    const first = lastToken();
    await admin.post(`/api/v1/admin/clients/${c.body.id}/resend-invitation`).expect(200);
    const second = lastToken();
    expect(second).not.toBe(first);
    await request(app).get(`/api/v1/auth/invitation/${first}`).expect(410);
    await request(app).get(`/api/v1/auth/invitation/${second}`).expect(200);
  });

  it("requires accepting the policy", async () => {
    const admin = await createAdmin(tenantId);
    await admin.post("/api/v1/admin/clients").send({ email: "j@test.pe", name: "Juan" }).expect(201);
    await request(app)
      .post("/api/v1/auth/invitation/accept")
      .send({ token: lastToken(), name: "Juan", password: PASS, acceptPolicy: false })
      .expect(400);
  });
});

describe("Roles", () => {
  it("a client cannot reach admin routes", async () => {
    const admin = await createAdmin(tenantId);
    const { client } = await inviteAndActivate(admin);
    await client.get("/api/v1/admin/clients").expect(403);
    await request(app).get("/api/v1/admin/clients").expect(401);
  });
});

describe("Login", () => {
  it("locks the account after 10 failed attempts", async () => {
    const admin = await createAdmin(tenantId);
    await inviteAndActivate(admin);
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/v1/auth/login").send({ email: "maria@test.pe", password: "wrong-wrong-wrong" }).expect(401);
    }
    await request(app).post("/api/v1/auth/login").send({ email: "maria@test.pe", password: PASS }).expect(423);
  });

  it("returns the same message for an unknown email", async () => {
    const r = await request(app).post("/api/v1/auth/login").send({ email: "nobody@test.pe", password: "x" }).expect(401);
    expect(r.body.error).toBe("Correo o contraseña incorrectos.");
  });

  it("logout invalidates the session", async () => {
    const admin = await createAdmin(tenantId);
    await admin.post("/api/v1/auth/logout").expect(200);
    await admin.get("/api/v1/auth/me").expect(401);
  });
});

describe("Password recovery", () => {
  it("resets the password, closes previous sessions and the token is single-use", async () => {
    const admin = await createAdmin(tenantId);
    const { client } = await inviteAndActivate(admin);
    outbox.length = 0;
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "maria@test.pe" }).expect(200);
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@test.pe" }).expect(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain("/reset-password?token=");
    const token = lastToken();
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: "new-secure-password" }).expect(200);
    await client.get("/api/v1/auth/me").expect(401);
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: "another-secure-password" }).expect(410);
    await request(app).post("/api/v1/auth/login").send({ email: "maria@test.pe", password: "new-secure-password" }).expect(200);
  });

  it("change password requires the current one and closes other sessions", async () => {
    const admin = await createAdmin(tenantId);
    const { client } = await inviteAndActivate(admin);
    const other = request.agent(app);
    await other.post("/api/v1/auth/login").send({ email: "maria@test.pe", password: PASS }).expect(200);
    await client.post("/api/v1/auth/change-password").send({ currentPassword: "wrong", newPassword: "brand-new-password" }).expect(400);
    await client.post("/api/v1/auth/change-password").send({ currentPassword: PASS, newPassword: "brand-new-password" }).expect(200);
    await client.get("/api/v1/auth/me").expect(200);
    await other.get("/api/v1/auth/me").expect(401);
  });
});

describe("Privacy policy versions", () => {
  it("publishing a new version requires clients to accept it again", async () => {
    const admin = await createAdmin(tenantId);
    const { client } = await inviteAndActivate(admin);
    const cur = await admin.get("/api/v1/admin/policies/current").expect(200);
    const v2 = await admin
      .post("/api/v1/admin/policies")
      .send({ content: cur.body.content + "\n\n## 11. Nueva cláusula\n\nTexto agregado en la versión 2." })
      .expect(201);
    expect(v2.body.version).toBe(2);

    const me = await client.get("/api/v1/auth/me").expect(200);
    expect(me.body.requiresConsent).toBe(true);

    await client.post("/api/v1/auth/consent").send({ policyId: cur.body.id }).expect(409);
    await client.post("/api/v1/auth/consent").send({ policyId: v2.body.id }).expect(200);
    expect((await client.get("/api/v1/auth/me")).body.requiresConsent).toBe(false);

    const list = await admin.get("/api/v1/admin/policies").expect(200);
    expect(list.body.map((p: { version: number; acceptances: number }) => [p.version, p.acceptances])).toEqual([[2, 1], [1, 1]]);
  });

  it("rejects publishing without changes", async () => {
    const admin = await createAdmin(tenantId);
    const cur = await admin.get("/api/v1/admin/policies/current");
    await admin.post("/api/v1/admin/policies").send({ content: cur.body.content }).expect(400);
  });
});

describe("Branding", () => {
  it("validates colors and font", async () => {
    const admin = await createAdmin(tenantId);
    await admin
      .put("/api/v1/admin/branding")
      .send({ brandName: "X", primaryColor: "red", secondaryColor: "#000000", font: "Lato" })
      .expect(400);
    await admin
      .put("/api/v1/admin/branding")
      .send({ brandName: "X", primaryColor: "#000000", secondaryColor: "#000000", font: "Comic Sans" })
      .expect(400);
  });

  it("issues a signed logo upload URL scoped to the tenant and rejects disallowed types", async () => {
    const admin = await createAdmin(tenantId);
    const r = await admin.post("/api/v1/admin/branding/logo/upload-url").send({ mime: "image/png", size: 1000 }).expect(200);
    expect(r.body.key).toMatch(new RegExp(`^t/${tenantId}/branding/logo-.+\\.png$`));
    expect(r.body.url).toContain("X-Amz-Signature");
    await admin.post("/api/v1/admin/branding/logo/upload-url").send({ mime: "application/pdf", size: 1000 }).expect(400);
    await admin.post("/api/v1/admin/branding/logo/upload-url").send({ mime: "image/png", size: 5_000_000 }).expect(400);
    await admin.post("/api/v1/admin/branding/logo/confirm").send({ key: "t/other-tenant/branding/x.png" }).expect(400);
  });
});

describe("Database convention (D33)", () => {
  it("every table uses the gradual_ prefix", async () => {
    const [rows] = await db.raw("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
    const bad = (rows as { t: string }[]).map((r) => r.t).filter((t) => !t.startsWith("gradual_"));
    expect(bad).toEqual([]);
  });
});
