import assert from "node:assert/strict";

export async function runErgonomicsJourney({ page, fixture }) {
  const screenshot = (name) =>
    page.screenshot({ path: `test-results/ergonomics-${name}.png` });
  const nav = page.locator(".sidebar");
  const grip = page.getByRole("separator", {
    name: "Ajuster la largeur de la navigation",
    exact: true,
  });
  const before = await nav.evaluate((el) => el.offsetWidth);
  const bounds = await grip.boundingBox();
  await page.mouse.move(bounds.x + 5, bounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 95, bounds.y + 80, { steps: 8 });
  await page.mouse.up();
  assert.ok((await nav.evaluate((el) => el.offsetWidth)) > before + 70);
  await grip.press("ArrowLeft");
  const savedWidth = await nav.evaluate((el) => el.offsetWidth);
  await nav.getByRole("button", { name: "Outils", exact: true }).click();
  assert.equal(
    await nav
      .getByRole("button", { name: "Espace disque", exact: true })
      .isVisible(),
    false,
  );
  await page.reload();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  assert.equal(await nav.evaluate((el) => el.offsetWidth), savedWidth);
  assert.equal(
    await nav
      .getByRole("button", { name: "Outils", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await nav.getByRole("button", { name: "Outils", exact: true }).click();
  await grip.dblclick();

  await page
    .getByRole("button", { name: "Nouvel onglet", exact: true })
    .click();
  await page.locator(".tab-actions summary").click();
  assert.equal(await page.locator(".tab-actions > div button svg").count(), 4);
  await page
    .getByRole("button", { name: "Dupliquer l’onglet", exact: true })
    .click();
  await page.locator(".tab-actions summary").click();
  const tabs = page.locator(".tab-select");
  assert.equal(await tabs.count(), 3);
  const order = () =>
    page
      .locator(".workspace-tab")
      .evaluateAll((elements) =>
        elements.map((element) => element.dataset.tabId),
      );
  const initialOrder = await order();
  const sourceTab = await tabs.nth(2).boundingBox(),
    targetTab = await tabs.nth(0).boundingBox();
  await page.mouse.move(
    sourceTab.x + sourceTab.width / 2,
    sourceTab.y + sourceTab.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceTab.x + sourceTab.width / 2 - 10,
    sourceTab.y + sourceTab.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(
    targetTab.x + targetTab.width / 2,
    targetTab.y + targetTab.height / 2,
    { steps: 8 },
  );
  await page.waitForFunction(
    () => document.querySelector(".tabs-scroll")?.dataset.dragging === "true",
  );
  assert.equal(await page.locator(".workspace-tab.dragging").count(), 1);
  assert.deepEqual(
    await order(),
    initialOrder,
    "l’ordre reste inchangé avant le dépôt",
  );
  await page.screenshot({ path: "test-results/motion-tabs-drag.png" });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelector(".tab-select")?.getAttribute("aria-selected") ===
      "true",
  );
  assert.equal((await order())[0], initialOrder[2]);
  assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
  // Manual mouse coordinates need the same stable geometry Playwright waits for on clicks.
  await page
    .locator(".tabs-scroll")
    .evaluate((element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  const beforeCancel = await order();
  const cancelSource = await tabs.nth(0).boundingBox(),
    cancelTarget = await tabs.nth(2).boundingBox();
  await page.mouse.move(cancelSource.x + 20, cancelSource.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    cancelTarget.x + cancelTarget.width / 2,
    cancelTarget.y + 15,
    { steps: 10 },
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForFunction(
    () => !document.querySelector(".tabs-scroll")?.dataset.dragging,
  );
  assert.deepEqual(
    await order(),
    beforeCancel,
    "annuler un glisser ne change pas l’ordre",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".workspace-tab")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const close = page.locator(".workspace-tab").first().locator(".tab-close");
  assert.ok(
    (await close.boundingBox()).x > (await tabs.first().boundingBox()).x,
  );
  await close.click();

  const settings = async () => {
    await page
      .locator(".appbar")
      .getByTitle("Réglages", { exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Sections des réglages" })
      .waitFor();
  };
  const dialog = page.getByRole("dialog");
  await settings();
  assert.equal(await dialog.locator("fieldset:visible").count(), 1);
  await dialog
    .getByLabel("Taille de l’interface", { exact: true })
    .selectOption("compact");
  await dialog
    .getByLabel("Taille du menu contextuel", { exact: true })
    .selectOption("compact");
  await dialog.getByLabel("Taille du texte", { exact: true }).fill("150");
  await dialog
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.density === "compact" &&
      getComputedStyle(document.documentElement).getPropertyValue(
        "--text-scale",
      ) === "1.5",
  );
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(
      await dialog.evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().bottom <= innerHeight,
      ),
    );
    assert.ok(
      await dialog
        .locator(".preferences-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await screenshot(`settings-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const viewport of [
    { width: 800, height: 480 },
    { width: 390, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const saveBounds = await dialog
      .getByRole("button", { name: "Enregistrer les préférences" })
      .boundingBox();
    const dialogBounds = await dialog.boundingBox();
    assert.ok(
      saveBounds.y + saveBounds.height <= dialogBounds.y + dialogBounds.height,
      "enregistrement accessible sur petit écran",
    );
    await screenshot(`settings-${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  const search = dialog.getByRole("searchbox");
  await search.fill("miniatures");
  assert.equal(await dialog.locator("fieldset:visible").count(), 1);
  await dialog.getByLabel("Afficher les miniatures").waitFor();
  await search.fill("un-reglage-absent");
  await dialog.getByText("Aucun réglage trouvé.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Compagnons", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "Fonctions supplémentaires", exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "Raccourcis", exact: true }).click();
  assert.equal(await dialog.locator("fieldset:visible").count(), 1);
  await dialog.getByRole("button", { name: "Aide", exact: true }).focus();
  await page.getByRole("tooltip").waitFor();
  assert.ok(
    await page
      .getByRole("tooltip")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().bottom <= innerHeight,
      ),
  );
  await dialog
    .getByRole("button", { name: "Aide", exact: true })
    .press("Escape");
  await page.getByRole("tooltip").waitFor({ state: "hidden" });
  await dialog.getByRole("button", { name: "Apparence", exact: true }).click();
  await dialog.getByLabel("Afficher les infobulles d’aide").uncheck();
  await dialog
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.waitForFunction(() => !document.querySelector("[title]"));
  await dialog.getByRole("button", { name: "Raccourcis", exact: true }).click();
  assert.equal(
    await dialog.getByRole("button", { name: "Aide", exact: true }).count(),
    0,
  );
  await dialog.getByRole("button", { name: "Apparence", exact: true }).click();
  await dialog.getByLabel("Afficher les infobulles d’aide").check();
  await dialog
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.waitForFunction(() => !!document.querySelector("[title]"));
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  const readme = page.getByRole("option", { name: /README.md/ });
  const font = await readme
    .locator(".file-name")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(font >= 18, `texte agrandi : ${font}`);
  await readme.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions sur les fichiers" });
  await menu.waitFor();
  const compactHeight = (await menu.getByRole("menuitem").first().boundingBox())
    .height;
  await screenshot("menu-compact");
  await page.keyboard.press("Escape");
  await settings();
  await dialog
    .getByLabel("Taille du menu contextuel", { exact: true })
    .selectOption("comfortable");
  await dialog
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.waitForFunction(
    () => document.documentElement.dataset.menuSize === "comfortable",
  );
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await readme.click({ button: "right" });
  await menu.waitFor();
  assert.ok(
    (await menu.getByRole("menuitem").first().boundingBox()).height >
      compactHeight,
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await readme.waitFor();
  assert.equal(
    await page.locator("html").getAttribute("data-menu-size"),
    "comfortable",
  );
  await screenshot("explorer");
  await page.getByTitle("Volet d’aperçu", { exact: true }).click();
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  const detailsGrip = page.getByRole("separator", {
    name: "Ajuster la largeur de l’aperçu",
    exact: true,
  });
  await detailsGrip.press("End");
  assert.ok((await details.boundingBox()).width > 500);
  await detailsGrip.press("Home");
  await page
    .getByRole("button", { name: "Fermer le volet d’aperçu", exact: true })
    .click();
  const panelURL = new URL(page.url());
  panelURL.searchParams.set("panel", "1");
  await page.goto(panelURL.href);
  await page.locator(".companion-files").waitFor();
  await page.locator(".companion-files .companion-entry").first().waitFor();
  for (const width of [320, 390, 700, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      await page
        .locator(".companion-files")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await screenshot(`panel-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page
    .locator('.appbar summary[aria-label="Options du panneau"]')
    .click();
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await dialog.getByLabel("Taille du texte", { exact: true }).waitFor();
  await screenshot("panel-settings");
  await dialog.getByLabel("Taille du texte", { exact: true }).fill("85");
  await dialog
    .getByRole("button", { name: "Enregistrer les préférences" })
    .click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--text-scale",
      ) === "0.85",
  );
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await screenshot("panel-compact");
  panelURL.searchParams.delete("panel");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(panelURL.href);
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await screenshot("explorer-compact");
  console.log(
    "Ergonomie : réglages 390/800/1440 px, tailles indépendantes et persistantes, aides clavier/désactivation, navigation souris/clavier et catégories persistantes, onglets glissés : OK",
  );
}
