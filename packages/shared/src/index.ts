import { z } from "zod";

// NOTE: Code is in English. User-facing strings (validation messages shown in the UI) are in Spanish.

// ---------- Constants ----------

/** superadmin = platform owner (D63); admin = a tenant's consultant; client = her clients. */
export const ROLES = ["superadmin", "admin", "client"] as const;
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
  /** ISO date when the client asked to delete their account (D52), or null. */
  deletionRequestedAt: string | null;
  /** True when a published policy version exists that this user has not accepted yet. */
  requiresConsent: boolean;
  /** Set when the platform superadmin is acting as this user (support mode, D66). */
  impersonation: { tenantName: string; superadminName: string } | null;
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
  /** ISO date of a pending deletion request (D52), or null. */
  deletionRequestedAt: string | null;
}

/** Admin deletes a client: the client's exact name must be typed to confirm (D53). */
export const deleteClientSchema = z.object({ confirmName: z.string().trim().min(1).max(120) });

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

// =====================================================================
// F2 — CV improver
// =====================================================================

export const CV_MAX_BYTES = 5 * 1024 * 1024;
/** Client runs per calendar month, Lima time (D30). Admin-started and failed runs do not count. */
export const CV_MONTHLY_LIMIT = 5;
export const CV_RUN_STATUSES = ["queued", "processing", "done", "failed"] as const;
export type CvRunStatus = (typeof CV_RUN_STATUSES)[number];

export const cvUploadSchema = z.object({
  mime: z.literal("application/pdf", { message: "Sube tu CV en formato PDF." }),
  size: z.number().int().positive().max(CV_MAX_BYTES, "El PDF no puede superar 5 MB"),
  fileName: z.string().trim().min(1).max(200),
});

export const cvRunCreateSchema = z.object({
  key: z.string().min(1).max(300),
  fileName: z.string().trim().min(1).max(200),
  /** Required when the admin starts a run on behalf of a client. */
  clientId: z.string().length(26).optional(),
});

export const cvStandardsSchema = z.object({ standards: z.string().trim().min(50, "Escribe al menos unas líneas de estándares").max(50_000) });
export const cvSettingsSchema = z.object({ footerText: z.string().trim().max(120) });

// ---------- Output contract (D21): keys in English, generated content in Spanish ----------

const str = z.string().trim().max(4000);
const shortStr = z.string().trim().max(300);
const optShort = shortStr.optional().default("");

export const improvedCvSchema = z.object({
  name: shortStr,
  headline: optShort,
  contact: z
    .object({ email: optShort, phone: optShort, location: optShort, linkedin: optShort, website: optShort })
    .default({ email: "", phone: "", location: "", linkedin: "", website: "" }),
  profile: str.optional().default(""),
  experience: z
    .array(
      z.object({
        role: shortStr,
        company: optShort,
        location: optShort,
        start: optShort,
        end: optShort,
        bullets: z.array(str).max(15).default([]),
      }),
    )
    .max(20)
    .default([]),
  education: z
    .array(
      z.object({ degree: shortStr, institution: optShort, location: optShort, start: optShort, end: optShort, details: str.optional().default("") }),
    )
    .max(15)
    .default([]),
  skills: z.array(shortStr).max(40).default([]),
  languages: z.array(z.object({ language: shortStr, level: optShort })).max(10).default([]),
  certifications: z.array(shortStr).max(20).default([]),
  other: z.array(z.object({ title: shortStr, items: z.array(str).max(15).default([]) })).max(6).default([]),
});
export type ImprovedCv = z.infer<typeof improvedCvSchema>;

export const cvResultSchema = z.object({
  summary: str,
  initialScore: z.number().int().min(0).max(100),
  finalScore: z.number().int().min(0).max(100),
  sections: z
    .array(
      z.object({
        name: shortStr,
        original: str.optional().default(""),
        improved: str.optional().default(""),
        comments: z.array(z.string().trim().max(1000)).max(10).default([]),
      }),
    )
    .min(1)
    .max(15),
  improvedCv: improvedCvSchema,
});
export type CvResult = z.infer<typeof cvResultSchema>;

export interface CvRunSummaryDTO {
  id: string;
  clientId: string;
  clientName: string;
  status: CvRunStatus;
  sourceFileName: string;
  startedBy: "client" | "admin";
  initialScore: number | null;
  finalScore: number | null;
  createdAt: string;
}

export interface CvRunDTO extends CvRunSummaryDTO {
  result: CvResult | null;
  /** User-facing (Spanish) error message when status is "failed". */
  error: string | null;
  promptVersion: number;
}

export interface CvQuotaDTO {
  used: number;
  limit: number;
  remaining: number;
}

export interface CvPromptVersionDTO {
  id: string;
  version: number;
  createdAt: string;
  runs: number;
}

export interface CvStandardsDTO {
  current: { id: string; version: number; standards: string; createdAt: string };
  versions: CvPromptVersionDTO[];
  footerText: string;
}

// =====================================================================
// F4 — Editable email templates (D57–D59)
// =====================================================================

export const EMAIL_TEMPLATE_KEYS = ["invitation", "reset_password", "deletion_requested", "deletion_request_admin"] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplateContent {
  subject: string;
  /** Plain text; a blank line separates paragraphs. Variables use {{name}} syntax. */
  body: string;
  buttonLabel: string;
}

export interface EmailTemplateDef {
  /** User-facing (Spanish) name and purpose shown in the editor. */
  label: string;
  description: string;
  /** Variables available in this template (without braces). */
  variables: string[];
  defaults: EmailTemplateContent;
}

/** Common variables: nombre (recipient), marca (brand name), enlace (the button link). */
const BASE_VARS = ["nombre", "marca", "enlace"];

/** Built-in templates. Labels, descriptions and default texts are customer-facing, so they are in Spanish. */
export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateDef> = {
  invitation: {
    label: "Invitación",
    description: "Se envía cuando invitas a un cliente para que active su cuenta.",
    variables: BASE_VARS,
    defaults: {
      subject: "Activa tu cuenta en {{marca}}",
      body: "Hola {{nombre}}:\n\nTe damos la bienvenida a {{marca}}. Para activar tu cuenta, crea tu contraseña con el siguiente botón.\n\nEste enlace vence en 7 días.",
      buttonLabel: "Activar mi cuenta",
    },
  },
  reset_password: {
    label: "Recuperar contraseña",
    description: "Se envía cuando alguien pide restablecer su contraseña.",
    variables: BASE_VARS,
    defaults: {
      subject: "Restablece tu contraseña de {{marca}}",
      body: "Hola {{nombre}}:\n\nRecibimos una solicitud para restablecer tu contraseña en {{marca}}.\n\nEste enlace vence en 1 hora. Si no lo solicitaste, ignora este correo.",
      buttonLabel: "Crear nueva contraseña",
    },
  },
  deletion_requested: {
    label: "Solicitud de eliminación (al cliente)",
    description: "Confirma al cliente que recibimos su pedido de eliminar su cuenta.",
    variables: BASE_VARS,
    defaults: {
      subject: "Recibimos tu solicitud de eliminación de cuenta",
      body: "Hola {{nombre}}:\n\nRecibimos tu solicitud para eliminar tu cuenta en {{marca}} y todos tus datos. La procesaremos pronto; cuando lo hagamos, ya no podrás ingresar.\n\nSi cambiaste de opinión, puedes cancelar la solicitud desde tu perfil.",
      buttonLabel: "Ir a mi perfil",
    },
  },
  deletion_request_admin: {
    label: "Solicitud de eliminación (a ti)",
    description: "Te avisa que un cliente pidió eliminar su cuenta.",
    variables: [...BASE_VARS, "cliente", "correo_cliente"],
    defaults: {
      subject: "Solicitud de eliminación de cuenta: {{cliente}}",
      body: "Hola {{nombre}}:\n\n{{cliente}} ({{correo_cliente}}) solicitó eliminar su cuenta y todos sus datos. Revisa la solicitud en su ficha.\n\nSegún la política de privacidad, debes atender la solicitud dentro de los plazos legales.",
      buttonLabel: "Ver ficha del cliente",
    },
  },
};

export const emailTemplateSchema = z.object({
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(200),
  body: z.string().trim().min(1, "El texto es obligatorio").max(5000),
  buttonLabel: z.string().trim().min(1, "El texto del botón es obligatorio").max(60),
});

export interface EmailTemplateDTO extends EmailTemplateContent {
  key: EmailTemplateKey;
  label: string;
  description: string;
  variables: string[];
  /** True when the tenant has customized this template. */
  isCustom: boolean;
  defaults: EmailTemplateContent;
}

// =====================================================================
// F4 — Platform: tenants, metrics, impersonation (D60–D68)
// =====================================================================

export const TENANT_STATUSES = ["active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

const subdomain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/, "Usa solo letras minúsculas, números y guiones (sin espacios ni tildes)");

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subdomain,
  adminName: z.string().trim().min(2).max(120),
  adminEmail: email,
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  status: z.enum(TENANT_STATUSES),
});

export const inviteTenantAdminSchema = z.object({ name: z.string().trim().min(2).max(120), email });

export interface TenantMetricsDTO {
  clientsActive: number;
  clientsInvited: number;
  routes: number;
  cvRunsMonth: number;
  cvRunsTotal: number;
  /** Sum of recorded LLM cost this calendar month (Lima); null when no pricing is configured. */
  llmCostMonthUsd: number | null;
  lastActivityAt: string | null;
}

export interface TenantSummaryDTO {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  status: TenantStatus;
  isMain: boolean;
  createdAt: string;
  metrics: TenantMetricsDTO;
}

export interface TenantAdminDTO {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  lastLoginAt: string | null;
}

export interface TenantDetailDTO extends TenantSummaryDTO {
  admins: TenantAdminDTO[];
  /** Base domain for tenant subdomains, e.g. "genia.pro" (D62). */
  domainSuffix: string;
}
