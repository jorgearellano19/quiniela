export type AuthField = "name" | "email" | "password" | "confirmPassword";

export type AuthActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, readonly string[]>>;
}>;

export const initialAuthActionState: AuthActionState = { status: "idle" };
