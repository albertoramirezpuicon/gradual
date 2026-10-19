import type { Metadata } from "next";
import type { EmailTemplateDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { EmailsEditor } from "./editor";

export const metadata: Metadata = { title: "Correos" };

export default async function Page() {
  const r = await serverFetch("/admin/email-templates");
  return <EmailsEditor initial={(await r.json()) as EmailTemplateDTO[]} />;
}
