import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Only the executable path in the isolated test manifest changes, without installing anything.
export async function runConnectionJourney({
  page,
  context,
  fixture,
  activateCompanion,
}) {
  const base = page.url().split("?")[0];
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  const download = `https://github.com/Gremy44/NextExplorer-Downloads/releases/download/v${version}/NextExplorer-${version}-Setup.exe`;
  const child = path.join(fixture, "Projet de demonstration");
  await mkdir(child);
  await writeFile(
    path.join(child, "temoin.txt"),
    "Fichier fictif du premier dossier.\n",
  );
  const setup = (target) =>
    target.getByRole("region", { name: "Première connexion", exact: true });
  const check = (target) =>
    setup(target).getByRole("button", {
      name: "Vérifier la connexion",
      exact: true,
    });
  await check(page).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".connection-setup button.primary")?.disabled,
  );
  await check(page).click();
  await page
    .getByRole("button", { name: "Vérification…", exact: true })
    .waitFor();
  await check(page).waitFor();
  assert.equal(await setup(page).locator("details[open]").count(), 0);
  assert.equal(
    await setup(page)
      .getByRole("link", {
        name: "Télécharger le compagnon Windows",
        exact: true,
      })
      .getAttribute("href"),
    download,
  );
  assert.equal(await page.locator(".connection-error:visible").count(), 0);

  const panel = await context.newPage();
  await panel.goto(`${base}?panel=1`);
  await setup(panel).waitFor();
  for (const target of [page, panel]) {
    for (const width of [320, 390, 1440]) {
      await target.setViewportSize({ width, height: 960 });
      if (target === page && width < 760) {
        const collapse = page.getByRole("button", {
          name: "Masquer la navigation",
          exact: true,
        });
        if (await collapse.isVisible()) await collapse.click();
      }
      await setup(target)
        .getByRole("link", {
          name: "Télécharger le compagnon Windows",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      assert.equal(
        await target.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const box = await setup(target).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await target.screenshot({
        path: `test-results/connection-${target === page ? "page" : "panel"}-${width}.png`,
      });
    }
  }
  await panel.close();
  await page.setViewportSize({ width: 1440, height: 960 });
  // Playwright otherwise keeps every tab focused, hiding real return events.
  await (
    await context.newCDPSession(page)
  ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
  // Exercise the download link and return gesture without downloading or running an EXE.
  await context.route(download, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Retour de telechargement - recette</title><p>Test local : aucun installateur execute.</p>",
    }),
  );
  const popup = context.waitForEvent("page");
  await setup(page)
    .getByRole("link", {
      name: "Télécharger le compagnon Windows",
      exact: true,
    })
    .click();
  const destination = await popup;
  await destination.waitForLoadState("domcontentloaded");
  assert.equal(destination.url(), download);
  await (
    await context.newCDPSession(destination)
  ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await destination.bringToFront();
  await activateCompanion();
  await destination.close();
  await page.bringToFront();
  await page
    .getByRole("heading", {
      name: "Choisissez votre premier dossier",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await setup(page)
      .getByRole("heading")
      .evaluate((h) => h === document.activeElement),
    true,
  );
  assert.equal(
    await page.evaluate(
      async () => (await chrome.storage.local.get("lastPath")).lastPath,
    ),
    undefined,
  );
  await page.screenshot({ path: "test-results/connection-first-folder.png" });
  await setup(page)
    .getByRole("button", { name: "Choisir un dossier", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choisir un dossier",
    exact: true,
  });
  await picker.waitFor();
  await picker.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await setup(page)
    .getByRole("button", { name: "Choisir un dossier", exact: true })
    .click();
  await picker.getByRole("button", { name: /Projet de demonstration/ }).click();
  await picker
    .getByRole("button", { name: "Choisir ce dossier", exact: true })
    .click();
  await setup(page).waitFor({ state: "hidden" });
  await page.getByRole("option", { name: "temoin.txt", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await chrome.storage.local.get("lastPath")).lastPath,
    ),
    child,
  );
  await page.reload();
  await page.getByRole("option", { name: "temoin.txt", exact: true }).waitFor();
  assert.equal(await setup(page).count(), 0);

  const returningPanel = await context.newPage();
  await returningPanel.goto(`${base}?panel=1`);
  await returningPanel
    .locator(".companion-entry-name")
    .filter({ hasText: "temoin.txt" })
    .waitFor();
  assert.equal(await setup(returningPanel).count(), 0);
  await returningPanel.evaluate(async () => {
    await chrome.storage.local.remove("lastPath");
    localStorage.removeItem("nextexplorer:tabs:panel");
  });
  await returningPanel.close();
  const freshPanel = await context.newPage();
  await freshPanel.setViewportSize({ width: 390, height: 960 });
  await freshPanel.goto(`${base}?panel=1`);
  await setup(freshPanel)
    .getByRole("button", {
      name: "Utiliser mon dossier personnel",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await freshPanel
      .getByRole("region", { name: "Fichiers du dossier", exact: true })
      .count(),
    0,
  );
  await freshPanel.screenshot({
    path: "test-results/connection-panel-first-folder.png",
  });
  await setup(freshPanel)
    .getByRole("button", {
      name: "Utiliser mon dossier personnel",
      exact: true,
    })
    .click();
  await setup(freshPanel).waitFor({ state: "hidden" });
  assert.equal(
    await freshPanel.evaluate(
      async () => (await chrome.storage.local.get("lastPath")).lastPath,
    ),
    fixture,
  );
  await freshPanel.close();
  await page.evaluate(() => localStorage.removeItem("nextexplorer:tabs:page"));
  await page.goto(`${base}?path=${encodeURIComponent(fixture)}`);
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  console.log(
    "Première connexion : absence réelle, lien versionné, retour automatique après disponibilité du compagnon, dossier choisi, annulation, reprise et panneau neuf/existant ; 320/390/1440 px : OK. Aucun installateur exécuté.",
  );
}
