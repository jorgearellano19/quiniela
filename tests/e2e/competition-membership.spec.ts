import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUsersByEmail,
  createIntegrationDatabase,
} from "../../src/test/integration/database";

const password = "Quiniela-test-2026";
const databaseUrl = process.env.TEST_DATABASE_URL;

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Confirmar contraseña").fill(password);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("Admin invita, la persona solicita acceso y queda activa", async ({ browser }) => {
  test.skip(!databaseUrl, "TEST_DATABASE_URL is required for deterministic cleanup.");

  const suffix = randomUUID();
  const adminEmail = `admin-${suffix}@example.test`;
  const participantEmail = `participant-${suffix}@example.test`;
  const { client, database } = createIntegrationDatabase();
  const adminContext = await browser.newContext({ ...devicesForMobile });
  const participantContext = await browser.newContext({ ...devicesForMobile });

  try {
    const admin = await adminContext.newPage();
    await signUp(admin, "Admin E2E", adminEmail);
    await admin.getByRole("link", { name: "Crear quiniela" }).click();
    await admin.getByLabel("Nombre").fill("Copa E2E");
    await admin.getByLabel("Tipo de competencia").click();
    await admin.getByRole("option", { name: "Liga", exact: true }).click();
    await admin.getByLabel(/Nota de reglas/).fill("Reglas visibles antes de solicitar.");
    await admin.getByRole("button", { name: "Crear quiniela" }).click();
    await admin.getByRole("link", { name: "Participantes" }).click();
    await admin.getByRole("button", { name: "Generar enlace" }).click();
    const invitationUrl = await admin.getByLabel("Enlace de invitación").inputValue();

    const participant = await participantContext.newPage();
    await participant.goto(invitationUrl);
    await expect(participant).toHaveURL(/\/sign-in\?returnTo=/);
    await participant.getByRole("link", { name: "Créala aquí" }).click();
    await participant.getByLabel("Nombre").fill("Participante E2E");
    await participant.getByLabel("Correo electrónico").fill(participantEmail);
    await participant.getByLabel("Contraseña", { exact: true }).fill(password);
    await participant.getByLabel("Confirmar contraseña").fill(password);
    await participant.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(
      participant.getByText("Reglas visibles antes de solicitar."),
    ).toBeVisible();
    await participant.getByRole("button", { name: "Solicitar unirme" }).click();
    await expect(participant.getByText("Solicitud pendiente")).toBeVisible();

    await admin.reload();
    const participantCard = admin.locator('[data-slot="card"]').filter({
      hasText: participantEmail,
    });
    await participantCard.getByRole("button", { name: "Aprobar" }).click();
    await participant.reload();
    await expect(participant.getByRole("heading", { name: "Copa E2E" })).toBeVisible();

    await admin.getByRole("button", { name: "Iniciar quiniela" }).click();
    const startDialog = admin.getByRole("alertdialog");
    await expect(startDialog.getByText("Las reglas y la lista")).toBeVisible();
    await startDialog.getByRole("button", { name: "Cancelar" }).click();
    await admin.getByRole("button", { name: "Iniciar quiniela" }).click();
    await admin
      .getByRole("alertdialog")
      .getByRole("button", { name: "Iniciar quiniela" })
      .click();
    await expect(admin.getByText("Iniciada")).toBeVisible();

    await participant.goto(invitationUrl);
    await expect(participant.getByText("Invitación no disponible")).toBeVisible();
  } finally {
    await adminContext.close();
    await participantContext.close();
    await cleanupUsersByEmail(database, [adminEmail, participantEmail]);
    await client.end();
  }
});

const devicesForMobile = {
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
};
