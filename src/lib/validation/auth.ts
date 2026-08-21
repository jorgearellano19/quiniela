import { z } from "zod";

const email = z
  .string()
  .trim()
  .max(320, "El correo es demasiado largo.")
  .pipe(z.email("Escribe un correo válido."))
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(128, "La contraseña no puede superar 128 caracteres.");

export const signInSchema = z.object({
  email,
  password,
});

export const signUpCredentialSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre.")
    .max(80, "El nombre no puede superar 80 caracteres."),
  email,
  password,
});

export const signUpSchema = signUpCredentialSchema
  .extend({ confirmPassword: z.string() })
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
