import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { user } from "../../src/infrastructure/db/schema";
import { createAuthSecurityRepository } from "../../src/infrastructure/auth/security-repository";
import {
  cleanupUsersByEmail,
  createIntegrationDatabase,
} from "../../src/test/integration/database";

const password = "Quiniela-test-2026";

test("sign-up, sign-out, rejected credentials, and sign-in form one secure flow", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${Date.now() % 200}` });
  const email = `auth-${randomUUID()}@example.test`;
  const { client, database } = createIntegrationDatabase();
  try {
    await page.goto("/sign-up");
    await page.getByLabel("Nombre").fill("Cuenta E2E");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByLabel("Confirmar contraseña").fill(password);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);

    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("not-the-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(
      page.getByText("El correo o la contraseña no son correctos."),
    ).toBeVisible();

    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    await cleanupUsersByEmail(database, [email]);
    await client.end();
  }
});

test("temporary password forces replacement and suspension denies access", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": `203.0.113.${Date.now() % 200}` });
  const email = `recovery-${randomUUID()}@example.test`;
  const { client, database } = createIntegrationDatabase();
  try {
    await page.goto("/sign-up");
    await page.getByLabel("Nombre").fill("Recuperación E2E");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByLabel("Confirmar contraseña").fill(password);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page).toHaveURL(/\/app$/);
    const [target] = await database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    const security = createAuthSecurityRepository(database);
    const recovery = await security.issueTemporaryPassword({
      actorId: target!.id,
      targetId: target!.id,
      reason: "Validación E2E",
      verificationMethod: "Prueba automatizada",
    });

    await page.goto("/sign-in");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(recovery.temporaryPassword);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/account\/change-password$/);
    await expect(page.getByText("Cambio obligatorio")).toBeVisible();
    const replacement = "Replacement-test-2026";
    await page.getByLabel("Contraseña actual").fill(recovery.temporaryPassword);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(replacement);
    await page.getByLabel("Confirmar nueva contraseña").fill(replacement);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await security.suspend(target!.id, target!.id, "Validación E2E");
    await page.goto("/sign-in");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(replacement);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(
      page.getByText("El correo o la contraseña no son correctos."),
    ).toBeVisible();
  } finally {
    await cleanupUsersByEmail(database, [email]);
    await client.end();
  }
});

test("credential rate limit returns safe feedback", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": `192.0.2.${Date.now() % 200}` });
  await page.goto("/sign-in");
  const email = `limit-${randomUUID()}@example.test`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("invalid-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
  }
  await expect(page.getByText(/Demasiados intentos/)).toBeVisible();
});
