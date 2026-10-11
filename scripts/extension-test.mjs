import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  stat,
  cp,
  rename,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { runHybridJourneys } from "./hybrid-journeys.mjs";
import { runFileGroupJourney } from "./file-group-journey.mjs";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
async function waitUntil(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
await mkdir("test-results", { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/chromium-profile-"));
const fixture = await mkdtemp(path.resolve("test-results/native-extension-"));
const downloadsFolder = path.join(fixture, "Browser-downloads");
await mkdir(downloadsFolder);
await mkdir(path.join(profile, "Default"));
await writeFile(path.join(profile, "Default", "Preferences"), JSON.stringify({ download: { default_directory: downloadsFolder, prompt_for_download: false, directory_upgrade: true } }));
await writeFile(
  path.join(fixture, "native.txt"),
  "Lecture réelle via Native Messaging",
);
const imageBytes = await readFile("public/icon128.png");
let imageRequests = 0;
const formServer = createServer((request, response) => {
  if (request.url.startsWith("/automatic-download?")) {
    const name = new URL(request.url, "http://localhost").searchParams.get("name");
    assert.match(name, /^[a-z-]+\.auto$/);
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    response.end("Téléchargement Chrome réel à ranger");
    return;
  }
  if (request.url.startsWith("/slow-download.txt")) {
    response.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "100000", "Content-Disposition": 'attachment; filename="en-cours.txt"' });
    response.write("x".repeat(2048));
    return; // The test cancels this unfinished download and closes the connection.
  }
  if (request.url.startsWith("/download.txt")) {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Content-Disposition", 'attachment; filename="recette-download.txt"');
    response.end("Téléchargement Chrome réel à ranger");
    return;
  }
  if (request.url.startsWith("/capture.png")) {
    imageRequests++;
    response.setHeader("Content-Type", "image/png");
    response.end(imageBytes);
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(
    '<!doctype html><title>Formulaire de recette</title><p id="excerpt">Une référence à conserver.</p><label>Justificatif<input id="proof" type="file"></label><label>Pièces jointes<input id="attachments" type="file" multiple></label>',
  );
});
await new Promise((resolve) => formServer.listen(0, "127.0.0.1", resolve));
const formURL = `http://127.0.0.1:${formServer.address().port}/`;
// Pre-grant the test origin in an isolated copy, as after accepting Chrome's permission prompt.
const extension = await mkdtemp(
  path.resolve("test-results/companion-extension-"),
);
await cp(path.resolve("dist"), extension, { recursive: true });
const testManifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
testManifest.host_permissions = ["http://127.0.0.1/*"];
testManifest.permissions.push("debugger", "downloads"); // Simulate accepting optional permissions in the isolated test copy.
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(testManifest),
);
const context = await chromium.launchPersistentContext(profile, {
  acceptDownloads: true,
  downloadsPath: downloadsFolder,
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 20000 }));
  const id = new URL(worker.url()).hostname;
  assert.equal(id, (await readFile("extension-id.txt", "utf8")).trim());
  const menus = await worker.evaluate(async () => {
    const names = ["collect-page", "collect-link", "collect-selection", "collect-image"];
    let found = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      found = await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve) =>
              chrome.contextMenus.update(name, {}, () =>
                resolve(!chrome.runtime.lastError),
              ),
            ),
        ),
      );
      if (found.every(Boolean)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { found, manifest: chrome.runtime.getManifest() };
  });
  assert.ok(menus.manifest.permissions.includes("contextMenus"));
  assert.equal(menus.manifest.background.type, "module");
  assert.deepEqual(menus.found, [true, true, true, true]);
  await worker.evaluate(
    async (path) => chrome.storage.local.set({ lastPath: path }),
    fixture,
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole("button", { name: "Réglages", exact: true }).waitFor();
  const previewWorkerAsset = (await readdir(path.join(extension, "assets"))).find((name) => /^preview-worker-.*\.js$/.test(name));
  assert.ok(previewWorkerAsset);
  const highlighted = await page.evaluate((asset) => new Promise((resolve, reject) => {
    const previewWorker = new Worker(new URL(`assets/${asset}`, location.href), { type: "module" });
    const timer = setTimeout(() => { previewWorker.terminate(); reject(new Error("Preview worker timeout")); }, 5000);
    previewWorker.onmessage = ({ data }) => { clearTimeout(timer); previewWorker.terminate(); resolve(data); };
    previewWorker.onerror = (event) => { clearTimeout(timer); previewWorker.terminate(); reject(new Error(event.message)); };
    previewWorker.postMessage({ text: '{"preview": true, "count": 123}', markdown: false });
  }), previewWorkerAsset);
  assert.match(highlighted, /hljs-/);
  const response = await worker.evaluate(
    async () =>
      await new Promise((resolve) => {
        const port = chrome.runtime.connectNative("com.local.file_explorer");
        port.onMessage.addListener((message) => {
          if (message.id === "smoke") {
            resolve(message);
            port.disconnect();
          }
        });
        port.onDisconnect.addListener(() =>
          resolve({ error: chrome.runtime.lastError?.message }),
        );
        port.postMessage({ id: "smoke", action: "HELLO", payload: {} });
      }),
  );
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    assert.equal(response.status, "SUCCESS", JSON.stringify(response));
    assert.ok(response.data.roots.length > 0);
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
    await page.getByRole("option", { name: /native.txt/ }).click();
    await page.getByTitle("Volet d’aperçu", { exact: true }).click();
    const details = page.getByRole("complementary", { name: "Volet d’aperçu", exact: true });
    await details.getByText("Lecture réelle via Native Messaging", { exact: false }).waitFor();
    await details.getByRole("heading", { name: "native.txt", exact: true }).waitFor();
    await details.getByRole("button", { name: "Fermer le volet d’aperçu", exact: true }).click();
    await page.keyboard.press("Space");
    await page
      .getByText("Lecture réelle via Native Messaging", { exact: false })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.getByTitle("Nouveau dossier", { exact: true }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Créé par extension");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await page.getByRole("option", { name: /Créé par extension/ }).waitFor();
    assert.ok(
      (await stat(path.join(fixture, "Créé par extension"))).isDirectory(),
    );
    console.log(
      "Extension réelle : manifeste, service worker, origine, lecture, aperçu et création via Native Messaging : OK",
    );
  } else
    console.log(
      "Extension réelle : manifeste et service worker acceptés. Native : " +
        (response.status || response.error),
    );
  await page.screenshot({
    path: "test-results/extension-real.png",
    fullPage: true,
  });
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") await mkdir(path.join(fixture, "Choix du dossier"));
  const companion = await context.newPage();
  companion.on("pageerror", (error) => errors.push(error.message));
  await companion.setViewportSize({ width: 390, height: 844 });
  await companion.goto(`chrome-extension://${id}/index.html?panel=1`);
  const webPage = await context.newPage();
  await webPage.goto(formURL);
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    await companion.getByRole("button", { name: "Changer de dossier", exact: true }).click();
    const picker = companion.getByRole("dialog", { name: "Choisir un dossier", exact: true });
    assert.equal(await picker.getByRole("button", { name: "Dossier précédent", exact: true }).isDisabled(), true);
    await picker.getByRole("button", { name: "Ouvrir le dossier Choix du dossier", exact: true }).click();
    await picker.getByRole("button", { name: "Dossier précédent", exact: true }).click();
    await picker.getByRole("button", { name: "Ouvrir le dossier Choix du dossier", exact: true }).waitFor();
    await picker.getByRole("button", { name: "Ouvrir le dossier Choix du dossier", exact: true }).click();
    await picker.getByText("Aucun sous-dossier. Vous pouvez choisir ce dossier.", { exact: true }).waitFor();
    await picker.getByRole("button", { name: "Choisir ce dossier", exact: true }).click();
    await companion.getByText("Ce dossier est vide.", { exact: true }).waitFor();
    await companion.getByRole("button", { name: "Dossier précédent", exact: true }).click();
    await companion.getByRole("button", { name: "Ajouter native.txt à la collecte", exact: true }).waitFor();
    await companion.locator(".companion-filters > summary").click();
    await companion.getByLabel("Type de fichier", { exact: true }).selectOption("image");
    await companion.getByText("Aucun fichier ne correspond aux filtres.", { exact: true }).waitFor();
    await companion.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
    await companion.getByRole("button", { name: "Ajouter native.txt à la collecte", exact: true }).waitFor();
    await companion.locator(".companion-filters > summary").click();
    console.log("Sélecteur réel : navigation, confirmation, historique et filtres via Native Messaging : OK");
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      for (const [label, count, capture] of [["Affichage des fichiers", 8, "view"], ["Trier les fichiers", 6, "sort"]]) {
        const trigger = companion.getByRole("button", { name: label, exact: true });
        await trigger.locator("svg").first().click();
        const menu = companion.getByRole("menu", { name: label, exact: true });
        await menu.waitFor();
        assert.equal(await menu.getByRole("menuitemradio").count(), count);
        assert.equal(await menu.getByRole("menuitemradio", { checked: true }).count(), 1);
        assert.ok(await menu.getByRole("menuitemradio").evaluateAll(items => items.every(item => item.querySelector("svg"))));
        const box = await menu.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        assert.ok(box.y >= 0 && box.y + box.height <= 844);
        await companion.screenshot({ path: `test-results/companion-${capture}-menu-${width}.png`, animations: "disabled" });
        await companion.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        assert.equal(await trigger.evaluate(button => button === document.activeElement), true);
      }
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    const sortTrigger = companion.getByRole("button", { name: "Trier les fichiers", exact: true });
    await sortTrigger.click();
    await companion.getByRole("menuitemradio", { name: "Plus récents", exact: true }).click();
    await companion.waitForFunction(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:panel")).tabs[0].panes[0].sortBy === "mtime");
    await companion.reload();
    await sortTrigger.waitFor();
    assert.equal(await sortTrigger.getAttribute("data-value"), "mtime:desc");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:page")).tabs[0].panes[0].sortBy), "name");
    await sortTrigger.click();
    await companion.getByRole("menuitemradio", { name: "Nom A–Z", exact: true }).click();
    console.log("Extension réelle : menus sur icône, huit affichages/six tris illustrés, Échap/focus, 320/390/1024 px et tri du panneau mémorisé indépendamment : OK");
  }
  await companion.getByRole("tab", { name: "Page", exact: true }).click();
  await companion
    .getByRole("heading", { name: "Formulaire de recette", exact: true })
    .waitFor();
  assert.equal(await companion.locator(".pane").count(), 0);
  await companion
    .getByRole("button", { name: "Garder cette page", exact: true })
    .click();
  await companion
    .getByRole("status")
    .getByText("Page ajoutée à la collecte", { exact: true })
    .waitFor();
  await webPage.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("excerpt"));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await companion
    .getByRole("button", { name: "Capturer la sélection", exact: true })
    .click();
  const excerpt = companion.getByRole("dialog", {
    name: "Enregistrer la sélection",
    exact: true,
  });
  await excerpt
    .getByText("Une référence à conserver.", { exact: true })
    .waitFor();
  await excerpt
    .getByRole("button", { name: "Écarter la capture", exact: true })
    .click();
  await excerpt.waitFor({ state: "hidden" });
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    const capture = { kind: "image", id: "7db6d44a-ef2a-4e47-b229-23e4d22ec331", imageUrl: formURL + "capture.png?token=test#image", sourceUrl: formURL, title: "Image de recette", collectedAt: new Date().toISOString() };
    await worker.evaluate(async (pendingCapture) => chrome.storage.local.set({ pendingCapture }), capture);
    const imageDialog = companion.getByRole("dialog", { name: "Enregistrer l’image", exact: true });
    await imageDialog.waitFor();
    assert.equal(imageRequests, 0);
    await assert.rejects(stat(path.join(fixture, `Image-${capture.id}.png`)));
    await imageDialog.getByRole("button", { name: "Plus tard", exact: true }).click();
    await companion.reload();
    await imageDialog.waitFor();
    assert.equal(imageRequests, 0);
    await imageDialog.getByLabel("Dossier de destination", { exact: true }).fill(fixture);
    await imageDialog.getByRole("button", { name: "Enregistrer l’image", exact: true }).click();
    await imageDialog.waitFor({ state: "hidden" });
    assert.equal(imageRequests, 1);
    assert.deepEqual(await readFile(path.join(fixture, `Image-${capture.id}.png`)), imageBytes);
    const provenance = JSON.parse(await readFile(path.join(fixture, `Image-${capture.id}.png.source.json`), "utf8"));
    assert.equal(provenance.imageUrl, formURL + "capture.png");
    assert.equal(provenance.sourceUrl, formURL);
    await worker.evaluate(async (pendingCapture) => chrome.storage.local.set({ pendingCapture }), capture);
    await imageDialog.waitFor();
    await imageDialog.getByLabel("Dossier de destination", { exact: true }).fill(fixture);
    await imageDialog.getByRole("button", { name: "Enregistrer l’image", exact: true }).click();
    await imageDialog.locator(".error").waitFor();
    assert.deepEqual(await readFile(path.join(fixture, `Image-${capture.id}.png`)), imageBytes);
    await imageDialog.getByRole("button", { name: "Écarter la capture", exact: true }).click();
    await imageDialog.waitFor({ state: "hidden" });
    console.log("Capture image réelle : confirmation, reprise, octets et provenance, refus d’écrasement : OK");
    await companion.getByRole("tab", { name: "Page", exact: true }).click();
    await companion.getByRole("heading", { name: "Formulaire de recette", exact: true }).waitFor();
    await companion.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    const pdfButton = companion.getByRole("button", { name: "Enregistrer la page en PDF…", exact: true });
    await pdfButton.click();
    const pdfDialog = companion.getByRole("dialog", { name: "Enregistrer la page en PDF", exact: true });
    await pdfDialog.waitFor();
    assert.equal((await readdir(fixture)).filter((name) => /^Page-.*\.pdf$/.test(name)).length, 0);
    await pdfDialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await pdfButton.click();
    await pdfDialog.getByLabel("Dossier de destination", { exact: true }).fill(fixture);
    await companion.screenshot({ path: "test-results/page-pdf-capture.png", fullPage: true });
    await pdfDialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await pdfDialog.waitFor({ state: "hidden", timeout: 45000 });
    const pdfName = (await readdir(fixture)).find((name) => /^Page-.*\.pdf$/.test(name));
    assert.ok(pdfName);
    assert.equal((await readFile(path.join(fixture, pdfName))).subarray(0, 5).toString(), "%PDF-");
    const pdfSource = JSON.parse(await readFile(path.join(fixture, pdfName + ".source.json"), "utf8"));
    assert.equal(pdfSource.title, "Formulaire de recette");
    assert.equal(pdfSource.sourceUrl, formURL);
    assert.equal(pdfSource.format, "pdf");
    await pdfButton.click();
    await webPage.goto(formURL + "changed-before-pdf");
    await pdfDialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await pdfDialog.getByRole("alert").getByText(/La page a changé/).waitFor();
    assert.equal((await readdir(fixture)).filter((name) => /^Page-.*\.pdf$/.test(name)).length, 1);
    await pdfDialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await webPage.goto(formURL);
    console.log("PDF réel : annulation sans fichier, capture native et provenance, page changée refusée : OK");
    await companion.getByRole("tab", { name: "Fichiers", exact: true }).click();
    await companion.getByTitle(path.join(fixture, pdfName), { exact: true }).click();
    const pdfPreview = companion.getByRole("dialog", { name: `Aperçu de ${pdfName}`, exact: true });
    await pdfPreview.getByRole("button", { name: "Voir la provenance", exact: true }).click();
    const pdfProvenance = pdfPreview.getByRole("region", { name: "Provenance de la capture", exact: true });
    await pdfProvenance.getByText("Formulaire de recette", { exact: true }).waitFor();
    assert.equal(await pdfProvenance.getByRole("link", { name: "Ouvrir la page source" }).getAttribute("href"), formURL);
    await pdfPreview.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
    console.log("Provenance du PDF consultable dans le panneau réel : OK");
    await companion.getByRole("tab", { name: "Page", exact: true }).click();
    const downloadSession = await context.newCDPSession(webPage);
    await downloadSession.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsFolder, eventsEnabled: true });
    const downloadId = await worker.evaluate(async (url) => chrome.downloads.download({ url, filename: "recette-download.txt", saveAs: false }), formURL + "download.txt");
    await waitUntil(async () => (await worker.evaluate(async (id) => (await chrome.downloads.search({ id }))[0]?.state, downloadId)) === "complete", "Téléchargement non terminé");
    const downloaded = await worker.evaluate(async (id) => (await chrome.downloads.search({ id }))[0], downloadId);
    assert.ok(path.resolve(downloaded.filename).startsWith(path.resolve(downloadsFolder) + path.sep));
    const downloadName = path.basename(downloaded.filename);
    const expectedDownload = await readFile(downloaded.filename);
    const exportsFolder = path.join(fixture, "Exports");
    await mkdir(exportsFolder);
    await writeFile(path.join(exportsFolder, downloadName), "Original à conserver");
    await companion.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    const downloadListButton = companion.getByRole("button", { name: "Ranger les téléchargements…", exact: true });
    await worker.evaluate((url) => { void chrome.downloads.download({ url, filename: "en-cours.txt", saveAs: false }).catch(() => {}); }, formURL + "slow-download.txt");
    await waitUntil(async () => (await worker.evaluate(async (url) => chrome.downloads.search({ url }), formURL + "slow-download.txt")).some((item) => item.filename.endsWith("en-cours.txt")), "Téléchargement en cours non détecté");
    const slowId = await worker.evaluate(async (url) => (await chrome.downloads.search({ url }))[0].id, formURL + "slow-download.txt");
    await downloadListButton.click();
    const downloadListDialog = companion.getByRole("dialog", { name: "Ranger les téléchargements", exact: true });
    const slowButton = downloadListDialog.getByRole("button", { name: "Ranger en-cours.txt", exact: true });
    await slowButton.waitFor();
    assert.equal(await slowButton.isDisabled(), true);
    await worker.evaluate(async (id) => chrome.downloads.cancel(id), slowId);
    await downloadListDialog.getByText(/^Interrompu(?: ·|$)/).waitFor();
    assert.equal(await slowButton.isDisabled(), true);
    const fileDownloadButton = downloadListDialog.getByRole("button", { name: `Ranger ${downloadName}`, exact: true });
    const createRule = downloadListDialog.getByRole("button", { name: `Créer une règle pour ${downloadName}`, exact: true });
    const ruleEditor = downloadListDialog.getByRole("form", { name: "Éditer une règle de rangement", exact: true });
    await createRule.click();
    await ruleEditor.getByRole("button", { name: "Annuler la règle", exact: true }).click();
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get("downloadFiling")).downloadFiling))?.rules?.length || 0, 0);
    await createRule.click();
    assert.equal(await ruleEditor.getByLabel("Site d’origine (facultatif)").inputValue(), "127.0.0.1");
    assert.equal(await ruleEditor.getByLabel("Extension (facultative)").inputValue(), ".txt");
    await ruleEditor.getByLabel("Nom de la règle", { exact: true }).fill("Documents de recette");
    await ruleEditor.getByLabel("Site d’origine (facultatif)").fill("*");
    await ruleEditor.getByRole("button", { name: "Enregistrer la règle", exact: true }).click();
    await downloadListDialog.getByRole("alert").getByText(/Indiquez un site exact/).waitFor();
    await ruleEditor.getByLabel("Site d’origine (facultatif)").fill("127.0.0.1");
    await ruleEditor.getByRole("button", { name: "Parcourir les dossiers", exact: true }).click();
    const rulePicker = companion.getByRole("dialog", { name: "Choisir un dossier", exact: true });
    await rulePicker.getByRole("button", { name: "Ouvrir le dossier Exports", exact: true }).click();
    await rulePicker.getByRole("button", { name: "Choisir ce dossier", exact: true }).click();
    assert.equal(await ruleEditor.getByLabel("Dossier de destination", { exact: true }).inputValue(), exportsFolder);
    await ruleEditor.getByRole("button", { name: "Enregistrer la règle", exact: true }).click();
    await ruleEditor.waitFor({ state: "hidden" });
    await downloadListDialog.getByText(`Destination proposée :`, { exact: false }).waitFor();
    const ruleEnabled = downloadListDialog.getByRole("checkbox", { name: "Utiliser la règle Documents de recette", exact: true });
    await ruleEnabled.click();
    await waitUntil(async () => !(await ruleEnabled.isChecked()), "Règle non désactivée");
    await downloadListDialog.getByText("Règle désactivée.", { exact: true }).waitFor();
    assert.equal(await downloadListDialog.getByText("Destination proposée :", { exact: false }).count(), 0);
    await ruleEnabled.click();
    await waitUntil(async () => await ruleEnabled.isChecked(), "Règle non activée");
    await downloadListDialog.getByText("Règle activée.", { exact: true }).waitFor();
    await companion.screenshot({ path: "test-results/download-rules.png", fullPage: true });
    assert.deepEqual(await readFile(downloaded.filename), expectedDownload);
    assert.equal((await readdir(exportsFolder)).length, 1);
    await fileDownloadButton.click();
    const transferDownloadDialog = companion.getByRole("dialog", { name: "Transférer les fichiers", exact: true });
    assert.equal(await transferDownloadDialog.locator('select[name="mode"]').inputValue(), "move");
    assert.equal(await transferDownloadDialog.getByLabel("Dossier de destination", { exact: true }).inputValue(), exportsFolder);
    await transferDownloadDialog.getByRole("button", { name: "Annuler", exact: true }).click();
    assert.deepEqual(await readFile(downloaded.filename), expectedDownload);
    assert.deepEqual((await worker.evaluate(async () => (await chrome.storage.local.get("downloadFiling")).downloadFiling)).destinations, []);
    await downloadListButton.click();
    await fileDownloadButton.click();
    await transferDownloadDialog.getByLabel("Dossier de destination", { exact: true }).fill(exportsFolder);
    await companion.screenshot({ path: "test-results/download-filing.png", fullPage: true });
    await transferDownloadDialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await transferDownloadDialog.waitFor({ state: "hidden" });
    const filingPreferences = await worker.evaluate(async () => (await chrome.storage.local.get("downloadFiling")).downloadFiling);
    assert.deepEqual(filingPreferences.destinations, [exportsFolder]);
    assert.equal(filingPreferences.rules[0].name, "Documents de recette");
    await waitUntil(() => companion.evaluate(async (file) => {
      return new Promise((resolve) => {
        const port = chrome.runtime.connect({ name: "explorer" });
        const id = crypto.randomUUID();
        port.onMessage.addListener((message) => { if (message.id === id) { port.disconnect(); resolve(message.status === "SUCCESS" && message.data.some((job) => job.kind === "transfer" && job.state === "completed" && job.audit?.entries.some((entry) => entry.source === file && entry.status === "moved"))); } });
        port.postMessage({ id, action: "JOBS", payload: {} });
      });
    }, downloaded.filename), "Rangement natif non terminé");
    await assert.rejects(stat(downloaded.filename));
    assert.equal(await readFile(path.join(exportsFolder, downloadName), "utf8"), "Original à conserver");
    const movedDownloadName = (await readdir(exportsFolder)).find((name) => name !== downloadName && !name.endsWith(".source.json"));
    assert.deepEqual(await readFile(path.join(exportsFolder, movedDownloadName)), expectedDownload);
    await waitUntil(async () => (await worker.evaluate(async () => (await chrome.storage.local.get("downloadRuns")).downloadRuns))?.some(run => run.state === "completed"), "Suivi du rangement non terminé");
    const filedSource = JSON.parse(await readFile(path.join(exportsFolder, movedDownloadName + ".source.json"), "utf8"));
    assert.equal(filedSource.file, movedDownloadName);
    assert.equal(filedSource.format, "download");
    assert.equal(filedSource.sourceUrl, formURL + "download.txt");
    await companion.locator(".jobs header button").click();
    await downloadListButton.click();
    await downloadListDialog.getByRole("button", { name: "Actualiser les téléchargements", exact: true }).click();
    const sourceAvailable = await fileDownloadButton.isEnabled();
    if (sourceAvailable) {
      await fileDownloadButton.click();
      await transferDownloadDialog.getByLabel("Dossier de destination", { exact: true }).fill(exportsFolder);
      await transferDownloadDialog.getByRole("button", { name: "Confirmer", exact: true }).click();
      await transferDownloadDialog.getByRole("alert").waitFor();
      await transferDownloadDialog.getByRole("button", { name: "Annuler", exact: true }).click();
    } else await downloadListDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.equal((await readdir(exportsFolder)).length, 3);
    await companion.getByRole("tab", { name: "Fichiers", exact: true }).click();
    await companion.getByRole("button", { name: "Changer de dossier", exact: true }).click();
    const filedPicker = companion.getByRole("dialog", { name: "Choisir un dossier", exact: true });
    await filedPicker.getByRole("button", { name: "Ouvrir le dossier Exports", exact: true }).click();
    await filedPicker.getByRole("button", { name: "Choisir ce dossier", exact: true }).click();
    await companion.getByTitle(path.join(exportsFolder, movedDownloadName), { exact: true }).click();
    const filedPreview = companion.getByRole("dialog", { name: `Aperçu de ${movedDownloadName}`, exact: true });
    await filedPreview.getByRole("button", { name: "Voir la provenance", exact: true }).click();
    assert.equal(await filedPreview.getByRole("link", { name: "Ouvrir la page source", exact: true }).getAttribute("href"), filedSource.sourceUrl);
    await filedPreview.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
    await companion.getByRole("button", { name: "Dossier précédent", exact: true }).click();
    console.log("Téléchargement Chrome réel : règles persistantes, sélecteur de dossier, activation, suggestion, annulation, mémorisation, rangement natif, collision et second rangement refusé : OK");
  }
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    await companion
      .getByRole("tab", { name: "Fichiers", exact: true })
      .click();
    await companion
      .getByRole("button", {
        name: "Ajouter native.txt à la collecte",
        exact: true,
      })
      .click();
  }
  await companion.getByRole("tab", { name: "Collecte", exact: true }).click();
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    await companion.locator('[data-file-drag="true"]').filter({hasText: "native.txt"}).waitFor();
  }
  await webPage.evaluate(() => { document.getElementById("attachments").accept = "text/plain"; });
  await companion.locator(".companion-insert > summary").click();
  await companion
    .getByRole("button", { name: "Repérer les champs de la page", exact: true })
    .click();
  await companion
    .getByLabel("Champ de destination", { exact: true })
    .selectOption("1");
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    await companion
      .getByRole("button", { name: "Insérer 1 fichier(s)", exact: true })
      .click();
    await companion
      .getByText(
        "Fichiers insérés dans le champ choisi. Vérifiez le formulaire avant de le valider.",
        { exact: true },
      )
      .waitFor();
    assert.deepEqual(
      await webPage.evaluate(async () => ({
        proof: document.getElementById("proof").files.length,
        text: await document.getElementById("attachments").files[0].text(),
        type: document.getElementById("attachments").files[0].type,
      })),
      { proof: 0, text: "Lecture réelle via Native Messaging", type: "text/plain" },
    );
    await webPage.evaluate(() => {
      const input = document.getElementById("attachments");
      window.uploadEvents = 0;
      input.addEventListener("change", () => window.uploadEvents++);
      input.addEventListener("input", () => window.uploadEvents++);
      input.accept = "image/*";
    });
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    await companion.locator(".companion-insert").getByText(/native.txt : format non reconnu/).waitFor();
    assert.equal(await companion.getByRole("button", { name: "Insérer 1 fichier(s)", exact: true }).isDisabled(), true);
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await companion.locator(".companion-insert").evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await companion.locator(".companion-insert").getByText(/native.txt : format non reconnu/).scrollIntoViewIfNeeded();
    await companion.screenshot({ path: "test-results/upload-preflight-real.png", fullPage: true });
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 0);

    const insertionImage = path.join(fixture, "insertion.png");
    await writeFile(insertionImage, imageBytes);
    const insertionStash = await worker.evaluate(async ({ path, size }) => {
      const { stash = [] } = await chrome.storage.local.get("stash");
      await chrome.storage.local.set({ stash: [...stash, { path, name: "insertion.png", type: "file", size, mtime: 0, ext: ".png" }] });
      return stash;
    }, { path: insertionImage, size: imageBytes.length });
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /native.txt/ }).uncheck();
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /insertion.png/ }).waitFor();
    await companion.getByRole("button", { name: "Insérer 1 fichier(s)", exact: true }).click();
    await companion.getByText("Fichiers insérés dans le champ choisi. Vérifiez le formulaire avant de le valider.", { exact: true }).waitFor();
    assert.deepEqual(await webPage.evaluate(async () => {
      const file = document.getElementById("attachments").files[0];
      return { name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] };
    }), { name: "insertion.png", type: "image/png", bytes: [...imageBytes] });
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);

    const insertionLarge = path.join(fixture, "insertion-large.tiff");
    await writeFile(insertionLarge, Buffer.alloc(24 * 1024 * 1024));
    // Deliberately stale collection size: native preflight must refuse the actual size.
    await worker.evaluate(async ({ stash, path }) => {
      await chrome.storage.local.set({ stash: [...stash, { path, name: "insertion-large.tiff", type: "file", size: 0, mtime: 0, ext: ".tiff" }] });
    }, { stash: insertionStash, path: insertionLarge });
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /insertion-large.tiff/ }).waitFor();
    await companion.getByRole("button", { name: "Insérer 1 fichier(s)", exact: true }).click();
    await companion.getByRole("alert").getByText(/La sélection dépasse 20 Mo au total/).waitFor();
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await webPage.evaluate(() => document.getElementById("attachments").files[0].name), "insertion.png");
    assert.deepEqual(await readFile(insertionImage), imageBytes);
    assert.equal((await stat(insertionLarge)).size, 24 * 1024 * 1024);
    await worker.evaluate(async stash => { await chrome.storage.local.set({ stash }); }, insertionStash);
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /native.txt/ }).check();
    console.log("H05 réel : formats, MIME texte/image, octets intacts, TIFF 24 Mio périmé refusé, champ conservé sans événement sur refus et panneau 320/390/1024 px : OK");

    const receipts = await worker.evaluate(async () => (await chrome.storage.local.get("fileInsertions")).fileInsertions);
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every(record => record.state === "inserted" && record.origin === new URL(formURL).origin && record.field === "Pièces jointes"));
    assert.deepEqual(receipts[0].files, [{ name: "insertion.png", size: imageBytes.length }]);
    assert.equal(receipts[1].files[0].name, "native.txt");
    assert.ok(!JSON.stringify(receipts).includes(fixture));
    assert.ok(!JSON.stringify(receipts).includes(formURL));
    const receiptStash = await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash);
    const history = companion.locator(".insertion-history");
    assert.equal(await history.getAttribute("open"), null);
    await history.locator("summary").focus();
    await history.locator("summary").press("Enter");
    await history.getByText("Insérée dans le champ", { exact: true }).first().waitFor();
    assert.equal(await history.locator("article").count(), 2);
    const uncertainReceipt = { ...receipts[0], id: "uncertain-recipe", state: "uncertain", field: "Champ " + "x".repeat(154), files: [{ name: "document-" + "x".repeat(190) + ".pdf", size: 1 }] };
    await worker.evaluate(async records => chrome.storage.local.set({ fileInsertions: records }), [uncertainReceipt, ...receipts]);
    await history.getByText("Résultat à vérifier sur le site", { exact: true }).waitFor();
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await companion.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await history.evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await history.locator("summary").scrollIntoViewIfNeeded();
    await companion.screenshot({ path: "test-results/insertion-history.png", fullPage: true });
    await page.getByTitle("Examiner la collecte", { exact: true }).click();
    const historyDialog = page.getByRole("dialog", { name: "Examiner la collecte", exact: true });
    const fullHistory = historyDialog.locator(".insertion-history");
    await fullHistory.locator("summary").click();
    await fullHistory.getByText("Résultat à vérifier sur le site", { exact: true }).waitFor();
    await fullHistory.locator('[data-insertion-id="uncertain-recipe"]').getByRole("button").click();
    await history.getByText("Résultat à vérifier sur le site", { exact: true }).waitFor({ state: "hidden" });
    await history.locator(`[data-insertion-id="${receipts[1].id}"]`).getByRole("button").click();
    await fullHistory.locator(`[data-insertion-id="${receipts[1].id}"]`).waitFor({ state: "hidden" });
    await historyDialog.locator("header").getByRole("button", { name: "Fermer", exact: true }).click();
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), receiptStash);
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await webPage.evaluate(() => document.getElementById("attachments").files[0].name), "insertion.png");
    await companion.reload();
    await companion.getByRole("tab", { name: /Collecte/ }).click();
    await history.locator("summary").click();
    await history.locator(`[data-insertion-id="${receipts[0].id}"]`).waitFor();
    assert.equal(await history.locator("article").count(), 1);
    // An unreadable receipt must block before mutation and can be explicitly cleared.
    await worker.evaluate(async () => chrome.storage.local.set({ fileInsertions: [{ broken: true }] }));
    await history.getByRole("alert").getByText(/Suivi des insertions illisible/).waitFor();
    await companion.locator(".companion-insert > summary").click();
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    await webPage.evaluate(() => { document.getElementById("attachments").accept = ".txt"; });
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    await companion.getByRole("button", { name: "Insérer 1 fichier(s)", exact: true }).click();
    await companion.getByRole("alert").getByText(/Insertion non lancée : suivi local indisponible/).waitFor();
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await webPage.evaluate(() => document.getElementById("attachments").files[0].name), "insertion.png");
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("fileInsertions")).fileInsertions), [{ broken: true }]);
    await companion.evaluate(() => {
      void navigator.locks.request("nextexplorer:fileInsertions", async () => {
        window.historyLocked = true;
        await new Promise(resolve => { window.releaseHistory = resolve; });
      });
    });
    await companion.waitForFunction(() => window.historyLocked);
    await history.getByRole("button", { name: "Effacer le suivi des insertions", exact: true }).click();
    await history.getByText("Retrait du suivi…", { exact: true }).waitFor();
    assert.equal(await history.getByText("Aucune insertion enregistrée.", { exact: true }).count(), 0);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("fileInsertions")).fileInsertions), [{ broken: true }]);
    await companion.evaluate(() => window.releaseHistory());
    await history.getByText("Aucune insertion enregistrée.", { exact: true }).waitFor();
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("fileInsertions")).fileInsertions), []);
    assert.deepEqual(await readFile(insertionImage), imageBytes);
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    await webPage.evaluate(() => { document.getElementById("attachments").accept = "image/*"; });
    console.log("Suivi H05 réel : insertions texte/image, données minimales, synchronisation/retrait dans les deux vues, rechargement, rendu d’une tentative incertaine sans rejeu, stockage illisible bloquant avant mutation puis effacement explicite, fichiers/formulaire/collecte intacts et 320/390/1024 px : OK");

    const contextualFolder = path.join(fixture, "Prepared-field");
    const otherImage = path.join(fixture, "autre-image.png");
    await mkdir(contextualFolder);
    await writeFile(otherImage, imageBytes);
    const contextualStash = [...insertionStash,
      { path: insertionImage, name: "insertion.png", type: "file", size: imageBytes.length, mtime: 0, ext: ".png" },
      { path: otherImage, name: "autre-image.png", type: "file", size: imageBytes.length, mtime: 0, ext: ".png" },
    ];
    await worker.evaluate(async stash => { await chrome.storage.local.set({ stash }); }, contextualStash);
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /native.txt/ }).uncheck();
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /autre-image.png/ }).uncheck();
    await webPage.evaluate(() => {
      const input = document.getElementById("attachments");
      input.accept = "image/webp";
      input.multiple = false;
    });
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    const contextualButton = companion.getByRole("button", { name: "Préparer les images pour ce champ…", exact: true });
    await contextualButton.click();
    const contextualDialog = companion.getByRole("dialog", { name: "Préparer des images pour le web", exact: true });
    assert.equal(await contextualDialog.getByRole("radio").count(), 1); // The unchecked image is not passed to preparation.
    assert.equal(await contextualDialog.getByRole("radio").isChecked(), true);
    assert.equal(await contextualDialog.getByLabel("Format des copies", { exact: true }).inputValue(), "webp");
    assert.deepEqual(await contextualDialog.getByLabel("Format des copies", { exact: true }).locator("option").allTextContents(), ["WebP"]);
    await contextualDialog.getByText(/Champ choisi : Pièces jointes/).waitFor();
    await contextualDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.equal((await readdir(contextualFolder)).length, 0);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("imagePreparations")).imagePreparations || []), []);
    await companion.locator(".companion-send-files").getByRole("checkbox", { name: /autre-image.png/ }).check();
    await contextualButton.click();
    assert.equal(await contextualDialog.getByRole("radio").count(), 2);
    assert.equal(await contextualDialog.getByRole("radio").first().isChecked(), true);
    await contextualDialog.getByRole("radio").last().check();
    assert.equal(await contextualDialog.getByRole("radio").first().isChecked(), false);
    await contextualDialog.getByLabel("Largeur maximale en pixels", { exact: true }).fill("64");
    await contextualDialog.getByLabel("Dossier de destination", { exact: true }).fill(contextualFolder);
    await contextualDialog.getByRole("button", { name: "Créer et vérifier les copies", exact: true }).click();
    try {
      await contextualDialog.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    } catch (error) {
      console.error(await contextualDialog.innerText());
      await companion.screenshot({ path: "test-results/prepare-for-field-failure.png", fullPage: true });
      throw error;
    }
    const contextualName = (await readdir(contextualFolder))[0];
    assert.match(contextualName, /\.webp$/);
    assert.match(contextualName, /autre-image/);
    const contextualPath = path.join(contextualFolder, contextualName);
    const contextualBytes = await readFile(contextualPath);
    assert.equal(contextualBytes.subarray(8, 12).toString(), "WEBP");
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await webPage.evaluate(() => document.getElementById("attachments").files[0].name), "insertion.png");
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), contextualStash);
    const insertCopies = contextualDialog.getByRole("button", { name: "Insérer les copies dans ce champ", exact: true });
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await contextualDialog.evaluate(node => node.scrollWidth <= node.clientWidth));
      assert.ok(await contextualDialog.getByRole("article", { name: "Insertion des copies préparées", exact: true }).evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await insertCopies.scrollIntoViewIfNeeded();
    await companion.screenshot({ path: "test-results/prepare-for-field.png", fullPage: true });
    await webPage.evaluate(() => { document.getElementById("attachments").accept = "image/png"; });
    await insertCopies.click();
    await contextualDialog.getByRole("alert").getByText(/Le formulaire a changé/).waitFor();
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await webPage.evaluate(() => document.getElementById("attachments").files[0].name), "insertion.png");
    assert.equal((await readdir(contextualFolder)).length, 1);
    await contextualDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await webPage.evaluate(() => { document.getElementById("attachments").accept = "image/webp"; });
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    await contextualButton.click();
    await contextualDialog.locator("summary").filter({ hasText: "Préparations récentes" }).click();
    await contextualDialog.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await contextualDialog.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    await writeFile(contextualPath, Buffer.concat([contextualBytes, Buffer.alloc(2 * 1024 * 1024)]));
    await insertCopies.click();
    await contextualDialog.getByRole("alert").getByText(/copies ne sont pas toutes prêtes ou compatibles/).waitFor();
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 2);
    assert.equal(await insertCopies.count(), 0);
    await writeFile(contextualPath, contextualBytes);
    await contextualDialog.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await contextualDialog.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    await insertCopies.click();
    await contextualDialog.getByText("Copies insérées dans le champ choisi. Vérifiez leur réception avant de valider le formulaire.", { exact: true }).waitFor();
    assert.deepEqual(await webPage.evaluate(async () => {
      const file = document.getElementById("attachments").files[0];
      return { proof: document.getElementById("proof").files.length, count: document.getElementById("attachments").files.length, name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] };
    }), { proof: 0, count: 1, name: contextualName, type: "image/webp", bytes: [...contextualBytes] });
    assert.equal(await webPage.evaluate(() => window.uploadEvents), 4);
    const preparedReceipt = (await worker.evaluate(async () => (await chrome.storage.local.get("fileInsertions")).fileInsertions))[0];
    assert.equal(preparedReceipt.state, "inserted");
    assert.equal(preparedReceipt.origin, new URL(formURL).origin);
    assert.deepEqual(preparedReceipt.files, [{ name: contextualName, size: contextualBytes.length }]);
    assert.deepEqual(await readFile(insertionImage), imageBytes);
    assert.deepEqual(await readFile(otherImage), imageBytes);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), contextualStash);
    assert.equal((await readdir(contextualFolder)).length, 1);
    await contextualDialog.getByRole("button", { name: "Retirer du suivi", exact: true }).click();
    await contextualDialog.locator("summary").filter({ hasText: "Préparations récentes" }).waitFor({ state: "hidden" });
    await contextualDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await webPage.evaluate(() => { document.getElementById("attachments").accept = "application/pdf"; });
    await companion.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
    await companion.getByLabel("Champ de destination", { exact: true }).selectOption("1");
    assert.equal(await contextualButton.isDisabled(), true);
    await companion.getByText("Aucun format de copie JPEG, PNG ou WebP accepté par ce champ.", { exact: true }).waitFor();
    await worker.evaluate(async stash => { await chrome.storage.local.set({ stash }); }, insertionStash);
    console.log("H12 réel : sélection conservée, champ unique, formats WebP déclarés, annulation sans conversion, copies sans transmission, champ changé/copie trop lourde refusés, insertion explicite aux octets/MIME exacts, originaux/collecte intacts et dialogue 320/390/1024 px : OK");
  }
  await webPage.goto(formURL + "next");
  await companion
    .getByLabel("Champ de destination", { exact: true })
    .waitFor({ state: "hidden" });
  await companion.screenshot({
    path: "test-results/companion-real.png",
    fullPage: true,
  });
  const openedPromise = context.waitForEvent("page");
  await companion.getByTitle("Ouvrir en pleine page", { exact: true }).click();
  const opened = await openedPromise;
  await opened.waitForURL(`chrome-extension://${id}/index.html*`);
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1")
    assert.equal(new URL(opened.url()).searchParams.get("path"), fixture);
  console.log(
    "Compagnon Chrome réel : page courante, collecte, extrait, choix du champ et invalidation après navigation : OK",
  );
  if (process.env.NEXTEXPLORER_REQUIRE_NATIVE === "1") {
    const preparationSource = path.join(fixture, "préparation-original.png");
    const preparationFolder = path.join(fixture, "Prepared-web");
    await writeFile(preparationSource, imageBytes);
    await mkdir(preparationFolder);
    await worker.evaluate(async ({ path, size }) => {
      const { stash = [] } = await chrome.storage.local.get("stash");
      await chrome.storage.local.set({ stash: [...stash, { path, name: "préparation-original.png", type: "file", size, mtime: 0, ext: ".png" }] });
    }, { path: preparationSource, size: imageBytes.length });
    await webPage.bringToFront();
    await companion.getByRole("tab", { name: "Page", exact: true }).click();
    await companion.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    const prepareButton = companion.getByRole("button", { name: "Préparer des images pour le web…", exact: true });
    await prepareButton.click();
    const preparation = companion.getByRole("dialog", { name: "Préparer des images pour le web", exact: true });
    await preparation.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.equal((await readdir(preparationFolder)).length, 0);
    await prepareButton.click();
    await preparation.getByLabel("Format des copies", { exact: true }).selectOption("jpg");
    await preparation.getByLabel("Largeur maximale en pixels", { exact: true }).fill("64");
    await preparation.getByLabel("Dossier de destination", { exact: true }).fill(preparationFolder);
    await preparation.getByRole("button", { name: "Créer et vérifier les copies", exact: true }).click();
    await preparation.getByRole("button", { name: "Fermer", exact: true }).click();
    await waitUntil(async () => (await worker.evaluate(async () => (await chrome.storage.local.get("imagePreparations")).imagePreparations?.[0]?.jobId)), "Conversion non enregistrée après fermeture");
    const preparationBeforeRecovery = await worker.evaluate(async () => (await chrome.storage.local.get("imagePreparations")).imagePreparations);
    assert.equal(preparationBeforeRecovery.length, 1);
    await prepareButton.click();
    await preparation.locator("summary").filter({ hasText: "Préparations récentes" }).click();
    await waitUntil(async () => {
      if (await preparation.getByText("Respecte les contraintes saisies", { exact: true }).count()) return true;
      const verify = preparation.getByRole("button", { name: "Vérifier les copies", exact: true });
      if (await verify.isEnabled()) await verify.click();
      return false;
    }, "Copies non récupérées après fermeture");
    await preparation.getByText("Copies revérifiées. Seules celles qui respectent les contraintes enregistrées peuvent être collectées.", { exact: true }).waitFor();
    await preparation.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    assert.deepEqual(await readFile(preparationSource), imageBytes);
    const preparedName = (await readdir(preparationFolder))[0];
    assert.match(preparedName, /\.jpg$/);
    assert.equal((await readFile(path.join(preparationFolder, preparedName))).subarray(0, 2).toString("hex"), "ffd8");
    await preparation.getByRole("button", { name: "Ajouter cette copie à la collecte", exact: true }).click();
    await preparation.getByText("Copie ajoutée à la collecte, prête à être glissée vers le site.", { exact: true }).waitFor();
    const preparedStash = (await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash));
    assert.ok(preparedStash.some(entry => entry.path === path.join(preparationFolder, preparedName)));
    const recoveredReceipt = await worker.evaluate(async () => (await chrome.storage.local.get("imagePreparations")).imagePreparations[0]);
    assert.equal(recoveredReceipt.id, preparationBeforeRecovery[0].id);
    assert.equal(recoveredReceipt.jobId, preparationBeforeRecovery[0].jobId);
    assert.deepEqual(recoveredReceipt.paths, [path.join(preparationFolder, preparedName)]);
    const preparedPath = path.join(preparationFolder, preparedName);
    const preparedBytes = await readFile(preparedPath);
    assert.equal((await readdir(preparationFolder)).length, 1);
    await preparation.getByRole("button", { name: "Fermer", exact: true }).click();
    await companion.reload();
    await webPage.bringToFront();
    await companion.getByRole("tab", { name: "Page", exact: true }).click();
    await companion.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    await prepareButton.click();
    await preparation.locator("summary").filter({ hasText: "Préparations récentes" }).click();
    await preparation.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await preparation.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await preparation.evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await preparation.locator("summary").filter({ hasText: "Préparations récentes" }).scrollIntoViewIfNeeded();
    await companion.screenshot({ path: "test-results/preparation-recovery.png", fullPage: true });
    await writeFile(preparedPath, Buffer.concat([preparedBytes, Buffer.alloc(2 * 1024 * 1024)]));
    await preparation.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await preparation.getByText(/Poids supérieur à la limite/).waitFor();
    assert.equal(await preparation.getByRole("button", { name: "Ajouter cette copie à la collecte", exact: true }).isDisabled(), true);
    await writeFile(preparedPath, preparedBytes);
    const movedCopy = path.join(fixture, "copie-temporairement-deplacee.jpg");
    await rename(preparedPath, movedCopy);
    await preparation.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await preparation.getByRole("alert").getByText(/copie inaccessible, modifiée ou non vérifiable/).waitFor();
    assert.equal(await preparation.getByRole("button", { name: "Ajouter cette copie à la collecte", exact: true }).count(), 0);
    await rename(movedCopy, preparedPath);
    await preparation.getByRole("button", { name: "Vérifier les copies", exact: true }).click();
    await preparation.getByText("Respecte les contraintes saisies", { exact: true }).waitFor();
    await preparation.getByRole("button", { name: "Retirer du suivi", exact: true }).click();
    await preparation.locator("summary").filter({ hasText: "Préparations récentes" }).waitFor({ state: "hidden" });
    assert.equal(await preparation.getByRole("button", { name: "Ajouter cette copie à la collecte", exact: true }).count(), 0);
    assert.deepEqual(await readFile(preparedPath), preparedBytes);
    assert.deepEqual(await readFile(preparationSource), imageBytes);
    assert.equal((await readdir(preparationFolder)).length, 1);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("imagePreparations")).imagePreparations), []);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), preparedStash);
    await companion.screenshot({ path: "test-results/prepare-images.png", fullPage: true });
    await preparation.getByRole("button", { name: "Fermer", exact: true }).click();
    console.log("Préparation web réelle : annulation sans écriture, copies JPEG 64 px, format/dimensions/poids vérifiés, original intact et collecte explicite : OK");
    console.log("Reprise réelle : fermeture avant résultat, même tâche et unique copie, rechargement, chemins persistants, copie trop lourde/absente bloquée, retrait sans supprimer et 320/390/1024 px : OK");
    const missingPath = path.join(fixture, "reference-manquante.txt");
    await worker.evaluate(async path => {
      const { stash = [] } = await chrome.storage.local.get("stash");
      await chrome.storage.local.set({ stash: [...stash, { path, name: "reference-manquante.txt", type: "file", size: 0, mtime: 0, ext: ".txt" }] });
    }, missingPath);

    const stashBeforeCheck = await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash);
    const checkTiffPath = path.join(fixture, "collecte-" + "x".repeat(100) + ".tiff");
    const checkTiffBytes = Buffer.alloc(24 * 1024 * 1024);
    checkTiffBytes.set([73, 73, 42, 0]);
    await writeFile(checkTiffPath, checkTiffBytes);
    const checkTiffStat = await stat(checkTiffPath);
    const changedPath = path.join(fixture, "collecte-modifiee.txt");
    await writeFile(changedPath, "Avant");
    const changedStat = await stat(changedPath);
    const checkFolder = path.join(fixture, "Dossier-de-collecte");
    await mkdir(checkFolder);
    const checkedStash = [...stashBeforeCheck,
      { path: checkTiffPath, name: path.basename(checkTiffPath), type: "file", size: checkTiffStat.size, mtime: Math.floor(checkTiffStat.mtimeMs / 1000), ext: ".tiff" },
      { path: changedPath, name: path.basename(changedPath), type: "file", size: changedStat.size, mtime: Math.floor(changedStat.mtimeMs / 1000), ext: ".txt" },
      { path: checkFolder, name: path.basename(checkFolder), type: "directory", size: 0, mtime: 0, ext: "" },
    ];
    await worker.evaluate(async stash => chrome.storage.local.set({ stash }), checkedStash);
    await writeFile(changedPath, "Après : fichier modifié pendant la collecte");
    await companion.getByRole("tab", { name: "Collecte", exact: true }).click();
    await companion.getByTitle("Examiner la collecte", { exact: true }).click();
    const checkedCollection = companion.getByRole("dialog", { name: "Examiner la collecte", exact: true });
    const checkRegion = checkedCollection.getByRole("region", { name: "Vérification des références locales", exact: true });
    await checkedCollection.getByRole("button", { name: `Retirer ${path.basename(checkTiffPath)} de la collecte`, exact: true }).waitFor();
    await checkRegion.getByRole("button", { name: "Vérifier les fichiers", exact: true }).click();
    await checkRegion.getByRole("status").getByText(/Contrôle terminé/).waitFor();
    const checkWarnings = checkRegion.getByRole("list", { name: "Références à vérifier", exact: true });
    await checkWarnings.getByText(missingPath, { exact: true }).waitFor();
    await checkWarnings.getByText(changedPath, { exact: true }).waitFor();
    assert.equal(await checkWarnings.getByText(checkTiffPath, { exact: true }).count(), 0);
    assert.equal(await checkWarnings.getByText(checkFolder, { exact: true }).count(), 0);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), checkedStash);
    assert.deepEqual(await readFile(checkTiffPath), checkTiffBytes);
    assert.equal(await readFile(changedPath, "utf8"), "Après : fichier modifié pendant la collecte");
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await checkedCollection.locator(".modal-content").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await companion.screenshot({ path: "test-results/collection-check.png", fullPage: true });
    await page.getByTitle("Examiner la collecte", { exact: true }).click();
    const fullCollection = page.getByRole("dialog", { name: "Examiner la collecte", exact: true });
    const fullCheck = fullCollection.getByRole("region", { name: "Vérification des références locales", exact: true });
    await fullCheck.getByRole("button", { name: "Vérifier les fichiers", exact: true }).click();
    await fullCheck.getByRole("status").getByText(/Contrôle terminé/).waitFor();
    await fullCheck.getByRole("list").getByText(missingPath, { exact: true }).waitFor();
    await worker.evaluate(async stash => chrome.storage.local.set({ stash }), stashBeforeCheck);
    await fullCheck.getByRole("status").waitFor({ state: "hidden" });
    await checkRegion.getByRole("status").waitFor({ state: "hidden" });
    await fullCollection.locator("footer").getByRole("button", { name: "Fermer", exact: true }).click();
    await checkedCollection.locator("footer").getByRole("button", { name: "Fermer", exact: true }).click();
    console.log("Collecte réelle : contrôle des métadonnées, référence absente et fichier modifié signalés, TIFF 24 Mio et dossier présents, références/fichiers intacts, deux vues, résultats périmés effacés et 320/390/1024 px : OK");

    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    const spacesDialog = page.getByRole("dialog", { name: "Espaces hybrides", exact: true });
    await spacesDialog.getByLabel("Nom de l’espace", { exact: true }).fill("Recette hybride");
    await spacesDialog.getByRole("button", { name: "Enregistrer cet espace", exact: true }).click();
    await spacesDialog.getByText("Espace « Recette hybride » enregistré.", { exact: true }).waitFor();
    const spaces = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].browser.tabs.length, 0);
    assert.ok(spaces[0].entries.some(entry => entry.path === missingPath));
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.reload();
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    await spacesDialog.getByRole("button", { name: "Examiner l’espace Recette hybride", exact: true }).click();
    const spaceReview = spacesDialog.getByRole("form", { name: "Reprendre un espace", exact: true });
    await spaceReview.getByText(missingPath, { exact: true }).waitFor();
    const pagesBefore = context.pages().length;
    const tabsBefore = await page.locator(".tab-select").count();
    await spaceReview.getByRole("button", { name: "Reprendre cet espace", exact: true }).click();
    await spacesDialog.getByText(/Espace « Recette hybride » rouvert/).waitFor();
    assert.equal(context.pages().length, pagesBefore);
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await waitUntil(async () => (await page.locator(".tab-select").count()) === tabsBefore + spaces[0].tabs.length, "Onglets de l’espace non restaurés");
    assert.equal(await readFile(path.join(fixture, "native.txt"), "utf8"), "Lecture réelle via Native Messaging");
    await worker.evaluate(async url => {
      const [tab] = await chrome.tabs.query({ url });
      const id = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(id, { title: "Projet web de recette", color: "blue" });
    }, formURL + "next");
    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    await spacesDialog.getByLabel("Nom de l’espace", { exact: true }).fill("Pages de recette");
    await spacesDialog.getByRole("checkbox", { name: "Inclure les onglets web et leurs groupes dans cette fenêtre", exact: true }).check();
    await spacesDialog.getByRole("button", { name: "Enregistrer cet espace", exact: true }).click();
    await spacesDialog.getByText("Espace « Pages de recette » enregistré.", { exact: true }).waitFor();
    const webSpace = (await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces)).find(space => space.name === "Pages de recette");
    assert.ok(webSpace.browser.tabs.some(tab => tab.url === formURL + "next"));
    assert.ok(webSpace.browser.groups.some(group => group.title === "Projet web de recette"));
    const webCount = (await worker.evaluate(async url => chrome.tabs.query({ url }), formURL + "next")).length;
    await spacesDialog.getByRole("button", { name: "Examiner l’espace Pages de recette", exact: true }).click();
    const restoreWeb = spaceReview.getByRole("checkbox", { name: /Rouvrir aussi les/ });
    await restoreWeb.waitFor();
    assert.equal(await restoreWeb.isChecked(), false);
    await restoreWeb.check();
    await spaceReview.getByRole("button", { name: "Reprendre cet espace", exact: true }).click();
    await spacesDialog.getByText(/Espace « Pages de recette » rouvert/).waitFor();
    assert.equal((await worker.evaluate(async url => chrome.tabs.query({ url }), formURL + "next")).length, webCount + 1);
    assert.equal((await worker.evaluate(async () => chrome.tabGroups.query({ title: "Projet web de recette" }))).length, 2);
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await companion.getByTitle("Options du panneau", { exact: true }).click();
    await companion.getByRole("button", { name: "Espaces hybrides…", exact: true }).click();
    const companionSpaces = companion.getByRole("dialog", { name: "Espaces hybrides", exact: true });
    await companionSpaces.getByText("Recette hybride", { exact: true }).waitFor();
    const taskCard = companionSpaces.locator(".spaces-dialog > article").filter({ has: companion.getByText("Pages de recette", { exact: true }) });
    const taskList = taskCard.locator(".space-tasks");
    const taskSummary = taskList.locator("summary");
    assert.equal(await taskList.getAttribute("open"), null);
    const taskStash = await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash);
    const taskPages = (await worker.evaluate(async () => chrome.tabs.query({}))).length;
    const taskFiles = await readdir(fixture);
    assert.equal(await companion.locator(".space-follow").count(), 0);
    assert.equal(await page.locator(".space-follow-name strong").textContent(), "Pages de recette");
    const followSpaces = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    const followLocalTabs = await companion.locator(".tab-select").count();
    await taskCard.getByRole("button", { name: "Suivre l’espace Pages de recette", exact: true }).click();
    await companionSpaces.getByText("Suivi de « Pages de recette » choisi dans cette vue.", { exact: true }).waitFor();
    assert.equal(await companion.locator(".space-follow-name strong").textContent(), "Pages de recette");
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), followSpaces);
    assert.equal(await companion.locator(".tab-select").count(), followLocalTabs);
    assert.deepEqual(await worker.evaluate(async () => chrome.storage.local.get(["followedSpace:panel", "followedSpace:page"])), { "followedSpace:panel": webSpace.id, "followedSpace:page": webSpace.id });
    await taskSummary.focus();
    await taskSummary.press("Enter");
    await taskList.getByLabel("Nouvelle tâche pour Pages de recette", { exact: true }).fill("Préparer le CV");
    await taskList.getByRole("button", { name: "Ajouter la tâche", exact: true }).click();
    await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).waitFor();
    await taskList.getByLabel("Nouvelle tâche pour Pages de recette", { exact: true }).fill("Vérifier les pièces");
    await taskList.getByRole("button", { name: "Ajouter la tâche", exact: true }).click();
    await taskList.getByRole("checkbox", { name: "Vérifier les pièces", exact: true }).waitFor();
    await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).click();
    await waitUntil(async () => (await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces)).find(space => space.name === "Pages de recette").tasks[0]?.done, "Tâche cochée non enregistrée");
    await waitUntil(async () => (await companion.locator(".space-follow-count").textContent()) === "1/2 tâches" && (await page.locator(".space-follow-count").textContent()) === "1/2 tâches", "Avancement suivi non synchronisé");
    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    const fullTaskCard = spacesDialog.locator(".spaces-dialog > article").filter({ has: page.getByText("Pages de recette", { exact: true }) });
    const fullTasks = fullTaskCard.locator(".space-tasks");
    await fullTasks.locator("summary").click();
    assert.equal(await fullTasks.getByRole("checkbox", { name: "Préparer le CV", exact: true }).isChecked(), true);
    await fullTasks.getByRole("checkbox", { name: "Vérifier les pièces", exact: true }).click();
    await waitUntil(async () => await taskList.getByRole("checkbox", { name: "Vérifier les pièces", exact: true }).isChecked(), "Tâche non synchronisée depuis la vue complète");
    await fullTasks.getByRole("button", { name: "Retirer la tâche Vérifier les pièces", exact: true }).click();
    await taskList.getByRole("checkbox", { name: "Vérifier les pièces", exact: true }).waitFor({ state: "hidden" });
    await taskList.getByLabel("Nouvelle tâche pour Pages de recette", { exact: true }).fill(" préparer le cv ");
    await taskList.getByRole("button", { name: "Ajouter la tâche", exact: true }).click();
    await companionSpaces.getByRole("alert").getByText(/tâche existe déjà/).waitFor();
    const longTask = "Vérifier " + "x".repeat(140);
    await taskList.getByLabel("Nouvelle tâche pour Pages de recette", { exact: true }).fill(longTask);
    await taskList.getByRole("button", { name: "Ajouter la tâche", exact: true }).click();
    await taskList.getByRole("checkbox", { name: longTask, exact: true }).waitFor();
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await companion.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await companionSpaces.locator(".modal-content").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      assert.ok(await taskList.evaluate(element => element.scrollWidth <= element.clientWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await taskSummary.scrollIntoViewIfNeeded();
    await companion.screenshot({ path: "test-results/space-tasks.png", fullPage: true });
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), taskStash);
    assert.equal((await worker.evaluate(async () => chrome.tabs.query({}))).length, taskPages);
    assert.deepEqual(await readdir(fixture), taskFiles);
    await fullTasks.getByRole("checkbox", { name: "Préparer le CV", exact: true }).click();
    await waitUntil(async () => !(await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).isChecked()), "Tâche décochée non synchronisée");
    await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).click();
    await waitUntil(async () => await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).isChecked(), "Tâche recochée non enregistrée");
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await companionSpaces.getByRole("button", { name: "Fermer", exact: true }).click();
    await companion.reload();
    const followedTasks = companion.getByRole("button", { name: "Ouvrir les tâches de Pages de recette", exact: true });
    await followedTasks.waitFor();
    const beforeLongName = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    const longSpaceName = "Projet " + "x".repeat(73);
    await worker.evaluate(async ({ spaces, id, name }) => chrome.storage.local.set({ hybridSpaces: spaces.map(space => space.id === id ? { ...space, name } : space) }), { spaces: beforeLongName, id: webSpace.id, name: longSpaceName });
    await waitUntil(async () => (await companion.locator(".space-follow-name strong").textContent()) === longSpaceName, "Nom suivi non synchronisé");
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await companion.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await companion.locator(".space-follow").evaluate(element => element.scrollWidth <= element.clientWidth));
      assert.ok((await companion.locator(".space-follow").boundingBox()).height >= 44);
    }
    await worker.evaluate(async spaces => chrome.storage.local.set({ hybridSpaces: spaces }), beforeLongName);
    await followedTasks.waitFor();
    await companion.setViewportSize({ width: 390, height: 844 });
    await companion.screenshot({ path: "test-results/space-follow.png", fullPage: true });
    await followedTasks.focus();
    await followedTasks.press("Enter");
    await waitUntil(async () => (await taskList.getAttribute("open")) !== null, "Tâches suivies non ouvertes");
    assert.equal(await taskSummary.evaluate(element => element === document.activeElement), true);
    assert.equal(await taskList.getByRole("checkbox", { name: "Préparer le CV", exact: true }).isChecked(), true);
    assert.equal(await taskList.getByRole("checkbox", { name: longTask, exact: true }).isChecked(), false);
    await companion.screenshot({ path: "test-results/hybrid-spaces.png", fullPage: true });
    await companionSpaces.getByRole("button", { name: "Supprimer l’espace Recette hybride", exact: true }).click();
    await companionSpaces.getByText("Espace retiré ; fichiers conservés.", { exact: true }).waitFor();
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces)).length, 1);
    const beforeImport = await worker.evaluate(async () => ({
      spaces: (await chrome.storage.local.get("hybridSpaces")).hybridSpaces,
      stash: (await chrome.storage.local.get("stash")).stash,
      tabs: (await chrome.tabs.query({})).length,
    }));
    const localTabsBeforeImport = await companion.locator(".tab-select").count();
    const downloadEvent = companion.waitForEvent("download");
    await companionSpaces.getByRole("button", { name: "Exporter l’espace Pages de recette", exact: true }).click();
    const spaceDownload = await downloadEvent;
    assert.equal(spaceDownload.suggestedFilename(), "NextExplorer-Pages de recette.space.json");
    // Chrome's downloads API keeps the real filename in this extension profile.
    let spaceExportPath;
    await waitUntil(async () => {
      const download = await worker.evaluate(async () => (await chrome.downloads.search({ filenameRegex: "\\.space\\.json$", orderBy: ["-startTime"], limit: 1 }))[0]);
      if (download?.state !== "complete") return false;
      spaceExportPath = download.filename;
      return true;
    }, "Export d’espace non terminé");
    assert.equal(path.dirname(spaceExportPath), downloadsFolder);
    const spaceExport = await readFile(spaceExportPath, "utf8");
    const exportedSpace = JSON.parse(spaceExport);
    assert.equal(exportedSpace.format, "nextexplorer-space");
    assert.deepEqual(exportedSpace.space, beforeImport.spaces[0]);
    const fileInput = companionSpaces.getByLabel("Fichier d’espace à importer", { exact: true });
    const upload = { name: "recette.space.json", mimeType: "application/json", buffer: Buffer.from(spaceExport) };
    await fileInput.setInputFiles(upload);
    const importReview = companionSpaces.getByRole("form", { name: "Importer un espace", exact: true });
    await importReview.waitFor();
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces)).length, 1);
    await importReview.getByRole("button", { name: "Enregistrer l’espace importé", exact: true }).click();
    await companionSpaces.getByRole("alert").getByText("Ce nom d’espace existe déjà.", { exact: true }).waitFor();
    await importReview.getByLabel("Nom de l’espace importé", { exact: true }).fill("Pages de recette importées");
    await importReview.getByRole("button", { name: "Enregistrer l’espace importé", exact: true }).click();
    await companionSpaces.getByText("Espace « Pages de recette importées » importé. Choisissez Rouvrir pour le reprendre.", { exact: true }).waitFor();
    const afterImport = await worker.evaluate(async () => ({
      spaces: (await chrome.storage.local.get("hybridSpaces")).hybridSpaces,
      stash: (await chrome.storage.local.get("stash")).stash,
      tabs: (await chrome.tabs.query({})).length,
    }));
    assert.equal(afterImport.spaces.length, 2);
    assert.deepEqual(afterImport.spaces[1], beforeImport.spaces[0]);
    assert.notEqual(afterImport.spaces[0].id, beforeImport.spaces[0].id);
    assert.deepEqual(afterImport.spaces[0].browser, beforeImport.spaces[0].browser);
    assert.deepEqual(afterImport.spaces[0].entries, beforeImport.spaces[0].entries);
    assert.deepEqual(afterImport.spaces[0].tasks, beforeImport.spaces[0].tasks);
    assert.deepEqual(afterImport.stash, beforeImport.stash);
    assert.equal(afterImport.tabs, beforeImport.tabs);
    assert.equal(await companion.locator(".tab-select").count(), localTabsBeforeImport);
    assert.equal((await worker.evaluate(async () => chrome.storage.local.get("followedSpace:panel")))["followedSpace:panel"], webSpace.id);
    assert.equal(await readFile(path.join(fixture, "native.txt"), "utf8"), "Lecture réelle via Native Messaging");
    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    await spacesDialog.getByText("Pages de recette importées", { exact: true }).waitFor();
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      await fileInput.setInputFiles(upload);
      await importReview.waitFor();
      assert.ok(await companionSpaces.locator(".modal-content").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      await importReview.getByRole("button", { name: "Annuler l’import", exact: true }).click();
      await importReview.waitFor({ state: "hidden" });
    }
    await fileInput.setInputFiles({ ...upload, buffer: Buffer.from("{broken") });
    await companionSpaces.getByRole("alert").getByText(/endommagé/).waitFor();
    await fileInput.setInputFiles({ ...upload, buffer: Buffer.from(JSON.stringify({ ...exportedSpace, version: 99 })) });
    await companionSpaces.getByRole("alert").getByText(/compatible/).waitFor();
    await fileInput.setInputFiles({ ...upload, buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
    await companionSpaces.getByRole("alert").getByText(/2 Mio/).waitFor();
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), afterImport.spaces);
    await companion.setViewportSize({ width: 390, height: 844 });
    await fileInput.setInputFiles(upload);
    await importReview.waitFor();
    await companion.screenshot({ path: "test-results/space-import.png", fullPage: true });
    await importReview.getByRole("button", { name: "Annuler l’import", exact: true }).click();

    // Current collection differs from the stored snapshot; updating must remain explicit.
    const currentStash = beforeImport.stash.filter(entry => entry.path !== missingPath);
    await companionSpaces.getByRole("button", { name: "Suivre l’espace Pages de recette importées", exact: true }).click();
    await companionSpaces.getByText("Suivi de « Pages de recette importées » choisi dans cette vue.", { exact: true }).waitFor();
    assert.equal(await page.locator(".space-follow-name strong").textContent(), "Pages de recette");
    assert.equal((await worker.evaluate(async () => chrome.storage.local.get("followedSpace:page")))["followedSpace:page"], webSpace.id);
    await worker.evaluate(async stash => chrome.storage.local.set({ stash }), currentStash);
    await waitUntil(async () => (await companion.locator("#companion-tab-collection .companion-count").textContent()) === String(currentStash.length), "Collecte actuelle non synchronisée");
    const updateReview = companionSpaces.getByRole("form", { name: "Actualiser un espace", exact: true });
    const updateButton = companionSpaces.getByRole("button", { name: "Actualiser l’espace Pages de recette importées", exact: true });
    const webUpdate = updateReview.getByRole("checkbox", { name: "Remplacer aussi les pages web par celles de cette fenêtre", exact: true });
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      await updateButton.click();
      await updateReview.waitFor();
      assert.equal(await webUpdate.isChecked(), false);
      assert.ok(await companionSpaces.locator(".modal-content").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      if (width === 390) await companion.screenshot({ path: "test-results/space-update.png", fullPage: true });
      assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), afterImport.spaces);
      await updateReview.getByRole("button", { name: "Annuler l’actualisation", exact: true }).click();
      await updateReview.waitFor({ state: "hidden" });
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await updateButton.click();
    await updateReview.getByLabel("Nom de l’espace actualisé", { exact: true }).fill("Pages de recette");
    await updateReview.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await companionSpaces.getByRole("alert").getByText("Ce nom d’espace existe déjà.", { exact: true }).waitFor();
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), afterImport.spaces);
    await updateReview.getByLabel("Nom de l’espace actualisé", { exact: true }).fill("Pages de recette actualisées");
    await updateReview.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await companionSpaces.getByText("Espace « Pages de recette actualisées » actualisé. Fichiers et pages ouvertes conservés.", { exact: true }).waitFor();
    const updatedSpaces = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    assert.equal(updatedSpaces.length, 2);
    assert.equal(updatedSpaces[0].id, afterImport.spaces[0].id);
    assert.equal(updatedSpaces[0].name, "Pages de recette actualisées");
    assert.notEqual(updatedSpaces[0].date, afterImport.spaces[0].date);
    assert.deepEqual(updatedSpaces[0].entries, currentStash);
    assert.deepEqual(updatedSpaces[0].browser, afterImport.spaces[0].browser);
    assert.deepEqual(updatedSpaces[0].tasks, afterImport.spaces[0].tasks);
    assert.deepEqual(updatedSpaces[1], beforeImport.spaces[0]);
    const currentWorkspace = await companion.evaluate(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:panel")));
    assert.deepEqual(updatedSpaces[0].tabs.map(tab => tab.paths), currentWorkspace.tabs.map(tab => tab.panes.map(pane => pane.path)));
    assert.equal((await worker.evaluate(async () => chrome.tabs.query({}))).length, beforeImport.tabs);
    assert.equal(await companion.locator(".tab-select").count(), localTabsBeforeImport);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("stash")).stash), currentStash);
    assert.equal(await readFile(path.join(fixture, "native.txt"), "utf8"), "Lecture réelle via Native Messaging");

    const additionalWebPage = await context.newPage();
    await additionalWebPage.goto(formURL + "actualisation-web");
    const webTabsBeforeUpdate = (await worker.evaluate(async () => chrome.tabs.query({}))).length;
    await companionSpaces.getByRole("button", { name: "Actualiser l’espace Pages de recette actualisées", exact: true }).click();
    await webUpdate.check();
    await waitUntil(async () => await webUpdate.isEnabled(), "Pages web non préparées");
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), updatedSpaces);
    await webUpdate.uncheck();
    await waitUntil(async () => await webUpdate.isEnabled(), "Pages web initiales non rétablies");
    await updateReview.getByText(new RegExp(`Pages web : ${updatedSpaces[0].browser.tabs.length} → ${updatedSpaces[0].browser.tabs.length}\\.`)).waitFor();
    await webUpdate.check();
    await waitUntil(async () => await webUpdate.isEnabled(), "Pages web non préparées");
    await updateReview.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await companionSpaces.getByText("Espace « Pages de recette actualisées » actualisé. Fichiers et pages ouvertes conservés.", { exact: true }).waitFor();
    const webUpdatedSpaces = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    assert.ok(webUpdatedSpaces[0].browser.tabs.some(tab => tab.url === formURL + "actualisation-web"));
    assert.ok(webUpdatedSpaces[0].browser.groups.some(group => group.title === "Projet web de recette"));
    assert.equal((await worker.evaluate(async () => chrome.tabs.query({}))).length, webTabsBeforeUpdate);
    assert.deepEqual(webUpdatedSpaces[1], beforeImport.spaces[0]);
    await additionalWebPage.close();

    await page.getByTitle("Enregistrer ou reprendre un espace", { exact: true }).click();
    await spacesDialog.getByText("Pages de recette actualisées", { exact: true }).waitFor();
    await companionSpaces.getByRole("button", { name: "Actualiser l’espace Pages de recette actualisées", exact: true }).click();
    await spacesDialog.getByRole("button", { name: "Actualiser l’espace Pages de recette actualisées", exact: true }).click();
    const otherUpdate = spacesDialog.getByRole("form", { name: "Actualiser un espace", exact: true });
    await otherUpdate.getByLabel("Nom de l’espace actualisé", { exact: true }).fill("Pages modifiées ailleurs");
    await otherUpdate.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await spacesDialog.getByText("Espace « Pages modifiées ailleurs » actualisé. Fichiers et pages ouvertes conservés.", { exact: true }).waitFor();
    await waitUntil(async () => (await companion.locator(".space-follow-name strong").textContent()) === "Pages modifiées ailleurs", "Renommage de l’espace suivi non reflété");
    const concurrentSpaces = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    await updateReview.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await companionSpaces.getByRole("alert").getByText(/a changé dans une autre vue/).waitFor();
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), concurrentSpaces);
    await updateReview.getByRole("button", { name: "Annuler l’actualisation", exact: true }).click();
    await companionSpaces.getByRole("button", { name: "Actualiser l’espace Pages modifiées ailleurs", exact: true }).click();
    await spacesDialog.getByRole("button", { name: "Supprimer l’espace Pages modifiées ailleurs", exact: true }).click();
    await spacesDialog.getByText("Espace retiré ; fichiers conservés.", { exact: true }).waitFor();
    await companion.locator(".space-follow").waitFor({ state: "hidden" });
    assert.equal((await worker.evaluate(async () => chrome.storage.local.get("followedSpace:panel")))["followedSpace:panel"], null);
    assert.equal(await page.locator(".space-follow-name strong").textContent(), "Pages de recette");
    await updateReview.getByRole("button", { name: "Confirmer l’actualisation", exact: true }).click();
    await companionSpaces.getByRole("alert").getByText(/a été supprimé/).waitFor();
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces)).length, 1);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), beforeImport.spaces);
    await updateReview.getByRole("button", { name: "Annuler l’actualisation", exact: true }).click();
    const beforeStop = await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces);
    await spacesDialog.getByRole("button", { name: "Arrêter le suivi dans cette vue", exact: true }).click();
    await spacesDialog.getByText("Suivi arrêté dans cette vue ; espace et fichiers conservés.", { exact: true }).waitFor();
    assert.equal(await page.locator(".space-follow").count(), 0);
    assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("hybridSpaces")).hybridSpaces), beforeStop);
    assert.equal((await worker.evaluate(async () => chrome.storage.local.get("followedSpace:page")))["followedSpace:page"], null);
    await page.reload();
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
    assert.equal(await page.locator(".space-follow").count(), 0);
    await page.keyboard.press("Control+k");
    await page.locator(".palette-search input").fill("Enregistrer ou reprendre un espace");
    await page.getByRole("button", { name: "Enregistrer ou reprendre un espace", exact: true }).waitFor();
    await page.locator(".palette-search input").press("Enter");
    await spacesDialog.waitFor();
    await spacesDialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await companionSpaces.getByRole("button", { name: "Fermer", exact: true }).click();
    console.log("Tâches d’espaces réelles : ajout/coches/retrait, doublon refusé, synchronisation des deux vues, rechargement, export/import et actualisation conservant l’avancement, fichiers/collecte/pages intacts et 320/390/1024 px : OK");
    console.log("Espace suivi réel : choix sans reprise, enregistrement/réouverture, avancement et noms synchronisés, choix indépendant panneau/page, persistance, accès clavier aux tâches, nom long à 320/390/1024 px, import sans activation, suppression distante et arrêt sans perdre l’espace : OK");
    console.log("Export/import local réel : JSON téléchargé, aperçu sans activation, conflits de noms, nouvelle identité, synchronisation, annulation, fichiers invalides/trop lourds et 320/390/1024 px : OK");
    console.log("Actualisation réelle : aperçu/annulation sans stockage, nouvelle collecte et dossiers, identité conservée, conflit de nom, pages conservées par défaut ou remplacées explicitement, synchronisation, modification/suppression concurrente refusée et 320/390/1024 px : OK");
    console.log("Espaces hybrides réels : persistance, ressource manquante, reprise locale sans ouverture web, réouverture web/groupes choisie, collecte préservée, synchronisation, 320/390/1024 px et suppression sans toucher aux fichiers : OK");
    await runFileGroupJourney({ context, baseURL: `chrome-extension://${id}/index.html`, fixture });
    await runHybridJourneys({ context, worker, companion, fixture, imageBytes });
    const automaticFolder = path.join(fixture, "Automatic");
    await mkdir(automaticFolder);
    await writeFile(path.join(automaticFolder, "auto-test.auto"), "Collision à conserver");
    const oldAutomaticId = await worker.evaluate(async url => chrome.downloads.download({ url, filename: "ancien.auto", saveAs: false }), formURL + "automatic-download?name=ancien.auto");
    await waitUntil(async () => (await worker.evaluate(async id => (await chrome.downloads.search({ id }))[0]?.state, oldAutomaticId)) === "complete", "Téléchargement ancien non terminé");
    const oldAutomatic = await worker.evaluate(async id => (await chrome.downloads.search({ id }))[0], oldAutomaticId);
    await companion.getByRole("tab", { name: "Page", exact: true }).click();
    const downloadsAction = companion.getByRole("button", { name: "Ranger les téléchargements…", exact: true });
    if (!(await downloadsAction.isVisible())) await companion.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    await downloadsAction.click();
    const autoList = companion.getByRole("dialog", { name: "Ranger les téléchargements", exact: true });
    await autoList.locator(".download-rules > summary").filter({ hasText: "Règles de rangement" }).click();
    await autoList.getByRole("button", { name: "Nouvelle règle", exact: true }).click();
    const autoEditor = autoList.getByRole("form", { name: "Éditer une règle de rangement", exact: true });
    const autoOptIn = autoEditor.getByRole("checkbox", { name: "Ranger automatiquement les nouveaux téléchargements", exact: true });
    assert.equal(await autoOptIn.isChecked(), false);
    await autoEditor.getByLabel("Nom de la règle", { exact: true }).fill("Automatique de recette");
    await autoEditor.getByLabel("Site d’origine (facultatif)").fill("127.0.0.1");
    await autoEditor.getByLabel("Extension (facultative)").fill(".auto");
    await autoEditor.getByLabel("Dossier de destination", { exact: true }).fill(automaticFolder);
    await autoOptIn.check();
    for (const width of [320, 390, 1024]) {
      await companion.setViewportSize({ width, height: 844 });
      assert.ok(await companion.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await companion.setViewportSize({ width: 390, height: 844 });
    await companion.screenshot({ path: "test-results/download-automatic-opt-in.png", fullPage: true });
    await autoEditor.getByRole("button", { name: "Enregistrer la règle", exact: true }).click();
    await autoEditor.waitFor({ state: "hidden" });
    const autoPreferences = await worker.evaluate(async () => (await chrome.storage.local.get("downloadFiling")).downloadFiling);
    const autoRule = autoPreferences.rules.find(rule => rule.name === "Automatique de recette");
    assert.equal(autoRule.automatic, true);
    assert.ok(Date.parse(autoRule.automaticSince) > Date.parse(oldAutomatic.startTime));
    assert.equal(autoPreferences.rules.find(rule => rule.name === "Documents de recette").automatic, undefined);
    await autoList.getByRole("button", { name: "Modifier la règle Automatique de recette", exact: true }).click();
    assert.equal(await autoOptIn.isChecked(), false);
    await autoEditor.getByRole("button", { name: "Annuler la règle", exact: true }).click();
    await autoList.getByRole("button", { name: "Fermer", exact: true }).click();
    // Exercise the worker/native pipeline with every explorer view closed.
    for (const view of context.pages().filter(view => view.url().startsWith(`chrome-extension://${id}/`))) await view.close();
    const autoId = await worker.evaluate(async url => chrome.downloads.download({ url, filename: "auto-test.auto", saveAs: false }), formURL + "automatic-download?name=auto-test.auto");
    await waitUntil(async () => (await worker.evaluate(async id => (await chrome.storage.local.get("downloadRuns")).downloadRuns?.find(run => run.key.startsWith(`${id}/`))?.state, autoId)) === "completed", "Rangement automatique panneau fermé non terminé");
    const autoRun = await worker.evaluate(async id => (await chrome.storage.local.get("downloadRuns")).downloadRuns.find(run => run.key.startsWith(`${id}/`)), autoId);
    assert.equal(autoRun.automatic, true);
    assert.equal(autoRun.state, "completed");
    assert.equal(await readFile(path.join(automaticFolder, "auto-test.auto"), "utf8"), "Collision à conserver");
    assert.notEqual(path.basename(autoRun.destination), "auto-test.auto");
    assert.equal(await readFile(autoRun.destination, "utf8"), "Téléchargement Chrome réel à ranger");
    await assert.rejects(stat(autoRun.source));
    const autoSource = JSON.parse(await readFile(autoRun.destination + ".source.json", "utf8"));
    assert.equal(autoSource.file, path.basename(autoRun.destination));
    assert.equal(autoSource.sourceUrl, formURL + "automatic-download");
    assert.equal(await readFile(oldAutomatic.filename, "utf8"), "Téléchargement Chrome réel à ranger");
    // Pause and destination failure remain visible without moving the sources.
    await worker.evaluate(async id => {
      const { downloadFiling } = await chrome.storage.local.get("downloadFiling");
      downloadFiling.rules.find(rule => rule.id === id).enabled = false;
      await chrome.storage.local.set({ downloadFiling });
    }, autoRule.id);
    const pausedId = await worker.evaluate(async url => chrome.downloads.download({ url, filename: "pause.auto", saveAs: false }), formURL + "automatic-download?name=pause.auto");
    await waitUntil(async () => (await worker.evaluate(async id => (await chrome.downloads.search({ id }))[0]?.state, pausedId)) === "complete", "Téléchargement en pause non terminé");
    const paused = await worker.evaluate(async id => (await chrome.downloads.search({ id }))[0], pausedId);
    await worker.evaluate(async ({ id, destination }) => {
      const { downloadFiling } = await chrome.storage.local.get("downloadFiling");
      Object.assign(downloadFiling.rules.find(rule => rule.id === id), { enabled: true, destination, automaticSince: new Date().toISOString() });
      await chrome.storage.local.set({ downloadFiling });
    }, { id: autoRule.id, destination: path.join(fixture, "Absent") });
    const blockedId = await worker.evaluate(async url => chrome.downloads.download({ url, filename: "bloque.auto", saveAs: false }), formURL + "automatic-download?name=bloque.auto");
    await waitUntil(async () => (await worker.evaluate(async id => (await chrome.storage.local.get("downloadRuns")).downloadRuns?.find(run => run.key.startsWith(`${id}/`))?.state, blockedId)) === "blocked", "Destination absente non signalée");
    const blocked = await worker.evaluate(async id => (await chrome.downloads.search({ id }))[0], blockedId);
    assert.equal(await readFile(paused.filename, "utf8"), "Téléchargement Chrome réel à ranger");
    assert.equal(await readFile(blocked.filename, "utf8"), "Téléchargement Chrome réel à ranger");
    const review = await context.newPage();
    review.on("pageerror", error => errors.push(error.message));
    await review.goto(`chrome-extension://${id}/index.html?panel=1`);
    await review.getByRole("tab", { name: "Page", exact: true }).click();
    await review.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
    await review.getByRole("button", { name: "Ranger les téléchargements…", exact: true }).click();
    const reviewList = review.getByRole("dialog", { name: "Ranger les téléchargements", exact: true });
    await reviewList.locator(".download-rules > summary").filter({ hasText: "Suivi des rangements" }).click();
    await reviewList.getByText("Automatique · À ranger manuellement — aucun transfert lancé", { exact: true }).waitFor();
    await review.screenshot({ path: "test-results/download-automatic-history.png", fullPage: true });
    assert.equal((await readdir(automaticFolder)).length, 3);
    console.log("H07 automatique réel : opt-in par règle, nouveaux téléchargements, vues fermées, collision conservée, provenance, ancien fichier intact, pause, destination absente et suivi persistant : OK");
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  formServer.closeAllConnections();
  await new Promise((resolve) => formServer.close(resolve));
}
