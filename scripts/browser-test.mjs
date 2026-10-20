import { chromium } from "playwright";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { runFileGroupJourney } from "./file-group-journey.mjs";
import { runLayoutJourney } from "./layout-journey.mjs";
import { runQuickTagsJourney } from "./quick-tags-journey.mjs";
import { runSpaceJourney } from "./space-journey.mjs";
import { runConsoleJourney } from "./console-journey.mjs";
async function chooseFileOption(page, label, value) {
  const trigger = page.getByRole("button", { name: label, exact: true });
  await trigger.locator("svg").first().click();
  const menu = page.getByRole("menu", { name: label, exact: true });
  await menu.waitFor();
  assert.equal(await menu.getByRole("menuitemradio", { checked: true }).count(), 1);
  assert.ok(await menu.getByRole("menuitemradio").evaluateAll(items => items.every(item => item.querySelector('svg'))));
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height);
  await menu.locator(`[data-value="${value}"]`).click();
  await menu.waitFor({ state: "hidden" });
  assert.equal(await trigger.getAttribute("data-value"), value);
}
const root = process.cwd();
await mkdir("test-results", { recursive: true });
const fixture = await mkdtemp(path.join(root, "test-results", "workspace-"));
const nativeConfig = await mkdtemp(path.join(root, "test-results", "native-config-"));
for (const name of ["Design", "Documents", "Exports", "Images", "Sources"])
  await mkdir(path.join(fixture, name));
await writeFile(
  path.join(fixture, "README.md"),
  "# Projet Atlas\n\nUn espace de travail local.\n\n- Design\n- Développement\n",
);
await writeFile(
  path.join(fixture, "brief.txt"),
  "Ceci est un vrai fichier temporaire de test.",
);
await writeFile(path.join(fixture, "budget.csv"), "Poste,Montant\nDesign,1500");
await writeFile(
  path.join(fixture, "config.json"),
  '{"project":"Atlas","version":1}',
);
await writeFile(path.join(fixture, ".hidden"), "hidden");
await writeFile(path.join(fixture, "Documents", "document.txt"), "Document de test du fil d’Ariane");
await writeFile(
  path.join(fixture, "Images", "icon.png"),
  await readFile("public/icon128.png"),
);
const id = (await readFile("extension-id.txt", "utf8")).trim();
await writeFile(
  "native/com.local.file_explorer.json",
  JSON.stringify({
    name: "com.local.file_explorer",
    path: path.join(root, "native/native-host.exe"),
    type: "stdio",
    allowed_origins: [`chrome-extension://${id}/`],
  }),
);
const host = spawn(
  path.join(root, "native/native-host.exe"),
  [`chrome-extension://${id}/`],
  { stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    env: { ...process.env, AppData: nativeConfig, APPDATA: nativeConfig } },
);
let buffer = Buffer.alloc(0);
const pending = new Map();
const events = [];
host.stdout.on("data", (b) => {
  buffer = Buffer.concat([buffer, b]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const n = buffer.readUInt32LE(0);
    const msg = JSON.parse(buffer.subarray(4, n + 4));
    buffer = buffer.subarray(n + 4);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        clearTimeout(p.timer);
        p.resolve(msg);
      }
    } else events.push(msg);
  }
});
host.stderr.on("data", (b) => process.stderr.write(b));
function rpc(message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(message.id);
      reject(new Error("RPC timeout: " + message.action));
    }, 20000);
    pending.set(message.id, { resolve, reject, timer });
    const body = Buffer.from(JSON.stringify(message)),
      length = Buffer.alloc(4);
    length.writeUInt32LE(body.length);
    host.stdin.write(Buffer.concat([length, body]));
  });
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: false },
});
const testWorker = await rpc({ id:"j5-test-worker",action:"WORKER_HELLO",payload:{} });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PRISME_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let helloAttempts = 0;
  const reads = [];
  const stats = [];
  let heldStatPath, heldStats;
  await page.context().exposeFunction("__nativeRPC", async (message) => {
    if (message.action === "FS_READ") reads.push(message.payload);
    if (message.action === "FS_STAT") {
      stats.push(message.payload.path);
      if (message.payload.path === heldStatPath) await heldStats;
    }
    if (message.action === "HELLO" && ++helloAttempts <= 2)
      return {
        id: message.id,
        status: "ERROR",
        error: "Compagnon temporairement absent",
      };
    const reply = await rpc(message);
    if (message.action === "HELLO" && reply.status === "SUCCESS") {
      reply.data.home = fixture;
      reply.data.aliases = { ...reply.data.aliases, "~": fixture, "~docs": path.join(fixture, "Documents"), "~desk": path.join(fixture, "Design"), "~dl": path.join(fixture, "Exports") };
    }
    return reply;
  });
  const eventCursors = new WeakMap();
  await page.context().exposeBinding("__nativeEvents", ({ page }) => {
    const next = events.slice(eventCursors.get(page) || 0);
    eventCursors.set(page, events.length);
    return next;
  });
  await page.context().addInitScript(
    ({ id, fixture }) => {
      const readStored = () => ({ lastPath: fixture, ...JSON.parse(localStorage.getItem("test-storage") || "{}") });
      const storageListeners = new Set();
      const changed = (before, after) => {
        const changes = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
          .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
          .map((key) => [key, { oldValue: before[key], newValue: after[key] }]));
        storageListeners.forEach((fn) => fn(changes, "local"));
      };
      window.addEventListener("storage", (event) => {
        if (event.key === "test-storage") changed(JSON.parse(event.oldValue || "{}"), JSON.parse(event.newValue || "{}"));
      });
      const listeners = [];
      const tabListeners = new Set();
      const grantedPermissions = new Set();
      window.__testPage = { id: 22, windowId: 11, url: "https://example.com/project", title: "Projet Atlas", active: true };
      window.__changeTestPage = (change) => {
        Object.assign(window.__testPage, change);
        tabListeners.forEach((listener) => listener(22, { status: "loading" }, window.__testPage));
      };
      window.chrome = {
        tabs: {
          async query() { return [window.__testPage]; },
          async get() { return window.__testPage; },
          async create(options) { window.__openedFull = options; return { id: 23, ...options }; },
          onActivated: { addListener() {}, removeListener() {} },
          onUpdated: { addListener(fn) { tabListeners.add(fn); }, removeListener(fn) { tabListeners.delete(fn); } },
        },
        windows: { async getCurrent() { return { id: 11 }; } },
        sidePanel: { async close(options) { window.__closedPanel = options; } },
        permissions: {
          async request(options = {}) { for (const permission of [...options.permissions || [], ...options.origins || []]) grantedPermissions.add(permission); return true; },
          async contains(options = {}) { return [...options.permissions || [], ...options.origins || []].every(permission => grantedPermissions.has(permission)); },
        },
        scripting: {
          async executeScript({ target, func, args = [] }) {
            if (target.documentIds && target.documentIds[0] !== window.__testDocumentId) throw new Error("Document remplacé");
            let frame = document.getElementById("test-web-form");
            if (!frame) {
              frame = document.createElement("iframe");
              frame.id = "test-web-form";
              frame.style.cssText = "position:fixed;left:-10000px;width:100px;height:100px";
              document.body.append(frame);
              frame.contentDocument.body.innerHTML = '<p id="selection">Extrait sélectionné sur la page</p><label>Justificatif<input id="proof" type="file" accept=".txt"></label><label>Pièces jointes<input id="attachments" type="file" multiple></label>';
              const selection = frame.contentWindow.getSelection();
              const range = frame.contentDocument.createRange();
              range.selectNodeContents(frame.contentDocument.getElementById("selection"));
              selection.addRange(range);
              window.__testDocumentId = "test-web-document";
            }
            const result = frame.contentWindow.eval(`(${func.toString()})`)(...args);
            return [{ result, documentId: window.__testDocumentId, frameId: 0 }];
          },
        },
        runtime: {
          id,
          getURL(path) { return `chrome-extension://${id}/${path}`; },
          connect() {
            const owner = crypto.randomUUID();
            return {
              onMessage: {
                addListener(fn) {
                  listeners.push(fn);
                },
              },
              onDisconnect: { addListener() {} },
              postMessage(msg) {
                if (msg.action.startsWith("TERMINAL_")) msg.payload = { ...msg.payload, owner };
                window
                  .__nativeRPC(msg)
                  .then((response) => {
                    listeners.forEach((f) => f(response));
                    if (msg.action === "FS_STAT") window.__receivedStatResponses = (window.__receivedStatResponses || 0) + 1;
                  });
              },
            };
          },
        },
        storage: {
          onChanged: { addListener(fn) { storageListeners.add(fn); }, removeListener(fn) { storageListeners.delete(fn); } },
          local: {
            async get(k) {
              const stored = readStored(), keys = Array.isArray(k) ? k : [k];
              return Object.fromEntries(keys.filter(key => Object.hasOwn(stored, key)).map(key => [key, stored[key]]));
            },
            async set(v) {
              const before = readStored(), after = { ...before, ...v };
              localStorage.setItem("test-storage", JSON.stringify(after));
              changed(before, after);
            },
            async remove(keys) {
              const before = readStored(), after = { ...before };
              for (const key of Array.isArray(keys) ? keys : [keys]) delete after[key];
              localStorage.setItem("test-storage", JSON.stringify(after));
              changed(before, after);
            },
          },
        },
      };
      setInterval(async () => {
        for (const e of await window.__nativeEvents())
          listeners.forEach((f) => f(e));
      }, 100);
    },
    { id, fixture },
  );
  await page.goto(url);
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  assert.ok(
    helloAttempts >= 3,
    "reconnexion automatique après indisponibilité",
  );
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  if (process.argv.includes("--console-only")) {
    page.setDefaultTimeout(15000);
    try { await runConsoleJourney({ page, fixture }); }
    catch (error) {
      await page.screenshot({ path: "test-results/console-failure.png" });
      await writeFile("test-results/console-failure.txt", await page.locator("body").innerText());
      throw error;
    }
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--layout-only")) {
    await runLayoutJourney({ page });
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--tags-only")) {
    await runQuickTagsJourney({ page, fixture });
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--space-only")) {
    await runSpaceJourney({ page, fixture, reads });
    assert.deepEqual(errors, []);
  } else {
  assert.equal(await page.getByRole("listbox", { name: "Fichiers", exact: true }).getByRole("option").count(), 9);
  const viewModes = ["extra-large-icons", "large-icons", "medium-icons", "small-icons", "list", "details", "tiles", "content"];
  const explorerView = page.getByRole("button", { name: "Affichage des fichiers", exact: true });
  await page.getByRole("option", { name: /README.md/ }).click();
  for (const mode of viewModes) {
    await chooseFileOption(page, "Affichage des fichiers", mode);
    await page.locator(`.pane[data-view="${mode}"]`).waitFor();
    assert.equal(await page.getByRole("option", { name: /README.md/ }).getAttribute("aria-selected"), "true");
    assert.equal(await page.locator(".table-head").isVisible(), mode === "details");
    assert.ok(await page.locator(".file-scroll").evaluate((scroll) => scroll.scrollWidth <= scroll.clientWidth));
    await page.screenshot({ path: `test-results/explorer-view-${mode}.png`, animations: "disabled" });
  }
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:page")).tabs[0].panes[0].viewMode === "content");
  await page.reload();
  await explorerView.waitFor();
  assert.equal(await explorerView.getAttribute("data-value"), "content");
  await chooseFileOption(page, "Affichage des fichiers", "large-icons");
  await page.getByRole("option", { name: /Design/ }).click();
  await page.locator(".file-scroll").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("option", { name: /Documents/ }).getAttribute("aria-selected"), "true");
  await chooseFileOption(page, "Affichage des fichiers", "details");
  await page.getByRole("option", { name: "Documents", exact: true }).click({ modifiers: ["Control"] });
  console.log("Explorateur : huit affichages, sélection conservée, clavier et préférence mémorisée : OK");
  const viewMenu = page.getByRole("menu", { name: "Affichage des fichiers", exact: true });
  await explorerView.locator("svg").first().click();
  await viewMenu.getByRole("menuitemradio", { name: "Détails", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/explorer-view-menu.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await viewMenu.waitFor({ state: "hidden" });
  assert.equal(await explorerView.evaluate(button => button === document.activeElement), true);
  await explorerView.press("ArrowDown");
  await viewMenu.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-checked") === "true");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await viewMenu.waitFor({ state: "hidden" });
  assert.equal(await explorerView.getAttribute("data-value"), "large-icons");
  await explorerView.click();
  await viewMenu.waitFor();
  await page.getByRole("heading", { name: path.basename(fixture), exact: true }).click();
  await viewMenu.waitFor({ state: "hidden" });
  assert.equal(await explorerView.getAttribute("data-value"), "large-icons");
  await explorerView.click();
  await viewMenu.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-checked") === "true");
  await page.keyboard.press("Tab");
  await viewMenu.waitFor({ state: "hidden" });
  const sortable = ["brief.txt", "budget.csv", "config.json", "README.md"];
  for (let i = 0; i < sortable.length; i++) {
    const time = new Date(Date.UTC(2020, 0, i + 1));
    await utimes(path.join(fixture, sortable[i]), time, time);
  }
  const sortRows = await Promise.all(sortable.map(async name => ({name,...await stat(path.join(fixture,name))})));
  for (const value of ["name:asc", "name:desc", "mtime:asc", "mtime:desc", "size:asc", "size:desc"]) {
    await chooseFileOption(page, "Trier les fichiers", value);
    const [by, direction] = value.split(":");
    const expected = [...sortRows].sort((a,b) => {
      const result = by === "size" ? a.size-b.size : by === "mtime" ? a.mtimeMs-b.mtimeMs : a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return direction === "desc" ? -result : result;
    }).map(row => row.name);
    await page.waitForFunction(expected => {
      const names = [...document.querySelectorAll('.file-scroll [role="option"]')].map(row => row.getAttribute('aria-label')).filter(name => expected.includes(name));
      return JSON.stringify(names) === JSON.stringify(expected);
    }, expected);
  }
  const sortTrigger = page.getByRole("button", { name: "Trier les fichiers", exact: true });
  await sortTrigger.click();
  const sortMenu = page.getByRole("menu", { name: "Trier les fichiers", exact: true });
  await sortMenu.waitFor();
  await page.screenshot({ path: "test-results/explorer-sort-menu.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:page")).tabs[0].panes[0].sortBy === "size");
  await page.reload();
  await sortTrigger.waitFor();
  assert.equal(await sortTrigger.getAttribute("data-value"), "size:desc");
  await chooseFileOption(page, "Trier les fichiers", "name:asc");
  await chooseFileOption(page, "Affichage des fichiers", "details");
  await page.getByRole("option", { name: "README.md", exact: true }).waitFor();
  console.log("Menus : ouverture sur icône, icônes et choix actif, Échap/focus, clavier, Tab et clic extérieur ; six tris réels hors Détails et préférence mémorisée : OK");
  await page.getByTitle("Volet d’aperçu", { exact: true }).click();
  const details = page.getByRole("complementary", { name: "Volet d’aperçu", exact: true });
  await details.getByText("Sélectionnez un fichier pour voir son aperçu et ses informations.").waitFor();
  await page.getByRole("option", { name: /brief.txt/ }).click();
  await details.locator(".preview-body").getByText(/vrai fichier/).waitFor();
  await details.getByRole("heading", { name: "brief.txt", exact: true }).waitFor();
  await page.getByRole("option", { name: /README.md/ }).click({ modifiers: ["Control"] });
  await details.getByText("2 éléments sélectionnés", { exact: true }).waitFor();
  await page.getByRole("option", { name: /Images/ }).dblclick();
  await page.getByRole("option", { name: /icon.png/ }).click();
  await details.getByRole("heading", { name: "icon.png", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".details-pane img")?.naturalWidth > 0);
  await details.getByText("Largeur", { exact: true }).waitFor();
  assert.ok((await details.locator("dd").allTextContents()).includes("128"));
  await page.screenshot({ path: "test-results/selection-details.png", fullPage: true });
  const detailsDivider = page.getByRole("separator", { name: "Ajuster la largeur de l’aperçu", exact: true });
  const detailsWidth = (await details.boundingBox()).width;
  const detailsHandle = await detailsDivider.boundingBox();
  await page.mouse.move(detailsHandle.x + 8, detailsHandle.y + detailsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(detailsHandle.x - 92, detailsHandle.y + detailsHandle.height / 2);
  await page.mouse.up();
  await page.waitForFunction(width => document.querySelector(".details-pane").getBoundingClientRect().width > width + 90, detailsWidth);
  const savedDetailsWidth = await detailsDivider.getAttribute("aria-valuenow");
  await page.reload();
  await details.waitFor();
  assert.equal(await detailsDivider.getAttribute("aria-valuenow"), savedDetailsWidth);
  await detailsDivider.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(Number(await detailsDivider.getAttribute("aria-valuenow")), Number(savedDetailsWidth) + 20);
  await detailsDivider.dblclick();
  assert.equal(await detailsDivider.getAttribute("aria-valuenow"), "330");
  await page.getByRole("option", { name: /icon.png/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await detailsDivider.isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await details.getByRole("button", { name: "Fermer le volet d’aperçu", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTitle("Précédent", { exact: true }).click();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  console.log("Volet d’aperçu : texte, sélection multiple, image, métadonnées natives et petit écran : OK");
  await page.getByRole("option", { name: /README.md/ }).click();
  for (let i = 0; i < 2; i++) {
    await page.locator(".breadcrumbs").getByRole("button", { name: path.basename(fixture), exact: true }).click();
    assert.equal(await page.getByRole("listbox", { name: "Fichiers", exact: true }).getByRole("option").count(), 9);
    assert.equal(await page.getByRole("option", { name: /README.md/ }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByTitle("Précédent", { exact: true }).isDisabled(), true);
  }
  await page.getByLabel("Filtrer ce dossier", { exact: true }).fill("budget");
  await page.waitForFunction(() => document.querySelectorAll("[role=option]").length === 1);
  await page.locator(".breadcrumbs").getByRole("button", { name: path.basename(fixture), exact: true }).click();
  assert.equal(await page.getByLabel("Filtrer ce dossier", { exact: true }).inputValue(), "budget");
  await page.getByRole("option", { name: /budget.csv/ }).waitFor();
  await page.getByLabel("Filtrer ce dossier", { exact: true }).fill("");
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await page.screenshot({
    path: "test-results/explorer-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.getByRole("tab").count(), 1);
  assert.ok((await page.getByRole("button", { name: "Nouvel onglet" }).boundingBox()).width >= 48);
  await page.getByRole("button", { name: "Nouvel onglet" }).click();
  assert.equal(await page.getByRole("tab").count(), 2);
  await page.getByRole("option", { name: /Documents/ }).dblclick();
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
  await page.getByRole("option", { name: /document.txt/ }).waitFor();
  await page.locator(".breadcrumbs").getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("option", { name: /document.txt/ }).waitFor();
  await page.getByTitle("Précédent", { exact: true }).click();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await page.getByRole("option", { name: /Documents/ }).dblclick();
  await page.getByRole("option", { name: /document.txt/ }).waitFor();
  console.log("Fil d’Ariane : dossier courant, filtre et sélection conservés, retour précédent : OK");
  await page.getByTitle("Double panneau", { exact: true }).click();
  assert.equal(await page.locator(".pane").count(), 2);
  await page.locator(".pane").nth(1).getByRole("option", { name: /README.md/ }).waitFor();
  await page.getByTitle("Volet d’aperçu", { exact: true }).click();
  await page.locator(".pane").nth(1).getByRole("option", { name: /README.md/ }).click();
  await details.getByRole("heading", { name: "README.md", exact: true }).waitFor();
  await page.locator(".pane").first().getByRole("option", { name: /document.txt/ }).click();
  await details.getByRole("heading", { name: "document.txt", exact: true }).waitFor();
  await details.getByRole("button", { name: "Fermer le volet d’aperçu", exact: true }).click();
  await page.screenshot({ path: "test-results/explorer-tabs.png", fullPage: true });
  const divider = page.getByRole("separator", { name: "Ajuster la largeur des panneaux" });
  const initialWidth = (await page.locator(".pane").first().boundingBox()).width;
  const dividerBox = await divider.boundingBox();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 110, dividerBox.y + dividerBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction((width) => document.querySelector(".pane").getBoundingClientRect().width > width + 90, initialWidth);
  const resizedSplit = Number(await divider.getAttribute("aria-valuenow"));
  assert.ok(resizedSplit > 50);
  await page.screenshot({ path: "test-results/explorer-split-resized.png", fullPage: true });
  await page.locator(".tab-select").nth(1).focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.activeElement?.id === "folder-tab-0");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.activeElement?.id === "folder-tab-1");
  await page.locator(".tab-select").first().click();
  assert.equal(await page.locator(".pane").count(), 1);
  await page.getByRole("heading", { name: path.basename(fixture), exact: true }).waitFor();
  await page.locator(".tab-select").nth(1).click();
  assert.equal(await page.locator(".pane").count(), 2);
  await page.reload();
  await page.getByRole("tab").nth(1).waitFor();
  assert.equal(await page.getByRole("tab").count(), 2);
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
  assert.equal(await page.locator(".pane").count(), 2);
  assert.equal(Number(await divider.getAttribute("aria-valuenow")), resizedSplit);
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(Number(await divider.getAttribute("aria-valuenow")), resizedSplit - 5);
  await page.keyboard.press("Home");
  assert.equal(Number(await divider.getAttribute("aria-valuenow")), 30);
  await page.keyboard.press("End");
  assert.equal(Number(await divider.getAttribute("aria-valuenow")), 70);
  await divider.dblclick();
  assert.equal(Number(await divider.getAttribute("aria-valuenow")), 50);
  await page.locator(".workspace-tab.current .tab-close").click();
  assert.equal(await page.getByRole("tab").count(), 1);
  assert.equal(await page.locator(".pane").count(), 1);
  await page.getByRole("option", { name: /Documents/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Ouvrir dans un nouvel onglet" }).click();
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
  await page.locator(".workspace-tab.current .tab-close").click();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await page.getByRole("option", { name: /brief.txt/ }).click();
  await page.keyboard.press("Space");
  await page.getByRole("dialog", { name: "Aperçu de brief.txt" }).waitFor();
  await page
    .getByText("Ceci est un vrai fichier temporaire de test.", { exact: false })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByTitle("Nouveau dossier", { exact: true }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Test créé");
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /Test créé/ }).waitFor();
  assert.ok((await stat(path.join(fixture, "Test créé"))).isDirectory());
  await page.getByRole("option", { name: /brief.txt/ }).click();
  await page.keyboard.press("F2");
  await page.getByLabel("Nom", { exact: true }).fill("renommé.txt");
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /renommé.txt/ }).waitFor();
  assert.match(
    await readFile(path.join(fixture, "renommé.txt"), "utf8"),
    /vrai fichier/,
  );
  await page.getByRole("option", { name: /renommé.txt/ }).click();
  await page.getByRole("button", { name: "Collecter", exact: true }).click();
  await page.getByTitle(path.join(fixture, "renommé.txt")).last().waitFor();
  await page.getByRole("button", { name: "Collecter", exact: true }).click();
  await page.getByText("Ces éléments sont déjà dans la collecte", { exact: true }).waitFor();
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  const collectionReview = page.getByRole("dialog", { name: "Examiner la collecte", exact: true });
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 1);
  await collectionReview.getByText(path.join(fixture, "renommé.txt"), { exact: true }).waitFor();
  const checkRegion = collectionReview.getByRole("region", { name: "Vérification des références locales", exact: true });
  const readsBeforeCheck = reads.length;
  await checkRegion.getByRole("button", { name: "Vérifier les fichiers", exact: true }).click();
  await checkRegion.getByRole("status").getByText(/Contrôle terminé : 1\/1 références locales examinées\. 1 présentes/).waitFor();
  assert.equal(reads.length, readsBeforeCheck);
  assert.equal(await checkRegion.getByRole("list").count(), 0);
  const responsesBeforeCancel = await page.evaluate(() => window.__receivedStatResponses || 0);
  const statCallsBeforeCancel = stats.length;
  heldStatPath = path.join(fixture, "renommé.txt");
  let releaseStats;
  heldStats = new Promise(resolve => { releaseStats = resolve; });
  await checkRegion.getByRole("button", { name: "Vérifier les fichiers", exact: true }).click();
  await checkRegion.getByRole("button", { name: "Arrêter la vérification", exact: true }).click();
  await checkRegion.getByRole("status").getByText(/Vérification arrêtée : 0\/1/).waitFor();
  releaseStats();
  await page.waitForFunction(count => (window.__receivedStatResponses || 0) > count, responsesBeforeCancel);
  assert.equal(stats.length, statCallsBeforeCancel + 1);
  await checkRegion.getByRole("status").getByText(/Vérification arrêtée : 0\/1/).waitFor();
  heldStatPath = undefined;
  assert.equal(reads.length, readsBeforeCheck);
  console.log("Contrôle de collecte : présence réelle sans lecture du contenu, arrêt et réponse tardive ignorée : OK");
  await page.screenshot({ path: "test-results/collection-review.png", fullPage: true });
  await collectionReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).focus();
  await page.keyboard.press("Enter");
  await collectionReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 0);
  await checkRegion.getByRole("status").waitFor({ state: "hidden" });
  assert.equal(await collectionReview.getByRole("button", { name: "Copier vers ce dossier", exact: true }).isDisabled(), true);
  assert.match(await readFile(path.join(fixture, "renommé.txt"), "utf8"), /vrai fichier/);
  await collectionReview.locator("footer").getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("option", { name: /renommé.txt/ }).click();
  await page.getByRole("button", { name: "Collecter", exact: true }).click();
  await page.locator(".stash-items").getByTitle(path.join(fixture, "renommé.txt"), { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("option", { name: /renommé.txt/ }).waitFor();
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  await collectionReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).waitFor();
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 1);
  await collectionReview.getByRole("button", { name: "Copier vers ce dossier", exact: true }).click();
  const collectionTransfer = page.getByRole("dialog", { name: "Transférer les fichiers", exact: true });
  assert.equal(await collectionTransfer.locator("select[name=mode]").inputValue(), "copy");
  await page.keyboard.press("Escape");
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  for (let n = 0; n < 2; n++) {
    await collectionReview.getByLabel("Adresse du lien", { exact: true }).fill("https://example.com/reference");
    await collectionReview.getByLabel("Titre (facultatif)", { exact: true }).fill("Référence web");
    await collectionReview.getByRole("button", { name: "Ajouter un lien", exact: true }).click();
  }
  await collectionReview.getByRole("button", { name: "Retirer Référence web de la collecte", exact: true }).waitFor();
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 2);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("option", { name: /renommé.txt/ }).waitFor();
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 2);
  await collectionReview.getByRole("button", { name: "Copier vers ce dossier", exact: true }).click();
  await collectionTransfer.getByText("1 élément(s) sélectionné(s)", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/collection-web.png", fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await collectionReview.getByRole("button", { name: "Enregistrer le lien…", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Enregistrer le lien", exact: true });
  await linkDialog.getByLabel("Dossier de destination", { exact: true }).fill(path.join(fixture, "Exports"));
  await linkDialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await linkDialog.waitFor({ state: "hidden" });
  const savedLinks = (await readdir(path.join(fixture, "Exports"))).filter((name) => name.endsWith(".weblink"));
  assert.equal(savedLinks.length, 1);
  const savedLink = JSON.parse(await readFile(path.join(fixture, "Exports", savedLinks[0]), "utf8"));
  assert.equal(savedLink.url, "https://example.com/reference");
  assert.equal(savedLink.title, "Référence web");
  assert.ok(Number.isFinite(Date.parse(savedLink.collectedAt)));
  const moreCollection = page.getByTitle("Plus d’actions de collecte", { exact: true });
  const sidebarWasOpen = Boolean(await page.locator(".sidebar").count());
  if (sidebarWasOpen) await page.getByTitle("Masquer la navigation").click();
  await moreCollection.click();
  assert.equal(await moreCollection.getAttribute("aria-expanded"), "true");
  await page.screenshot({ path: "test-results/explorer-sidepanel-actions.png", fullPage: true });
  await moreCollection.click();
  assert.equal(await moreCollection.getAttribute("aria-expanded"), "false");
  if (sidebarWasOpen) await page.locator(".brand").click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByTitle("Examiner la collecte", { exact: true }).click();
  await collectionReview.getByLabel("Nom de la liste", { exact: true }).fill("Dossier voyage");
  await collectionReview.getByRole("button", { name: "Enregistrer cette liste", exact: true }).click();
  await collectionReview.getByRole("button", { name: "Ajouter la liste Dossier voyage au panier", exact: true }).waitFor();
  const otherView = await page.context().newPage();
  otherView.on("pageerror", (error) => errors.push(error.message));
  await otherView.setViewportSize({ width: 390, height: 844 });
  await otherView.goto(url + "?panel=1");
  await otherView.getByRole("tab", { name: "Collecte", exact: true }).click();
  await otherView.getByTitle("Examiner la collecte", { exact: true }).click();
  const otherReview = otherView.getByRole("dialog", { name: "Examiner la collecte", exact: true });
  await otherReview.getByRole("button", { name: "Ajouter la liste Dossier voyage au panier", exact: true }).waitFor();
  await otherReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).click();
  await collectionReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).waitFor({ state: "hidden" });
  await otherView.reload();
  await otherView.getByRole("tab", { name: "Collecte", exact: true }).click();
  await otherView.getByTitle("Examiner la collecte", { exact: true }).click();
  await otherReview.getByRole("button", { name: "Ajouter la liste Dossier voyage au panier", exact: true }).click();
  await collectionReview.getByRole("button", { name: "Retirer renommé.txt de la collecte", exact: true }).waitFor();
  for (const [view, label] of [[page, "Alpha"], [otherView, "Beta"]]) {
    await view.getByLabel("Adresse du lien", { exact: true }).fill(`https://example.com/${label}`);
    await view.getByLabel("Titre (facultatif)", { exact: true }).fill(label);
  }
  await Promise.all([page, otherView].map((view) => view.getByRole("button", { name: "Ajouter un lien", exact: true }).click()));
  for (const view of [page, otherView]) {
    await view.getByRole("dialog").getByRole("button", { name: "Retirer Alpha de la collecte", exact: true }).waitFor();
    await view.getByRole("dialog").getByRole("button", { name: "Retirer Beta de la collecte", exact: true }).waitFor();
  }
  await page.screenshot({ path: "test-results/collection-saved.png", fullPage: true });
  await otherReview.getByRole("button", { name: "Supprimer la liste Dossier voyage", exact: true }).click();
  await collectionReview.getByRole("button", { name: "Ajouter la liste Dossier voyage au panier", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await collectionReview.locator(".collection-entries li").count(), 4);
  for (const label of ["Alpha", "Beta"]) {
    await collectionReview.getByRole("button", { name: `Retirer ${label} de la collecte`, exact: true }).click();
    await otherReview.getByRole("button", { name: `Retirer ${label} de la collecte`, exact: true }).waitFor({ state: "hidden" });
  }
  assert.match(await readFile(path.join(fixture, "renommé.txt"), "utf8"), /vrai fichier/);
  await otherView.close();
  await page.keyboard.press("Escape");
  const captureId = "103b132e-48ba-40c6-9b43-197b25c750cc";
  await page.evaluate(async (pendingCapture) => chrome.storage.local.set({ pendingCapture }), {
    id: captureId, text: "  Premier paragraphe\nsecond paragraphe  ", title: "Article Atlas",
    sourceUrl: "https://example.com/article", collectedAt: "2026-10-03T08:00:00.000Z",
  });
  const captureDialog = page.getByRole("dialog", { name: "Enregistrer la sélection", exact: true });
  await captureDialog.waitFor();
  assert.equal((await readdir(path.join(fixture, "Exports"))).filter((name) => name.startsWith("Extrait-")).length, 0);
  await captureDialog.getByRole("button", { name: "Plus tard", exact: true }).click();
  await page.getByRole("button", { name: "Extrait en attente", exact: true }).click();
  await captureDialog.getByLabel("Dossier de destination", { exact: true }).fill(path.join(fixture, "Exports"));
  await page.screenshot({ path: "test-results/selection-capture.png", fullPage: true });
  await captureDialog.getByRole("button", { name: "Enregistrer l’extrait", exact: true }).click();
  await captureDialog.waitFor({ state: "hidden" });
  const savedCapture = await readFile(path.join(fixture, "Exports", `Extrait-${captureId}.txt`), "utf8");
  assert.match(savedCapture, /Titre : Article Atlas/);
  assert.match(savedCapture, /Source : https:\/\/example.com\/article/);
  assert.match(savedCapture, /Date : 2026-10-03T08:00:00.000Z/);
  assert.ok(savedCapture.endsWith("  Premier paragraphe\nsecond paragraphe  "));
  assert.equal(await page.evaluate(async () => (await chrome.storage.local.get("pendingCapture")).pendingCapture), null);
  const imageCapture = { kind: "image", id: "7db6d44a-ef2a-4e47-b229-23e4d22ec331", imageUrl: url + "icon128.png?token=test#image", sourceUrl: "https://example.com/article", title: "Image de recette", collectedAt: new Date().toISOString() };
  let imageRequests = 0;
  page.on("request", (request) => { if (request.url().includes("icon128.png?token=test")) imageRequests++; });
  await page.evaluate(async (pendingCapture) => chrome.storage.local.set({ pendingCapture }), imageCapture);
  const imageDialog = page.getByRole("dialog", { name: "Enregistrer l’image", exact: true });
  await imageDialog.waitFor();
  assert.equal(imageRequests, 0);
  const capturedImagePath = path.join(fixture, "Exports", `Image-${imageCapture.id}.png`);
  await assert.rejects(stat(capturedImagePath));
  await imageDialog.getByRole("button", { name: "Plus tard", exact: true }).click();
  await page.reload();
  await imageDialog.waitFor();
  assert.equal(imageRequests, 0);
  await imageDialog.getByLabel("Dossier de destination", { exact: true }).fill(path.join(fixture, "Exports"));
  await page.screenshot({ path: "test-results/image-capture.png", fullPage: true });
  await imageDialog.getByRole("button", { name: "Enregistrer l’image", exact: true }).click();
  await imageDialog.waitFor({ state: "hidden" });
  assert.equal(imageRequests, 1);
  assert.deepEqual(await readFile(capturedImagePath), await readFile("public/icon128.png"));
  const imageSource = JSON.parse(await readFile(capturedImagePath + ".source.json", "utf8"));
  assert.equal(imageSource.imageUrl, url + "icon128.png");
  assert.equal(imageSource.sourceUrl, imageCapture.sourceUrl);
  await page.evaluate(async (pendingCapture) => chrome.storage.local.set({ pendingCapture }), imageCapture);
  await imageDialog.waitFor();
  await imageDialog.getByLabel("Dossier de destination", { exact: true }).fill(path.join(fixture, "Exports"));
  await imageDialog.getByRole("button", { name: "Enregistrer l’image", exact: true }).click();
  await imageDialog.locator(".error").waitFor();
  assert.deepEqual(await readFile(capturedImagePath), await readFile("public/icon128.png"));
  await imageDialog.getByRole("button", { name: "Écarter la capture", exact: true }).click();
  await imageDialog.waitFor({ state: "hidden" });
  console.log("Capture image : consentement, reprise, écriture native, provenance et collision : OK");
  await page.getByRole("option", { name: /Exports/ }).dblclick();
  const capturedImageOption = page.getByRole("option", { name: new RegExp(`Image-${imageCapture.id}\\.png`) }).first();
  await capturedImageOption.click();
  await page.keyboard.press("Space");
  const imagePreview = page.getByRole("dialog", { name: `Aperçu de Image-${imageCapture.id}.png`, exact: true });
  assert.equal(await imagePreview.getByRole("region", { name: "Provenance de la capture", exact: true }).count(), 0);
  await imagePreview.getByRole("button", { name: "Voir la provenance", exact: true }).click();
  const provenanceRegion = imagePreview.getByRole("region", { name: "Provenance de la capture", exact: true });
  await provenanceRegion.getByText("Image de recette", { exact: true }).waitFor();
  const sourceLink = provenanceRegion.getByRole("link", { name: "Ouvrir la page source" });
  assert.equal(await sourceLink.getAttribute("href"), "https://example.com/article");
  assert.equal(await sourceLink.getAttribute("rel"), "noopener noreferrer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({ path: "test-results/capture-provenance.png", fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.context().route("https://example.com/article", (route) => route.fulfill({ contentType: "text/html", body: "Page source de recette" }));
  const sourcePopupPromise = page.waitForEvent("popup");
  await sourceLink.click();
  const sourcePopup = await sourcePopupPromise;
  await sourcePopup.waitForURL("https://example.com/article");
  assert.equal(await sourcePopup.evaluate(() => window.opener), null);
  await sourcePopup.close();
  await page.setViewportSize({ width: 1440, height: 960 });
  await imagePreview.getByRole("button", { name: "Masquer la provenance", exact: true }).click();
  await writeFile(capturedImagePath + ".source.json", JSON.stringify({ ...imageSource, sourceUrl: "javascript:alert(1)" }));
  await imagePreview.getByRole("button", { name: "Voir la provenance", exact: true }).click();
  await provenanceRegion.getByRole("status").getByText(/Adresse HTTP/).waitFor();
  assert.equal(await provenanceRegion.getByRole("link").count(), 0);
  await unlink(capturedImagePath + ".source.json");
  await imagePreview.getByRole("button", { name: "Masquer la provenance", exact: true }).click();
  await imagePreview.getByRole("button", { name: "Voir la provenance", exact: true }).click();
  await provenanceRegion.getByRole("status").getByText(/absent ou inaccessible/).waitFor();
  await writeFile(capturedImagePath + ".source.json", JSON.stringify(imageSource));
  assert.deepEqual(await readFile(capturedImagePath), await readFile("public/icon128.png"));
  await imagePreview.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
  await page.getByTitle("Dossier parent", { exact: true }).click();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  console.log("Provenance : affichage 390 px, ouverture explicite isolée, source invalide/absente refusée, image intacte : OK");
  const tiffPath = path.join(fixture, "volumineux.tiff");
  const largeTiff = Buffer.alloc(24 * 1024 * 1024);
  largeTiff.set([73, 73, 42, 0]);
  await writeFile(tiffPath, largeTiff);
  const logPath = path.join(fixture, "volumineux.log");
  await writeFile(logPath, "Une ligne de journal\n".repeat(100000));
  await page.reload();
  await page.getByRole("option", { name: /volumineux.tiff/ }).click();
  const readsBeforeTiff = reads.filter((read) => read.path === tiffPath).length;
  await page.getByTitle("Volet d’aperçu", { exact: true }).click();
  await details.getByText(/aperçu indisponible ou limite atteinte/).waitFor();
  assert.equal(reads.filter(read => read.path === tiffPath).length, readsBeforeTiff);
  await page.reload();
  await details.getByText("Sélectionnez un fichier pour voir son aperçu et ses informations.").waitFor();
  assert.equal(await page.getByTitle("Volet d’aperçu", { exact: true }).getAttribute("aria-pressed"), "true");
  await details.getByRole("button", { name: "Fermer le volet d’aperçu", exact: true }).click();
  await page.getByRole("option", { name: /volumineux.tiff/ }).click();
  await page.keyboard.press("Space");
  const tiffPreview = page.getByRole("dialog", { name: "Aperçu de volumineux.tiff", exact: true });
  await tiffPreview.getByText(/aperçu indisponible ou limite atteinte/).waitFor();
  await page.screenshot({ path: "test-results/large-tiff-preview.png", fullPage: true });
  await tiffPreview.getByRole("button", { name: "Créer une copie PNG…", exact: true }).click();
  const convertDialog = page.getByRole("dialog", { name: "Convertir les fichiers", exact: true });
  assert.equal(await convertDialog.locator('select[name="format"]').inputValue(), "png");
  await page.keyboard.press("Escape");
  assert.equal(reads.filter((read) => read.path === tiffPath).length, readsBeforeTiff);
  assert.deepEqual(await readFile(tiffPath), largeTiff);
  await page.getByRole("option", { name: /volumineux.log/ }).click();
  const readsBeforeLog = reads.length;
  await page.keyboard.press("Space");
  const logPreview = page.getByRole("dialog", { name: "Aperçu de volumineux.log", exact: true });
  await logPreview.getByRole("status").getByText(/Aperçu partiel/).waitFor();
  assert.ok(await logPreview.locator(".line-numbers span").count() <= 1000);
  const logReads = reads.slice(readsBeforeLog).filter((read) => read.path === logPath);
  assert.ok(logReads.length > 0 && logReads.length <= 2); // React StrictMode runs effects twice in development.
  assert.ok(logReads.every((read) => read.limit === 65536 && read.offset === 0));
  await logPreview.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click({ timeout: 3000 });
  await logPreview.waitFor({ state: "hidden", timeout: 3000 });
  console.log("TIFF invalide 24 Mo refusé par le décodeur isolé sans lecture Chrome, copie PNG proposée et journal 2 Mo limité à 64 Ko : OK");
  await page.getByRole("option", { name: /renommé.txt/ }).click();
  await page.keyboard.press("Delete");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mettre à la corbeille", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("[role=option]")).some((e) =>
        e.textContent.includes("renommé.txt"),
      ),
  );
  assert.ok(
    (await readdir(path.join(fixture, ".nextexplorer-trash"))).length === 2,
  );
  await page.getByRole("button", { name: "Corbeille", exact: true }).click();
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await page.getByRole("option", { name: /renommé.txt/ }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByLabel("Filtrer ce dossier", { exact: true }).fill("budget");
  await page.waitForFunction(
    () => document.querySelectorAll("[role=option]").length === 1,
  );
  await page.getByLabel("Filtrer ce dossier", { exact: true }).fill("");
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await page.keyboard.press("Control+k");
  await page
    .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…")
    .fill("renommer");
  await page
    .getByRole("button", { name: "Renommer par lot", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByTitle("Double panneau", { exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".pane").length === 2,
  );
  await page.screenshot({
    path: "test-results/explorer-dual.png",
    fullPage: true,
  });
  await page.getByTitle("Double panneau", { exact: true }).click();
  await writeFile(path.join(fixture, "watcher.txt"), "Watcher fonctionne");
  await page
    .getByRole("option", { name: /watcher.txt/ })
    .waitFor({ timeout: 10000 });
  await page.getByRole("option", { name: /budget.csv/ }).click();
  await page.getByRole("button", { name: "Renommer", exact: true }).click();
  await page
    .getByLabel("Suffixe / {Model}, {Title}…", { exact: true })
    .fill("-2026");
  await page
    .getByRole("cell", { name: "budget-2026.csv", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Appliquer le renommage", exact: true })
    .click();
  await page.getByRole("option", { name: /budget-2026.csv/ }).waitFor();
  await page.getByRole("option", { name: /budget-2026.csv/ }).click();
  await page.keyboard.press("Control+c");
  await page.getByRole("option", { name: /Exports/ }).dblclick();
  await page.getByRole("heading", { name: "Exports", exact: true }).waitFor();
  await page.keyboard.press("Control+v");
  await page.getByRole("dialog", { name: "Transférer les fichiers" }).waitFor();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /budget-2026.csv/ }).waitFor();
  assert.equal(
    await readFile(path.join(fixture, "Exports", "budget-2026.csv"), "utf8"),
    await readFile(path.join(fixture, "budget-2026.csv"), "utf8"),
  );
  await page
    .getByRole("option", { name: /budget-2026.csv/ })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Créer une archive", exact: true })
    .click();
  await page.getByLabel("Nom", { exact: true }).fill("test.zip");
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /test.zip/ }).waitFor();
  await page.getByRole("option", { name: /test.zip/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Extraire une archive…", exact: true }).click();
  await page.getByRole("dialog", { name: "Extraire une archive", exact: true }).waitFor();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /test-extrait/ }).waitFor();
  assert.equal(
    await readFile(path.join(fixture, "Exports", "test-extrait", "budget-2026.csv"), "utf8"),
    await readFile(path.join(fixture, "Exports", "budget-2026.csv"), "utf8"),
  );
  await page.getByRole("option", { name: /test.zip/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Extraire une archive…", exact: true }).click();
  await page.getByLabel("Extraire directement dans le dossier de destination et fusionner").check();
  assert.equal(await page.getByLabel("Nom", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /budget-2026 \(1\).csv/ }).waitFor();
  assert.equal(await readFile(path.join(fixture, "Exports", "budget-2026 (1).csv"), "utf8"), await readFile(path.join(fixture, "Exports", "budget-2026.csv"), "utf8"));
  await new Promise((resolve, reject) => {
    const engine = spawn(path.join(root, "native/tools/7z.exe"), ["a", "-t7z", path.join(fixture, "Exports", "engine.7z"), "budget-2026.csv"], {
      cwd: path.join(fixture, "Exports"), windowsHide: true, stdio: "ignore",
    });
    engine.on("error", reject);
    engine.on("exit", (code) => code === 0 ? resolve() : reject(new Error("7z fixture creation failed")));
  });
  await page.getByRole("option", { name: /engine.7z/ }).waitFor();
  await page.getByRole("option", { name: /engine.7z/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Extraire une archive…", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /engine-extrait/ }).waitFor();
  assert.equal(await readFile(path.join(fixture, "Exports", "engine-extrait", "budget-2026.csv"), "utf8"), await readFile(path.join(fixture, "Exports", "budget-2026.csv"), "utf8"));
  await writeFile(path.join(fixture, "Exports", "reference.rar"), await readFile(path.join(root, "native/testdata/rar5/compressed.rar")));
  await page.getByRole("option", { name: /reference.rar/ }).waitFor();
  await page.getByRole("option", { name: /reference.rar/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Extraire une archive…", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.getByRole("option", { name: /reference-extrait/ }).waitFor();
  const rar5Data = await readFile(path.join(fixture, "Exports", "reference-extrait", "test.bin"));
  assert.equal(rar5Data.length, 1200);
  for (let i = 0; i < 300; i++) { const k = i + 1; assert.equal(rar5Data.readUInt32LE(i * 4), Math.max(0, k * k - 3 * k + 1)); }
  await page.getByTitle("Fermer l’activité", { exact: true }).click();
  await page.getByTitle("Dossier parent", { exact: true }).click();
  await page.getByRole("option", { name: /README.md/ }).waitFor();
  await chooseFileOption(page, "Affichage des fichiers", "large-icons");
  await page.getByRole("option", { name: "README.md", exact: true }).scrollIntoViewIfNeeded();
  await page.getByText("Projet Atlas", { exact: false }).first().waitFor();
  await page.screenshot({
    path: "test-results/explorer-grid.png",
    fullPage: true,
  });
  await mkdir(path.join(fixture, "Documents", "Contrats"));
  await writeFile(path.join(fixture, "panel-image.png"), await readFile("public/icon128.png"));
  await writeFile(path.join(fixture, "panel-A.txt"), "A".repeat(100));
  await writeFile(path.join(fixture, "panel-B.txt"), "B");
  await writeFile(path.join(fixture, "panel-note.docx"), "Office document fixture");
  await mkdir(path.join(fixture, ".hidden-folder"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem("nextexplorer:tabs:panel"));
  await page.goto(url + "?panel=1");
  const filesTab = page.getByRole("tab", { name: "Fichiers", exact: true });
  await filesTab.waitFor();
  assert.equal(await filesTab.getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".pane").count(), 0);
  assert.equal(await page.locator('.companion-files input[type="checkbox"]').count(), 0);
  assert.equal(await page.getByLabel("Afficher les fichiers cachés", { exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).waitFor();
  const panelView = page.getByRole("button", { name: "Affichage des fichiers", exact: true });
  assert.equal(await panelView.getAttribute("data-value"), "tiles");
  for (const width of [390, 1024]) {
  await page.setViewportSize({ width, height: 844 });
  for (const mode of viewModes) {
    await chooseFileOption(page, "Affichage des fichiers", mode);
    await page.locator(`.companion-files[data-view="${mode}"]`).waitFor();
    await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).count(), 1);
    assert.ok(await page.locator(".companion-scroll").evaluate((scroll) => scroll.scrollWidth <= scroll.clientWidth));
    await page.screenshot({ path: `test-results/panel-view-${mode}-${width}.png`, animations: "disabled" });
  }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:panel")).tabs[0].panes[0].viewMode === "content");
  await page.reload();
  await panelView.waitFor();
  assert.equal(await panelView.getAttribute("data-value"), "content");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nextexplorer:tabs:page")).tabs[0].panes[0].viewMode), "large-icons");
  await chooseFileOption(page, "Affichage des fichiers", "large-icons");
  await page.locator(".companion-entry-name").filter({ hasText: "panel-image.png" }).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll(".companion-entry-name")].find((button) => button.textContent.includes("panel-image.png"))?.querySelector("img")?.naturalWidth > 0);
  await chooseFileOption(page, "Affichage des fichiers", "tiles");
  console.log("Panneau : huit affichages, miniature visible et préférence indépendante conservée après rechargement : OK");
  const folderTrigger = page.getByRole("button", { name: "Changer de dossier", exact: true });
  const folderPicker = page.getByRole("dialog", { name: "Choisir un dossier", exact: true });
  await folderTrigger.click();
  assert.equal(await folderPicker.getByRole("button", { name: "Dossier précédent", exact: true }).isDisabled(), true);
  await folderPicker.getByRole("button", { name: "Documents", exact: true }).click();
  await folderPicker.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).click();
  const pickerPath = folderPicker.getByRole("navigation", { name: "Chemin du dossier", exact: true });
  await pickerPath.getByRole("button", { name: "Documents", exact: true }).click();
  await folderPicker.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).waitFor();
  await folderPicker.getByRole("button", { name: "Dossier précédent", exact: true }).click();
  await folderPicker.getByText("Aucun sous-dossier. Vous pouvez choisir ce dossier.", { exact: true }).waitFor();
  await folderPicker.press("Alt+ArrowLeft");
  await folderPicker.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).waitFor();
  await folderPicker.getByRole("button", { name: "Choisir ce dossier", exact: true }).waitFor();
  await folderTrigger.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "attached" });
  await folderPicker.press("Escape");
  await folderPicker.waitFor({ state: "hidden" });
  assert.equal(await folderTrigger.evaluate((button) => button === document.activeElement), true);
  await folderTrigger.click();
  assert.equal(await folderPicker.getByRole("textbox", { name: "Chemin du dossier", exact: true }).isVisible(), false);
  await folderPicker.locator("summary").filter({ hasText: "Saisir un chemin" }).click();
  await folderPicker.getByRole("textbox", { name: "Chemin du dossier", exact: true }).fill(path.join(fixture, "absent-picker"));
  await folderPicker.getByRole("button", { name: "Ouvrir ce dossier", exact: true }).click();
  await folderPicker.getByRole("alert").waitFor();
  assert.equal(await folderPicker.getByRole("button", { name: "Choisir ce dossier", exact: true }).isDisabled(), true);
  await folderPicker.getByRole("button", { name: "Documents", exact: true }).click();
  await folderPicker.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).waitFor();
  await folderPicker.getByRole("button", { name: "Choisir ce dossier", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter document.txt à la collecte", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).click();
  await page.getByText("Ce dossier est vide.", { exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Chemin du dossier", exact: true }).getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter document.txt à la collecte", exact: true }).waitFor();
  await page.getByRole("button", { name: "Dossier précédent", exact: true }).click();
  await page.getByText("Ce dossier est vide.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dossier précédent", exact: true }).press("Alt+ArrowLeft");
  await page.getByRole("button", { name: "Ajouter document.txt à la collecte", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ouvrir le dossier Contrats", exact: true }).click();
  await page.getByText("Ce dossier est vide.", { exact: true }).waitFor();
  await page.getByTitle("Dossier parent", { exact: true }).click();
  await page.getByRole("button", { name: "Ajouter document.txt à la collecte", exact: true }).waitFor();
  await page.getByTitle("Dossier parent", { exact: true }).click();
  await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).waitFor();
  await page.getByRole("button", { name: /Voir les \d+ autres dossiers/ }).click();
  await page.getByRole("button", { name: "Ouvrir le dossier Sources", exact: true }).waitFor();
  await page.getByRole("button", { name: "Réduire les dossiers", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Ouvrir le dossier Sources", exact: true }).isVisible(), false);
  console.log("Panneau : choix visuel du dossier, sous-dossiers, annulation et focus, chemin invalide et groupes distincts : OK");
  const mainPath = page.getByRole("navigation", { name: "Chemin du dossier", exact: true });
  const fileSearch = page.getByRole("searchbox", { name: "Filtrer les fichiers", exact: true });
  const filters = page.locator(".companion-filters");
  await filters.locator("summary").click();
  await page.getByLabel("Type de fichier", { exact: true }).selectOption("image");
  await page.getByRole("button", { name: "Ajouter panel-image.png à la collecte", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Ouvrir le dossier Documents", exact: true }).isVisible(), true);
  await fileSearch.fill("panel-A");
  await page.getByText("Aucun fichier ne correspond aux filtres.", { exact: true }).waitFor();
  await mainPath.locator('[aria-current="location"]').click();
  assert.equal(await fileSearch.inputValue(), "panel-A");
  await page.getByLabel("Type de fichier", { exact: true }).selectOption("documents");
  await page.getByRole("button", { name: "Ajouter panel-A.txt à la collecte", exact: true }).waitFor();
  await fileSearch.fill("panel-");
  await page.getByRole("button", { name: "Ajouter panel-note.docx à la collecte", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ajouter panel-image.png à la collecte", exact: true }).count(), 0);
  await fileSearch.fill("panel-A.txt");
  await page.getByRole("button", { name: "Ajouter panel-B.txt à la collecte", exact: true }).waitFor({ state: "hidden" });
  await fileSearch.fill("panel-");
  await page.getByRole("button", { name: "Ajouter panel-B.txt à la collecte", exact: true }).waitFor();
  await chooseFileOption(page, "Trier les fichiers", "size:asc");
  await page.waitForFunction(() => document.querySelector(".companion-entry-name")?.getAttribute("title")?.endsWith("panel-B.txt"));
  await chooseFileOption(page, "Trier les fichiers", "size:desc");
  await page.waitForFunction(() => document.querySelector(".companion-entry-name")?.getAttribute("title")?.endsWith("panel-A.txt"));
  await page.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ajouter .hidden à la collecte", exact: true }).count(), 0);
  await page.getByLabel("Afficher les fichiers cachés", { exact: true }).check();
  await page.getByRole("button", { name: "Ajouter .hidden à la collecte", exact: true }).waitFor();
  await folderTrigger.click();
  await folderPicker.getByRole("button", { name: "Ouvrir le dossier .hidden-folder", exact: true }).waitFor();
  await folderPicker.getByRole("button", { name: "Annuler", exact: true }).click();
  await filters.locator("summary").click();
  await page.getByLabel("1 filtre(s) actif(s)", { exact: true }).waitFor();
  await filters.locator("summary").click();
  await page.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
  assert.equal(await page.getByLabel("Type de fichier", { exact: true }).inputValue(), "all");
  assert.equal(await page.getByRole("button", { name: "Trier les fichiers", exact: true }).getAttribute("data-value"), "name:asc");
  assert.equal(await fileSearch.inputValue(), "");
  assert.equal(await page.getByLabel("Afficher les fichiers cachés", { exact: true }).isChecked(), false);
  await page.getByRole("button", { name: "Ajouter .hidden à la collecte", exact: true }).waitFor({ state: "hidden" });
  await filters.locator("summary").click();
  console.log("Panneau : historique, Alt + gauche, chemin cliquable, type, tri par taille, fichiers cachés et réinitialisation : OK");
  await filesTab.focus();
  await filesTab.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "Page", exact: true }).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await filesTab.getAttribute("aria-selected"), "true");
  for (const width of [320, 390, 520, 760, 1024, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(() => {
      const scroll = document.querySelector(".companion-scroll");
      return scroll.scrollWidth <= scroll.clientWidth;
    }));
    await page.waitForFunction(() => {
      const node = document.querySelector(".companion-folder-path");
      const current = node.querySelector('[aria-current="location"]').getBoundingClientRect();
      const nav = node.getBoundingClientRect();
      return node.scrollWidth <= node.clientWidth && current.top >= nav.top - 1 && current.bottom <= nav.bottom + 1;
    });
    await page.screenshot({ path: `test-results/companion-files-${width}.png`, animations: "disabled" });
    const columns = await page.locator(".companion-document-group .companion-entry").evaluateAll((entries) => new Set(entries.map((entry) => Math.round(entry.getBoundingClientRect().left))).size);
    assert.equal(columns >= 2, width >= 760, `Colonnes des fichiers à ${width} px`);
    assert.ok(await page.locator(".companion-folder-tiles button").evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth)));
    await filters.locator("summary").click();
    assert.ok(await filters.evaluate((node) => node.scrollWidth <= node.clientWidth));
    await page.screenshot({ path: `test-results/companion-filters-${width}.png`, animations: "disabled" });
    await filters.locator("summary").click();
    await folderTrigger.click();
    const folderSearch = folderPicker.getByLabel("Rechercher un sous-dossier", { exact: true });
    await folderSearch.fill("Doc");
    await folderPicker.getByRole("button", { name: "Ouvrir le dossier Documents", exact: true }).waitFor();
    assert.equal(await folderPicker.getByRole("button", { name: "Ouvrir le dossier Design", exact: true }).isVisible(), false);
    await folderSearch.fill("");
    await folderPicker.getByRole("button", { name: "Ouvrir le dossier Design", exact: true }).waitFor();
    assert.ok(await folderPicker.evaluate((dialog) => dialog.matches(":modal") && dialog.scrollWidth <= dialog.clientWidth));
    const pickerWidth = await folderPicker.evaluate((dialog) => dialog.getBoundingClientRect().width);
    assert.ok(pickerWidth >= Math.min(width - 26, 958) && pickerWidth <= Math.min(width - 24, 960), `Largeur du sélecteur : ${pickerWidth} pour ${width} px`);
    assert.ok(await folderPicker.locator(".companion-picker-body").evaluate((body) => body.scrollWidth <= body.clientWidth));
    const folderColumns = await folderPicker.locator(".companion-picker-folders > button").evaluateAll((buttons) => new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().left))).size);
    assert.equal(folderColumns >= 2, width >= 760, `Colonnes du sélecteur à ${width} px`);
    assert.ok(await pickerPath.evaluate((node) => {
      const current = node.querySelector('[aria-current="location"]').getBoundingClientRect();
      const nav = node.getBoundingClientRect();
      return node.scrollWidth <= node.clientWidth && current.top >= nav.top - 1 && current.bottom <= nav.bottom + 1;
    }));
    await page.screenshot({ path: `test-results/companion-folder-picker-${width}.png`, animations: "disabled" });
    await folderPicker.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByTitle("Options du panneau", { exact: true }).click();
    assert.ok(await page.locator(".companion-options > div").evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }));
    await page.locator(".companion-options summary").press("Escape");
    assert.equal(await page.locator(".companion-options").getAttribute("open"), null);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Page", exact: true }).click();
  await page.getByRole("heading", { name: "Projet Atlas", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Enregistrer la page en PDF…", exact: true }).isVisible(), false);
  await page.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
  await page.getByRole("button", { name: "Enregistrer la page en PDF…", exact: true }).waitFor();
  await page.locator(".companion-disclosure > summary").filter({ hasText: "Plus d’actions" }).click();
  await page.getByRole("button", { name: "Garder cette page", exact: true }).click();
  await page.getByRole("status").getByText("Page ajoutée à la collecte", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Capturer la sélection", exact: true }).click();
  try { await captureDialog.waitFor({ timeout: 5000 }); }
  catch (error) { console.error(await page.getByRole("alert").allTextContents()); throw error; }
  await captureDialog.getByRole("button", { name: "Écarter la capture", exact: true }).click();
  await captureDialog.waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "Fichiers", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).click();
  await page.getByRole("tab", { name: "Collecte", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Repérer les champs de la page", exact: true }).isVisible(), false);
  await page.locator(".companion-insert > summary").click();
  await page.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
  const fieldChoice = page.getByLabel("Champ de destination", { exact: true });
  try { await fieldChoice.waitFor({ timeout: 5000 }); }
  catch (error) { console.error(await page.getByRole("alert").allTextContents()); await page.screenshot({ path: "test-results/companion-failure.png", fullPage: true }); throw error; }
  await fieldChoice.selectOption("1");
  await page.evaluate(() => { document.getElementById("test-web-form").contentDocument.getElementById("attachments").accept = "image/*"; });
  await page.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
  await fieldChoice.selectOption("1");
  await page.locator(".companion-insert").getByText(/format non reconnu parmi/).waitFor();
  assert.equal(await page.getByRole("button", { name: /Insérer \d+ fichier/ }).isDisabled(), true);
  const preflightReads = reads.length;
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator(".companion-insert").evaluate(node => node.scrollWidth <= node.clientWidth));
  }
  assert.equal(reads.length, preflightReads);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".companion-insert").getByText(/format non reconnu parmi/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/upload-preflight.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => { document.getElementById("test-web-form").contentDocument.getElementById("attachments").accept = ""; });
  await page.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
  await fieldChoice.selectOption("1");
  await page.getByRole("button", { name: /Insérer \d+ fichier/ }).click();
  await page.getByText("Fichiers insérés dans le champ choisi. Vérifiez le formulaire avant de le valider.", { exact: true }).waitFor();
  const inserted = await page.evaluate(() => {
    const doc = document.getElementById("test-web-form").contentDocument;
    return { proof: doc.getElementById("proof").files.length, attachments: [...doc.getElementById("attachments").files].map((file) => file.name), markdownType: [...doc.getElementById("attachments").files].find(file => file.name === "README.md")?.type };
  });
  assert.equal(inserted.proof, 0);
  assert.ok(inserted.attachments.includes("README.md"));
  assert.equal(inserted.markdownType, "text/markdown");
  const beforeChangedField = reads.length;
  await page.evaluate(() => { document.getElementById("test-web-form").contentDocument.getElementById("attachments").name = "changed-field"; });
  await page.getByRole("button", { name: /Insérer \d+ fichier/ }).click();
  await page.getByRole("alert").getByText("Le formulaire a changé. Analysez à nouveau ses champs.", { exact: true }).waitFor();
  assert.equal(reads.length, beforeChangedField);
  await page.evaluate(() => {
    const input = document.getElementById("test-web-form").contentDocument.getElementById("attachments");
    input.addEventListener("change", () => window.__uploadChanges = (window.__uploadChanges || 0) + 1);
  });
  await page.getByRole("button", { name: "Repérer les champs de la page", exact: true }).click();
  await fieldChoice.selectOption("1");
  await page.evaluate(() => {
    const input = document.getElementById("test-web-form").contentDocument.getElementById("attachments");
    const original = chrome.scripting.executeScript;
    chrome.scripting.executeScript = async options => {
      const result = await original(options);
      if (options.args?.[0] === null) { input.name = "changed-after-preflight"; chrome.scripting.executeScript = original; }
      return result;
    };
  });
  await page.getByRole("button", { name: /Insérer \d+ fichier/ }).click();
  await page.getByRole("alert").getByText("Le formulaire a changé. Analysez à nouveau ses champs.", { exact: true }).waitFor();
  assert.ok(reads.length > beforeChangedField);
  assert.equal(await page.evaluate(() => window.__uploadChanges || 0), 0);
  assert.deepEqual(await page.evaluate(() => [...document.getElementById("test-web-form").contentDocument.getElementById("attachments").files].map(file => file.name)), inserted.attachments);
  await page.evaluate(() => window.__changeTestPage({ url: "https://example.org/next", title: "Nouvelle page" }));
  await page.locator(".companion-insert").getByText("Nouvelle page", { exact: true }).waitFor();
  await fieldChoice.waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "Fichiers", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Ajouter README.md à la collecte", exact: true }).isDisabled(), true);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/explorer-sidepanel.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Page", exact: true }).click();
  assert.equal(await page.locator(".companion-scroll").evaluate((scroll) => scroll.scrollTop), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "test-results/explorer-tabs-sidepanel.png", fullPage: true, animations: "disabled" });
  await page.getByTitle("Ouvrir en pleine page", { exact: true }).click();
  const fullPage = await page.evaluate(() => ({ opened: window.__openedFull, closed: window.__closedPanel }));
  assert.equal(new URL(fullPage.opened.url).searchParams.get("path"), fixture);
  assert.equal(fullPage.closed.windowId, 11);
  const openedView = await page.context().newPage();
  await openedView.goto(url + `?path=${encodeURIComponent(path.join(fixture, "Exports"))}`);
  await openedView.getByRole("heading", { name: "Exports", exact: true }).waitFor();
  await openedView.close();
  await page.getByTitle("Options du panneau", { exact: true }).click();
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await page.screenshot({
    path: "test-results/explorer-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/explorer-material-light.png", fullPage: true, animations: "disabled" });
  const auditSource = path.join(fixture, "journal-source.txt");
  await writeFile(auditSource, "journal proof");
  const transfer = await rpc({ id: "journal-transfer", action: "FS_TRANSFER", payload: {
    paths: [auditSource], destination: path.join(fixture, "Exports"), mode: "copy", conflict: "skip",
  } });
  assert.equal(transfer.status, "SUCCESS");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Activité", exact: false }).first().click();
  const journalEntry = page.locator("article.job").filter({ hasText: auditSource });
  await journalEntry.getByText("1 copié(s), 0 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
  await journalEntry.locator("summary").click();
  await page.getByText(auditSource, { exact: false }).first().waitFor();
  const journal = await rpc({ id: "journal-read", action: "OPERATION_JOURNAL", payload: {} });
  assert.equal(journal.status, "SUCCESS");
  assert.ok(journal.data.some((j) => j.id === transfer.data.jobId && j.audit.copied === 1));
  await page.screenshot({ path: "test-results/operation-journal.png", fullPage: true });
  await journalEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByRole("button", { name: "Annuler cette copie", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/undo-copy.png", fullPage: true });
  await page.getByRole("button", { name: "Annuler cette copie", exact: true }).click();
  await page.getByText("Copie annulée : 1 élément(s) placé(s) dans la corbeille", { exact: true }).waitFor();
  assert.equal(await readFile(auditSource, "utf8"), "journal proof");
  await assert.rejects(stat(path.join(fixture, "Exports", "journal-source.txt")), { code: "ENOENT" });
  await journalEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByText("Cette opération a déjà été annulée.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Retour à l’activité", exact: true }).click();
  const recoveryDir = path.join(nativeConfig, "NextExplorer", "journal", "transactions", transfer.data.jobId, "undo");
  const confirmedStep = await readFile(path.join(recoveryDir, "00000001-result.json"), "utf8");
  await unlink(path.join(recoveryDir, "00000000-end.json"));
  await journalEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByRole("button", { name: "Terminer l’annulation", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/undo-recovery.png", fullPage: true });
  await page.getByRole("button", { name: "Terminer l’annulation", exact: true }).click();
  await page.getByText("Annulation récupérée : étapes restantes terminées.", { exact: true }).waitFor();
  assert.equal(await readFile(path.join(recoveryDir, "00000001-result.json"), "utf8"), confirmedStep);
  assert.equal((await rpc({ id: "recovered-check", action: "TRANSFER_UNDO_CHECK", payload: { jobId: transfer.data.jobId } })).data.undone, true);
  // The mutation succeeded but its result was lost: preserve the original
  // intent, add separate recovery evidence only after the user's confirmation.
  await unlink(path.join(recoveryDir, "00000000-end.json"));
  await unlink(path.join(recoveryDir, "00000001-result.json"));
  await journalEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByText("1 résultat(s) manquant(s)", { exact: false }).waitFor();
  await assert.rejects(stat(path.join(recoveryDir, "00000001-reconciled.json")), { code: "ENOENT" });
  await page.screenshot({ path: "test-results/undo-reconciliation.png", fullPage: true });
  await page.getByRole("button", { name: "Terminer l’annulation", exact: true }).click();
  await page.getByRole("dialog", { name: "Récupérer une annulation", exact: true }).waitFor({ state: "hidden" });
  const reconciled = JSON.parse(await readFile(path.join(recoveryDir, "00000001-reconciled.json"), "utf8"));
  assert.equal(reconciled.phase, "reconciled");
  assert.equal(reconciled.destination, JSON.parse(confirmedStep).destination);
  assert.equal(await readFile(auditSource, "utf8"), "journal proof");
  await assert.rejects(stat(path.join(recoveryDir, "00000001-result.json")), { code: "ENOENT" });
  const treeSource = path.join(fixture, "journal-folder");
  await mkdir(path.join(treeSource, "empty"), { recursive: true });
  await writeFile(path.join(treeSource, "proof.txt"), "directory undo proof");
  const treeTransfer = await rpc({ id: "tree-transfer", action: "FS_TRANSFER", payload: {
    paths: [treeSource], destination: path.join(fixture, "Exports"), mode: "copy", conflict: "rename",
  } });
  assert.equal(treeTransfer.status, "SUCCESS");
  const treeEntry = page.locator("article.job").filter({ hasText: treeSource });
  await treeEntry.getByText("1 copié(s), 0 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
  await treeEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByRole("button", { name: "Annuler cette copie", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/undo-directory.png", fullPage: true });
  await page.getByRole("button", { name: "Annuler cette copie", exact: true }).click();
  await page.getByRole("dialog", { name: "Annuler une copie", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await readFile(path.join(treeSource, "proof.txt"), "utf8"), "directory undo proof");
  await assert.rejects(stat(path.join(fixture, "Exports", "journal-folder")), { code: "ENOENT" });
  const moveSource = path.join(fixture, "journal-move");
  await mkdir(path.join(moveSource, "empty"), { recursive: true });
  await writeFile(path.join(moveSource, "proof.txt"), "move undo proof");
  const moveTransfer = await rpc({ id: "move-transfer", action: "FS_TRANSFER", payload: {
    paths: [moveSource], destination: path.join(fixture, "Exports"), mode: "move", conflict: "rename",
  } });
  assert.equal(moveTransfer.status, "SUCCESS");
  const moveEntry = page.locator("article.job").filter({ hasText: moveSource });
  await moveEntry.getByText("0 copié(s), 1 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
  await assert.rejects(stat(moveSource), { code: "ENOENT" });
  await moveEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByRole("button", { name: "Annuler ce déplacement", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/undo-move.png", fullPage: true });
  await page.getByRole("button", { name: "Annuler ce déplacement", exact: true }).click();
  await page.getByRole("dialog", { name: "Annuler un déplacement", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await readFile(path.join(moveSource, "proof.txt"), "utf8"), "move undo proof");
  assert.ok((await stat(path.join(moveSource, "empty"))).isDirectory());
  await assert.rejects(stat(path.join(fixture, "Exports", "journal-move")), { code: "ENOENT" });
  const replaceSource = path.join(fixture, "journal-replace.txt");
  const replaceTarget = path.join(fixture, "Exports", "journal-replace.txt");
  await writeFile(replaceSource, "new version");
  await writeFile(replaceTarget, "old version");
  const replaceTransfer = await rpc({ id: "replace-transfer", action: "FS_TRANSFER", payload: {
    paths: [replaceSource], destination: path.join(fixture, "Exports"), mode: "copy", conflict: "overwrite",
  } });
  assert.equal(replaceTransfer.status, "SUCCESS");
  const replaceEntry = page.locator("article.job").filter({ hasText: replaceSource });
  await replaceEntry.getByText("1 copié(s), 0 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
  assert.equal(await readFile(replaceTarget, "utf8"), "new version");
  await replaceEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByText("1 ancien(s) fichier(s) remplacé(s) seront ensuite restaurés depuis la corbeille. Les nouvelles versions seront conservées.", { exact: true }).waitFor();
  await page.screenshot({ path: "test-results/undo-replacement.png", fullPage: true });
  await page.getByRole("button", { name: "Annuler cette copie", exact: true }).click();
  await page.getByRole("dialog", { name: "Annuler une copie", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await readFile(replaceTarget, "utf8"), "old version");
  assert.equal(await readFile(replaceSource, "utf8"), "new version");
  const mergeSource = path.join(fixture, "journal-merge");
  const mergeTarget = path.join(fixture, "Exports", "journal-merge");
  await mkdir(mergeSource); await mkdir(mergeTarget);
  await writeFile(path.join(mergeSource, "proof.txt"), "merge proof");
  await writeFile(path.join(mergeTarget, "existing.txt"), "keep existing");
  const mergeTransfer = await rpc({ id: "merge-undo-transfer", action: "FS_TRANSFER", payload: {
    paths: [mergeSource], destination: path.join(fixture, "Exports"), mode: "move", conflict: "skip", merge: true,
  } });
  assert.equal(mergeTransfer.status, "SUCCESS");
  const mergeEntry = page.locator("article.job").filter({ hasText: mergeSource });
  await mergeEntry.getByText("0 copié(s), 1 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
  await assert.rejects(stat(mergeSource), { code: "ENOENT" });
  await mergeEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
  await page.getByText(/1 dossier\(s\) source\(s\) supprimé\(s\) lors de la fusion seront recréés/).waitFor();
  await page.screenshot({ path: "test-results/undo-merge.png", fullPage: true });
  await page.getByRole("button", { name: "Annuler ce déplacement", exact: true }).click();
  await page.getByRole("dialog", { name: "Annuler un déplacement", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await readFile(path.join(mergeSource, "proof.txt"), "utf8"), "merge proof");
  assert.equal(await readFile(path.join(mergeTarget, "existing.txt"), "utf8"), "keep existing");
  await assert.rejects(stat(path.join(mergeTarget, "proof.txt")), { code: "ENOENT" });
  if (path.parse(tmpdir()).root.toLowerCase() !== path.parse(fixture).root.toLowerCase()) {
    const volumeFixture = await mkdtemp(path.join(tmpdir(), "nextexplorer-undo-"));
    const volumeSource = path.join(volumeFixture, "journal-volumes.txt");
    const volumeTarget = path.join(fixture, "Exports", "journal-volumes.txt");
    await writeFile(volumeSource, "cross-volume browser proof");
    const volumeTransfer = await rpc({ id: "volume-undo-transfer", action: "FS_TRANSFER", payload: {
      paths: [volumeSource], destination: path.join(fixture, "Exports"), mode: "move", conflict: "rename",
    } });
    assert.equal(volumeTransfer.status, "SUCCESS");
    const volumeEntry = page.locator("article.job").filter({ hasText: volumeSource });
    await volumeEntry.getByText("0 copié(s), 1 déplacé(s), 0 ignoré(s)", { exact: true }).waitFor();
    await volumeEntry.getByRole("button", { name: "Vérifier l’annulation", exact: true }).click();
    await page.getByRole("button", { name: "Annuler ce déplacement", exact: true }).waitFor();
    await page.screenshot({ path: "test-results/undo-volumes.png", fullPage: true });
    await page.getByRole("button", { name: "Annuler ce déplacement", exact: true }).click();
    await page.getByRole("dialog", { name: "Annuler un déplacement", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await readFile(volumeSource, "utf8"), "cross-volume browser proof");
    await assert.rejects(stat(volumeTarget), { code: "ENOENT" });
    const trash = path.join(fixture, "Exports", ".nextexplorer-trash");
    const saved = (await readdir(trash)).find((name) => name.endsWith("-journal-volumes.txt"));
    assert.ok(saved);
    assert.equal(await readFile(path.join(trash, saved), "utf8"), "cross-volume browser proof");
    console.log("Browser: annulation réelle entre volumes et copie de sécurité vérifiées");
  }
  await runFileGroupJourney({ context, baseURL: url, fixture });
  const offline = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await offline.goto(url);
  await offline
    .getByRole("button", { name: "Vérifier la connexion", exact: true })
    .waitFor();
  await offline.screenshot({
    path: "test-results/explorer-setup.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser: navigation, aperçu, création, renommage, collecte, corbeille, restauration, filtre, palette, double panneau, watcher, thèmes, compagnon 390 px, capture, choix du champ, insertion, invalidation de destination, ouverture en pleine page, extraction ZIP/7z/RAR5 et journal de transfert : OK",
  );
  }
} finally {
  if (browser) await browser.close();
  await server.close();
  host.stdin.end();
  host.kill();
  if (testWorker.data?.tasks === path.join(nativeConfig,"NextExplorer","worker","tasks")) {
    try { process.kill(testWorker.data.pid); } catch {}
  }
  for (const p of pending.values()) clearTimeout(p.timer);
}
