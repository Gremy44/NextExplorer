import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const root = path.resolve(`release/distribution/${version}`);
const prepared = JSON.parse(
  await readFile(path.join(root, "prepared.json"), "utf8"),
);
assert.equal(prepared.version, version);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function verifyTree(directory, inventory) {
  const names = [];
  async function visit(relative = "") {
    for (const item of await readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      assert.ok(!item.isSymbolicLink(), "Unexpected link");
      const name = path.posix.join(relative, item.name);
      if (item.isDirectory()) await visit(name);
      else names.push(name);
    }
  }
  await visit();
  assert.deepEqual(
    names.sort(),
    inventory.map((file) => file.path).sort(),
    "Unexpected or missing public file",
  );
  for (const file of inventory) {
    assert.ok(
      !file.path.includes("..") &&
        !file.path.includes("\\") &&
        !path.isAbsolute(file.path),
    );
    const bytes = await readFile(path.join(directory, file.path));
    assert.equal(digest(bytes), file.sha256, `Changed file: ${file.path}`);
  }
}
const payload = path.resolve(prepared.payload),
  website = path.resolve(prepared.public);
for (const directory of [payload, website])
  assert.ok(directory.startsWith(root + path.sep));
await verifyTree(payload, prepared.payloadFiles);
await verifyTree(website, prepared.publicFiles);
assert.ok(!prepared.payloadFiles.some(({ path }) => path.endsWith(".map")));
assert.ok(
  !prepared.publicFiles.some(({ path }) =>
    /\.(js|mjs|ts|tsx|ps1|exe|map)$/.test(path),
  ),
);
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "lucide-react",
  "@tanstack-react-virtual",
  "@tanstack-virtual-core",
  "@mozilla-readability",
  "dompurify",
  "marked",
  "highlight.js",
  "nextexplorer",
])
  assert.ok(
    prepared.payloadFiles.some(
      ({ path }) => path === `dist/licenses/${name}.txt`,
    ),
  );
const manifest = JSON.parse(
  await readFile(path.join(payload, "dist/manifest.json"), "utf8"),
);
assert.equal(manifest.version, version);
const id = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (value) =>
    String.fromCharCode(97 + parseInt(value, 16)),
  );
assert.equal(
  id,
  (await readFile(path.join(payload, "extension-id.txt"), "utf8")).trim(),
);
assert.equal(id, (await readFile("extension-id.txt", "utf8")).trim());
assert.equal(
  digest(await readFile(path.join(payload, "native/native-host.exe"))),
  digest(await readFile("native/native-host.exe")),
);

const noticesPath = path.join(root, `NextExplorer-${version}-NOTICES.txt`);
const notices = [];
for (const directory of ["dist/licenses", "licenses"]) {
  for (const file of (await readdir(path.join(payload, directory))).sort())
    notices.push(
      `===== ${directory}/${file} =====\n\n${await readFile(path.join(payload, directory, file), "utf8")}`,
    );
}
await writeFile(noticesPath, notices.join("\n\n") + "\n");
const setupName = `NextExplorer-${version}-Setup.exe`;
await copyFile(
  path.join(root, "NextExplorer-Setup.exe"),
  path.join(root, setupName),
);
const names = [
  setupName,
  `NextExplorer-${version}-extension.zip`,
  path.basename(noticesPath),
];
const files = [];
for (const name of names) {
  const bytes = await readFile(path.join(root, name));
  if (name.endsWith(".exe")) assert.equal(bytes.toString("ascii", 0, 2), "MZ");
  files.push({ name, bytes: bytes.length, sha256: digest(bytes) });
}
const sums =
  files.map(({ name, sha256 }) => `${sha256}  ${name}`).join("\n") + "\n";
await writeFile(path.join(root, "SHA256SUMS.txt"), sums);
const checksums = await readFile(path.join(root, "SHA256SUMS.txt"));
files.push({
  name: "SHA256SUMS.txt",
  bytes: checksums.length,
  sha256: digest(checksums),
});
const record = {
  version,
  extensionId: id,
  prerelease: true,
  unsigned: true,
  cleanWindowsValidated: false,
  files,
  publicFiles: prepared.publicFiles,
};
await writeFile(
  path.join(root, "assets.json"),
  JSON.stringify(record, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    version,
    publicFiles: record.publicFiles.length,
    payloadFiles: prepared.payloadFiles.length,
    files,
    nativeUnchanged: true,
  }),
);
