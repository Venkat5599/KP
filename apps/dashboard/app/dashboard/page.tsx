import { redirect } from "next/navigation";

/** The dapp lives at /. Kept for old links. */
export default function DashboardRedirect(): never {
  redirect("/");
}
