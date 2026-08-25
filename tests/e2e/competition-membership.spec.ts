import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
    await expect(admin.getByRole("button", { name: "Abrir menú" })).toBeVisible();
    await admin.getByRole("button", { name: "Abrir menú" }).click();
    await expect(admin.getByRole("link", { name: "Seguridad" })).toBeVisible();
    await admin.getByRole("button", { name: "Cerrar menú" }).click();
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

test("Admin prepara las cinco preguntas, publica y ve la jornada congelada", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  test.skip(!databaseUrl, "TEST_DATABASE_URL is required for deterministic cleanup.");
  const suffix = randomUUID();
  const adminEmail = `round-admin-${suffix}@example.test`;
  const { client, database } = createIntegrationDatabase();
  const context = await browser.newContext({ ...devicesForMobile });
  try {
    const page = await context.newPage();
    await signUp(page, "Admin Jornadas", adminEmail);
    await page.getByRole("link", { name: "Crear quiniela" }).click();
    await page.getByLabel("Nombre").fill("Copa Jornadas E2E");
    await page.getByLabel("Tipo de competencia").click();
    await page.getByRole("option", { name: "Liga", exact: true }).click();
    await page.getByRole("button", { name: "Crear quiniela" }).click();
    await expect(page).toHaveURL(/\/app\/competitions\/[^/?]+\?created=1$/);
    const competitionUrl = page.url();
    await page.getByRole("link", { name: "Jornadas" }).click();
    await page.getByRole("button", { name: "Crear jornada" }).click();
    await page.getByLabel("Nombre").fill("Fecha inaugural");
    await page.getByLabel("Inicio de jornada").fill("2027-01-01T12:00");
    await page.getByRole("button", { name: "Crear jornada" }).click();
    await page.getByRole("link", { name: /Fecha inaugural/ }).click();
    await expect(page).toHaveURL(/\/rounds\/[^/]+$/);
    const roundUrl = page.url();

    await page.goto(competitionUrl);
    await page.getByRole("link", { name: "Participantes" }).click();
    await page.getByRole("button", { name: "Iniciar quiniela" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Iniciar quiniela" })
      .click();
    await page.goto(roundUrl);

    await addQuestion(page, "Marcador", "México vs Canadá", async (form) => {
      await form.getByLabel("Local").fill("México");
      await form.getByLabel("Visitante").fill("Canadá");
    });
    await addQuestion(page, "Valor más cercano", "Total de goles");
    await addQuestion(page, "Opciones", "Equipo campeón", async (form) => {
      await form.getByLabel("Opciones").fill("México");
      await form.getByRole("button", { name: "Agregar", exact: true }).click();
      await form.getByLabel("Opciones").fill("Canadá");
      await form.getByRole("button", { name: "Agregar", exact: true }).click();
    });
    await addQuestion(page, "Texto abierto", "Nombre del goleador");
    await addQuestion(page, "Valor exacto", "Minuto del primer gol");

    await page.getByRole("button", { name: "Publicar y abrir jornada" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirmar" })
      .click();
    await expect(page.getByText("Esta jornada está activa")).toBeVisible();
    await expect(page.getByText("Editar pregunta")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Publicar y abrir jornada" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await cleanupUsersByEmail(database, [adminEmail]);
    await client.end();
  }
});

async function addQuestion(
  page: Page,
  type: string,
  prompt: string,
  configure?: (form: Locator) => Promise<void>,
) {
  await page.getByRole("button", { name: "Agregar pregunta", exact: true }).click();
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Agregar pregunta" });
  const form = card.locator("form");
  await form.getByLabel("Tipo de pregunta").click();
  await page.getByRole("option", { name: type, exact: true }).click();
  if (type !== "Marcador")
    await form.getByLabel("Pregunta", { exact: true }).fill(prompt);
  await configure?.(form);
  await form.getByRole("button", { name: "Agregar pregunta" }).click();
  const title = page.locator("button[aria-controls]").filter({ hasText: prompt });
  await expect(title).toBeVisible();
  await title.click();
  await expect(
    title.locator("xpath=ancestor::*[@data-slot='card'][1]").locator("time"),
  ).toContainText("12:00 p.m.");
}

const devicesForMobile = {
  viewport: { width: 320, height: 800 },
  isMobile: true,
  hasTouch: true,
};
