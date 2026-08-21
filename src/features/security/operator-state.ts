import type { SecurityUser } from "@/application/auth-security/use-cases";

export type OperatorState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  user?: SecurityUser;
  temporaryPassword?: string;
  temporaryPasswordExpiresAt?: string;
}>;

export const initialOperatorState: OperatorState = { status: "idle" };
