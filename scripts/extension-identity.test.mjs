import { generateKeyPairSync } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extensionIdFromKey,
  readExtensionIdentity,
} from "./extension-identity.mjs";

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
const id = readFileSync("extension-id.txt", "utf8").trim();

describe("extension and Native Messaging identity", () => {
  it("derives the existing Chrome ID from its public key", () => {
    expect(extensionIdFromKey(manifest.key)).toBe(id);
    expect(readExtensionIdentity()).toBe(id);
  });
  it("rejects missing, malformed, private and appended keys", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const privateDer = privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    const appended = Buffer.concat([
      Buffer.from(manifest.key, "base64"),
      Buffer.from("extra"),
    ]).toString("base64");
    for (const key of [
      undefined,
      "",
      "not a key",
      "AAAA",
      privateDer,
      appended,
      manifest.key + "=",
    ])
      expect(() => extensionIdFromKey(key)).toThrow();
  });
  it("refuses an ID mismatch without changing either source file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "nextexplorer-identity-"));
    try {
      mkdirSync(path.join(root, "public"));
      const file = path.join(root, "public/manifest.json");
      const idFile = path.join(root, "extension-id.txt");
      const text = JSON.stringify(manifest);
      writeFileSync(file, text);
      for (const badId of ["a".repeat(32), "invalid"]) {
        writeFileSync(idFile, badId);
        expect(() => readExtensionIdentity(root)).toThrow(
          /Identité incohérente/,
        );
        expect(readFileSync(file, "utf8")).toBe(text);
        expect(readFileSync(idFile, "utf8")).toBe(badId);
      }
      writeFileSync(idFile, id);
      expect(readExtensionIdentity(root)).toBe(id);
    } finally {
      expect(path.dirname(root)).toBe(path.resolve(tmpdir()));
      expect(path.basename(root)).toMatch(/^nextexplorer-identity-/);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
