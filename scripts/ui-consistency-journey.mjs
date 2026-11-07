import assert from "node:assert/strict";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function runUIConsistency({ page, fixture, label = "browser" }) {
  const context = page.context(),
    url = page.url();
  for (const name of ["UI-note.txt", "UI-autre.txt"])
    await writeFile(
      path.join(fixture, name),
      "Texte de vérification sans modification.",
    );
  await copyFile("public/icon128.png", path.join(fixture, "UI-image.png"));
  await mkdir(path.join(fixture, "UI-dossier"));
  const original = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("explorerPreferences"))
        .explorerPreferences,
  );
  const prefs = async (values) => {
    await page.evaluate(
      async (values) =>
        chrome.storage.local.set({
          explorerPreferences: { version: 1, ...values },
        }),
      { ...original, ...values },
    );
    await page.waitForFunction(
      ({ theme, size }) =>
        document.documentElement.dataset.theme === theme &&
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text-scale")
          .trim() === String(size / 100),
      { theme: values.theme, size: values.textSize },
    );
  };
  const basePrefs = {
    theme: "dark",
    density: "standard",
    textSize: 100,
    menuSize: "standard",
    tooltips: true,
  };
  const option = (name) =>
    page.locator(".pane").first().getByRole("option", { name, exact: true });
  const menu = page.getByRole("menu", {
    name: "Actions sur les fichiers",
    exact: true,
  });
  try {
    await prefs(basePrefs);
    await page.reload();
    await option("UI-note.txt").click({ button: "right" });
    assert.equal(
      await menu
        .getByRole("menuitem", { name: "Actions rapides…", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await menu
        .getByRole("menuitem", { name: "Convertir…", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await menu
        .getByRole("menuitem", { name: "Renommer", exact: true })
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    await option("UI-dossier").click({ button: "right" });
    assert.equal(
      await menu
        .getByRole("menuitem", { name: "Actions rapides…", exact: true })
        .count(),
      0,
    );
    await page.keyboard.press("Escape");
    await option("UI-image.png").click({ button: "right" });
    await menu
      .getByRole("menuitem", { name: "Actions rapides…", exact: true })
      .waitFor();
    await menu
      .getByRole("menuitem", { name: "Convertir…", exact: true })
      .waitFor();
    assert.ok((await menu.getByRole("separator").count()) > 0);
    assert.ok(
      await menu
        .getByRole("menuitem")
        .evaluateAll((buttons) => buttons.every((b) => b.querySelector("svg"))),
    );
    await page.keyboard.press("End");
    assert.ok(await menu.evaluate((el) => el.contains(document.activeElement)));
    await page.keyboard.press("Escape");
    assert.ok(
      await page
        .locator(".file-scroll")
        .first()
        .evaluate((el) => el === document.activeElement),
    );
    await option("UI-note.txt").click();
    const selection = page.locator(".selectionbar");
    await selection
      .getByRole("button", { name: "Renommer", exact: true })
      .click();
    const rename = page.getByRole("dialog", { name: "Renommer", exact: true });
    await rename.waitFor();
    await rename.getByRole("button", { name: "Annuler", exact: true }).click();
    await option("UI-autre.txt").click({ modifiers: ["Control"] });
    assert.equal(
      await selection
        .getByRole("button", { name: "Renommer", exact: true })
        .count(),
      0,
    );
    await selection
      .getByRole("button", { name: "Renommer par lot", exact: true })
      .waitFor();
    await option("UI-note.txt").click();
    await option("UI-image.png").click({ modifiers: ["Control"] });
    await selection
      .getByRole("button", { name: "Convertir", exact: true })
      .click();
    const convert = page.getByRole("dialog", {
      name: "Convertir les fichiers",
      exact: true,
    });
    await convert.locator('[name="format"]').waitFor();
    await convert.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Réglages", exact: true }).click();
    const settings = page.getByRole("dialog", {
      name: "Réglages et moteurs",
      exact: true,
    });
    const search = settings.getByRole("searchbox");
    await search.fill("texte taille");
    await settings.getByLabel("Taille du texte", { exact: true }).waitFor();
    await search.fill("demarrage");
    assert.match(
      (
        await settings.locator("fieldset:visible legend").allTextContents()
      ).join(" "),
      /Démarrage/,
    );
    await search.fill("aucun-reglage-ici");
    await settings
      .getByText("Aucun réglage trouvé.", { exact: true })
      .waitFor();
    await settings
      .getByRole("button", { name: "Moteurs", exact: true })
      .click();
    await settings
      .getByRole("heading", { name: "Fonctions supplémentaires", exact: true })
      .waitFor();
    await settings
      .getByRole("button", { name: "Apparence", exact: true })
      .click();
    await settings.getByLabel("Afficher les infobulles d’aide").uncheck();
    await settings
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector("[title]"));
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "ui-tooltip-probe";
      b.title = "Ouvrir le panneau";
      document.querySelector(".app").append(b);
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector("#ui-tooltip-probe")
          ?.getAttribute("aria-label") === "Ouvrir le panneau",
    );
    await page.evaluate(() => {
      document.querySelector("#ui-tooltip-probe").title = "Fermer le panneau";
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector("#ui-tooltip-probe")
          ?.getAttribute("aria-label") === "Fermer le panneau",
    );
    await settings.getByLabel("Afficher les infobulles d’aide").check();
    await settings
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("#ui-tooltip-probe")?.getAttribute("title") ===
        "Fermer le panneau",
    );
    await page.evaluate(() =>
      document.querySelector("#ui-tooltip-probe").remove(),
    );
    await settings
      .getByRole("button", { name: "Raccourcis", exact: true })
      .click();
    await settings.getByRole("button", { name: "Aide", exact: true }).focus();
    await page.getByRole("tooltip").waitFor();
    await page
      .getByRole("tooltip")
      .evaluate((el) =>
        el.dispatchEvent(new Event("scroll", { bubbles: false })),
      );
    await page.getByRole("tooltip").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("tooltip").count(), 0);
    await settings.getByRole("button", { name: "Fermer", exact: true }).click();
    for (const theme of ["dark", "light"]) {
      for (const [density, textSize] of [
        ["compact", 85],
        ["comfortable", 150],
      ]) {
        await prefs({
          ...basePrefs,
          theme,
          density,
          textSize,
          menuSize: density,
        });
        for (const width of [320, 390, 900, 1440]) {
          await page.setViewportSize({ width, height: 720 });
          await page
            .getByRole("button", { name: "Réglages", exact: true })
            .click();
          await settings
            .getByRole("button", { name: "Apparence", exact: true })
            .click();
          assert.ok(
            await settings.evaluate(
              (el) => el.scrollWidth <= el.clientWidth + 1,
            ),
            `réglages ${theme} ${density} ${width}`,
          );
          const save = await settings
            .getByRole("button", {
              name: "Enregistrer les préférences",
              exact: true,
            })
            .boundingBox();
          assert.ok(
            save.x >= 0 &&
              save.y >= 0 &&
              save.x + save.width <= width + 1 &&
              save.y + save.height <= 721,
          );
          await page.screenshot({
            path: `test-results/v1-ui-${label}-${theme}-${density}-${width}.png`,
            animations: "disabled",
          });
          await settings
            .getByRole("button", { name: "Fermer", exact: true })
            .click();
          const navToggle = page.getByRole("button", {
            name: "Réduire la navigation",
            exact: true,
          });
          if (await navToggle.isVisible()) await navToggle.click();
          await option("UI-image.png").click({ button: "right" });
          const box = await menu.boundingBox();
          assert.ok(
            box.x >= 0 &&
              box.x + box.width <= width + 1 &&
              box.y >= 0 &&
              box.y + box.height <= 721,
          );
          await page.keyboard.press("End");
          assert.ok(
            await menu.evaluate((el) => {
              const box = document.activeElement.getBoundingClientRect();
              return (
                el.contains(document.activeElement) &&
                box.top >= 0 &&
                box.bottom <= innerHeight
              );
            }),
          );
          if (
            (theme === "dark" && density === "comfortable" && width === 320) ||
            (theme === "light" && density === "compact" && width === 1440)
          )
            await page.screenshot({
              path: `test-results/v1-ui-menu-${label}-${theme}-${density}-${width}.png`,
              animations: "disabled",
            });
          await page.keyboard.press("Escape");
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await prefs({ ...basePrefs, textSize: 150 });
    const detailsToggle = page.getByRole("button", {
      name: "Volet d’aperçu",
      exact: true,
    });
    if ((await detailsToggle.getAttribute("aria-pressed")) !== "true")
      await detailsToggle.click();
    await page.getByRole("button", { name: "Console", exact: true }).click();
    const title = page.locator(".console-toolbar > strong");
    await title.waitFor();
    assert.equal(
      await title.evaluate((el) => getComputedStyle(el).fontSize),
      "19.5px",
    );
    await prefs(basePrefs);
    await page.evaluate(
      (lastPath) => chrome.storage.local.set({ lastPath }),
      fixture,
    );
    const panel = await context.newPage();
    const panelErrors = [];
    panel.on("pageerror", (error) => panelErrors.push(error.message));
    try {
      await panel.goto(`${url.split("?")[0]}?panel=1`);
      await panel.getByText("Fichiers connectés", { exact: true }).waitFor();
      for (const [width, height, theme, textSize] of [
        [320, 320, "dark", 100],
        [320, 320, "light", 150],
        [390, 320, "dark", 150],
        [900, 320, "light", 150],
        [390, 600, "dark", 100],
        [600, 960, "dark", 100],
      ]) {
        await prefs({ ...basePrefs, theme, textSize });
        await panel.setViewportSize({ width, height });
        await panel.getByLabel("Options du panneau", { exact: true }).click();
        await panel
          .getByRole("button", { name: "Réglages", exact: true })
          .click();
        const modal = panel.getByRole("dialog", {
          name: "Réglages et moteurs",
          exact: true,
        });
        assert.ok(
          await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        const save = await modal
          .getByRole("button", {
            name: "Enregistrer les préférences",
            exact: true,
          })
          .boundingBox();
        assert.ok(
          save.y >= 0 && save.y + save.height <= height + 1,
          `enregistrement du panneau à ${width}x${height}`,
        );
        const textSizeControl = modal.getByRole("slider", {
          name: "Taille du texte",
          exact: true,
        });
        await textSizeControl.focus();
        await textSizeControl.press("ArrowLeft");
        assert.equal(await textSizeControl.inputValue(), String(textSize - 5));
        const field = await textSizeControl.boundingBox();
        const visibleArea = await modal
          .locator(
            height <= 500 ? ".preferences-scroll" : ".preferences-content",
          )
          .boundingBox();
        assert.ok(
          visibleArea.height >= field.height &&
            field.y >= visibleArea.y - 1 &&
            field.y + field.height <= visibleArea.y + visibleArea.height + 1 &&
            field.y + field.height <= save.y,
          `champ modifiable et entièrement visible à ${width}x${height}, texte ${textSize}%`,
        );
        assert.equal(
          await textSizeControl.evaluate((el) => document.activeElement === el),
          true,
        );
        await panel.screenshot({
          path: `test-results/v1-ui-panel-${label}-${width}x${height}-${theme}-${textSize}.png`,
          animations: "disabled",
        });
        await modal
          .getByRole("button", { name: "Fermer", exact: true })
          .click();
      }
      assert.deepEqual(panelErrors, []);
    } finally {
      await panel.close();
    }
    console.log(
      `Cohérence UI ${label} : actions contextuelles, renommage, sélection mixte, réglages sans accents, infobulles/clavier, thèmes, densités et texte 85/150 %, menus et réglages 320/390/900/1440 px, texte de console : OK`,
    );
  } catch (error) {
    await page.screenshot({ path: `test-results/v1-ui-${label}-failure.png` });
    await writeFile(
      `test-results/v1-ui-${label}-failure.txt`,
      await page.locator("body").innerText(),
    );
    throw error;
  } finally {
    await page.evaluate(
      async (original) =>
        original
          ? chrome.storage.local.set({ explorerPreferences: original })
          : chrome.storage.local.remove("explorerPreferences"),
      original,
    );
  }
  if (url.startsWith("http:")) {
    const offlineContext = await context.browser().newContext();
    try {
      const offline = await offlineContext.newPage();
      await offline.goto(url);
      await offline
        .getByRole("button", { name: "Vérifier la connexion", exact: true })
        .waitFor();
      await offline.keyboard.press("Control+k");
      const query = offline.getByRole("textbox", {
        name: "Rechercher un fichier ou une action",
        exact: true,
      });
      await query.fill("Créer un dossier");
      assert.equal(
        await offline
          .getByRole("button", { name: "Créer un dossier", exact: true })
          .isDisabled(),
        true,
      );
      await query.press("Enter");
      await offline
        .getByRole("dialog", { name: "Aller à…", exact: true })
        .waitFor();
      await query.fill("Réglages et moteurs");
      await query.press("Enter");
      await offline
        .getByRole("dialog", { name: "Réglages et moteurs", exact: true })
        .waitFor();
      console.log(
        "Palette hors ligne : Entrée respecte les actions désactivées ; les réglages restent accessibles : OK",
      );
    } finally {
      await offlineContext.close();
    }
  }
}
