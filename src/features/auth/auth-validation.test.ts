import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

describe("authentication validation", () => {
  it("normalizes valid sign-in credentials", () => {
    const result = signInSchema.parse({
      email: "  USUARIO@EJEMPLO.COM ",
      password: "password-seguro",
    });

    expect(result.email).toBe("usuario@ejemplo.com");
  });

  it("rejects invalid emails and password boundaries", () => {
    expect(
      signInSchema.safeParse({ email: "no-es-correo", password: "corta" })
        .success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({
        email: "usuario@ejemplo.com",
        password: "a".repeat(129),
      }).success,
    ).toBe(false);
  });

  it("requires a name and matching password confirmation", () => {
    const result = signUpSchema.safeParse({
      name: " ",
      email: "usuario@ejemplo.com",
      password: "password-seguro",
      confirmPassword: "password-distinto",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });
});
