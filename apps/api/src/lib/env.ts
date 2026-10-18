import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
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
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env: Env = parsed.data;
