import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const local = path.join(
  root,
  ".tools",
  "go",
  "bin",
  process.platform === "win32" ? "go.exe" : "go",
);
mkdirSync(".tools/go-cache", { recursive: true });
mkdirSync(".tools/go-mod", { recursive: true });
const command = process.argv[2];
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const args =
  command === "test"
    ? ["test", "./...", "-count=1"]
    : [
        "build",
        "-trimpath",
        `-ldflags=-s -w -X main.releaseVersion=${version}`,
        "-o",
        path.join(
          root,
          "native",
          process.platform === "win32" ? "native-host.exe" : "native-host",
        ),
        ".",
      ];
const r = spawnSync(existsSync(local) ? local : "go", args, {
  cwd: "native",
  stdio: "inherit",
  env: {
    ...process.env,
    CGO_ENABLED: "0",
    GOCACHE: path.join(root, ".tools/go-cache"),
    GOMODCACHE: path.join(root, ".tools/go-mod"),
  },
});
if (r.error) console.error(r.error.message);
process.exit(r.status ?? 1);
