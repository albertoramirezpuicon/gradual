import type { Metadata } from "next";
import type { PolicyDTO, PolicyVersionDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { PolicyEditor } from "./editor";

export const metadata: Metadata = { title: "Privacidad" };

export default async function Page() {
  const [cur, list] = await Promise.all([serverFetch("/admin/policies/current"), serverFetch("/admin/policies")]);
  const current = (await cur.json()) as PolicyDTO | null;
  return <PolicyEditor current={current} versions={(await list.json()) as PolicyVersionDTO[]} />;
}
