import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("nativeMessaging"));
assert.equal(manifest.background.service_worker, "background.js");
for (const file of [
  "dist/index.html",
  "dist/background.js",
  "dist/collect-background.js",
  "dist/download-background.js",
  "release/NextExplorer/dist/download-background.js",
  "dist/icon16.png",
  "dist/icon48.png",
  "dist/icon128.png",
  "native/native-host.exe",
  "release/NextExplorer/scripts/install-host.ps1",
  "release/NextExplorer/scripts/host-installation.ps1",
  "release/NextExplorer/scripts/diagnose-host.ps1",
  "release/NextExplorer/scripts/host-diagnostics.ps1",
  "release/NextExplorer/scripts/repair-host.ps1",
  "release/NextExplorer/scripts/host-repair.ps1",
  "release/NextExplorer/scripts/setup-host.ps1",
  "release/NextExplorer/scripts/setup-workflow.ps1",
  "release/NextExplorer/scripts/setup-7zip.ps1",
  "release/NextExplorer/scripts/drag-test-site.mjs",
  "release/NextExplorer/GLISSER_DEPOSER_WEB.md",
  "release/NextExplorer/README.md",
  "release/NextExplorer/GUIDE_UTILISATION.md",
])
  assert.ok((await stat(file)).size > 0, file);
assert.ok((await stat("native/native-host.exe")).size < 15 * 1024 * 1024);
assert.deepEqual((await readdir("release/NextExplorer/dist/assets")).sort(), (await readdir("dist/assets")).sort());
const rejected = await new Promise((resolve) => {
  const p = spawn(
    "native/native-host.exe",
    ["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"],
    { windowsHide: true, stdio: "ignore" },
  );
  p.on("exit", resolve);
});
assert.equal(rejected, 1);
console.log(
  "Paquet : manifeste MV3, assets, compagnon < 15 Mo, installateur et rejet des origines étrangères : OK",
);
