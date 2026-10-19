import { describe, it, expect, afterEach, vi } from "vitest";
import { extractJson, adapters } from "../src/lib/llm.js";

afterEach(() => vi.unstubAllGlobals());

describe("extractJson", () => {
  it("parses JSON inside code fences or stray text", () => {
    expect(extractJson('Aquí está:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('texto {"a":[1,2]} más texto')).toEqual({ a: [1, 2] });
  });

  it("repairs common model mistakes such as an unescaped quote inside a string", () => {
    const broken = '{"bullets":["Lideré el proyecto "Impulsa" con 5 personas", "Otro logro"]}';
    expect(() => JSON.parse(broken)).toThrow();
    const fixed = extractJson(broken) as { bullets: string[] };
    expect(fixed.bullets).toHaveLength(2);
    expect(fixed.bullets[0]).toContain("Impulsa");
  });

  it("still fails clearly when there is no JSON at all", () => {
    expect(() => extractJson("lo siento, no puedo")).toThrow("No JSON object");
  });
});

describe("Anthropic adapter (structured output)", () => {
  it("forces the tool and returns the tool input as JSON", async () => {
    let sent: any;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "submit_cv_result", input: { summary: 'Texto con "comillas"', n: 1 } }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200 },
      );
    });
    const res = await adapters.anthropic("k", "m").complete({
      system: "s",
      user: "u",
      maxTokens: 100,
      tool: { name: "submit_cv_result", description: "d", schema: { type: "object" } },
    });
    expect(sent.tool_choice).toEqual({ type: "tool", name: "submit_cv_result" });
    expect(sent.tools[0].input_schema).toEqual({ type: "object" });
    expect(JSON.parse(res.text)).toEqual({ summary: 'Texto con "comillas"', n: 1 });
    expect(res).toMatchObject({ tokensIn: 10, tokensOut: 20 });
  });

  it("reports truncated output instead of returning partial JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ stop_reason: "max_tokens", content: [] }), { status: 200 }));
    await expect(adapters.anthropic("k", "m").complete({ system: "s", user: "u", maxTokens: 1 })).rejects.toThrow("truncated");
  });
});
