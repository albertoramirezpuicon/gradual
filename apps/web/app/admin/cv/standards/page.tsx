import type { Metadata } from "next";
import type { CvStandardsDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { StandardsEditor } from "./editor";

export const metadata: Metadata = { title: "Estándares de CV" };

export default async function Page() {
  const r = await serverFetch("/cv/standards");
  return <StandardsEditor initial={(await r.json()) as CvStandardsDTO} />;
}
