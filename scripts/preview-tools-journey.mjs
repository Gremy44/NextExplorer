import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function runPreviewToolsJourney({ page, fixture }) {
  page.setDefaultTimeout(15000);
  const folder = path.join(fixture, "Aperçus");
  await mkdir(folder);
  const original = "Première ligne\r\nDeuxième ligne\r\n";
  const edited = "Texte modifié dans l’aperçu\nUne nouvelle ligne\n";
  const file = path.join(folder, "note.txt");
  await writeFile(file, original);
  await writeFile(path.join(folder, "vide.md"), "");
  await writeFile(
    path.join(folder, "utf16.txt"),
    Buffer.from([255, 254, 65, 0]),
  );
  await writeFile(path.join(folder, "grand.txt"), "x".repeat(128 * 1024 + 1));
  await writeFile(
    path.join(folder, "Ubuntu.ttf"),
    await readFile("public/fonts/UbuntuMono-Regular.ttf"),
  );
  await writeFile(
    path.join(folder, "illisible.woff2"),
    "Ce fichier n’est pas une police.",
  );
  await writeFile(
    path.join(folder, "trop-grande.otf"),
    Buffer.alloc(16 * 1024 * 1024 + 1),
  );
  await page.getByRole("option", { name: "Aperçus", exact: true }).dblclick();
  const select = async (name) => {
    await page
      .locator(".pane")
      .first()
      .getByRole("option", { name, exact: true })
      .click();
  };
  await select("note.txt");
  const toggle = page.getByRole("button", {
    name: "Volet d’aperçu",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-pressed")) !== "true")
    await toggle.click();
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  const edit = () =>
    details
      .getByRole("button", { name: /^(Modifier|Reprendre le brouillon)$/ })
      .click();
  const area = details.getByRole("textbox", {
    name: "Contenu du fichier",
    exact: true,
  });
  await edit();
  await area.fill(edited);
  await page.evaluate(() => {
    window.__draftSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("nextexplorer:document-draft:"))
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      return window.__draftSetItem.call(this, key, value);
    };
  });
  await area.fill("Brouillon seulement en mémoire");
  await select("vide.md");
  await select("note.txt");
  await edit();
  assert.equal(await area.inputValue(), "Brouillon seulement en mémoire");
  await details
    .getByRole("alert")
    .filter({ hasText: "uniquement dans cette page" })
    .waitFor();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__draftSetItem;
  });
  await area.fill(edited);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await readFile(file, "utf8"), original);
  await select("vide.md");
  assert.equal(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
    "avertissement même si le brouillon est hors sélection",
  );
  await select("note.txt");
  await details
    .getByRole("button", { name: "Reprendre le brouillon", exact: true })
    .waitFor();
  await edit();
  assert.equal(await area.inputValue(), edited);
  await page
    .locator(".pane")
    .first()
    .getByRole("option", { name: "note.txt", exact: true })
    .dblclick();
  const resumedModal = page.getByRole("dialog", {
    name: "Aperçu de note.txt",
    exact: true,
  });
  assert.equal(
    await page
      .getByRole("textbox", { name: "Contenu du fichier", exact: true })
      .count(),
    0,
  );
  await resumedModal
    .getByRole("button", { name: "Reprendre le brouillon", exact: true })
    .click();
  assert.equal(
    await resumedModal
      .getByRole("textbox", { name: "Contenu du fichier", exact: true })
      .inputValue(),
    edited,
  );
  await resumedModal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  await edit();
  assert.equal(await area.inputValue(), edited);
  await area.press("Control+s");
  await details
    .getByText("Enregistré. La version précédente est conservée.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await readFile(file, "utf8"), edited.replaceAll("\n", "\r\n"));
  await details
    .getByRole("button", { name: "Versions", exact: true })
    .last()
    .click();
  await details.locator(".version-row").first().waitFor();
  await details
    .locator(".version-row")
    .first()
    .getByRole("button", { name: "Voir", exact: true })
    .click();
  assert.equal(
    await details.getByLabel("Contenu de la version").textContent(),
    original,
  );
  await details
    .locator(".document-tabs")
    .getByRole("button", { name: "Modifier", exact: true })
    .click();
  await area.fill("Brouillon à préserver");
  await writeFile(file, "Modification externe");
  await details
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await details.getByRole("alert").waitFor();
  assert.equal(await area.inputValue(), "Brouillon à préserver");
  assert.equal(await readFile(file, "utf8"), "Modification externe");
  page.once("dialog", (dialog) => dialog.accept());
  await details
    .getByRole("button", { name: "Quitter l’édition", exact: true })
    .click();
  await select("grand.txt");
  assert.equal(
    await details
      .getByRole("button", { name: "Modifier", exact: true })
      .isDisabled(),
    true,
  );
  await select("utf16.txt");
  await edit();
  await details.getByRole("alert").waitFor();
  assert.equal(await area.isDisabled(), true);
  await select("vide.md");
  await edit();
  await area.fill("# Note créée directement dans l’aperçu");
  await area.press("Control+s");
  await details
    .getByText("Enregistré. La version précédente est conservée.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await readFile(path.join(folder, "vide.md"), "utf8"),
    "# Note créée directement dans l’aperçu",
  );
  await select("Ubuntu.ttf");
  const specimen = details.getByLabel("Texte dans la police sélectionnée");
  await specimen.waitFor();
  assert.ok(
    await specimen.evaluate((element) => {
      const family = getComputedStyle(element).fontFamily;
      return (
        family.includes("nxe-font-") &&
        [...document.fonts].some(
          (font) => family.includes(font.family) && font.status === "loaded",
        )
      );
    }),
  );
  await details
    .getByLabel("Texte d’essai")
    .fill("Une police locale, sans installation.");
  await details.getByLabel("Taille des caractères").fill("64");
  assert.equal(
    await specimen.textContent(),
    "Une police locale, sans installation.",
  );
  assert.equal(
    await specimen.evaluate((element) => getComputedStyle(element).fontSize),
    "64px",
  );
  await page.screenshot({ path: "test-results/font-preview.png" });
  await select("illisible.woff2");
  await details.getByRole("alert").waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        [...document.fonts].filter((font) =>
          font.family.startsWith("nxe-font-"),
        ).length,
    ),
    0,
  );
  await select("trop-grande.otf");
  await details
    .getByText("Aperçu des polices limité à 16 Mio.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Réduire la navigation", exact: true })
    .click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await select("vide.md");
    await edit();
    await area.waitFor();
    await details.locator(".details-content").evaluate((element) => {
      element.scrollTop = 0;
    });
    const bounds = await area.boundingBox();
    assert.ok(
      bounds.width > 40 &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= width + 1,
      `éditeur à ${width} px`,
    );
    await page.screenshot({ path: `test-results/inline-editor-${width}.png` });
    await select("Ubuntu.ttf");
    await specimen.waitFor();
    assert.ok(
      await details.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
      `police à ${width} px`,
    );
  }
  await page
    .locator(".pane")
    .first()
    .getByRole("option", { name: "Ubuntu.ttf", exact: true })
    .dblclick();
  const modal = page.getByRole("dialog", {
    name: "Aperçu de Ubuntu.ttf",
    exact: true,
  });
  await modal.getByLabel("Texte dans la police sélectionnée").waitFor();
  await modal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  await select("vide.md");
  await page
    .locator(".pane")
    .first()
    .getByRole("option", { name: "vide.md", exact: true })
    .dblclick();
  const textModal = page.getByRole("dialog", {
    name: "Aperçu de vide.md",
    exact: true,
  });
  await textModal
    .getByRole("button", { name: "Modifier", exact: true })
    .click();
  const modalArea = textModal.getByRole("textbox", {
    name: "Contenu du fichier",
    exact: true,
  });
  await modalArea.fill("# Enregistrement depuis la fenêtre d’aperçu");
  await modalArea.press("Control+s");
  await textModal
    .getByText("Enregistré. La version précédente est conservée.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await readFile(path.join(folder, "vide.md"), "utf8"),
    "# Enregistrement depuis la fenêtre d’aperçu",
  );
  await textModal
    .getByRole("button", { name: "Quitter l’édition", exact: true })
    .click();
  await textModal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  console.log(
    "Aperçus : police locale, texte et taille, nettoyage et erreurs ; édition sans modale, Ctrl+S, version, CRLF, brouillon, conflit externe, fichier vide et limites, 320/390/1440 px : OK",
  );
}
