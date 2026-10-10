import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
if (process.platform === "win32")
  throw new Error("Sous Windows : scripts/install-host.ps1");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id =
  process.argv[2] ||
  readFileSync(path.join(root, "extension-id.txt"), "utf8").trim();
if (!/^[a-p]{32}$/.test(id)) throw new Error("ID invalide");
const binary = path.join(root, "native/native-host");
if (!existsSync(binary))
  throw new Error("Compiler le compagnon sur ce système");
const manifest = {
  name: "com.local.file_explorer",
  description: "NextExplorer Native Host",
  path: binary,
  type: "stdio",
  allowed_origins: [`chrome-extension://${id}/`],
};
const json = JSON.stringify(manifest, null, 2);
writeFileSync(path.join(root, "native/com.local.file_explorer.json"), json);
const dir =
  process.platform === "darwin"
    ? path.join(
        os.homedir(),
        "Library/Application Support/Google/Chrome/NativeMessagingHosts",
      )
    : path.join(os.homedir(), ".config/google-chrome/NativeMessagingHosts");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "com.local.file_explorer.json"), json);
console.log("Compagnon enregistré : " + binary);
