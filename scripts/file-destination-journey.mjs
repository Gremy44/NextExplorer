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

export async function runFileDestinationJourney({
  page,
  panel,
  baseURL,
  fixture,
  openGroups,
  large,
}) {
  const folder = path.join(fixture, "C1 destinations"),
    docs = path.join(fixture, "Documents proposés"),
    images = path.join(fixture, "Images proposées");
  for (const dir of [folder, docs, images, path.join(folder, "Sous-dossier")])
    await mkdir(dir);
  const samples = {
    "rapport.pdf": Buffer.from("Rapport de référence"),
    "note.txt": Buffer.from("Note de référence"),
    "photo.png": await readFile("public/icon128.png"),
    "archive.zip": Buffer.from("Conflit de règles"),
    "scan.TIFF": Buffer.alloc(24 * 1024 * 1024),
    "rapport.pdf.source.json": Buffer.from(
      "Métadonnées voisines non transférées",
    ),
    ...Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [
        `lot-${i}.bulk`,
        Buffer.from(`Fichier ${i}`),
      ]),
    ),
  };
  const sampleDate = new Date(2026, 9, 10, 12);
  for (const [name, bytes] of Object.entries(samples)) {
    await writeFile(path.join(folder, name), bytes);
    await utimes(path.join(folder, name), sampleDate, sampleDate);
  }
  await writeFile(path.join(docs, "rapport.pdf"), "Collision à conserver");
  const before = await Promise.all(
    Object.keys(samples).map(async (name) => ({
      name,
      ...(await stat(path.join(folder, name))),
      hash: createHash("sha256").update(samples[name]).digest("hex"),
    })),
  );
  const saved = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("downloadFiling")).downloadFiling ?? null,
  );
  const rule = (id, extension, destination = docs, extra = {}) => ({
    id,
    name: id,
    extension,
    destination,
    site: "",
    enabled: true,
    ...extra,
  });
  const filing = {
    destinations: [],
    rules: [
      rule("PDF", ".pdf"),
      rule("Texte", ".txt"),
      rule("Images", ".png", images),
      rule("ZIP documents", ".zip"),
      rule("ZIP images", ".zip", images),
      rule("Lot", ".bulk"),
      rule("PDF désactivée", ".pdf", images, { enabled: false }),
      rule("TIFF avec site", ".tiff", images, { site: "example.com" }),
    ],
  };
  await page.addInitScript(() => {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args),
        send = port.postMessage.bind(port);
      port.postMessage = (message) => {
        if (
          ["FS_TRANSFER", "FS_READ", "FS_LIST_DIR"].includes(message.action)
        ) {
          const key = `destination-${message.action}`;
          sessionStorage.setItem(
            key,
            String(Number(sessionStorage.getItem(key) || 0) + 1),
          );
        }
        send(message);
      };
      return port;
    };
  });
  const requests = (action) =>
    page.evaluate(
      (action) => Number(sessionStorage.getItem(`destination-${action}`) || 0),
      action,
    );
  const transfersBefore = await requests("FS_TRANSFER"),
    readsBefore = await requests("FS_READ");
  async function checkOriginals() {
    for (const entry of before) {
      const current = await stat(path.join(folder, entry.name));
      assert.equal(current.size, entry.size);
      assert.equal(current.mtimeMs, entry.mtimeMs);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(folder, entry.name)))
          .digest("hex"),
        entry.hash,
      );
    }
  }
  async function groups() {
    await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
    await page
      .getByRole("listbox", { name: "Fichiers", exact: true })
      .getByRole("option")
      .first()
      .waitFor();
    const dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(/26 fichiers regroupés · 2 éléments exclus/)
      .waitFor();
    return dialog;
  }
  function destinationGroup(dialog, destination) {
    return dialog
      .locator("details.file-group")
      .filter({ has: page.getByText(destination, { exact: true }) });
  }
  async function preview(dialog, destination = docs) {
    const group = destinationGroup(dialog, destination);
    await group.locator("summary").click();
    await group
      .getByRole("button", { name: "Examiner le transfert", exact: true })
      .click();
    const transfer = page.getByRole("dialog", {
      name: "Transférer les fichiers",
      exact: true,
    });
    await transfer.waitFor();
    assert.equal(
      await transfer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      true,
    );
    return transfer;
  }
  try {
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(
      async (filing) => chrome.storage.local.set({ downloadFiling: filing }),
      filing,
    );
    let dialog = await groups();
    const proposed = destinationGroup(dialog, docs);
    await proposed.locator("summary").focus();
    await page.keyboard.press("Enter");
    await proposed.getByText("Règle : PDF", { exact: true }).waitFor();
    await proposed.getByText("Règle : Texte", { exact: true }).waitFor();
    await dialog
      .locator("details.file-group")
      .filter({ hasText: "Règles en conflit" })
      .locator("summary")
      .click();
    await dialog.getByText("archive.zip", { exact: true }).waitFor();
    await dialog
      .locator("details.file-group")
      .filter({ hasText: "Sans destination proposée" })
      .locator("summary")
      .click();
    await dialog.getByText("scan.TIFF", { exact: true }).waitFor();
    const bulk = proposed; // PDF, texte et lot partagent la même destination, trop grande pour un transfert.
    assert.equal(
      await bulk
        .getByRole("button", { name: "Examiner le transfert", exact: true })
        .isDisabled(),
      true,
    );
    await bulk.getByText(/Plus de 20 fichiers/).waitFor();
    assert.equal(await requests("FS_TRANSFER"), transfersBefore);
    assert.equal(await requests("FS_READ"), readsBefore);
    await checkOriginals();

    // Mise à jour entre vues : le même instantané ne propose plus les PDF désactivés.
    const changed = {
      ...filing,
      rules: filing.rules.map((rule) =>
        rule.id === "PDF" || rule.id === "Lot"
          ? { ...rule, enabled: false }
          : rule,
      ),
    };
    await panel.evaluate(
      async (filing) => chrome.storage.local.set({ downloadFiling: filing }),
      changed,
    );
    await proposed
      .getByRole("button", { name: "Examiner le transfert", exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".file-group")]
          .find((group) =>
            group
              .querySelector("summary strong")
              ?.textContent.includes("Documents proposés"),
          )
          ?.querySelector("summary span")?.textContent === "1",
    );
    const small = {
      ...filing,
      rules: filing.rules.map((rule) =>
        rule.id === "Lot" ? { ...rule, enabled: false } : rule,
      ),
    };
    await panel.evaluate(
      async (filing) => chrome.storage.local.set({ downloadFiling: filing }),
      small,
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".file-group")]
          .find((group) =>
            group
              .querySelector("summary strong")
              ?.textContent.includes("Documents proposés"),
          )
          ?.querySelector("summary span")?.textContent === "2",
    );
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
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.screenshot({
      path: "test-results/file-destinations-results.png",
      animations: "disabled",
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: "test-results/file-destinations-light.png",
      animations: "disabled",
    });
    const listsBefore = await requests("FS_LIST_DIR");
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("format");
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    assert.equal(await requests("FS_LIST_DIR"), listsBefore);

    let transfer = await preview(dialog);
    assert.equal(await transfer.getByLabel("Opération").inputValue(), "copy");
    assert.equal(
      await transfer
        .getByLabel("Dossier de destination", { exact: true })
        .inputValue(),
      docs,
    );
    assert.deepEqual(
      await transfer.locator(".path-list li").allTextContents(),
      [path.join(folder, "note.txt"), path.join(folder, "rapport.pdf")],
    );
    await transfer
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    assert.equal(await requests("FS_TRANSFER"), transfersBefore);
    await checkOriginals();

    dialog = await groups();
    transfer = await preview(dialog);
    const note = path.join(folder, "note.txt"),
      noteBefore = before.find((entry) => entry.name === "note.txt");
    await writeFile(note, "Note modifiée après l’aperçu");
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer
      .getByRole("alert")
      .filter({ hasText: /a changé/ })
      .waitFor();
    assert.equal(await requests("FS_TRANSFER"), transfersBefore);
    assert.deepEqual(await readdir(docs), ["rapport.pdf"]);
    await writeFile(note, samples["note.txt"]);
    await utimes(
      note,
      new Date(noteBefore.atimeMs),
      new Date(noteBefore.mtimeMs),
    );
    await transfer
      .getByRole("button", { name: "Annuler", exact: true })
      .click();

    dialog = await groups();
    transfer = await preview(dialog);
    await transfer
      .getByLabel("Dossier de destination", { exact: true })
      .fill(path.join(fixture, "Dossier absent"));
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer.getByRole("alert").waitFor();
    assert.equal(await requests("FS_TRANSFER"), transfersBefore);
    await transfer
      .getByLabel("Dossier de destination", { exact: true })
      .fill(docs);
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer.waitFor({ state: "hidden" });
    const deadline = Date.now() + 20000;
    while (
      !(await readdir(docs)).some(
        (name) => name !== "rapport.pdf" && name.endsWith(".pdf"),
      ) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await readdir(docs)).length, 3);
    assert.equal(
      await readFile(path.join(docs, "rapport.pdf"), "utf8"),
      "Collision à conserver",
    );
    assert.deepEqual(
      await readFile(path.join(docs, "note.txt")),
      samples["note.txt"],
    );
    const copy = (await readdir(docs)).find(
      (name) => name !== "rapport.pdf" && name.endsWith(".pdf"),
    );
    assert.deepEqual(
      await readFile(path.join(docs, copy)),
      samples["rapport.pdf"],
    );
    await checkOriginals();

    dialog = await groups();
    transfer = await preview(dialog, images);
    await transfer.getByLabel("Opération").selectOption("move");
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer.waitFor({ state: "hidden" });
    const moveDeadline = Date.now() + 20000;
    while (
      (await readdir(folder)).includes("photo.png") &&
      Date.now() < moveDeadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await readdir(folder)).includes("photo.png"), false);
    assert.deepEqual(
      await readFile(path.join(images, "photo.png")),
      samples["photo.png"],
    );
    assert.equal(await requests("FS_TRANSFER"), transfersBefore + 2);
    assert.equal(await requests("FS_READ"), readsBefore);
    assert.deepEqual(
      await readFile(path.join(folder, "rapport.pdf.source.json")),
      samples["rapport.pdf.source.json"],
    );

    await page.goto(`${baseURL}?path=${encodeURIComponent(docs)}`);
    await page.getByRole("option", { name: "note.txt", exact: true }).waitFor();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText("Déjà à destination", { exact: true }).waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Examiner le transfert", exact: true })
        .count(),
      0,
    );

    await panel.keyboard.press("Escape");
    await panel.keyboard.press("Control+k");
    const input = panel.getByPlaceholder(
      "Action, chemin ou alias (~dl, ~desk)…",
      { exact: true },
    );
    await input.fill(folder);
    await input.press("Enter");
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .and(panel.getByTitle(folder, { exact: true }))
      .waitFor();
    const other = await openGroups(panel, true);
    await other
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    await other
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await other.getByRole("button", { name: "Regrouper", exact: true }).click();
    await other
      .getByText(/25 fichiers regroupés · 2 éléments exclus/)
      .waitFor();
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("space");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(docs, { exact: true }).waitFor();

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
      .selectOption("destination");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(/Vue partielle : 1000 premières entrées sur 1003/)
      .waitFor();
    assert.equal(await requests("FS_READ"), readsBefore);
    console.log(
      "C1 destinations : règles d’extension, conflits/exclusions, synchronisation, 20/1000/1003, aperçu/annulation, fichier changé et dossier absent refusés, copie avec collision et déplacement explicites, deux vues/espace, clavier/320/390/1024 px : OK",
    );
  } finally {
    await page.evaluate(
      async (saved) => chrome.storage.local.set({ downloadFiling: saved }),
      saved,
    );
  }
}
