import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/server";

/** Entry point: routes the user to the right area based on session, consent and role. */
export default async function Home() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.requiresConsent) redirect("/consent");
  redirect(homeFor(me.role));
}
