import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuth } from "./index";
export async function requireAccount() {
  await connection();
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  return { email: session.user.email, emailVerified: session.user.emailVerified };
}
export async function redirectAuthenticated() {
  await connection();
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (session) redirect("/dashboard");
}
