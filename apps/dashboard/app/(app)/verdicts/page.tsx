import { redirect } from "next/navigation";

/** Every executed decision is a transaction; every refusal never existed. The real
 *  record lives on the transactions page. */
export default function VerdictsRedirect(): never {
  redirect("/transactions");
}
