import { createHash, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function extensionIdFromKey(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(key))
    throw new Error(
      "La clé du manifeste doit être une clé publique DER en base64.",
    );
  const der = Buffer.from(key, "base64");
  const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
  if (
    der.toString("base64") !== key ||
    !publicKey.export({ format: "der", type: "spki" }).equals(der)
  )
    throw new Error("Clé publique non canonique ou contenu ajouté.");
  return createHash("sha256")
    .update(der)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + parseInt(digit, 16)),
    );
}

export function readExtensionIdentity(root = process.cwd()) {
  const id = readFileSync(path.join(root, "extension-id.txt"), "utf8").trim();
  const manifest = JSON.parse(
    readFileSync(path.join(root, "public/manifest.json"), "utf8"),
  );
  if (!/^[a-p]{32}$/.test(id) || extensionIdFromKey(manifest.key) !== id)
    throw new Error(
      "Identité incohérente : la clé publique et extension-id.txt doivent désigner la même extension.",
    );
  return id;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(readExtensionIdentity(process.argv[2]));
