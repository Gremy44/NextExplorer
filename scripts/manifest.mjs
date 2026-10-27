import { generateKeyPairSync, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const file = "public/manifest.json";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const key = existsSync(file)
  ? JSON.parse(readFileSync(file)).key
  : generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    }).publicKey.toString("base64");
const id = createHash("sha256")
  .update(Buffer.from(key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
const manifest = {
  manifest_version: 3,
  name: "NextExplorer — Explorateur local",
  version,
  description:
    "Vos fichiers, vos outils et vos projets web, dans un seul espace local.",
  key,
  minimum_chrome_version: "116",
  permissions: [
    "nativeMessaging",
    "storage",
    "contextMenus",
    "sidePanel",
    "tabs",
    "tabGroups",
    "activeTab",
    "scripting",
  ],
  optional_permissions: ["debugger"],
  optional_host_permissions: ["https://*/*", "http://*/*"],
  background: { service_worker: "background.js", type: "module" },
  action: { default_title: "Ouvrir NextExplorer" },
  side_panel: { default_path: "index.html?panel=1" },
  commands: {
    "open-explorer": {
      suggested_key: { default: "Alt+E" },
      description: "Ouvrir le panneau explorateur",
    },
    "open-dashboard": {
      suggested_key: { default: "Alt+Shift+E" },
      description: "Ouvrir en pleine page",
    },
  },
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; connect-src 'self' https: http:; img-src 'self' data: blob: https: http:; media-src 'self' blob: data:; frame-src 'self' blob:",
  },
  icons: { 16: "icon16.png", 48: "icon48.png", 128: "icon128.png" },
};
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
writeFileSync("extension-id.txt", id + "\n");
console.log(id);
