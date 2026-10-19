import { env } from "./env.js";

/**
 * Minimal multi-provider LLM client (D44): Anthropic, OpenAI and Gemini over plain HTTPS.
 * Providers without a key are skipped; the rest are tried in LLM_PROVIDERS order (failover).
 */

export type ProviderName = "anthropic" | "openai" | "gemini";

export interface LlmRequest {
  system: string;
  user: string;
  /** Upper bound for the response length. */
  maxTokens: number;
}

export interface LlmResponse {
  provider: ProviderName;
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface Provider {
  name: ProviderName;
  model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.LLM_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const anthropic = (key: string, model: string): Provider => ({
  name: "anthropic",
  model,
  async complete(req) {
    const j = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: "user", content: req.user }] },
    );
    const text = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    return { provider: "anthropic", model, text, tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0 };
  },
});

const openai = (key: string, model: string): Provider => ({
  name: "openai",
  model,
  async complete(req) {
    const j = await postJson(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${key}` },
      {
        model,
        max_completion_tokens: req.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      },
    );
    return {
      provider: "openai",
      model,
      text: j.choices?.[0]?.message?.content ?? "",
      tokensIn: j.usage?.prompt_tokens ?? 0,
      tokensOut: j.usage?.completion_tokens ?? 0,
    };
  },
});

const gemini = (key: string, model: string): Provider => ({
  name: "gemini",
  model,
  async complete(req) {
    const j = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { maxOutputTokens: req.maxTokens, responseMimeType: "application/json" },
      },
    );
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    return {
      provider: "gemini",
      model,
      text,
      tokensIn: j.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0,
    };
  },
});

let override: Provider[] | null = null;

/** Tests (and local demos) can replace the real providers. */
export function setProvidersForTesting(providers: Provider[] | null) {
  override = providers;
}

/** Development stub (LLM_STUB=true): waits a few seconds and returns a valid sample result. */
const stub: Provider = {
  name: "openai",
  model: "stub",
  async complete(req) {
    await new Promise((r) => setTimeout(r, 3000));
    const firstLine = req.user.split("<cv>")[1]?.trim().split(/[.\n]/)[0]?.slice(0, 60) || "Nombre Apellido";
    const sample = {
      summary: "Versión de prueba (LLM_STUB): reorganizamos tu CV y destacamos tus logros. Completa los datos marcados.",
      initialScore: 52,
      finalScore: 84,
      sections: [
        {
          name: "Perfil profesional",
          original: "Persona proactiva con ganas de aprender.",
          improved: "Profesional con [indica los años] años de experiencia en tu área, orientada a resultados.",
          comments: ["Evita rasgos genéricos como “proactiva”.", "Indica el rol al que apuntas."],
        },
        {
          name: "Experiencia",
          original: "Encargada de redes sociales.",
          improved: "Gestioné las redes sociales de la marca y aumenté la interacción en [agrega una cifra: %].",
          comments: ["Empieza cada viñeta con un verbo de acción.", "Cuantifica tus logros."],
        },
      ],
      improvedCv: {
        name: firstLine,
        headline: "Profesional de Marketing Digital",
        contact: { email: "correo@ejemplo.pe", phone: "", location: "Lima, Perú", linkedin: "", website: "" },
        profile: "Profesional con [indica los años] años de experiencia en marketing digital, orientada a resultados.",
        experience: [
          { role: "Asistente de Marketing", company: "Empresa Ejemplo S.A.C.", location: "Lima", start: "2021", end: "actualidad", bullets: ["Gestioné campañas digitales con un presupuesto de [agrega una cifra: S/]."] },
        ],
        education: [{ degree: "Bachiller en Comunicaciones", institution: "Universidad Ejemplo", location: "", start: "2016", end: "2020", details: "" }],
        skills: ["Meta Ads", "Excel", "Canva"],
        languages: [{ language: "Inglés", level: "Intermedio" }],
        certifications: [],
        other: [],
      },
    };
    return { provider: "openai", model: "stub", text: JSON.stringify(sample), tokensIn: 0, tokensOut: 0 };
  },
};

/** Configured providers in rotation order; providers without a key are left out. */
export function providers(): Provider[] {
  if (override) return override;
  if (env.LLM_STUB && env.NODE_ENV !== "production") return [stub];
  const factories: Record<ProviderName, () => Provider | null> = {
    anthropic: () => (env.ANTHROPIC_API_KEY ? anthropic(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null),
    openai: () => (env.OPENAI_API_KEY ? openai(env.OPENAI_API_KEY, env.OPENAI_MODEL) : null),
    gemini: () => (env.GEMINI_API_KEY ? gemini(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null),
  };
  return env.LLM_PROVIDERS.split(",")
    .map((s) => s.trim() as ProviderName)
    .filter((n) => n in factories)
    .map((n) => factories[n]())
    .filter((p): p is Provider => p !== null);
}

/** Cost in USD from optional LLM_PRICING ({"model":[inputPerM, outputPerM]}); null when unknown. */
export function costUsd(model: string, tokensIn: number, tokensOut: number): number | null {
  try {
    const prices = JSON.parse(env.LLM_PRICING) as Record<string, [number, number]>;
    const p = prices[model];
    return p ? (tokensIn * p[0] + tokensOut * p[1]) / 1_000_000 : null;
  } catch {
    return null;
  }
}

/** Extracts the first JSON object from a model reply (tolerates code fences or stray text). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}
