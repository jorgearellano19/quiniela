"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/infrastructure/auth/auth";
import { toAuthActionError } from "./auth-errors";
import type { AuthActionState } from "./auth-state";

export async function signOutAction(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  void _previousState;
  void _formData;

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    return toAuthActionError("sign-out", error);
  }

  redirect("/sign-in?signedOut=1");
}
