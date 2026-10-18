import { createHash, randomBytes } from "node:crypto";
import { ulid } from "ulid";
import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export const newId = () => ulid();
export const now = () => new Date();
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Random URL-safe token plus its SHA-256 hash (only the hash is stored). */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Error with an HTTP status. The message is shown to the user, so it is written in Spanish. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, first?.message ?? "Datos no válidos", r.error.issues);
  }
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Ocurrió un error inesperado. Inténtalo de nuevo." });
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
