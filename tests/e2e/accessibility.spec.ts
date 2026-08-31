import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "móvil estrecho", width: 320, height: 720 },
  { name: "tableta", width: 768, height: 900 },
  { name: "escritorio", width: 1280, height: 800 },
]) {
  test(`acceso es usable y sin violaciones automáticas en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-in");

    const violations = (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    ).violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        summary: node.failureSummary,
      })),
    }));
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido principal" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("min-width", "320px");
  });
}
