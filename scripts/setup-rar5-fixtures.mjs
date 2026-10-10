import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const commit = "abaa707d92fce052f386b6cc2c8d0593ce61e639";
const base = `https://raw.githubusercontent.com/libarchive/libarchive/${commit}/libarchive/test/`;
const dir = "native/testdata/rar5";
await mkdir(dir, { recursive: true });
const names = ["stored", "compressed", "multiple_files_solid", "encrypted", "encrypted_filenames", "hardlink", "symlink", "multiarchive.part01"];
const provenance = { repository: "https://github.com/libarchive/libarchive", commit, files: [] };
for (const name of names) {
  const source = `test_read_format_rar5_${name}.rar.uu`;
  const response = await fetch(base + source);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  const text = await response.text();
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => line.startsWith("begin "));
  if (start < 0 || !lines.includes("end")) throw new Error("Invalid uuencode fixture");
  const output = [];
  for (const line of lines.slice(start + 1)) {
    if (line === "end") break;
    if (!line) continue;
    const length = (line.charCodeAt(0) - 32) & 63;
    const decoded = [];
    for (let i = 1; i < line.length; i += 4) {
      const values = [0, 1, 2, 3].map((n) => (line.charCodeAt(i + n) - 32) & 63);
      decoded.push((values[0] << 2) | (values[1] >> 4), ((values[1] << 4) | (values[2] >> 2)) & 255, ((values[2] << 6) | values[3]) & 255);
    }
    if (decoded.length < length) throw new Error("Truncated fixture");
    output.push(...decoded.slice(0, length));
  }
  const data = Buffer.from(output);
  await writeFile(`${dir}/${name}.rar`, data);
  provenance.files.push({ name: `${name}.rar`, source: base + source, sha256: createHash("sha256").update(data).digest("hex") });
}
const licenseResponse = await fetch(base + "test_read_format_rar5.c");
if (!licenseResponse.ok) throw new Error("Cannot retrieve fixture license");
const c = await licenseResponse.text();
await writeFile(`${dir}/LICENSE.txt`, c.slice(0, c.indexOf("*/") + 2) + "\n");
await writeFile(`${dir}/provenance.json`, JSON.stringify(provenance, null, 2) + "\n");
console.log("RAR5 fixtures downloaded, decoded and hashed at pinned libarchive commit.");
