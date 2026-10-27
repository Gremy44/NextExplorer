import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const source = await readFile("public/background.js", "utf8");
const events = {};
const calls = [];
vm.runInNewContext(
  source.slice(source.indexOf("chrome.runtime.onInstalled.addListener")),
  {
    chrome: {
      runtime: {
        onInstalled: { addListener: (callback) => (events.install = callback) },
        getURL: (path) => `chrome-extension://test/${path}`,
      },
      commands: {
        onCommand: { addListener: (callback) => (events.command = callback) },
      },
      sidePanel: {
        setPanelBehavior: (options) =>
          calls.push(["behavior", options.openPanelOnActionClick]),
        open: (options) => calls.push(["panel", options.windowId]),
      },
      tabs: { create: (options) => calls.push(["tab", options.url]) },
    },
  },
);
events.install();
events.command("open-explorer", { windowId: 12 });
events.command("open-dashboard");
events.command("unknown");
assert.deepEqual(calls, [
  ["behavior", true],
  ["panel", 12],
  ["tab", "chrome-extension://test/index.html"],
]);
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
assert.equal(manifest.side_panel.default_path, "index.html?panel=1");
assert.equal(manifest.web_accessible_resources, undefined);
console.log(
  "Panel entry: native toolbar behavior, keyboard shortcuts and isolated UI: OK",
);

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
await mkdir("test-results", { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/native-panel-"));
const extension = path.resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
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
  assert.equal(
    await worker.evaluate(async () => {
      const behavior = await chrome.sidePanel.getPanelBehavior();
      return behavior.openPanelOnActionClick;
    }),
    true,
  );
  console.log(
    "Chromium: packaged extension loads with native toolbar action enabled: OK",
  );
} finally {
  await context.close();
}
