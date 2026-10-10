// Isolated API experiment: real pointer drag, generated File, cross-origin drop.
// This does not add a feature or change the production extension's permissions.
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
await mkdir("test-results", { recursive: true });
const extension = await mkdtemp(path.resolve("test-results/drag-probe-extension-"));
const profile = await mkdtemp(path.resolve("test-results/drag-probe-profile-"));
const site = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<div id="target" style="height:250px;background:#cdf">Déposer ici</div><script>
    window.events = [];
    target.ondragover = event => { window.events.push({type:event.type, types:[...event.dataTransfer.types]}); event.preventDefault(); };
    target.ondrop = async event => {
      event.preventDefault();
      const files = [...event.dataTransfer.files];
      window.result = { trusted: event.isTrusted, types: [...event.dataTransfer.types], count: files.length,
        files: await Promise.all(files.map(async file => ({ name: file.name, size: file.size, text: await file.text() }))) };
    };
  </script>`);
});
await new Promise(resolve => site.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${site.address().port}`;
await writeFile(path.join(extension, "manifest.json"), JSON.stringify({
  manifest_version: 3, name: "File drag API probe", version: "1.0",
  background: { service_worker: "worker.js" },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-src http://127.0.0.1:*" },
}));
await writeFile(path.join(extension, "worker.js"), "chrome.runtime.onInstalled.addListener(() => {});");
await writeFile(path.join(extension, "index.html"), `<div id="source" draggable="true" style="width:200px;height:100px;background:#fdc">Fichier préparé</div><div id="local" style="width:200px;height:100px;background:#dfc">Contrôle local</div><iframe src="${url}" style="width:500px;height:300px;margin-top:40px"></iframe><script src="probe.js"></script>`);
await writeFile(path.join(extension, "probe.js"), `const file = new File(["Contenu de recette"], "probe.txt", {type:"text/plain"});
source.ondragstart = event => { event.dataTransfer.items.add(file); event.dataTransfer.setData("text/plain", "Contrôle texte"); event.dataTransfer.effectAllowed = "copy"; window.started = { count:event.dataTransfer.files.length, trusted:event.isTrusted }; };
local.ondragover = event => event.preventDefault();
local.ondrop = event => { event.preventDefault(); window.localResult = {count:event.dataTransfer.files.length, types:[...event.dataTransfer.types], trusted:event.isTrusted}; };`);
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html`);
  const target = page.frameLocator("iframe").locator("#target");
  await target.waitFor();
  const from = await page.locator("#source").boundingBox();
  const to = await target.boundingBox();
  const control = await page.locator("#local").boundingBox();
  await page.mouse.move(from.x + 40, from.y + 40);
  await page.mouse.down();
  await page.mouse.move(control.x + 80, control.y + 60, { steps: 20 });
  await page.mouse.move(control.x + 85, control.y + 65);
  await page.mouse.up();
  await page.mouse.move(from.x + 40, from.y + 40);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 5 });
  await page.mouse.move(to.x + 80, to.y + 80, { steps: 20 });
  await page.mouse.move(to.x + 85, to.y + 85);
  await page.mouse.up();
  const frame = page.frames().find(frame => frame.url().startsWith(url));
  await frame.waitForFunction(() => window.result, undefined, { timeout: 5000 }).catch(() => {});
  const result = { browser: context.browser()?.version(), source: await page.evaluate(() => window.started), local: await page.evaluate(() => window.localResult || null), drop: await frame.evaluate(() => window.result || null), events: await frame.evaluate(() => window.events), scope: "Extension page to cross-origin iframe; actual side panel and arbitrary sites remain untested" };
  await writeFile("test-results/file-drag-probe.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  site.closeAllConnections();
  await new Promise(resolve => site.close(resolve));
}
