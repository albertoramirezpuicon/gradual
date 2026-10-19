import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  /** Interface to bind. Use 127.0.0.1 in production (nginx in front); 0.0.0.0 to reach it from the LAN. */
  HOST: z.string().default("0.0.0.0"),
  APP_BASE_URL: z.string().url(),
  DEFAULT_TENANT_SLUG: z.string().default("gradual"),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),

  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  AWS_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string(),
  /** Optional S3-compatible endpoint (e.g. MinIO in development). */
  S3_ENDPOINT: z.string().url().optional(),
  MAIL_TRANSPORT: z.enum(["console", "ses", "memory"]).default("console"),
  MAIL_FROM: z.string(),

  // --- LLM (D44): keys dedicated to Gradual; a provider is used only when its key is set ---
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  /** Rotation order; the first provider with a key is tried first, the rest are failover. */
  LLM_PROVIDERS: z.string().default("anthropic,openai,gemini"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  /** Optional per-model prices in USD per million tokens: {"model":[input,output]} */
  LLM_PRICING: z.string().default("{}"),
  /** Development only: answer with a canned sample result instead of calling a real LLM (ignored in production). */
  LLM_STUB: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  /** Set to false to disable the in-process CV worker (e.g. when running a separate worker). */
  CV_WORKER: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env: Env = parsed.data;
