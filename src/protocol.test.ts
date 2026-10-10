import { describe, expect, it } from "vitest";
import { validateHello } from "./protocol";
import type { Hello } from "./types";

describe("compatibilité du compagnon", () => {
  it("accepte le même protocole même sans moteurs optionnels", () => {
    const hello = { protocolVersion: 1, version: "1.2.0", tools: {} } as Hello;
    expect(validateHello(hello)).toBe(hello);
  });

  it.each([undefined, 0])(
    "demande la mise à jour d’un ancien compagnon (%s)",
    (protocolVersion) => {
      expect(() => validateHello({ protocolVersion } as Hello)).toThrow(
        "Le compagnon doit être mis à jour",
      );
    },
  );

  it.each([2, -1.5, "1", null])(
    "refuse un protocole incompatible ou invalide (%s)",
    (protocolVersion) => {
      expect(() => validateHello({ protocolVersion } as Hello)).toThrow();
    },
  );
});
