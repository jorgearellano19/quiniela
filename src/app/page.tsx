import { redirect } from "next/navigation";
import { getServerSession } from "@/infrastructure/auth/session";

export default async function HomePage() {
  const session = await getServerSession();
  redirect(session ? "/app" : "/sign-in");
}
