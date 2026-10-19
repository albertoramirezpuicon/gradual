import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createElement as h } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";

// ---------- S3 mock with real bytes ----------
const objects = new Map<string, { ContentType: string; ContentLength: number; bytes: Uint8Array }>();
const deleted: string[] = [];
vi.mock("../src/lib/s3.js", async (orig) => {
  const real = await orig<typeof import("../src/lib/s3.js")>();
  return {
    ...real,
    presignPut: async (key: string) => `https://s3.test/${key}?X-Amz-Signature=x`,
    headObject: async (key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error("NotFound");
      return o;
    },
    getObjectBytes: async (key: string) => objects.get(key)!.bytes,
    deleteObject: async (key: string) => {
      deleted.push(key);
      objects.delete(key);
    },
  };
});

const { app, db, resetDb, createAdmin, createClient } = await import("./helpers.js");
const { processRun, limaMonthStart, FAILED_MESSAGE } = await import("../src/lib/cv.js");
const { setProvidersForTesting } = await import("../src/lib/llm.js");
type Provider = import("../src/lib/llm.js").Provider;

// ---------- Fixtures ----------
const CV_TEXT =
  "María López Torres. Lima, Perú. maria@correo.pe. Experiencia: Asistente de marketing en Empresa Andina SAC (2021-2024). " +
  "Responsable de redes sociales y campañas. Apoyo en eventos. Educación: Bachiller en Comunicaciones, Universidad de Lima (2016-2020). " +
  "Habilidades: Excel, Canva, Meta Ads. Idiomas: inglés intermedio.";

async function pdfWith(text: string) {
  return new Uint8Array(await renderToBuffer(h(Document, null, h(Page, { size: "A4" }, h(Text, null, text))) as never));
}

const RESULT = {
  summary: "Reorganizamos tu CV y destacamos tus logros. Completa las cifras marcadas.",
  initialScore: 48,
  finalScore: 81,
  sections: [
    { name: "Experiencia", original: "Responsable de redes sociales", improved: "Gestioné las redes sociales y aumenté el alcance [agrega una cifra: %]", comments: ["Usa verbos de acción"] },
  ],
  improvedCv: {
    name: "María López Torres",
    headline: "Asistente de Marketing Digital",
    contact: { email: "maria@correo.pe", phone: "", location: "Lima, Perú", linkedin: "", website: "" },
    profile: "Comunicadora con 3 años de experiencia en marketing digital.",
    experience: [{ role: "Asistente de marketing", company: "Empresa Andina SAC", location: "Lima", start: "2021", end: "2024", bullets: ["Gestioné campañas en Meta Ads [agrega una cifra: S/]"] }],
    education: [{ degree: "Bachiller en Comunicaciones", institution: "Universidad de Lima", location: "", start: "2016", end: "2020", details: "" }],
    skills: ["Excel", "Canva", "Meta Ads"],
    languages: [{ language: "Inglés", level: "Intermedio" }],
    certifications: [],
    other: [],
  },
};

/** Fake provider; records the prompts it receives. */
function fake(name: Provider["name"], behaviour: () => string | Promise<string>, seen: string[] = []): Provider {
  return {
    name,
    model: `${name}-test`,
    async complete(req) {
      seen.push(req.system);
      return { provider: name, model: `${name}-test`, text: await behaviour(), tokensIn: 1000, tokensOut: 500 };
    },
  };
}

let tenantId: string;
let admin: request.Agent;
beforeEach(async () => {
  tenantId = (await resetDb()).id;
  objects.clear();
  deleted.length = 0;
  setProvidersForTesting([fake("anthropic", () => JSON.stringify(RESULT))]);
  admin = await createAdmin(tenantId);
});
afterAll(async () => {
  setProvidersForTesting(null);
  await db.destroy();
});

/** Upload-url → simulated browser PUT → create run. */
async function startRun(agent: request.Agent, bytes: Uint8Array, clientId?: string) {
  const u = await agent.post("/api/v1/cv/upload-url").send({ mime: "application/pdf", size: bytes.length, fileName: "mi-cv.pdf", clientId });
  if (u.status !== 200) return u;
  objects.set(u.body.key, { ContentType: "application/pdf", ContentLength: bytes.length, bytes });
  return agent.post("/api/v1/cv/runs").send({ key: u.body.key, fileName: "mi-cv.pdf", clientId });
}

describe("F2 — acceptance criterion", () => {
  it("client uploads a PDF and gets result + downloads; admin edits standards and the new version applies", async () => {
    const seen: string[] = [];
    setProvidersForTesting([fake("anthropic", () => JSON.stringify(RESULT), seen)]);
    const { agent: client } = await createClient(admin);

    const created = await startRun(client, await pdfWith(CV_TEXT));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "queued", startedBy: "client", promptVersion: 1 });
    const stored = await db("gradual_cv_runs").where({ id: created.body.id }).first();
    expect(stored.extracted_text).toContain("Empresa Andina");

    await processRun(created.body.id);
    const done = (await client.get(`/api/v1/cv/runs/${created.body.id}`).expect(200)).body;
    expect(done).toMatchObject({ status: "done", initialScore: 48, finalScore: 81 });
    expect(done.result.improvedCv.name).toBe("María López Torres");
    expect(seen[0]).toContain("NEVER invent facts");
    expect(seen[0]).toContain("Estándares para mejorar un CV");

    // PDF with the default footer (D47)
    const pdf = await client.get(`/api/v1/cv/runs/${done.id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(encodeURIComponent("CV - Maria Lopez Torres.pdf"));
    const pdfText = String((await extractText(await getDocumentProxy(new Uint8Array(pdf.body)), { mergePages: true })).text);
    expect(pdfText).toContain("Creado con la ayuda de Gradual");
    expect(pdfText).toContain("Empresa Andina SAC");

    const docx = await client.get(`/api/v1/cv/runs/${done.id}/docx`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((docx.body as Buffer).subarray(0, 2).toString()).toBe("PK");

    // New standards version applies to the next run only
    const std = (await admin.get("/api/v1/cv/standards").expect(200)).body;
    expect(std.current.version).toBe(1);
    await admin.post("/api/v1/cv/standards").send({ standards: std.current.standards + "\n\n- Regla nueva: incluir siempre un titular profesional." }).expect(201);
    const second = await startRun(client, await pdfWith(CV_TEXT));
    expect(second.body.promptVersion).toBe(2);
    await processRun(second.body.id);
    expect(seen[1]).toContain("Regla nueva");
    const versions = (await admin.get("/api/v1/cv/standards")).body.versions;
    expect(versions.map((v: { version: number; runs: number }) => [v.version, v.runs])).toEqual([[2, 1], [1, 1]]);

    // History includes both runs, newest first
    const hist = (await client.get("/api/v1/cv/runs").expect(200)).body;
    expect(hist.map((r: { id: string }) => r.id)).toEqual([second.body.id, created.body.id]);
  });
});

describe("Monthly quota (D30)", () => {
  it("allows 5 client runs per month; failed and admin-started runs do not count", async () => {
    const { agent: client, id: clientId } = await createClient(admin);
    const pdf = await pdfWith(CV_TEXT);
    for (let i = 0; i < 4; i++) expect((await startRun(client, pdf)).status).toBe(201);

    // A failed run does not consume quota
    setProvidersForTesting([fake("anthropic", () => "not json")]);
    const failed = await startRun(client, pdf);
    await processRun(failed.body.id);
    expect((await client.get("/api/v1/cv/quota")).body).toEqual({ used: 4, limit: 5, remaining: 1 });

    expect((await startRun(client, pdf)).status).toBe(201);
    const blocked = await startRun(client, pdf);
    expect(blocked.status).toBe(429);

    // Admin can still run on the client's behalf, and it does not count
    const byAdmin = await startRun(admin, pdf, clientId);
    expect(byAdmin.status).toBe(201);
    expect(byAdmin.body.startedBy).toBe("admin");
    expect((await client.get("/api/v1/cv/quota")).body.used).toBe(5);
    // ...and it appears in the client's history (D51)
    expect((await client.get("/api/v1/cv/runs")).body.some((r: { id: string }) => r.id === byAdmin.body.id)).toBe(true);
  });

  it("computes the Lima calendar month start", () => {
    // 2026-11-01 03:00 UTC is still Oct 31 in Lima
    expect(limaMonthStart(new Date("2026-11-01T03:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(limaMonthStart(new Date("2026-11-01T06:00:00Z")).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
});

describe("LLM failover", () => {
  it("retries, then falls back to the next provider", async () => {
    let calls = 0;
    setProvidersForTesting([
      fake("anthropic", () => {
        calls++;
        throw new Error("HTTP 529 overloaded");
      }),
      fake("openai", () => "```json\n" + JSON.stringify(RESULT) + "\n```"),
    ]);
    const { agent: client } = await createClient(admin);
    const r = await startRun(client, await pdfWith(CV_TEXT));
    await processRun(r.body.id);
    const row = await db("gradual_cv_runs").where({ id: r.body.id }).first();
    expect(calls).toBe(2);
    expect(row).toMatchObject({ status: "done", provider: "openai", model: "openai-test", tokens_in: 1000 });
  });

  it("marks the run failed with a friendly message when every provider fails", async () => {
    setProvidersForTesting([fake("anthropic", () => JSON.stringify({ ...RESULT, initialScore: 500 })), fake("gemini", () => "oops")]);
    const { agent: client } = await createClient(admin);
    const r = await startRun(client, await pdfWith(CV_TEXT));
    await processRun(r.body.id);
    const dto = (await client.get(`/api/v1/cv/runs/${r.body.id}`)).body;
    expect(dto.status).toBe("failed");
    expect(dto.error).toBe(FAILED_MESSAGE);
    expect(JSON.stringify(dto)).not.toContain("gemini");
    expect((await db("gradual_cv_runs").where({ id: r.body.id }).first()).error).toContain("gemini#2");
    await client.get(`/api/v1/cv/runs/${r.body.id}/pdf`).expect(409);
  });

  it("does not process the same run twice", async () => {
    const seen: string[] = [];
    setProvidersForTesting([fake("anthropic", () => JSON.stringify(RESULT), seen)]);
    const { agent: client } = await createClient(admin);
    const r = await startRun(client, await pdfWith(CV_TEXT));
    await Promise.all([processRun(r.body.id), processRun(r.body.id)]);
    expect(seen).toHaveLength(1);
  });
});

describe("Input validation", () => {
  it("rejects scanned (text-less) PDFs and removes the upload", async () => {
    const { agent: client } = await createClient(admin);
    const r = await startRun(client, await pdfWith(" "));
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("imagen escaneada");
    expect(deleted).toHaveLength(1);
    expect((await client.get("/api/v1/cv/quota")).body.used).toBe(0);
  });

  it("rejects non-PDF types and files over 5 MB", async () => {
    const { agent: client } = await createClient(admin);
    await client.post("/api/v1/cv/upload-url").send({ mime: "image/png", size: 10, fileName: "a.png" }).expect(400);
    await client.post("/api/v1/cv/upload-url").send({ mime: "application/pdf", size: 6 * 1024 * 1024, fileName: "a.pdf" }).expect(400);
  });
});

describe("Access control (D51)", () => {
  it("clients only see their own runs and cannot act for others; admin must choose a client", async () => {
    const { agent: c1 } = await createClient(admin, "c1@test.pe");
    const { agent: c2, id: c2id } = await createClient(admin, "c2@test.pe");
    const r = await startRun(c1, await pdfWith(CV_TEXT));
    await c2.get(`/api/v1/cv/runs/${r.body.id}`).expect(404);
    expect((await c2.get("/api/v1/cv/runs")).body).toEqual([]);
    // A client passing clientId still uploads into their own folder
    const up = await c1.post("/api/v1/cv/upload-url").send({ mime: "application/pdf", size: 10, fileName: "a.pdf", clientId: c2id });
    expect(up.body.key).not.toContain(c2id);
    await admin.post("/api/v1/cv/upload-url").send({ mime: "application/pdf", size: 10, fileName: "a.pdf" }).expect(400);
    await c1.get("/api/v1/cv/standards").expect(403);
    expect((await admin.get("/api/v1/cv/runs")).body).toHaveLength(1);
  });
});

describe("CV footer setting (D47)", () => {
  it("is customizable and can be hidden", async () => {
    const { agent: client } = await createClient(admin);
    await admin.put("/api/v1/cv/settings").send({ footerText: "" }).expect(200);
    const r = await startRun(client, await pdfWith(CV_TEXT));
    await processRun(r.body.id);
    const pdf = await client.get(`/api/v1/cv/runs/${r.body.id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    const text = String((await extractText(await getDocumentProxy(new Uint8Array(pdf.body)), { mergePages: true })).text);
    expect(text).not.toContain("Gradual");
    expect((await admin.get("/api/v1/cv/standards")).body.footerText).toBe("");
  });
});
