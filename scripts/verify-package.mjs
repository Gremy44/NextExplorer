import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  extensionIdFromKey,
  readExtensionIdentity,
} from "./extension-identity.mjs";
const extensionId = readExtensionIdentity();
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(
  extensionIdFromKey(manifest.key),
  extensionId,
  "Build extension identity",
);
assert.equal(
  (await readFile("release/NextExplorer/extension-id.txt", "utf8")).trim(),
  extensionId,
);
assert.equal(
  extensionIdFromKey(
    JSON.parse(
      await readFile("release/NextExplorer/dist/manifest.json", "utf8"),
    ).key,
  ),
  extensionId,
);
assert.deepEqual(
  JSON.parse(await readFile("native/com.local.file_explorer.json", "utf8"))
    .allowed_origins,
  [`chrome-extension://${extensionId}/`],
);
assert.equal(manifest.manifest_version, 3);
assert.equal(
  manifest.version,
  JSON.parse(await readFile("package.json", "utf8")).version,
);
assert.ok(manifest.permissions.includes("nativeMessaging"));
assert.equal(manifest.background.service_worker, "background.js");
assert.equal(
  manifest.web_accessible_resources,
  undefined,
  "UI must stay private to the extension",
);
for (const file of [
  "dist/index.html",
  "dist/background.js",
  "dist/collect-background.js",
  "dist/download-background.js",
  "dist/organization-background.js",
  "dist/mcp-background.js",
  "release/NextExplorer/dist/mcp-background.js",
  "release/NextExplorer/MCP.md",
  "release/NextExplorer/dist/organization-background.js",
  "release/NextExplorer/dist/download-background.js",
  "dist/icon16.png",
  "dist/icon48.png",
  "dist/icon128.png",
  "dist/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "dist/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "dist/licenses/pdf-lib.txt",
  "dist/licenses/pdfjs-dist.txt",
  "dist/licenses/@xterm-xterm.txt",
  "dist/licenses/@xterm-addon-fit.txt",
  "release/NextExplorer/dist/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "release/NextExplorer/dist/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "release/NextExplorer/dist/licenses/pdf-lib.txt",
  "release/NextExplorer/dist/licenses/pdfjs-dist.txt",
  "release/NextExplorer/dist/licenses/@xterm-xterm.txt",
  "release/NextExplorer/dist/licenses/@xterm-addon-fit.txt",
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
  "release/NextExplorer/REVUE_ERGONOMIE_OUTILS.md",
  "release/NextExplorer/APERCUS_100_FORMATS.md",
  "release/NextExplorer/GUIDE_UTILISATION.md",
  "release/NextExplorer/RECETTE_HYBRIDE.md",
  "release/NextExplorer/EVALUATION_CLASSEMENT.md",
  "release/NextExplorer/J4_ORGANISATION_RECHERCHE.md",
  "release/NextExplorer/C2_COPIES_IDENTIQUES.md",
  "release/NextExplorer/J5_MEDIAS_TACHES.md",
  "release/NextExplorer/AMELIORATIONS_FINDER.md",
  "release/NextExplorer/CONSOLE_INTEGREE.md",
  "release/NextExplorer/store/README.md",
  "release/NextExplorer/store/CONFIDENTIALITE.md",
])
  assert.ok((await stat(file)).size > 0, file);
assert.ok((await stat("native/native-host.exe")).size < 15 * 1024 * 1024);
assert.deepEqual(
  (await readdir("release/NextExplorer/dist/assets")).sort(),
  (await readdir("dist/assets")).sort(),
);
const fonts = JSON.parse(
  await readFile("public/fonts/provenance.json", "utf8"),
);
for (const directory of ["dist", "release/NextExplorer/dist"]) {
  assert.equal((await readdir(directory)).includes("floating-panel.js"), false);
  assert.ok(
    (await readdir(`${directory}/assets`)).every(
      (file) => !file.endsWith(".map"),
    ),
    "No debug source maps in distributable assets",
  );
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/fonts/provenance.json`, "utf8")),
    fonts,
  );
  for (const { file, sha256 } of fonts) {
    const data = await readFile(`${directory}/${file}`);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      sha256,
      `${directory}/${file}`,
    );
  }
  for (const license of [
    "dracula-palette",
    "nordtheme-palette",
    "altercation-palette",
    "Gogh-Co-palette-MIT",
    "Go-pkg-sftp",
    "Go-jlaffaye-ftp",
    "Go-kr-fs",
    "Go-x-crypto",
    "Go-x-sys",
    "Go-github.com-modelcontextprotocol-go-sdk",
    "Go-github.com-google-jsonschema-go",
    "Go-runtime",
  ])
    assert.ok((await stat(`${directory}/licenses/${license}.txt`)).size > 0);
  const nativeModules = JSON.parse(
    await readFile(`${directory}/licenses/native-modules.json`, "utf8"),
  );
  for (const module of nativeModules)
    assert.ok((await stat(`${directory}/licenses/${module.file}`)).size > 0);
}
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
