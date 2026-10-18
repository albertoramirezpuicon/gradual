import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/server";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage() {
  if (await getMe()) redirect("/");
  return <LoginForm />;
}
