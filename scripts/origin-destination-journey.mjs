import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function runOriginDestinationJourney({
  page,
  panel,
  baseURL,
  fixture,
  openGroups,
}) {
  const folder = path.join(fixture, "Destinations par origine"),
    siteFolder = path.join(fixture, "Dossier du site"),
    genericFolder = path.join(fixture, "Dossier générique");
  for (const dir of [folder, siteFolder, genericFolder]) await mkdir(dir);
  const files = {
    "01 site.pdf": Buffer.from("Document du site"),
    "02 autre.pdf": Buffer.from("Autre site"),
    "03 absent.pdf": Buffer.from("Sans origine"),
    "04 conflit.zip": Buffer.from("Règles contradictoires"),
    "05 volumineux.TIFF": Buffer.alloc(24 * 1024 * 1024),
    "06 invalide.pdf": Buffer.from("JSON invalide"),
    "07 trop grand.pdf": Buffer.from("JSON trop lourd"),
    ...Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [
        `lot-${i}.txt`,
        Buffer.from(`Lot ${i}`),
      ]),
    ),
  };
  const source = (name, site = "example.com") => ({
    version: 1,
    file: name,
    title: name,
    sourceUrl: `https://${site}/page?secret=prive#fragment`,
    collectedAt: "2026-10-11T00:00:00Z",
    size: files[name].length,
  });
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(path.join(folder, name), bytes);
    if (
      !["03 absent.pdf", "06 invalide.pdf", "07 trop grand.pdf"].includes(name)
    )
      await writeFile(
        path.join(folder, name + ".source.json"),
        JSON.stringify(
          source(name, name === "02 autre.pdf" ? "other.com" : "example.com"),
        ),
      );
  }
  await writeFile(
    path.join(folder, "06 invalide.pdf.source.json"),
    "JSON cassé",
  );
  await writeFile(
    path.join(folder, "07 trop grand.pdf.source.json"),
    "x".repeat(65537),
  );
  const sidecar = path.join(folder, "01 site.pdf.source.json"),
    originalSource = await readFile(sidecar);
  const before = new Map(
    await Promise.all(
      (await readdir(folder)).map(async (name) => [
        name,
        createHash("sha256")
          .update(await readFile(path.join(folder, name)))
          .digest("hex"),
      ]),
    ),
  );
  const saved = await page.evaluate(
    async () =>
      (await chrome.storage.local.get("downloadFiling")).downloadFiling ?? null,
  );
  const rule = (id, extension, site, destination) => ({
    id,
    name: id,
    extension,
    site,
    destination,
    enabled: true,
  });
  const rules = [
    rule("PDF génériques", ".pdf", "", genericFolder),
    rule("PDF du site", ".pdf", "example.com", siteFolder),
    rule("TIFF du site", ".tiff", "example.com", siteFolder),
    rule("ZIP génériques", ".zip", "", genericFolder),
    rule("Site seul", "", "example.com", siteFolder),
  ];
  const reads = [],
    actions = [],
    network = [];
  // Le port est observé sans modifier les messages envoyés au compagnon.
  await page.addInitScript(() => {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args),
        send = port.postMessage.bind(port);
      port.postMessage = (message) => {
        window.dispatchEvent(
          new CustomEvent("origin-destination-request", { detail: message }),
        );
        send(message);
      };
      return port;
    };
  });
  await page.exposeFunction("recordOriginDestination", (message) => {
    actions.push(message.action);
    if (message.action === "FS_READ") reads.push(message.payload);
  });
  await page.addInitScript(() =>
    window.addEventListener("origin-destination-request", (event) =>
      window.recordOriginDestination(event.detail),
    ),
  );
  const observeNetwork = (request) => {
    if (/^https?:\/\/(?:example|other|changed)\.com[/:]/.test(request.url()))
      network.push(request.url());
  };
  page.on("request", observeNetwork);
  async function groups(view = page, isPanel = false) {
    if (!isPanel) {
      await view.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
      await view.getByRole("option").first().waitFor();
    }
    const dialog = await openGroups(view, isPanel);
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    assert.equal(
      await dialog
        .getByRole("checkbox", {
          name: "Tenir compte des origines web (.source.json)",
          exact: true,
        })
        .isChecked(),
      false,
    );
    await dialog
      .getByRole("checkbox", {
        name: "Tenir compte des origines web (.source.json)",
        exact: true,
      })
      .check();
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog
      .getByText(
        /20 fichiers examinés · 3 sans origine vérifiable · 8 non analysés/,
      )
      .waitFor();
    return dialog;
  }
  const siteGroup = (dialog) =>
    dialog
      .locator("details.file-group")
      .filter({ has: page.getByText(siteFolder, { exact: true }) });
  async function preview(dialog) {
    await siteGroup(dialog).locator("summary").click();
    await siteGroup(dialog)
      .getByRole("button", { name: "Examiner le transfert", exact: true })
      .click();
    const transfer = page.getByRole("dialog", {
      name: "Transférer les fichiers",
      exact: true,
    });
    await transfer.waitFor();
    assert.equal(await transfer.getByLabel("Opération").inputValue(), "copy");
    await transfer.getByText(/Les origines déclarées seront relues/).waitFor();
    return transfer;
  }
  try {
    await page.evaluate(
      async (rules) =>
        chrome.storage.local.set({
          downloadFiling: { rules, destinations: [] },
        }),
      rules,
    );
    await page.keyboard.press("Escape");
    await panel.keyboard.press("Escape");
    await page.setViewportSize({ width: 1024, height: 900 });
    let dialog = await groups();
    assert.equal(
      await siteGroup(dialog).locator("summary span").textContent(),
      "15",
    );
    const unknown = dialog.locator("details.file-group").filter({
      has: page.getByText("Sans origine vérifiable", { exact: true }),
    });
    await unknown.locator("summary").click();
    assert.equal(
      await unknown
        .getByRole("button", { name: "Examiner le transfert", exact: true })
        .count(),
      0,
    );
    await dialog.getByText("Règles en conflit", { exact: true }).waitFor();
    await siteGroup(dialog).locator("summary").focus();
    await page.keyboard.press("Enter");
    await dialog
      .getByText(/Origine déclarée : https:\/\/example.com\/page/)
      .first()
      .waitFor();
    assert.equal(await dialog.getByText(/secret=prive|#fragment/).count(), 0);
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
        path: `test-results/origin-destinations-${theme}.png`,
        animations: "disabled",
      });
    }
    await siteGroup(dialog).locator("summary").click();
    let transfer = await preview(dialog);
    await transfer
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    assert.equal(
      actions.filter((action) => action === "FS_TRANSFER").length,
      0,
    );
    assert.deepEqual(await readdir(siteFolder), []);

    dialog = await groups();
    transfer = await preview(dialog);
    await writeFile(
      sidecar,
      JSON.stringify(source("01 site.pdf", "changed.com")),
    );
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer
      .getByRole("alert")
      .filter({ hasText: /origine.*01 site.pdf.*a changé/ })
      .waitFor();
    assert.equal(
      actions.filter((action) => action === "FS_TRANSFER").length,
      0,
    );
    await transfer
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    await writeFile(sidecar, originalSource);

    dialog = await groups();
    // Sortir puis revenir exige une nouvelle analyse explicite.
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("format");
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("destination");
    assert.equal(await dialog.locator(".group-results").count(), 0);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.getByText(/20 fichiers examinés/).waitFor();
    transfer = await preview(dialog);
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await transfer.waitFor({ state: "hidden" });
    const deadline = Date.now() + 30000;
    while (
      (await readdir(siteFolder)).filter(
        (name) => !name.startsWith(".nextexplorer"),
      ).length < 15 &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await readdir(siteFolder)).length, 15);
    for (const name of await readdir(siteFolder))
      assert.deepEqual(
        await readFile(path.join(siteFolder, name)),
        files[name],
      );
    for (const [name, hash] of before)
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(folder, name)))
          .digest("hex"),
        hash,
      );
    assert.equal(
      actions.filter((action) => action === "FS_TRANSFER").length,
      1,
    );
    assert.ok(reads.length > 0);
    assert.ok(
      reads.every(
        (read) => read.path.endsWith(".source.json") && read.limit <= 65536,
      ),
    );
    assert.equal(
      reads.some((read) => read.path.endsWith("07 trop grand.pdf.source.json")),
      false,
    );
    assert.deepEqual(network, []);

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
    const other = await groups(panel, true);
    await other.getByText("Règles en conflit", { exact: true }).waitFor();
    assert.ok(
      await other.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    console.log(
      "C1 destinations par origine : option explicite, priorité/site exact, conflits et origines invalides, 20/28, JSON <=64 Kio seuls, TIFF intact, aperçu/annulation, origine changée bloquée avant transfert, copie vérifiée, deux vues, 320/390/1024 px et zéro visite web : OK",
    );
  } finally {
    page.off("request", observeNetwork);
    await page.evaluate(
      async (saved) => chrome.storage.local.set({ downloadFiling: saved }),
      saved,
    );
  }
}
