import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runConsoleJourney } from "./console-journey.mjs";
import { runStoreScreenshots } from "./store-screenshots.mjs";
import { runPresentationScreenshots } from "./presentation-screenshots.mjs";
import { runConnectionJourney } from "./connection-journey.mjs";
import { runEngineJourney } from "./engine-journey.mjs";

assert.equal(process.platform, "win32", "Recette ConPTY Windows uniquement");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
const root = await mkdtemp(path.resolve("test-results/console-extension-"));
const store = process.argv.includes("--store");
const presentation = process.argv.includes("--presentation");
const setup = process.argv.includes("--setup");
assert.ok(
  !setup || (!presentation && !store && !process.argv.includes("--installed")),
  "Setup recipe requires its isolated native registration",
);
const demo = store || presentation;
const demoRoot = demo
  ? await mkdtemp(
      path.join(process.env.PUBLIC, "Documents", "NextExplorer-Demo-"),
    )
  : root;
const fixture = path.join(demoRoot, demo ? "Projet Atlas" : "Fichiers"),
  appdata = path.join(root, "appdata"),
  extension = path.join(root, "extension");
await mkdir(fixture);
if (demo) {
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  const zip = path.resolve(
    `release/store/${version}/NextExplorer-${version}-chrome.zip`,
  );
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Expand-Archive -LiteralPath $env:NEXTEXPLORER_STORE_ZIP -DestinationPath $env:NEXTEXPLORER_TEST_EXTENSION",
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        NEXTEXPLORER_STORE_ZIP: zip,
        NEXTEXPLORER_TEST_EXTENSION: extension,
      },
    },
  );
  const testManifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  assert.equal(testManifest.key, undefined);
  // Keep the declared public identity only in this isolated unpacked copy.
  testManifest.key = JSON.parse(
    await readFile("public/manifest.json", "utf8"),
  ).key;
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(testManifest),
  );
} else await cp(path.resolve("dist"), extension, { recursive: true });
const id = (await readFile("extension-id.txt", "utf8")).trim();
const manifest = path.join(root, "com.local.file_explorer.json");
await writeFile(
  manifest,
  JSON.stringify({
    name: "com.local.file_explorer",
    description: "Console test",
    path: setup
      ? path.join(root, "not-installed.exe")
      : path.resolve("native/native-host.exe"),
    type: "stdio",
    allowed_origins: [`chrome-extension://${id}/`],
  }),
);
const registryKey =
  "HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.local.file_explorer";
const installed = process.argv.includes("--installed");
const previous = JSON.parse(
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$k='HKCU:\\Software\\Chromium\\NativeMessagingHosts\\com.local.file_explorer'; if (Test-Path -LiteralPath $k) { $v=Get-Item -LiteralPath $k; @{exists=$true;hasValue=($v.GetValueNames() -contains '');value=$v.GetValue('')} | ConvertTo-Json -Compress } else { '{\"exists\":false}' }",
    ],
    { windowsHide: true, encoding: "utf8" },
  ),
);
const reg = (args) =>
  execFileSync("reg.exe", args, { windowsHide: true, stdio: "pipe" });
if (installed)
  assert.ok(previous.hasValue, "Compagnon Chromium non enregistré");
let context, page, workerInfo;
const errors = [];
async function rpc(target, action, payload = {}) {
  return target.evaluate(
    ({ action, payload }) =>
      new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: "explorer" }),
          id = crypto.randomUUID();
        const timer = setTimeout(() => {
          port.disconnect();
          reject(new Error(`Timeout ${action}`));
        }, 15000);
        port.onMessage.addListener((message) => {
          if (message.id !== id) return;
          clearTimeout(timer);
          port.disconnect();
          message.status === "SUCCESS"
            ? resolve(message.data)
            : reject(new Error(message.error));
        });
        port.postMessage({ id, action, payload });
      }),
    { action, payload },
  );
}
try {
  // Only Chromium's registration changes during this test; Chrome's installed companion stays untouched.
  if (!installed)
    reg(["add", registryKey, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"]);
  context = await chromium.launchPersistentContext(path.join(root, "profile"), {
    channel: "chromium",
    // The setup journey needs real focus events when returning from a download.
    headless: !setup,
    viewport: { width: 1440, height: 900 },
    env: {
      ...process.env,
      APPDATA: appdata,
      AppData: appdata,
      ...(setup ? { USERPROFILE: fixture } : {}),
    },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `chrome-extension://${id}/index.html${setup ? "" : `?path=${encodeURIComponent(fixture)}`}`,
  );
  if (setup)
    await runConnectionJourney({
      page,
      context,
      fixture,
      activateCompanion: async () => {
        const data = JSON.parse(await readFile(manifest, "utf8"));
        data.path = path.resolve("native/native-host.exe");
        await writeFile(manifest, JSON.stringify(data));
      },
    });
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  workerInfo = await rpc(page, "WORKER_HELLO");
  assert.equal(
    workerInfo.tasks,
    path.join(appdata, "NextExplorer", "worker", "tasks"),
  );
  await runEngineJourney({
    page,
    tools: (await rpc(page, "HELLO", { protocolVersion: 1 })).tools,
  });
  if (store) await runStoreScreenshots({ page, context, fixture });
  if (presentation)
    await runPresentationScreenshots({ page, context, fixture });
  await runConsoleJourney({ page, fixture });

  await page
    .getByRole("button", {
      name: "Ouvrir une nouvelle session PowerShell",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "true",
  );
  const session = await page
    .locator(".console-pane")
    .getAttribute("data-session");
  const pidFile = path.join(root, "shell-pid.txt");
  const input = page.getByRole("textbox", {
    name: "Saisir une commande PowerShell",
    exact: true,
  });
  await input.pressSequentially(
    `[IO.File]::WriteAllText('${pidFile.replaceAll("'", "''")}', [string]$PID)`,
  );
  await page.keyboard.press("Enter");
  let pid;
  for (let i = 0; i < 100 && !pid; i++) {
    try {
      pid = Number(await readFile(pidFile, "utf8"));
    } catch {}
    if (!pid) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(Number.isInteger(pid) && pid > 0, "PowerShell PID missing");
  const other = await context.newPage();
  await other.goto(
    `chrome-extension://${id}/index.html?path=${encodeURIComponent(fixture)}`,
  );
  await other.getByText("Compagnon connecté", { exact: true }).waitFor();
  await assert.rejects(
    rpc(other, "TERMINAL_READ", { session, owner: "spoofed" }),
    /introuvable/,
  );
  await page.close();
  let stopped = false;
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      stopped = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(stopped, "Closing the page retained PowerShell");
  assert.deepEqual(errors, []);
  console.log(
    "Extension console : Native Messaging réel, session par vue, propriétaire imposé, fermeture de page arrêtant PowerShell : OK",
    root,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: "test-results/console-extension-failure.png" })
      .catch(() => {});
    await writeFile(
      "test-results/console-extension-failure.txt",
      await page.locator("body").innerText(),
    ).catch(() => {});
  }
  throw error;
} finally {
  if (setup && !workerInfo && page && !page.isClosed())
    workerInfo = await rpc(page, "WORKER_HELLO").catch(() => null);
  await context?.close();
  if (
    workerInfo?.tasks === path.join(appdata, "NextExplorer", "worker", "tasks")
  ) {
    try {
      process.kill(workerInfo.pid);
    } catch {}
  }
  if (!installed && previous.hasValue)
    reg([
      "add",
      registryKey,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      previous.value,
      "/f",
    ]);
  else if (!installed && previous.exists)
    reg(["delete", registryKey, "/ve", "/f"]);
  else if (!installed) reg(["delete", registryKey, "/f"]);
}
