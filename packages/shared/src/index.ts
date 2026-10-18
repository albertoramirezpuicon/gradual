import { z } from "zod";

// NOTE: Code is in English. User-facing strings (validation messages shown in the UI) are in Spanish.

// ---------- Constants ----------

export const ROLES = ["admin", "client"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["invited", "active", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Closed list of fonts selectable in Branding (D3). All available on Google Fonts. */
export const FONTS = [
  "Mulish",
  "Inter",
  "Lato",
  "Montserrat",
  "Nunito",
  "Open Sans",
  "Poppins",
  "Raleway",
  "Roboto",
  "Source Sans 3",
  "Work Sans",
  "Merriweather",
  "Playfair Display",
] as const;
export type FontName = (typeof FONTS)[number];

export const DEFAULT_BRANDING = {
  brandName: "Gradual",
  primaryColor: "#2F5D62",
  secondaryColor: "#E07A5F",
  font: "Mulish" as FontName,
};

export const PASSWORD_MIN = 10;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;

// ---------- Request schemas ----------

const email = z.string().trim().toLowerCase().email("Correo no válido").max(254);
const password = z
  .string()
  .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
  .max(200);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido (usa formato #RRGGBB)");

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120),
  password,
  acceptPolicy: z.literal(true, { message: "Debes aceptar la política de privacidad" }),
});

export const acceptConsentSchema = z.object({ policyId: z.string().length(26) });

export const inviteClientSchema = z.object({
  email,
  name: z.string().trim().min(2).max(120),
});

export const brandingSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  font: z.enum(FONTS),
});

export const logoUploadSchema = z.object({
  mime: z.enum(LOGO_MIME),
  size: z.number().int().positive().max(LOGO_MAX_BYTES, "El logo no puede superar 2 MB"),
});

export const logoConfirmSchema = z.object({ key: z.string().min(1).max(300) });

export const publishPolicySchema = z.object({
  content: z.string().trim().min(50).max(100_000),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

// ---------- Response types ----------

export interface Branding {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  font: FontName;
  logoUrl: string | null;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** True when a published policy version exists that this user has not accepted yet. */
  requiresConsent: boolean;
}

export interface PolicyDTO {
  id: string;
  version: number;
  content: string;
  publishedAt: string;
}

export interface PolicyVersionDTO {
  id: string;
  version: number;
  publishedAt: string;
  acceptances: number;
}

export interface ClientDTO {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface InvitationDTO {
  email: string;
  name: string;
  policy: PolicyDTO | null;
}

// =====================================================================
// F1 — Routes, stages, resources, assignments, progress
// =====================================================================

export const RESOURCE_TYPES = ["file", "link", "video", "text"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Allowed file types for `file` resources (D38). */
export const RESOURCE_MIME = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
} as const;
export type ResourceMime = keyof typeof RESOURCE_MIME;
export const RESOURCE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Extracts a YouTube video ID from watch, youtu.be, shorts, embed and live URLs (D42).
 * Returns null when the URL is not a recognizable YouTube video link.
 */
export function parseYouTubeId(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      id = m ? m[2]! : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

const title = z.string().trim().min(1, "El título es obligatorio").max(160);
const description = z.string().trim().max(2000).optional().default("");
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Ingresa un enlace válido que empiece con http:// o https://");

export const routeCreateSchema = z.object({ title, description });
export const routeUpdateSchema = z.object({ title, description, published: z.boolean() });
export const stageSchema = z.object({ title, description });
export const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export const resourceUploadSchema = z.object({
  mime: z.enum(Object.keys(RESOURCE_MIME) as [ResourceMime, ...ResourceMime[]], {
    message: "Formato no permitido. Usa PDF, Word (DOCX) o PowerPoint (PPTX).",
  }),
  size: z.number().int().positive().max(RESOURCE_MAX_BYTES, "El archivo no puede superar 20 MB"),
  fileName: z.string().trim().min(1).max(200),
});

/** Create/update payload; fields required depend on the resource type. */
export const resourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file"), title, description, key: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("link"), title, description, url: httpUrl }),
  z.object({
    type: z.literal("video"),
    title,
    description,
    url: httpUrl.refine((v) => parseYouTubeId(v) !== null, "Ingresa un enlace de YouTube válido"),
  }),
  z.object({ type: z.literal("text"), title, description, html: z.string().max(200_000) }),
]);
export type ResourceInput = z.infer<typeof resourceSchema>;

/** Resource update: same as create, but a file resource may keep its current file (no key). */
export const resourceUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file"),
    title,
    description,
    key: z.string().min(1).max(300).optional(),
    fileName: z.string().trim().min(1).max(200).optional(),
  }),
  resourceSchema.options[1],
  resourceSchema.options[2],
  resourceSchema.options[3],
]);

export const completionSchema = z.object({ done: z.boolean() });
export const clientRoutesSchema = z.object({ routeIds: z.array(z.string().length(26)).max(50) });

export interface ResourceDTO {
  id: string;
  type: ResourceType;
  title: string;
  description: string;
  position: number;
  /** file */
  fileName: string | null;
  mime: string | null;
  sizeBytes: number | null;
  /** link and video */
  url: string | null;
  /** video */
  youtubeId: string | null;
  /** text (sanitized HTML) */
  html: string | null;
}

export interface StageDTO {
  id: string;
  title: string;
  description: string;
  position: number;
  resources: ResourceDTO[];
}

export interface RouteSummaryDTO {
  id: string;
  title: string;
  description: string;
  published: boolean;
  position: number;
  stageCount: number;
  assignedCount: number;
}

export interface RouteDetailDTO extends Omit<RouteSummaryDTO, "stageCount" | "assignedCount"> {
  stages: StageDTO[];
}

export interface StageCompletionDTO {
  stageId: string;
  markedBy: "client" | "admin";
  markedAt: string;
}

/** A client's view of one of their routes. */
export interface ClientRouteDTO extends RouteDetailDTO {
  completions: StageCompletionDTO[];
}

/** Card on the client's "Mis rutas" page. */
export interface ClientRouteSummaryDTO {
  id: string;
  title: string;
  description: string;
  stageCount: number;
  doneCount: number;
}

/** Admin: progress matrix for one route (D41). */
export interface RouteProgressDTO {
  stages: { id: string; title: string }[];
  clients: { id: string; name: string; email: string; doneStageIds: string[] }[];
}

/** Admin: one client with their assigned routes and per-stage progress. */
export interface ClientDetailDTO extends ClientDTO {
  routes: {
    id: string;
    title: string;
    published: boolean;
    stages: { id: string; title: string; done: StageCompletionDTO | null }[];
  }[];
  availableRoutes: { id: string; title: string; published: boolean }[];
}
