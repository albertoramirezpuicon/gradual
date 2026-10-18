import { redirect } from "next/navigation";
import { getMe } from "@/lib/server";

/** Entry point: routes the user to the right area based on session, consent and role. */
export default async function Home() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.requiresConsent) redirect("/consent");
  redirect(me.role === "admin" ? "/admin" : "/app");
}
