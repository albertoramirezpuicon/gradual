import type { Metadata } from "next";
import { getBranding } from "@/lib/server";
import { BrandingForm } from "./form";

export const metadata: Metadata = { title: "Marca" };

export default async function Page() {
  return <BrandingForm initial={await getBranding()} />;
}
