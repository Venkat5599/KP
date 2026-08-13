import { redirect } from "next/navigation";

/** The dapp lives at /execute (the landing is /). Kept for old links. */
export default function DashboardRedirect(): never {
  redirect("/execute");
}
