import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  competition,
  competitionParticipant,
  playoffMatchup,
  playoffRound,
  playoffSeed,
  question,
  questionScoring,
  round,
  user,
} from "../../src/infrastructure/db/schema";
import { createCompetitionRepository } from "../../src/infrastructure/competition/competition-repository";
import {
  cleanupUsersByEmail,
  createIntegrationDatabase,
  IntegrationTestData,
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

test("Admin publica cinco preguntas y guarda sus pronósticos como participante", async ({
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
    await page.getByRole("link", { name: "Editar configuración" }).click();
    await page.getByLabel("Cobrar una cuota por jornada").check();
    await page.getByLabel("Cuota por jornada (MXN)").fill("250.00");
    await page.getByLabel("Deuda máxima (MXN)").fill("0.00");
    await page.getByLabel("Premio por jornada (MXN)").fill("1000.00");
    await page.getByRole("button", { name: "Guardar pagos" }).click();
    await expect(page.getByText("Configuración de pagos guardada.")).toBeVisible();
    await page.goto(competitionUrl);
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
    const publishedOptions = page.locator('[data-slot="card"]').filter({
      hasText: "Equipo campeón",
    });
    await publishedOptions
      .getByRole("button", { name: /3 · Opciones.*Equipo campeón/ })
      .click();
    await expect(publishedOptions.getByText("Opciones publicadas")).toBeVisible();
    await expect(publishedOptions.getByText("México", { exact: true })).toBeVisible();
    await expect(publishedOptions.getByText("Canadá", { exact: true })).toBeVisible();

    await page.goto(competitionUrl);
    await page.getByRole("link", { name: "Pagos" }).click();
    await expect(page.getByText("Restringido")).toBeVisible();
    await expect(page.getByText("$250.00", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Monto (MXN)").fill("250.00");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText("Pago registrado.")).toBeVisible();
    await expect(
      page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Registrar pago" }) })
        .getByLabel("Monto (MXN)"),
    ).toHaveValue("");
    await expect(page.getByText("Elegible")).toBeVisible();
    await page.goto(competitionUrl);
    await page.getByRole("link", { name: "Pronósticos" }).click();
    await page.getByRole("link", { name: /Fecha inaugural/ }).click();

    const match = page.locator('[data-slot="card"]').filter({
      hasText: "Marcador",
    });
    await expect(
      match.getByRole("button", { name: "Guardar pronóstico" }),
    ).toBeDisabled();
    await match.getByLabel("México").fill("2");
    await match.getByLabel("Canadá").fill("1");
    await expect(match.getByRole("button", { name: "Guardar pronóstico" })).toBeEnabled();
    await match.getByRole("button", { name: "Guardar pronóstico" }).click();
    await expect(
      match.getByRole("button", { name: "Guardar pronóstico" }),
    ).toBeDisabled();

    const closest = page.locator('[data-slot="card"]').filter({
      hasText: "Total de goles",
    });
    await closest.getByLabel("Tu respuesta").fill("-12.5");
    await closest.getByRole("button", { name: "Guardar pronóstico" }).click();

    const options = page.locator('[data-slot="card"]').filter({
      hasText: "Equipo campeón",
    });
    await options.getByLabel("Elige una opción").click();
    await page.getByRole("option", { name: "México" }).click();
    await expect(
      options.getByRole("button", { name: "Guardar pronóstico" }),
    ).toBeEnabled();
    await options.getByRole("button", { name: "Guardar pronóstico" }).click();
    await expect(
      options.getByRole("button", { name: "Guardar pronóstico" }),
    ).toBeDisabled();

    const openText = page.locator('[data-slot="card"]').filter({
      hasText: "Nombre del goleador",
    });
    await openText.getByLabel("Tu respuesta").fill("Persona goleadora");
    await openText.getByRole("button", { name: "Guardar pronóstico" }).click();

    const exact = page.locator('[data-slot="card"]').filter({
      hasText: "Minuto del primer gol",
    });
    await expect(exact.getByPlaceholder("Ejemplo: 25")).toBeVisible();
    await expect(exact.getByText("Usa hasta 6 decimales.")).toHaveCount(0);
    await exact.getByLabel("Tu respuesta").fill("25");
    await exact.getByRole("button", { name: "Guardar pronóstico" }).click();
    await expect(page.getByText("5 de 5 guardados")).toBeVisible();

    await page.reload();
    await expect(match.getByLabel("México")).toHaveValue("2");
    await closest.getByLabel("Tu respuesta").fill("13.25");
    await closest.getByRole("button", { name: "Guardar pronóstico" }).click();
    await expect(closest.getByText("Pronóstico guardado.")).toBeVisible();
    await page.reload();
    await expect(closest.getByLabel("Tu respuesta")).toHaveValue("13.25");

    const roundId = new URL(roundUrl).pathname.split("/").at(-1)!;
    await database
      .update(round)
      .set({ startsAt: new Date(Date.now() - 60_000) })
      .where(eq(round.id, roundId));
    await page.reload();
    await expect(page.getByText("Sin pronóstico")).toHaveCount(0);
    await page.getByRole("link", { name: "Revisar resultados de la jornada" }).click();
    await expect(page.getByRole("heading", { name: "Fecha inaugural" })).toBeVisible();

    const resultMatch = page.locator('[data-slot="card"]').filter({
      hasText: "México vs Canadá",
    });
    await resultMatch.getByLabel("México").fill("2");
    await resultMatch.getByLabel("Canadá").fill("1");
    await resultMatch.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(resultMatch.getByText("Resultado guardado.")).toBeVisible();

    const resultClosest = page.locator('[data-slot="card"]').filter({
      hasText: "Total de goles",
    });
    await resultClosest.getByLabel("Valor oficial").fill("13");
    await resultClosest.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(resultClosest.getByText("Resultado guardado.")).toBeVisible();

    const resultOptions = page.locator('[data-slot="card"]').filter({
      hasText: "Equipo campeón",
    });
    await resultOptions.getByLabel("Opción correcta").click();
    await page.getByRole("option", { name: "México", exact: true }).click();
    await resultOptions.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(resultOptions.getByText("Resultado guardado.")).toBeVisible();

    const resultExact = page.locator('[data-slot="card"]').filter({
      hasText: "Minuto del primer gol",
    });
    await resultExact.getByLabel("Valor oficial").fill("25");
    await resultExact.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(resultExact.getByText("Resultado guardado.")).toBeVisible();

    const resultOpen = page.locator('[data-slot="card"]').filter({
      hasText: "Nombre del goleador",
    });
    await resultOpen.getByRole("button", { name: "Correcta", exact: true }).click();
    await expect(resultOpen.getByText("Juicio guardado.")).toBeVisible();
    await expect(page.getByText("En corrección")).toBeVisible();
    await expect(page.getByText("7", { exact: true })).toBeVisible();

    await resultExact.getByLabel("Valor oficial").fill("26");
    await resultExact.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(resultExact.getByText("Corrección guardada.")).toBeVisible();
    await expect(page.getByText("6", { exact: true })).toBeVisible();

    await database
      .update(round)
      .set({ finishedAt: new Date(Date.now() - 86_400_001) })
      .where(eq(round.id, roundId));
    await page.reload();
    const roundWinner = page.locator('[data-slot="card"]').filter({
      hasText: "Ganador de la jornada",
    });
    await expect(roundWinner).toBeVisible();
    await expect(roundWinner.getByText("Admin Jornadas", { exact: true })).toBeVisible();

    await page.goto(competitionUrl);
    await page.getByRole("link", { name: "Clasificación" }).click();
    await expect(page.getByRole("heading", { name: "Clasificación" })).toBeVisible();
    const leagueWinner = page.locator('[data-slot="card"]').filter({
      hasText: "Ganador actual",
    });
    await expect(leagueWinner).toBeVisible();
    await expect(leagueWinner.getByText("Admin Jornadas", { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await cleanupUsersByEmail(database, [adminEmail]);
    await client.end();
  }
});

test("Admin configura y confirma una fase H2H móvil", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(!databaseUrl, "TEST_DATABASE_URL is required for deterministic cleanup.");
  const suffix = randomUUID();
  const adminEmail = `h2h-admin-${suffix}@example.test`;
  const participantEmail = `h2h-participant-${suffix}@example.test`;
  const { client, database } = createIntegrationDatabase();
  const data = new IntegrationTestData(database);
  const context = await browser.newContext({ ...devicesForMobile });
  try {
    const page = await context.newPage();
    await signUp(page, "Admin H2H", adminEmail);
    await page.getByRole("link", { name: "Crear quiniela" }).click();
    await page.getByLabel("Nombre").fill("Copa H2H E2E");
    await page.getByLabel("Tipo de competencia").click();
    await page
      .getByRole("option", { name: "Liga con eliminatorias", exact: true })
      .click();
    await page.getByRole("button", { name: "Crear quiniela" }).click();
    await expect(page).toHaveURL(/\/app\/competitions\/[^/?]+\?created=1$/);
    const competitionUrl = page.url().split("?")[0]!;
    const competitionId = new URL(competitionUrl).pathname.split("/").at(-1)!;
    const admin = await database.query.user.findFirst({
      where: (table, { eq: equals }) => equals(table.email, adminEmail),
    });
    const participant = await data.createUser({ email: participantEmail });
    await data.createMembership({
      competitionId,
      userId: participant.id,
      status: "ACTIVE",
      statusChangedAt: new Date(),
      updatedByUserId: admin!.id,
    });

    await page.goto(`${competitionUrl}/h2h`);
    await page.getByLabel("Jornadas de fase regular").fill("1");
    await page.getByLabel("Clasifican").selectOption("2");
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();

    await page.goto(`${competitionUrl}/rounds`);
    await page.getByRole("button", { name: "Crear jornada" }).click();
    await page.getByLabel("Nombre").fill("Jornada H2H");
    await page.getByLabel("Inicio de jornada").fill("2027-01-01T12:00");
    await page.getByRole("button", { name: "Crear jornada" }).click();
    await page.goto(`${competitionUrl}/participants`);
    await page.getByRole("button", { name: "Iniciar quiniela" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Iniciar quiniela" })
      .click();
    await expect(page.getByText("Iniciada")).toBeVisible();

    await page.goto(`${competitionUrl}/h2h`);
    await page.getByRole("button", { name: "Confirmar sorteo" }).click();
    await expect(page.getByText("Calendario", { exact: true })).toBeVisible();
    await expect(page.getByText("Orden del sorteo", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
    await cleanupUsersByEmail(database, [adminEmail, participantEmail]);
    await client.end();
  }
});

test("Admin publica y avanza un playoff móvil hasta el campeón", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(!databaseUrl, "TEST_DATABASE_URL is required for deterministic cleanup.");
  const suffix = randomUUID();
  const adminEmail = `playoff-admin-${suffix}@example.test`;
  const { client, database } = createIntegrationDatabase();
  const data = new IntegrationTestData(database);
  const context = await browser.newContext({ ...devicesForMobile });
  try {
    const page = await context.newPage();
    await signUp(page, "Admin Playoffs", adminEmail);
    const [admin] = await database
      .select()
      .from(user)
      .where(eq(user.email, adminEmail))
      .limit(1);
    const value = data.competitionValue({
      creatorId: admin!.id,
      type: "LEAGUE_PLAYOFFS",
      name: "Copa Playoffs E2E",
    });
    await createCompetitionRepository(database).createWithAdmin(value, randomUUID());
    const [adminMembership] = await database
      .select()
      .from(competitionParticipant)
      .where(eq(competitionParticipant.competitionId, value.id))
      .limit(1);
    const participants = [adminMembership!.id];
    for (let index = 0; index < 3; index += 1) {
      const member = await data.createUser({
        email: `playoff-member-${suffix}-${index}@example.test`,
        name: `Rival ${index + 1}`,
      });
      const membership = await data.createMembership({
        competitionId: value.id,
        userId: member.id,
        status: "ACTIVE",
        statusChangedAt: new Date(),
        updatedByUserId: admin!.id,
      });
      participants.push(membership.id);
    }
    const roundId = randomUUID();
    const now = new Date();
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: now })
      .where(eq(competition.id, value.id));
    await database.insert(playoffRound).values({
      id: roundId,
      competitionId: value.id,
      sequence: 1,
      name: "Semifinal",
      startsAt: new Date(now.valueOf() + 86_400_000),
      status: "DRAFT",
      unansweredPenalty: -1,
      advancementMode: "BEST_SEED",
      createdByUserId: admin!.id,
      updatedByUserId: admin!.id,
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(playoffSeed).values(
      participants.map((participantId, index) => ({
        competitionId: value.id,
        participantId,
        seed: index + 1,
        sourceFingerprint: "a".repeat(64),
        createdByUserId: admin!.id,
        createdAt: now,
      })),
    );
    await database.insert(playoffMatchup).values([
      {
        id: randomUUID(),
        competitionId: value.id,
        playoffRoundId: roundId,
        position: 1,
        participantAId: participants[0]!,
        participantBId: participants[3]!,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        competitionId: value.id,
        playoffRoundId: roundId,
        position: 2,
        participantAId: participants[1]!,
        participantBId: participants[2]!,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await page.goto(`/app/competitions/${value.id}/playoffs`);
    await expect(
      page.getByRole("heading", { name: "El camino al campeonato" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Semifinal" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Admin Playoffs")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const nextRoundCard = page.locator('[data-slot="card"]').filter({
      hasText: "Configura la siguiente etapa",
    });
    await nextRoundCard.getByLabel("Nombre").fill("Final");
    await nextRoundCard.getByLabel("Cierre predeterminado").fill("2027-01-02T12:00");
    await nextRoundCard.getByRole("button", { name: "Crear ronda" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/competitions/${value.id}/playoffs/[^/]+$`),
    );
    const finalRoundId = new URL(page.url()).pathname.split("/").at(-1)!;
    const questionIds = [randomUUID(), randomUUID()];
    await database.insert(question).values([
      {
        id: questionIds[0]!,
        playoffRoundId: roundId,
        sequence: 1,
        type: "EXACT_VALUE",
        prompt: "Valor semifinal",
        deadlineMode: "ROUND_START",
        usesDefaultScoring: false,
        createdByUserId: admin!.id,
        updatedByUserId: admin!.id,
      },
      {
        id: questionIds[1]!,
        playoffRoundId: finalRoundId,
        sequence: 1,
        type: "EXACT_VALUE",
        prompt: "Valor final",
        deadlineMode: "ROUND_START",
        usesDefaultScoring: false,
        createdByUserId: admin!.id,
        updatedByUserId: admin!.id,
      },
    ]);
    await database
      .insert(questionScoring)
      .values(questionIds.map((questionId) => ({ questionId, points: 1 })));

    await page.goto(`/app/competitions/${value.id}/playoffs/${roundId}`);
    await page.getByRole("button", { name: "Publicar etapa" }).click();
    await expect
      .poll(async () => {
        const [persisted] = await database
          .select({ status: playoffRound.status })
          .from(playoffRound)
          .where(eq(playoffRound.id, roundId));
        return persisted?.status;
      })
      .toBe("ACTIVE");
    await database
      .update(playoffRound)
      .set({ startsAt: new Date(Date.now() - 1_000) })
      .where(eq(playoffRound.id, roundId));
    await page.goto(`/app/competitions/${value.id}/playoffs/${roundId}/results`);
    await page.getByLabel("Valor oficial").fill("1");
    await page.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(page.getByText("Resultado guardado.")).toBeVisible();
    await database
      .update(playoffRound)
      .set({ finishedAt: new Date(Date.now() - 86_400_001) })
      .where(eq(playoffRound.id, roundId));
    await page.goto(`/app/competitions/${value.id}/playoffs`);
    await page.getByRole("button", { name: "Confirmar avance" }).click();
    await expect
      .poll(async () => {
        const [persisted] = await database
          .select({ status: playoffRound.status })
          .from(playoffRound)
          .where(eq(playoffRound.id, roundId));
        return persisted?.status;
      })
      .toBe("FINALIZED");
    await expect
      .poll(
        async () =>
          (
            await database
              .select()
              .from(playoffMatchup)
              .where(eq(playoffMatchup.playoffRoundId, finalRoundId))
          ).length,
      )
      .toBe(1);

    await page.goto(`/app/competitions/${value.id}/playoffs/${finalRoundId}`);
    await page.getByRole("button", { name: "Publicar etapa" }).click();
    await expect
      .poll(async () => {
        const [persisted] = await database
          .select({ status: playoffRound.status })
          .from(playoffRound)
          .where(eq(playoffRound.id, finalRoundId));
        return persisted?.status;
      })
      .toBe("ACTIVE");
    await database
      .update(playoffRound)
      .set({ startsAt: new Date(Date.now() - 1_000) })
      .where(eq(playoffRound.id, finalRoundId));
    await page.goto(`/app/competitions/${value.id}/playoffs/${finalRoundId}/results`);
    await page.getByLabel("Valor oficial").fill("2");
    await page.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(page.getByText("Resultado guardado.")).toBeVisible();
    await database
      .update(playoffRound)
      .set({ finishedAt: new Date(Date.now() - 86_400_001) })
      .where(eq(playoffRound.id, finalRoundId));
    await page.goto(`/app/competitions/${value.id}/playoffs`);
    await page.getByRole("button", { name: "Confirmar avance" }).click();
    await expect(page.getByText("Campeón oficial")).toBeVisible();
  } finally {
    await context.close();
    await data.cleanup();
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
