import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
assert.match(version, /^\d+(\.\d+){0,3}$/);
const root = path.resolve(`release/distribution/${version}`);
assert.ok(
  !existsSync(path.join(root, "prepared.json")),
  "Version already prepared; preserve it and increment the version for another release",
);
await mkdir(root, { recursive: true });
const payload = path.join(
  await mkdtemp(path.join(root, "payload-")),
  "windows",
);
const website = path.join(root, "public");
await mkdir(website, { recursive: true });
const storeZip = path.resolve(
  `release/store/${version}/NextExplorer-${version}-chrome.zip`,
);
const storeRecord = JSON.parse(
  (await readFile(`release/store/${version}/release.json`, "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(digest(await readFile(storeZip)), storeRecord.sha256);
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "Expand-Archive -LiteralPath $env:NEXTEXPLORER_PUBLIC_ZIP -DestinationPath $env:NEXTEXPLORER_PUBLIC_DIST",
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NEXTEXPLORER_PUBLIC_ZIP: storeZip,
      NEXTEXPLORER_PUBLIC_DIST: path.join(payload, "dist"),
    },
  },
);
const manifestPath = path.join(payload, "dist/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.key = JSON.parse(await readFile("public/manifest.json", "utf8")).key;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await mkdir(path.join(payload, "native/security"), { recursive: true });
await mkdir(path.join(payload, "scripts"));
await mkdir(path.join(payload, "licenses"));
await cp("native/security", path.join(payload, "native/security"), {
  recursive: true,
});
await copyFile(
  "native/native-host.exe",
  path.join(payload, "native/native-host.exe"),
);
await copyFile("extension-id.txt", path.join(payload, "extension-id.txt"));
for (const name of [
  "install-host",
  "host-installation",
  "diagnose-host",
  "host-diagnostics",
  "repair-host",
  "host-repair",
  "setup-host",
  "setup-workflow",
  "setup-engines",
  "setup-7zip",
])
  await copyFile(
    `scripts/${name}.ps1`,
    path.join(payload, `scripts/${name}.ps1`),
  );
const docs = [
  "README.md",
  "FONCTIONNALITES.md",
  "INSTALLATION.md",
  "CONFIDENTIALITE.md",
  "CHANGELOG.md",
  "THIRD_PARTY.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
];
for (const name of docs) {
  await mkdir(path.dirname(path.join(website, name)), { recursive: true });
  await copyFile(`distribution/${name}`, path.join(website, name));
  if (!name.startsWith(".github"))
    await copyFile(`distribution/${name}`, path.join(payload, name));
}
await copyFile(
  "distribution/INSTALLATION.md",
  path.join(payload, "GUIDE_UTILISATION.md"),
);
for (const directory of [website, payload])
  await copyFile("LICENSE", path.join(directory, "LICENSE"));
for (const [source, target] of [
  [".tools/go/LICENSE", "go-runtime"],
  [".tools/go-mod/github.com/fsnotify/fsnotify@v1.9.0/LICENSE", "fsnotify"],
  [".tools/go-mod/lukechampine.com/blake3@v1.4.1/LICENSE", "blake3"],
  [".tools/go-mod/github.com/klauspost/cpuid/v2@v2.0.9/LICENSE", "cpuid"],
  [".tools/go-mod/golang.org/x/sys@v0.13.0/LICENSE", "x-sys"],
  [".tools/inno/license.txt", "inno-setup"],
])
  await copyFile(source, path.join(payload, `licenses/${target}.txt`));
await mkdir(path.join(website, "images"), { recursive: true });
await mkdir(path.join(payload, "images"), { recursive: true });
const images = [
  "banniere.png",
  "soutenir.png",
  "panneau-web.png",
  "explorateur-1920.png",
  "double-panneau-1920.png",
  "console-1920.png",
  "codex-1920.png",
  "espace-disque-1920.png",
];
for (const name of images) {
  for (const directory of [website, payload])
    await copyFile(
      `distribution/images/${name}`,
      path.join(directory, `images/${name}`),
    );
}
const publicNames = [
  ...docs,
  "LICENSE",
  ...images.map((name) => `images/${name}`),
].sort();
const websiteFiles = [];
for (const name of publicNames)
  websiteFiles.push({
    path: name,
    sha256: digest(await readFile(path.join(website, name))),
  });

// Audit the exact installer input, including archives' extracted resources.
const payloadFiles = [];
async function audit(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), "Unexpected link in public payload");
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      await audit(path.join(directory, entry.name), name);
      continue;
    }
    assert.ok(!name.endsWith(".map"), `Source map leaked: ${name}`);
    assert.ok(
      !/(^|\/)\.git(\/|$)|\.env$|credentials|\.key$|\.pfx$|\.pem$/i.test(name),
      `Private file leaked: ${name}`,
    );
    assert.ok(
      name.startsWith("dist/") ||
        name === "native/native-host.exe" ||
        name.startsWith("native/security/") ||
        /^scripts\/[\w-]+\.ps1$/.test(name) ||
        /^licenses\/[\w-]+\.txt$/.test(name) ||
        [
          ...docs,
          "LICENSE",
          "GUIDE_UTILISATION.md",
          "extension-id.txt",
          ...images.map((name) => `images/${name}`),
        ].includes(name),
      `Unexpected public file: ${name}`,
    );
    const bytes = await readFile(path.join(directory, entry.name));
    for (const privateText of [
      process.cwd(),
      "C:\\Users\\remyg",
      "Gremy44/NextExplorer.git",
      "BEGIN PRIVATE KEY",
      "BEGIN RSA PRIVATE KEY",
    ]) {
      assert.ok(
        !bytes.includes(Buffer.from(privateText)),
        `Private text in ${name}`,
      );
      assert.ok(
        !bytes.includes(Buffer.from(privateText, "utf16le")),
        `Private UTF16 text in ${name}`,
      );
    }
    if (/\.(js|mjs|css)$/.test(name))
      assert.ok(
        !/sourceMappingURL\s*=/.test(bytes.toString()),
        `Source mapping reference in ${name}`,
      );
    payloadFiles.push({ path: name, sha256: digest(bytes) });
  }
}
await audit(payload);
const extensionZip = path.join(root, `NextExplorer-${version}-extension.zip`);
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:NEXTEXPLORER_PUBLIC_DIST, $env:NEXTEXPLORER_EXTENSION_ZIP)",
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NEXTEXPLORER_PUBLIC_DIST: path.join(payload, "dist"),
      NEXTEXPLORER_EXTENSION_ZIP: extensionZip,
    },
  },
);
const record = {
  version,
  payload: path.relative(process.cwd(), payload),
  public: path.relative(process.cwd(), website),
  publicFiles: websiteFiles,
  payloadFiles: payloadFiles.sort((a, b) => a.path.localeCompare(b.path)),
  extension: path.relative(process.cwd(), extensionZip),
};
await writeFile(
  path.join(root, "prepared.json"),
  JSON.stringify(record, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    version,
    payload: record.payload,
    publicFiles: websiteFiles.length,
    payloadFiles: payloadFiles.length,
    extension: record.extension,
  }),
);
