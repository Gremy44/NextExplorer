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

export async function runFileFamilyJourney({
  page,
  panel,
  baseURL,
  fixture,
  openGroups,
  large,
}) {
  const folder = path.join(fixture, "Familles locales"),
    copies = path.join(fixture, "Copies liées"),
    target = path.join(fixture, "Rangement proposé");
  for (const dir of [folder, copies, target]) await mkdir(dir);
  const samples = {
    "Projet Atlas-v1.pdf": Buffer.from("Document Atlas"),
    "Projet Atlas-v2.docx": Buffer.from("Version Atlas"),
    "original.png": await readFile("public/icon128.png"),
    "note.txt": Buffer.from("Note"),
    "vide.bin": Buffer.alloc(0),
    "gros.TIFF": Buffer.alloc(24 * 1024 * 1024),
  };
  for (const [name, bytes] of Object.entries(samples))
    await writeFile(path.join(folder, name), bytes);
  const before = await Promise.all(
    Object.keys(samples).map(async (name) => ({
      name,
      ...(await stat(path.join(folder, name))),
      hash: createHash("sha256").update(samples[name]).digest("hex"),
    })),
  );
  const keys = ["fileFamilies", "imagePreparations", "downloadFiling"];
  const backup = await page.evaluate(
    async (keys) => chrome.storage.local.get(keys),
    keys,
  );
  await page.addInitScript(() => {
    window.__familyActions = [];
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args),
        send = port.postMessage.bind(port);
      port.postMessage = (message) => {
        window.__familyActions.push({
          action: message.action,
          payload: message.payload,
        });
        if (message.action === "FS_STAT" && window.__familyStatDelay)
          setTimeout(() => send(message), window.__familyStatDelay);
        else send(message);
      };
      return port;
    };
  });
  const group = (dialog, name) =>
    dialog
      .locator("details.file-group")
      .filter({ has: page.getByText(name, { exact: true }) });
  async function openAt(directory, mode = "relations") {
    await page.goto(`${baseURL}?path=${encodeURIComponent(directory)}`);
    await page
      .getByRole("listbox", { name: "Fichiers", exact: true })
      .getByRole("option")
      .first()
      .waitFor();
    const dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption(mode);
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.locator(".group-results").waitFor();
    return dialog;
  }
  const stored = (key) =>
    page.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      key,
    );
  async function verifyOriginals() {
    for (const item of before) {
      const current = await stat(path.join(folder, item.name));
      assert.equal(current.size, item.size);
      assert.equal(
        Math.floor(current.mtimeMs / 1000),
        Math.floor(item.mtimeMs / 1000),
      );
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(folder, item.name)))
          .digest("hex"),
        item.hash,
      );
    }
  }
  async function restoreDocument() {
    const item = before.find((item) => item.name === "Projet Atlas-v1.pdf");
    await writeFile(path.join(folder, item.name), samples[item.name]);
    await utimes(
      path.join(folder, item.name),
      new Date(item.atimeMs),
      new Date(item.mtimeMs),
    );
  }
  try {
    await page.keyboard.press("Escape");
    await panel.keyboard.press("Escape");
    await page.evaluate(async () =>
      chrome.storage.local.set({
        fileFamilies: [],
        imagePreparations: [],
        downloadFiling: { rules: [], destinations: [] },
      }),
    );
    await page.setViewportSize({ width: 1024, height: 900 });
    let dialog = await openAt(folder, "size");
    for (const label of [
      "Fichiers vides",
      "Moins de 1 Mio",
      "De 10 à moins de 100 Mio",
    ])
      await dialog.getByText(label, { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.__familyActions.filter((item) => item.action === "FS_READ")
            .length,
      ),
      0,
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("option", { name: "Projet Atlas-v1.pdf", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Projet Atlas-v2.docx", exact: true })
      .click({ modifiers: ["Control"] });
    dialog = await openGroups(page);
    await dialog
      .locator("details.group-help > summary")
      .filter({ hasText: "Familles enregistrées" })
      .click();
    await dialog
      .getByRole("button", { name: "Relier la sélection", exact: true })
      .click();
    let editor = dialog.getByRole("form", {
      name: "Enregistrer une famille",
      exact: true,
    });
    const name = editor.getByLabel("Nom de la famille", { exact: true });
    assert.ok(
      await name.evaluate((element) => element === document.activeElement),
    );
    await name.fill("Projet Atlas");
    await editor
      .getByRole("button", { name: "Enregistrer la famille", exact: true })
      .click();
    await dialog
      .getByText(/Famille enregistrée\. Aucun fichier déplacé/)
      .waitFor();
    assert.ok(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    );
    assert.equal((await stored("fileFamilies"))[0].members.length, 2);
    await page.keyboard.press("Escape");
    dialog = await openAt(folder);
    await dialog.getByText("Famille : Projet Atlas", { exact: true }).waitFor();
    assert.equal(
      await group(dialog, "Famille : Projet Atlas")
        .locator("summary span")
        .textContent(),
      "2",
    );
    await group(dialog, "Famille : Projet Atlas").locator("summary").click();
    await group(dialog, "Famille : Projet Atlas")
      .getByRole("button", { name: "Enregistrer une famille", exact: true })
      .click();
    editor = dialog.getByRole("form", {
      name: "Enregistrer une famille",
      exact: true,
    });
    await editor
      .getByLabel("Nom de la famille", { exact: true })
      .fill("Brouillon périmé");
    await writeFile(
      path.join(folder, "Projet Atlas-v1.pdf"),
      "Fichier changé après aperçu",
    );
    await editor
      .getByRole("button", { name: "Enregistrer la famille", exact: true })
      .click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: /a changé/ })
      .waitFor();
    assert.equal((await stored("fileFamilies")).length, 1);
    await editor
      .getByRole("button", { name: "Annuler la famille", exact: true })
      .click();
    assert.ok(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    );
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText("Relations à revérifier", { exact: true }).waitFor();
    assert.equal(
      await group(dialog, "Famille : Projet Atlas")
        .locator("summary span")
        .textContent(),
      "1",
    );
    await restoreDocument();
    await page.keyboard.press("Escape");

    await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
    await page
      .getByRole("option", { name: "original.png", exact: true })
      .click();
    await page.keyboard.press("Control+k");
    await page
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
        exact: true,
      })
      .fill("Préparer");
    await page
      .getByRole("button", { name: /Préparer des images pour le web/ })
      .click();
    const prepare = page.getByRole("dialog", {
      name: "Préparer des images pour le web",
      exact: true,
    });
    await prepare
      .getByLabel("Format des copies", { exact: true })
      .selectOption("jpg");
    await prepare
      .getByLabel("Largeur maximale en pixels", { exact: true })
      .fill("64");
    await prepare
      .getByLabel("Dossier de destination", { exact: true })
      .fill(copies);
    await prepare
      .getByRole("button", {
        name: "Créer et vérifier les copies",
        exact: true,
      })
      .click();
    await prepare
      .getByText("Respecte les contraintes saisies", { exact: true })
      .waitFor({ timeout: 45000 });
    const receipt = (await stored("imagePreparations"))[0];
    assert.equal(receipt.sources[0].path, path.join(folder, "original.png"));
    assert.equal(receipt.copies[0].path, path.join(copies, "original.jpg"));
    await page.keyboard.press("Escape");
    dialog = await openAt(copies);
    const linked = dialog
      .locator("details.file-group")
      .filter({ has: page.getByText(/^Préparation JPG/) });
    await linked.locator("summary").click();
    assert.equal(await linked.locator("summary span").textContent(), "2");
    await linked
      .getByText(path.join(folder, "original.png"), { exact: true })
      .waitFor();
    await linked
      .getByText(path.join(copies, "original.jpg"), { exact: true })
      .waitFor();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      );
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.screenshot({
        path: `test-results/file-families-${theme}.png`,
        animations: "disabled",
      });
    }
    await page.keyboard.press("Escape");

    async function ruleEditor() {
      const dialog = await openAt(copies, "format");
      const images = dialog
        .locator("details.file-group")
        .filter({ has: page.getByText("original.jpg", { exact: true }) });
      await images.locator("summary").click();
      await images
        .getByRole("button", { name: "Créer une règle", exact: true })
        .click();
      const rules = page.getByRole("dialog", {
        name: "Créer une règle de rangement",
        exact: true,
      });
      const form = rules.getByRole("form", {
        name: "Éditer une règle de rangement",
        exact: true,
      });
      await form.waitFor();
      assert.equal(
        await form.getByLabel("Extension (facultative)").inputValue(),
        ".jpg",
      );
      assert.equal(
        await form
          .getByRole("checkbox", {
            name: "Ranger automatiquement les nouveaux téléchargements",
            exact: true,
          })
          .isChecked(),
        false,
      );
      return { rules, form };
    }
    let draft = await ruleEditor();
    await page.keyboard.press("Escape");
    assert.equal((await stored("downloadFiling")).rules.length, 0);
    draft = await ruleEditor();
    await draft.form
      .getByLabel("Dossier de destination", { exact: true })
      .fill(target);
    await draft.form
      .getByRole("button", { name: "Enregistrer la règle", exact: true })
      .click();
    await draft.rules
      .getByText("Règle enregistrée.", { exact: true })
      .waitFor();
    const savedRule = (await stored("downloadFiling")).rules[0];
    assert.equal(savedRule.extension, ".jpg");
    assert.equal(savedRule.destination, target);
    assert.notEqual(savedRule.automatic, true);
    await page.keyboard.press("Escape");
    dialog = await openAt(copies, "destination");
    await dialog.getByText(target, { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.__familyActions.filter((item) => item.action === "FS_TRANSFER")
            .length,
      ),
      0,
    );
    assert.deepEqual(await readdir(target), []);

    await panel.goto(`${baseURL}?panel=1`);
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    await panel.keyboard.press("Control+k");
    const command = panel.getByPlaceholder(
      "Action, chemin ou alias (~dl, ~desk)…",
      { exact: true },
    );
    await command.fill(folder);
    await command.press("Enter");
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .and(panel.getByTitle(folder, { exact: true }))
      .waitFor();
    const other = await openGroups(panel, true);
    await other
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("relations");
    await other
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await other.getByText("Famille : Projet Atlas", { exact: true }).waitFor();
    assert.ok(
      await other.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    await page.keyboard.press("Escape");
    dialog = await openAt(folder);
    await other
      .locator("details.group-help > summary")
      .filter({ hasText: "Familles enregistrées" })
      .click();
    await other
      .getByTitle("Retirer la famille Projet Atlas", { exact: true })
      .click();
    await other
      .getByText("Famille retirée du profil. Aucun fichier supprimé.", {
        exact: true,
      })
      .waitFor();
    await dialog.locator(".group-results").waitFor({ state: "hidden" });
    assert.deepEqual(await stored("fileFamilies"), []);

    await page.keyboard.press("Escape");
    dialog = await openAt(large);
    await dialog
      .getByText(/200 fichiers examinés · 800 non vérifiés/)
      .waitFor();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();
    await page.evaluate(() => {
      window.__familyStatDelay = 1000;
      window.__familyActions = [];
    });
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.__familyActions.some((item) => item.action === "FS_STAT"),
    );
    await dialog.getByRole("button", { name: "Arrêter", exact: true }).click();
    const stopped = await page.evaluate(
      () =>
        window.__familyActions.filter((item) => item.action === "FS_STAT")
          .length,
    );
    await page.waitForTimeout(1400);
    assert.equal(await dialog.locator(".group-results").count(), 0);
    assert.equal(
      await page.evaluate(
        () =>
          window.__familyActions.filter((item) => item.action === "FS_STAT")
            .length,
      ),
      stopped,
    );
    await verifyOriginals();
    assert.deepEqual(await readdir(copies), ["original.jpg"]);
    console.log(
      "C1 palier : tailles, famille depuis sélection, contrôle avant stockage et lien périmé séparé, sources/copies réelles hors dossier, brouillon de règle manuel sans mutation, synchronisation/retrait entre vues, 200/1000/1003, arrêt, clavier et 320/390/1024 px, SHA256 des originaux intacts : OK",
    );
  } finally {
    await page.evaluate(
      async ({ keys, backup }) => {
        await chrome.storage.local.remove(
          keys.filter((key) => !(key in backup)),
        );
        await chrome.storage.local.set(backup);
      },
      { keys, backup },
    );
  }
}
