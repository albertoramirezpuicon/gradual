import type { Metadata } from "next";
import { ResetForm } from "./form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}
