import type { Hello } from "./types";

export const PROTOCOL_VERSION = 1;

export function validateHello(hello: Hello): Hello {
  if (hello?.protocolVersion !== PROTOCOL_VERSION) {
    const version = hello?.protocolVersion;
    throw new Error(
      version === undefined ||
      (typeof version === "number" && version < PROTOCOL_VERSION)
        ? "Le compagnon doit être mis à jour. Installez le compagnon fourni avec cette extension, puis désactivez et réactivez l’extension."
        : "Versions incompatibles. Mettez à jour l’extension et le compagnon depuis le même paquet, puis désactivez et réactivez l’extension.",
    );
  }
  return hello;
}
