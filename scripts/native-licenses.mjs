import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const root = process.cwd(),
  go = path.join(
    root,
    ".tools/go/bin",
    process.platform === "win32" ? "go.exe" : "go",
  );
const env = {
  ...process.env,
  GOMODCACHE: path.join(root, ".tools/go-mod"),
  GOCACHE: path.join(root, ".tools/go-cache"),
};
const output = execFileSync(
  existsSync(go) ? go : "go",
  [
    "list",
    "-deps",
    "-f",
    "{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}{{end}}",
    ".",
  ],
  { cwd: "native", env, encoding: "utf8", windowsHide: true },
);
mkdirSync("public/licenses", { recursive: true });
const goroot = execFileSync(existsSync(go) ? go : "go", ["env", "GOROOT"], {
  env,
  encoding: "utf8",
  windowsHide: true,
}).trim();
for (const [source, target] of [
  ["LICENSE", "Go-runtime.txt"],
  ["PATENTS", "Go-runtime-PATENTS.txt"],
])
  if (existsSync(path.join(goroot, source)))
    writeFileSync(
      path.join("public/licenses", target),
      readFileSync(path.join(goroot, source)),
    );
const modules = [...new Set(output.split(/\r?\n/).filter(Boolean))].sort(),
  notices = [];
for (const module of modules) {
  const [name, version, directory] = module.split("|");
  const source = ["LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING"]
    .map((f) => path.join(directory, f))
    .find(existsSync);
  if (!source) throw new Error(`Missing license for ${name}@${version}`);
  const file = `Go-${name.replace(/[^a-zA-Z0-9.-]/g, "-")}.txt`;
  writeFileSync(
    path.join("public/licenses", file),
      `${name}@${version}\nhttps://${name}\n\n${readFileSync(source, "utf8").trimEnd()}\n`,
  );
  notices.push({ module: name, version, file });
}
writeFileSync(
  "public/licenses/native-modules.json",
  JSON.stringify(notices, null, 2) + "\n",
);
console.log(`${notices.length} native dependency licenses prepared`);
