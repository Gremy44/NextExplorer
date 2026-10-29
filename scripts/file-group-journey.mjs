import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { runFileDestinationJourney } from "./file-destination-journey.mjs";
import { runOriginDestinationJourney } from "./origin-destination-journey.mjs";
import { runFileFamilyJourney } from "./file-family-journey.mjs";
import { runFileCopyJourney } from "./file-copies-journey.mjs";

export async function runFileGroupJourney({
  context,
  baseURL,
  fixture,
  menuOnly = false,
}) {
  const folder = path.join(fixture, "Référence française C0");
  await mkdir(folder);
  await mkdir(path.join(folder, "Sous-dossier"));
  const samples = {
    "rapport-final-v2.PDF": Buffer.from(
      "Document synthétique ; le format n’est pas vérifié par C0.",
    ),
    "justificatif sans titre.txt": Buffer.from("Référence française"),
    "photo vacances.png": await readFile("public/icon128.png"),
    "scan volumineux.TIFF": Buffer.alloc(24 * 1024 * 1024),
    "image.pdf.exe": Buffer.from("Nom trompeur"),
    README: Buffer.from("Sans extension"),
    "archive.zip": Buffer.from("Archive synthétique"),
  };
  for (const [name, bytes] of Object.entries(samples))
    await writeFile(path.join(folder, name), bytes);
  for (const [name, year, month, day] of [
    ["rapport-final-v2.PDF", 2026, 0, 15],
    ["justificatif sans titre.txt", 2026, 0, 23],
    ["photo vacances.png", 2026, 1, 15],
    ["scan volumineux.TIFF", 2026, 1, 20],
    ["image.pdf.exe", 2026, 1, 24],
    ["README", 2025, 11, 15],
    ["archive.zip", 2025, 11, 20],
  ]) {
    const date = new Date(year, month, day, 12);
    await utimes(path.join(folder, name), date, date);
  }
  const before = await Promise.all(
    Object.keys(samples).map(async (name) => ({
      name,
      hash: createHash("sha256")
        .update(await readFile(path.join(folder, name)))
        .digest("hex"),
      ...(await stat(path.join(folder, name))),
    })),
  );
  const page = await context.newPage(),
    panel = await context.newPage();
  const errors = [];
  for (const view of [page, panel]) {
    view.setDefaultTimeout(15000);
    view.on("pageerror", (error) => errors.push(error.message));
    await view.addInitScript(() => {
      window.__groupRequests = [];
      window.__groupReads = [];
      const connect = chrome.runtime.connect.bind(chrome.runtime);
      chrome.runtime.connect = (...args) => {
        const port = connect(...args),
          send = port.postMessage.bind(port);
        port.postMessage = (message) => {
          window.__groupRequests.push(message.action);
          if (message.action === "FS_READ")
            window.__groupReads.push(message.payload);
          if (message.action === "FS_READ" && window.__groupReadDelay) {
            setTimeout(() => send(message), window.__groupReadDelay);
            return;
          }
          send(message);
        };
        return port;
      };
    });
  }
  async function openGroups(view, isPanel = false) {
    if (isPanel) {
      await view.getByTitle("Options du panneau", { exact: true }).click();
      await view
        .getByRole("button", { name: "Regrouper les fichiers…", exact: true })
        .click();
    } else {
      await view.keyboard.press("Control+k");
      await view
        .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
          exact: true,
        })
        .fill("Regrouper");
      await view
        .getByRole("button", {
          name: "Regrouper les fichiers",
          exact: true,
        })
        .click();
    }
    return view.getByRole("dialog", {
      name: "Regrouper les fichiers",
      exact: true,
    });
  }
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
    await page.getByRole("option", { name: /rapport-final-v2.PDF/ }).waitFor();
    await page
      .getByRole("option", { name: "rapport-final-v2.PDF", exact: true })
      .click();
    await page
      .getByRole("option", { name: "justificatif sans titre.txt", exact: true })
      .click({ modifiers: ["Control"] });
    await page
      .getByRole("option", { name: "rapport-final-v2.PDF", exact: true })
      .click({ button: "right" });
    const contextMenu = page.getByRole("menu", {
      name: "Actions sur les fichiers",
      exact: true,
    });
    await contextMenu.waitFor();
    for (const label of [
      "Ouvrir",
      "Modifier",
      "Organiser",
      "Transformer",
      "Tags",
    ])
      await contextMenu
        .getByRole("group", { name: label, exact: true })
        .waitFor();
    assert.equal(await contextMenu.getByRole("separator").count(), 4);
    assert.equal(
      await contextMenu
        .getByRole("menuitem", { name: "Calculer une empreinte", exact: true })
        .count(),
      0,
    );
    assert.equal(await contextMenu.getByRole("menuitemcheckbox").count(), 7);
    assert.equal(
      await contextMenu
        .getByRole("menuitem", { name: "Tags…", exact: true })
        .isDisabled(),
      false,
    );
    assert.equal(
      await contextMenu
        .getByRole("menuitem", {
          name: "Personnaliser les dossiers…",
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await contextMenu
        .getByRole("menuitem", { name: "Actions rapides…", exact: true })
        .count(),
      0,
      "la sélection PDF + texte ne propose pas d’action rapide compatible",
    );
    assert.ok(
      await contextMenu
        .getByRole("menuitem")
        .evaluateAll((items) =>
          items.every((item) => item.querySelector('svg[aria-hidden="true"]')),
        ),
    );
    assert.equal(
      await page
        .locator('.pane.active [role="option"][aria-selected="true"]')
        .count(),
      2,
    );
    await contextMenu
      .getByRole("menuitem", { name: "Copier", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await contextMenu.waitFor({ state: "hidden" });
    await page.getByText("2 élément(s) copié(s)", { exact: true }).waitFor();
    await page.locator(".pane.active .file-scroll").focus();
    await page.keyboard.press("Shift+F10");
    await contextMenu.waitFor();
    await page.keyboard.press("Control+c");
    await contextMenu.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .locator('.pane.active [role="option"][aria-selected="true"]')
        .count(),
      2,
    );
    await page
      .getByRole("option", { name: "README", exact: true })
      .click({ button: "right" });
    assert.equal(
      await page
        .locator('.pane.active [role="option"][aria-selected="true"]')
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .locator(".pane.active .file-scroll")
        .evaluate((element) => element === document.activeElement),
      true,
    );
    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 844 },
      { width: 1024, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.locator(".pane.active .file-scroll").focus();
      await page.keyboard.press("Shift+F10");
      await contextMenu.waitFor();
      await contextMenu.evaluate((menu) =>
        Promise.all(
          menu
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
      const box = await contextMenu.boundingBox();
      assert.ok(box.x >= 8 && box.x + box.width <= viewport.width - 7);
      assert.ok(box.y >= 8 && box.y + box.height <= viewport.height - 7);
      assert.ok(
        await contextMenu.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      );
      await page.keyboard.press("End");
      const lastItem = contextMenu.getByRole("menuitem", {
        name: "Tags…",
        exact: true,
      });
      assert.equal(
        await lastItem.evaluate(
          (element) => element === document.activeElement,
        ),
        true,
      );
      const last = await lastItem.boundingBox();
      assert.ok(
        last.y >= box.y && last.y + last.height <= box.y + box.height + 1,
      );
      await page.keyboard.press("ArrowDown");
      assert.equal(
        await contextMenu
          .getByRole("menuitem", { name: "Aperçu", exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
      await contextMenu.waitFor({ state: "hidden" });
    }
    await page.setViewportSize({ width: 1024, height: 844 });
    await page.locator(".pane.active .file-scroll").focus();
    await page.keyboard.press("Shift+F10");
    assert.equal(
      await contextMenu
        .getByRole("menuitem", { name: "Mettre à la corbeille", exact: true })
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const background =
            style.backgroundColor === "rgba(0, 0, 0, 0)"
              ? getComputedStyle(element.closest('[role="menu"]'))
                  .backgroundColor
              : style.backgroundColor;
          return style.color !== background;
        }),
      true,
    );
    await page.screenshot({
      path: "test-results/file-context-menu.png",
      animations: "disabled",
    });
    const originalTheme = await page.evaluate(() => {
      const theme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = "light";
      return theme;
    });
    assert.equal(
      await contextMenu
        .getByRole("menuitem", { name: "Mettre à la corbeille", exact: true })
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const background =
            style.backgroundColor === "rgba(0, 0, 0, 0)"
              ? getComputedStyle(element.closest('[role="menu"]'))
                  .backgroundColor
              : style.backgroundColor;
          return style.color !== background;
        }),
      true,
    );
    await page.screenshot({
      path: "test-results/file-context-menu-light.png",
      animations: "disabled",
    });
    await page.evaluate((theme) => {
      if (theme === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
    }, originalTheme);
    await page.keyboard.press("Tab");
    await contextMenu.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("option", { name: "Sous-dossier", exact: true })
      .click({ button: "right" });
    await contextMenu
      .getByRole("menuitem", {
        name: "Ouvrir dans un nouvel onglet",
        exact: true,
      })
      .waitFor();
    assert.ok(
      await contextMenu
        .getByRole("menuitem", {
          name: "Personnaliser les dossiers…",
          exact: true,
        })
        .isEnabled(),
    );
    await page
      .getByRole("heading", { name: path.basename(folder), exact: true })
      .click();
    await contextMenu.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );
    await page.getByRole("option", { name: "README", exact: true }).click();
    for (const shortcut of ["F2", "Delete"]) {
      await page.locator(".pane.active .file-scroll").focus();
      await page.keyboard.press("Shift+F10");
      await contextMenu.waitFor();
      await page.keyboard.press(shortcut);
      await contextMenu.waitFor({ state: "hidden" });
      if (shortcut === "Delete") {
        await page
          .getByRole("option", { name: "README", exact: true })
          .waitFor({ state: "hidden" });
        assert.equal(await page.getByRole("dialog").count(), 0);
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Corbeille", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Restaurer", exact: true })
          .click();
        await page
          .getByRole("option", { name: "README", exact: true })
          .waitFor();
        await page.keyboard.press("Escape");
        continue;
      }
      const confirmation = page.getByRole("dialog");
      await confirmation.waitFor();
      if (shortcut === "F2")
        assert.equal(
          await confirmation.getByLabel("Nom", { exact: true }).inputValue(),
          "README",
        );
      else
        await confirmation
          .getByRole("button", { name: "Mettre à la corbeille", exact: true })
          .waitFor();
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
    }
    console.log(
      "Clic droit : icônes, cinq groupes et séparateurs, sélection multiple conservée, copie au clavier, Shift+F10/flèches/Échap/Tab, dossier et 320/390/1024 px : OK",
    );
    if (menuOnly) return;
    await page.getByRole("option", { name: /rapport-final-v2.PDF/ }).click();
    let dialog = await openGroups(page);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(/1 fichier regroupé/).waitFor();
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    const started = performance.now();
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText("7 fichiers regroupés · 1 élément exclu (dossiers ou liens)", {
        exact: true,
      })
      .waitFor();
    const elapsedMs = Math.round(performance.now() - started);
    for (const [category, names] of [
      ["Documents", ["rapport-final-v2.PDF", "justificatif sans titre.txt"]],
      ["Images", ["scan volumineux.TIFF", "photo vacances.png"]],
      ["Autres", ["image.pdf.exe", "README"]],
    ]) {
      const group = dialog
        .locator("details.file-group")
        .filter({ has: page.getByText(category, { exact: true }) });
      await group.locator("summary").click();
      for (const name of names)
        await group.getByText(name, { exact: true }).waitFor();
    }
    await dialog
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    const editor = dialog.locator("fieldset").first();
    await editor
      .getByLabel("Nom", { exact: true })
      .fill("Pièces administratives");
    await editor.getByLabel("Extensions", { exact: true }).fill("pdf, PDF");
    await dialog
      .getByRole("button", { name: "Enregistrer les catégories", exact: true })
      .click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: /appartient déjà/ })
      .waitFor();
    await editor.getByLabel("Extensions", { exact: true }).fill("pdf, txt, md");
    await dialog
      .getByRole("button", { name: "Enregistrer les catégories", exact: true })
      .click();
    await dialog.getByText(/Catégories enregistrées dans ce profil/).waitFor();
    await dialog.getByText("Pièces administratives", { exact: true }).waitFor();
    await panel.goto(`${baseURL}?panel=1`);
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    let other = await openGroups(panel, true);
    await other
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    assert.equal(
      await other
        .locator("fieldset")
        .first()
        .getByLabel("Nom", { exact: true })
        .inputValue(),
      "Pièces administratives",
    );
    // An editor opened before another view's save must not overwrite that save.
    await dialog
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    await dialog
      .locator("fieldset")
      .first()
      .getByLabel("Nom", { exact: true })
      .fill("Documents français");
    await dialog
      .getByRole("button", { name: "Enregistrer les catégories", exact: true })
      .click();
    await dialog.getByText("Documents français", { exact: true }).waitFor();
    await other
      .getByRole("button", { name: "Enregistrer les catégories", exact: true })
      .click();
    await other
      .getByRole("alert")
      .filter({ hasText: /autre vue/ })
      .waitFor();
    await other
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    await other
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    assert.equal(await other.getByRole("alert").count(), 0);
    assert.equal(
      await other
        .locator("fieldset")
        .first()
        .getByLabel("Nom", { exact: true })
        .inputValue(),
      "Documents français",
    );
    for (const width of [320, 390, 1024]) {
      await panel.setViewportSize({ width, height: 844 });
      assert.equal(
        await other.evaluate(
          (element) =>
            element.scrollWidth <= element.clientWidth + 1 &&
            [...element.querySelectorAll("input,textarea,select")].every(
              (input) =>
                input.getBoundingClientRect().right <=
                element.getBoundingClientRect().right + 1,
            ),
        ),
        true,
      );
    }
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({
      path: "test-results/file-groups-editor.png",
      fullPage: true,
    });
    await other.getByRole("button", { name: "Fermer", exact: true }).click();
    await panel.reload();
    other = await openGroups(panel, true);
    await other
      .getByRole("button", { name: "Personnaliser", exact: true })
      .click();
    assert.equal(
      await other
        .locator("fieldset")
        .first()
        .getByLabel("Nom", { exact: true })
        .inputValue(),
      "Documents français",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const firstGroup = dialog.locator(".file-group").first();
    await firstGroup.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await firstGroup.getAttribute("open"), "");
    await page.keyboard.press("Enter");
    await page.screenshot({
      path: "test-results/file-groups-results.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: "test-results/file-groups-light.png",
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await dialog.locator("button.primary").evaluate((button) => {
        const style = getComputedStyle(button);
        const luminance = (color) => {
          const channels = color
            .match(/\d+/g)
            .slice(0, 3)
            .map((value) => Number(value) / 255)
            .map((value) =>
              value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4,
            );
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const foreground = luminance(style.color),
          background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
            (Math.min(foreground, background) + 0.05) >=
          4.5
        );
      }),
      "Le bouton principal doit rester lisible en thème clair",
    );
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_LIST_DIR")),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 960 });
    await dialog
      .getByRole("button", {
        name: "Afficher scan volumineux.TIFF dans son dossier",
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("option", { name: /rapport-final-v2.PDF/ }).waitFor();
    await page
      .getByLabel("Filtrer ce dossier", { exact: true })
      .fill("rapport-final");
    await page.getByRole("option", { name: /rapport-final-v2.PDF/ }).waitFor();
    await page.getByRole("option", { name: /rapport-final-v2.PDF/ }).click();
    await page.getByRole("button", { name: "Collecter", exact: true }).click();
    await page.keyboard.press("Control+k");
    await page
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…")
      .fill("Enregistrer ou reprendre un espace");
    await page
      .getByRole("button", {
        name: "Enregistrer ou reprendre un espace",
        exact: true,
      })
      .click();
    const spaces = page.getByRole("dialog", {
      name: "Espaces hybrides",
      exact: true,
    });
    await spaces
      .getByLabel("Nom de l’espace", { exact: true })
      .fill("Référence C0");
    await spaces
      .getByRole("button", { name: "Enregistrer cet espace", exact: true })
      .click();
    await spaces
      .getByText("Espace « Référence C0 » enregistré.", { exact: true })
      .waitFor();
    await spaces.getByRole("button", { name: "Fermer", exact: true }).click();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("space");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText("Espace : Référence C0", { exact: false }).waitFor();
    await dialog
      .locator("details.file-group")
      .filter({ hasText: "Documents français" })
      .waitFor();
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText("7 fichiers regroupés · 1 élément exclu (dossiers ou liens)", {
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Escape");
    const large = path.join(fixture, "Référence C0 mille fichiers");
    await mkdir(large);
    await Promise.all(
      Array.from({ length: 1003 }, (_, index) =>
        writeFile(
          path.join(large, `${String(index).padStart(4, "0")}.txt`),
          "Référence",
        ),
      ),
    );
    await page.goto(`${baseURL}?path=${encodeURIComponent(large)}`);
    await page.getByRole("option", { name: /0000.txt/ }).waitFor();
    dialog = await openGroups(page);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();
    await dialog.getByText(/1000 fichiers regroupés/).waitFor();
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("name");
    await dialog
      .getByText(
        /1000 fichiers examinés · 0 famille proposée · 1000 fichiers sans rapprochement/,
      )
      .waitFor();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();

    const relatedFolder = path.join(fixture, "Référence française C1");
    await mkdir(relatedFolder);
    await mkdir(path.join(relatedFolder, "Sous-dossier"));
    const relatedSamples = {
      "Été_Atlas-v1.PDF": Buffer.from("Document synthétique version 1"),
      "ete atlas version 2.docx": Buffer.from("Autre contenu version 2"),
      "ETE–ATLAS (1).TIFF": samples["scan volumineux.TIFF"],
      "facture dupont 001.pdf": Buffer.from("Facture 001"),
      "facture dupont 002.pdf": Buffer.from("Facture 002"),
      "document final.pdf": Buffer.from("Nom générique"),
      "document_final.txt": Buffer.from("Autre nom générique"),
      "projet atlas lyon.pdf": Buffer.from("Lyon"),
      "projet atlas lyons.pdf": Buffer.from("Lyons"),
    };
    for (const [name, bytes] of Object.entries(relatedSamples))
      await writeFile(path.join(relatedFolder, name), bytes);
    const relatedBefore = await Promise.all(
      Object.keys(relatedSamples).map(async (name) => ({
        name,
        ...(await stat(path.join(relatedFolder, name))),
      })),
    );
    await page.goto(`${baseURL}?path=${encodeURIComponent(relatedFolder)}`);
    for (const name of Object.keys(relatedSamples).slice(0, 3))
      await page
        .getByRole("option", {
          name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .click({ modifiers: ["Control"] });
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("name");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(
        /3 fichiers examinés · 1 famille proposée · 0 fichier sans rapprochement/,
      )
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Personnaliser", exact: true })
        .count(),
      0,
    );
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    assert.equal(await dialog.locator(".file-group").count(), 0);
    const relatedStarted = performance.now();
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(
        /9 fichiers examinés · 1 famille proposée · 6 fichiers sans rapprochement · 1 élément exclu/,
      )
      .waitFor();
    const relatedElapsedMs = Math.round(performance.now() - relatedStarted);
    const family = dialog
      .locator("details.file-group")
      .filter({ has: page.getByText("ete atlas", { exact: true }) });
    await family.locator("summary").focus();
    await page.keyboard.press("Enter");
    await family.getByText(/Même nom normalisé : « ete atlas »/).waitFor();
    for (const name of Object.keys(relatedSamples).slice(0, 3))
      await family.getByText(name, { exact: true }).waitFor();
    const unmatched = dialog
      .locator("details.file-group")
      .filter({ hasText: "Sans rapprochement fiable" });
    await unmatched.locator("summary").click();
    for (const name of Object.keys(relatedSamples).slice(3))
      await unmatched.getByText(name, { exact: true }).waitFor();
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("format");
    await dialog.getByText(/9 fichiers regroupés/).waitFor();
    await dialog.getByText("Documents français", { exact: true }).waitFor();
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("name");
    await dialog
      .locator("details.file-group")
      .first()
      .locator("summary")
      .click();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/file-names-results.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: "test-results/file-names-light.png",
      fullPage: true,
      animations: "disabled",
    });
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("space");
    assert.equal(await dialog.locator(".file-group").count(), 0);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(/Espace : Référence C0/).waitFor();
    const spaceUnmatched = dialog
      .locator("details.file-group")
      .filter({ hasText: "Sans rapprochement fiable" });
    await spaceUnmatched.locator("summary").click();
    await spaceUnmatched
      .getByText("rapport-final-v2.PDF", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );

    await panel.goto(`${baseURL}?panel=1`);
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    await panel.keyboard.press("Control+k");
    const folderInput = panel.getByPlaceholder(
      "Action, chemin ou alias (~dl, ~desk)…",
      { exact: true },
    );
    await folderInput.fill(relatedFolder);
    await folderInput.press("Enter");
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .and(panel.getByTitle(relatedFolder, { exact: true }))
      .waitFor();
    other = await openGroups(panel, true);
    await other
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("name");
    assert.equal(
      await other.getByLabel("Regrouper depuis", { exact: true }).inputValue(),
      "folder",
    );
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await other
      .getByText(
        /9 fichiers examinés · 1 famille proposée · 6 fichiers sans rapprochement/,
      )
      .waitFor();
    await other
      .locator("details.file-group")
      .first()
      .locator("summary")
      .click();
    await other.getByText("ETE–ATLAS (1).TIFF", { exact: true }).waitFor();
    for (const width of [320, 390, 1024]) {
      await panel.setViewportSize({ width, height: 844 });
      assert.equal(
        await other.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        true,
      );
    }
    assert.equal(
      await panel.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );
    for (const item of relatedBefore) {
      const current = await stat(path.join(relatedFolder, item.name));
      assert.equal(current.size, item.size);
      assert.equal(current.mtimeMs, item.mtimeMs);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(relatedFolder, item.name)))
          .digest("hex"),
        createHash("sha256").update(relatedSamples[item.name]).digest("hex"),
      );
    }
    assert.equal((await readdir(relatedFolder)).length, 10);
    console.log(
      `C1 : noms normalisés, versions/copies, motifs, cas incertains et factures distinctes, sélection/dossier/espace, deux vues, 320/390/1024 px, TIFF 24 Mio sans FS_READ et fichiers intacts : OK (${relatedElapsedMs} ms, recette locale synthétique)`,
    );
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );
    for (const item of before) {
      const current = await stat(path.join(folder, item.name));
      assert.equal(current.size, item.size);
      assert.equal(current.mtimeMs, item.mtimeMs);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(folder, item.name)))
          .digest("hex"),
        item.hash,
      );
    }
    assert.deepEqual(
      (await readdir(folder)).sort(),
      [".nextexplorer-trash", "Sous-dossier", ...Object.keys(samples)].sort(),
    );
    assert.equal(
      (await readdir(path.join(folder, ".nextexplorer-trash"))).length,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      `C0 : sélection/dossier/espace, filtre ignoré, 1000/1003 entrées, corpus français mixte, TIFF 24 Mio sans FS_READ, catégories persistées, conflit entre vues, 320/390/1024 px et fichiers intacts : OK (${elapsedMs} ms, recette locale synthétique)`,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
    await page
      .getByRole("option", { name: "rapport-final-v2.PDF", exact: true })
      .click();
    dialog = await openGroups(page);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(/1 fichier regroupé/).waitFor();
    const dateRequests = await page.evaluate(
      () =>
        window.__groupRequests.filter((action) =>
          ["FS_LIST_DIR", "FS_STAT", "FS_READ"].includes(action),
        ).length,
    );
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("date");
    await dialog.getByText("janvier 2026", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.__groupRequests.filter((action) =>
            ["FS_LIST_DIR", "FS_STAT", "FS_READ"].includes(action),
          ).length,
      ),
      dateRequests,
    );
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    assert.equal(await dialog.locator(".file-group").count(), 0);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText("7 fichiers regroupés · 1 élément exclu (dossiers ou liens)", {
        exact: true,
      })
      .waitFor();
    assert.deepEqual(
      await dialog.locator(".file-group summary strong").allTextContents(),
      ["février 2026", "janvier 2026", "décembre 2025"],
    );
    const recentMonth = dialog
      .locator("details.file-group")
      .filter({ has: page.getByText("février 2026", { exact: true }) });
    await recentMonth.locator("summary").focus();
    await page.keyboard.press("Enter");
    await recentMonth
      .getByText("scan volumineux.TIFF", { exact: true })
      .waitFor();
    await recentMonth
      .getByText(/Modifié le.*2026/)
      .first()
      .waitFor();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/file-dates-results.png",
      animations: "disabled",
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: "test-results/file-dates-light.png",
      animations: "disabled",
    });
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("space");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    const spaceMonth = dialog
      .locator("details.file-group")
      .filter({ has: page.getByText("janvier 2026", { exact: true }) });
    await spaceMonth.locator("summary").click();
    await spaceMonth
      .getByText("rapport-final-v2.PDF", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );

    await panel.keyboard.press("Escape");
    await panel.keyboard.press("Control+k");
    const dateFolderInput = panel.getByPlaceholder(
      "Action, chemin ou alias (~dl, ~desk)…",
      { exact: true },
    );
    await dateFolderInput.fill(folder);
    await dateFolderInput.press("Enter");
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .and(panel.getByTitle(folder, { exact: true }))
      .waitFor();
    other = await openGroups(panel, true);
    await other
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("date");
    await other
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await other.getByText(/7 fichiers regroupés · 1 élément exclu/).waitFor();
    assert.deepEqual(
      await other.locator(".file-group summary strong").allTextContents(),
      ["février 2026", "janvier 2026", "décembre 2025"],
    );
    for (const item of before) {
      const current = await stat(path.join(folder, item.name));
      assert.equal(current.mtimeMs, item.mtimeMs);
      assert.equal(current.size, item.size);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(folder, item.name)))
          .digest("hex"),
        item.hash,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}?path=${encodeURIComponent(large)}`);
    await page
      .getByRole("listbox", { name: "Fichiers", exact: true })
      .getByRole("option")
      .first()
      .waitFor();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("date");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(/1000 fichiers regroupés/).waitFor();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__groupRequests.includes("FS_READ")),
      false,
    );
    console.log(
      "C1 dates : mois et années distincts, plus récents en premier, sélection/dossier/espace, instantané réutilisé, deux vues, 320/390/1024 px, 1000/1003, TIFF 24 Mio sans FS_READ et fichiers intacts : OK",
    );

    const originsFolder = path.join(fixture, "Origines web C1");
    await mkdir(originsFolder);
    await mkdir(path.join(originsFolder, "Sous-dossier"));
    const originSamples = {
      "a-facture.pdf": Buffer.from("Facture synthétique"),
      "b-scan.TIFF": samples["scan volumineux.TIFF"],
      "c-photo.txt": Buffer.from("Photo synthétique, aucun décodage"),
      "d-sans-origine.txt": Buffer.from("Sans provenance"),
      "e-taille-inexacte.pdf": Buffer.from("Taille inexacte"),
      "f-json-invalide.txt": Buffer.from("JSON invalide"),
      "g-adresse-interdite.txt": Buffer.from("Adresse invalide"),
      "h-provenance-volumineuse.txt": Buffer.from("Métadonnées volumineuses"),
    };
    for (const [name, bytes] of Object.entries(originSamples)) {
      if (name.startsWith("d-")) continue;
      const metadata = name.startsWith("f-")
        ? "{"
        : name.startsWith("h-")
          ? "x".repeat(65537)
          : JSON.stringify({
              version: 1,
              file: name,
              title: "Source synthétique",
              collectedAt: "2026-10-11T08:00:00Z",
              size: name.startsWith("e-") ? 1 : bytes.length,
              sourceUrl: name.startsWith("g-")
                ? "https://user:pass@atelier.example/"
                : name.startsWith("c-")
                  ? "https://photos.example/photo"
                  : "https://atelier.example/doc?token=secret#section",
            });
      originSamples[name + ".source.json"] = Buffer.from(metadata);
    }
    for (const [name, bytes] of Object.entries(originSamples))
      await writeFile(path.join(originsFolder, name), bytes);
    const originBefore = await Promise.all(
      Object.keys(originSamples).map(async (name) => ({
        name,
        ...(await stat(path.join(originsFolder, name))),
      })),
    );
    const network = [];
    page.on("request", (request) => {
      if (/^https:\/\/(?:atelier|photos)\.example\//.test(request.url()))
        network.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}?path=${encodeURIComponent(originsFolder)}`);
    await page
      .getByRole("option", { name: "a-facture.pdf", exact: true })
      .click();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("origin");
    assert.equal(await dialog.locator(".file-group").count(), 0);
    assert.equal(await page.evaluate(() => window.__groupReads.length), 0);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(/1 fichier examiné · 0 sans origine vérifiable/)
      .waitFor();
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    const originStarted = performance.now();
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(
        /8 fichiers examinés · 5 sans origine vérifiable · 0 non analysé · 8 éléments exclus/,
      )
      .waitFor();
    const originElapsedMs = Math.round(performance.now() - originStarted);
    const siteGroup = dialog.locator("details.file-group").filter({
      has: page.getByText("https://atelier.example", { exact: true }),
    });
    await siteGroup.locator("summary").focus();
    await page.keyboard.press("Enter");
    await siteGroup.getByText("b-scan.TIFF", { exact: true }).waitFor();
    await siteGroup
      .getByText(/Source enregistrée : https:\/\/atelier.example\/doc/)
      .first()
      .waitFor();
    assert.equal((await dialog.textContent()).includes("token=secret"), false);
    const originUnknown = dialog
      .locator("details.file-group")
      .filter({ hasText: "Sans origine vérifiable" });
    await originUnknown.locator("summary").click();
    await originUnknown.getByText(/taille enregistrée/).waitFor();
    await originUnknown.getByText(/64 Kio ; aucune lecture/).waitFor();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/file-origins-results.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: "test-results/file-origins-light.png",
      fullPage: true,
      animations: "disabled",
    });
    const reads = await page.evaluate(() => window.__groupReads);
    assert.ok(reads.length >= 5);
    assert.ok(
      reads.every(
        (read) => read.path.endsWith(".source.json") && read.limit <= 65536,
      ),
    );
    assert.equal(
      reads.some((read) =>
        read.path.endsWith("h-provenance-volumineuse.txt.source.json"),
      ),
      false,
    );
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("name");
    assert.equal(await dialog.locator(".file-group").count(), 0);
    assert.equal(
      await page.evaluate(() => window.__groupReads.length),
      reads.length,
    );

    await panel.keyboard.press("Escape");
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.keyboard.press("Control+k");
    await panel
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
        exact: true,
      })
      .fill(originsFolder);
    await panel
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
        exact: true,
      })
      .press("Enter");
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .and(panel.getByTitle(originsFolder, { exact: true }))
      .waitFor();
    other = await openGroups(panel, true);
    await other
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("origin");
    await other
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await other
      .getByText(/8 fichiers examinés · 5 sans origine vérifiable/)
      .waitFor();
    const readsBeforeStop = await panel.evaluate(() => {
      window.__groupReadDelay = 2000;
      return window.__groupReads.length;
    });
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await panel.waitForFunction(
      (before) => window.__groupReads.length > before,
      readsBeforeStop,
    );
    await other.getByRole("button", { name: "Arrêter", exact: true }).click();
    await other
      .getByText("Regroupement arrêté. Aucun fichier modifié.", { exact: true })
      .waitFor();
    assert.equal(await other.locator(".file-group").count(), 0);
    const statsAtStop = await panel.evaluate(
      () =>
        window.__groupRequests.filter((action) => action === "FS_STAT").length,
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal(await other.locator(".file-group").count(), 0);
    assert.equal(
      await panel.evaluate(
        () =>
          window.__groupRequests.filter((action) => action === "FS_STAT")
            .length,
      ),
      statsAtStop,
    );
    await panel.evaluate(() => {
      window.__groupReadDelay = 0;
    });
    await page.keyboard.press("Escape");
    await page.goto(`${baseURL}?path=${encodeURIComponent(large)}`);
    await page
      .getByRole("listbox", { name: "Fichiers", exact: true })
      .getByRole("option")
      .first()
      .waitFor();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("origin");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(
        /20 fichiers examinés · 20 sans origine vérifiable · 980 non analysés/,
      )
      .waitFor();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();
    for (const item of originBefore) {
      const current = await stat(path.join(originsFolder, item.name));
      assert.equal(current.size, item.size);
      assert.equal(current.mtimeMs, item.mtimeMs);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(originsFolder, item.name)))
          .digest("hex"),
        createHash("sha256").update(originSamples[item.name]).digest("hex"),
      );
    }
    assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
    console.log(
      `C1 origines : sélection/dossier, sites distincts, sources épurées, JSON seul <=64 Kio, TIFF 24 Mio non lu, cas invalides, 20/1000/1003, arrêt, deux vues, clavier/320/390/1024 px et fichiers intacts : OK (${originElapsedMs} ms, corpus local synthétique)`,
    );
    await runFileDestinationJourney({
      page,
      panel,
      baseURL,
      fixture,
      openGroups,
      large,
    });
    await runOriginDestinationJourney({
      page,
      panel,
      baseURL,
      fixture,
      openGroups,
    });
    await runFileFamilyJourney({
      page,
      panel,
      baseURL,
      fixture,
      openGroups,
      large,
    });
    await runFileCopyJourney({ context, baseURL, fixture });
    assert.deepEqual(errors, []);
  } catch (error) {
    await panel.screenshot({
      path: "test-results/file-groups-failure.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "test-results/file-names-failure.png",
      fullPage: true,
    });
    console.error(await page.getByRole("dialog").allTextContents());
    console.error(await panel.getByRole("dialog").allTextContents());
    throw error;
  } finally {
    await page.close();
    await panel.close();
  }
}
