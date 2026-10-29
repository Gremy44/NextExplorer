import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function runUsageFeedbackJourney({ page, fixture }) {
  const screenshot = async (filename) => {
    await page
      .locator(".app")
      .evaluate((app) =>
        Promise.all(
          app
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    await page.screenshot({
      path: `test-results/retour-usage-01/${filename}.png`,
    });
  };
  const nav = page.getByRole("complementary", {
    name: "Navigation de l’explorateur",
  });
  const menu = page.getByRole("menu", { name: "Actions sur les fichiers" });
  const readme = page.getByRole("option", { name: "README.md", exact: true });
  const name = readme.locator(".file-name > span").first();
  const rename = page.getByRole("textbox", {
    name: "Renommer README.md",
    exact: true,
  });
  const original = await readFile(path.join(fixture, "README.md"), "utf8");
  assert.deepEqual(
    await nav.locator(".nav-section > button:first-child").allTextContents(),
    ["Emplacements", "Accès rapide", "Outils"],
  );
  for (const label of [
    "Renommer par lot",
    "Convertir les fichiers",
    "Créer une archive",
    "Extraire une archive…",
    "Calculer une empreinte",
  ]) {
    assert.ok(
      await nav.getByRole("button", { name: label, exact: true }).isVisible(),
    );
  }
  assert.equal(await page.locator(".workspace-toolbar").count(), 0);
  assert.ok(
    await page
      .locator(".statusbar")
      .getByText("Compagnon connecté", { exact: true })
      .isVisible(),
  );
  assert.equal(
    await page
      .getByTitle("Afficher les fichiers cachés", { exact: true })
      .count(),
    0,
  );
  assert.ok(
    await page
      .locator(".tabs-bar")
      .getByRole("button", { name: "Double panneau", exact: true })
      .isVisible(),
  );
  assert.ok(
    await page
      .locator(".tabs-bar")
      .getByRole("button", { name: "Volet d’aperçu", exact: true })
      .isVisible(),
  );

  await nav.getByRole("button", { name: "Outils", exact: true }).click();
  await nav.getByRole("button", { name: "Réduire la navigation" }).click();
  assert.equal(await nav.evaluate((el) => el.offsetWidth), 52);
  for (const label of [
    "Accueil",
    "Bureau",
    "Téléchargements",
    "Tags",
    "Calculer une empreinte",
  ]) {
    const button = nav.getByRole("button", { name: label, exact: true });
    assert.ok(await button.isVisible());
    assert.ok(await button.locator("svg").isVisible());
    assert.equal(await button.locator(".nav-label").isVisible(), false);
  }
  await nav.getByRole("button", { name: "Bureau", exact: true }).click();
  await page.getByRole("heading", { name: "Design", exact: true }).waitFor();
  await nav.getByRole("button", { name: "Mes fichiers", exact: true }).click();
  await readme.waitFor();
  await nav.getByRole("button", { name: "Développer la navigation" }).click();
  assert.equal(
    await nav
      .getByRole("button", { name: "Outils", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await nav.getByRole("button", { name: "Outils", exact: true }).click();

  await name.click();
  await page.waitForTimeout(2700);
  await name.click();
  await rename.waitFor();
  assert.deepEqual(
    await rename.evaluate((input) => [
      input.selectionStart,
      input.selectionEnd,
    ]),
    [0, 6],
  );
  await rename.fill("annulé.md");
  await rename.press("Escape");
  assert.equal(await rename.count(), 0);
  assert.equal(
    await readFile(path.join(fixture, "README.md"), "utf8"),
    original,
  );

  await page.locator(".file-scroll").focus();
  await page.keyboard.press("F2");
  await rename.waitFor();
  await rename.fill("brief.txt");
  await rename.press("Enter");
  await page.locator(".inline-rename [role='alert']").waitFor();
  assert.equal(
    await readFile(path.join(fixture, "README.md"), "utf8"),
    original,
  );
  assert.equal(
    await readFile(path.join(fixture, "brief.txt"), "utf8"),
    "Ceci est un vrai fichier temporaire de test.",
  );
  await rename.fill("renommage-retour.md");
  await rename.press("Enter");
  const renamed = page.getByRole("option", {
    name: "renommage-retour.md",
    exact: true,
  });
  await renamed.waitFor();
  assert.equal(
    await readFile(path.join(fixture, "renommage-retour.md"), "utf8"),
    original,
  );
  await renamed.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Renommer", exact: true }).click();
  const renamedInput = page.getByRole("textbox", {
    name: "Renommer renommage-retour.md",
    exact: true,
  });
  await renamedInput.fill("README.md");
  await renamedInput.press("Enter");
  await readme.waitFor();

  await name.click();
  await page.waitForTimeout(700);
  await name.click();
  await page.getByRole("option", { name: "brief.txt", exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(
    await rename.count(),
    0,
    "changer de sélection annule le renommage différé",
  );

  await page
    .getByRole("button", { name: "Affichage des fichiers", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Mosaïques", exact: true })
    .click();
  await readme.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Renommer", exact: true }).click();
  await rename.waitFor();
  await rename.press("Escape");
  await page
    .getByRole("button", { name: "Affichage des fichiers", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Détails", exact: true })
    .click();

  await name.dblclick();
  await page.getByRole("dialog").waitFor();
  assert.equal(await rename.count(), 0);
  await page.keyboard.press("Escape");
  await readme.click({ button: "right" });
  assert.equal(
    await menu
      .getByRole("menuitem", { name: "Calculer une empreinte", exact: true })
      .count(),
    0,
  );
  const edit = menu.getByRole("group", { name: "Modifier", exact: true });
  assert.equal(await edit.getByRole("menuitem").count(), 4);
  const rects = await edit
    .getByRole("menuitem")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().top),
    );
  assert.ok(rects.every((y) => y === rects[0]));
  assert.equal(await menu.getByRole("menuitemcheckbox").count(), 7);
  await page.keyboard.press("Escape");

  await nav
    .getByRole("button", { name: "Calculer une empreinte", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Calculer une empreinte", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByTitle("Réglages", { exact: true }).click();
  const settings = page.getByRole("dialog");
  await settings
    .getByLabel("Afficher les éléments cachés (y compris système)")
    .check();
  await settings
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.getByRole("option", { name: ".hidden", exact: true }).waitFor();
  await settings.getByRole("button", { name: "Fermer", exact: true }).click();

  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByTitle("Changer de thème", { exact: true }).click();
    for (const width of [1366, 1024, 800]) {
      await page.setViewportSize({ width, height: 768 });
      const top = await page
        .locator(".file-scroll")
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            document.querySelector(".pane").getBoundingClientRect().top,
        );
      assert.ok(top < 170, `en-tête compact à ${width}px : ${top}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await screenshot(`applied-${theme}-${width}`);
    }
    await nav.getByRole("button", { name: "Réduire la navigation" }).click();
    for (const width of [320, 390, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await readme.click({ button: "right" });
      const box = await menu.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= 768,
      );
      await screenshot(`rail-menu-${theme}-${width}`);
      await page.keyboard.press("Escape");
    }
    await nav.getByRole("button", { name: "Développer la navigation" }).click();
  }
  console.log(
    "Retours usage 01 : navigation complète et rail, en-tête compact, outils, tags, renommage lent/F2/collision/annulation/double-clic et réglage cachés : OK",
  );
}
