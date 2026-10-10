import { describe, it, expect } from "vitest";
import {
  safeURL,
  fuzzy,
  join,
  mediaType,
  collectedLink,
  pathBreadcrumbs,
} from "./types";
describe("Données provenant du web et chemins", () => {
  it("collecte uniquement des liens HTTP(S) sans identifiants", () => {
    const link = collectedLink(" https://example.com ", " Exemple ");
    expect(link.path).toBe("https://example.com/");
    expect(link.name).toBe("Exemple");
    expect(Number.isFinite(Date.parse(link.collectedAt))).toBe(true);
    expect(collectedLink("https://example.com", "").name).toBe("example.com");
    for (const url of [
      "javascript:alert(1)",
      "file:///C:/test",
      "https://user:secret@example.com",
      "https://example.com/" + "a".repeat(8192),
    ]) {
      expect(() => collectedLink(url, "test")).toThrow();
    }
  });
  it("refuse les schémas exécutables", () => {
    for (const s of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///C:/test",
      "chrome://settings",
      "not a URL",
    ])
      expect(safeURL(s)).toBeNull();
    expect(safeURL("https://example.com")).toBe("https://example.com/");
  });
  it("garde les séparateurs de chaque système", () => {
    expect(join("C:\\Users\\", "a.txt")).toBe("C:\\Users\\a.txt");
    expect(join("/home/user/", "a.txt")).toBe("/home/user/a.txt");
  });
  it("garde la racine des chemins dans le fil d’Ariane", () => {
    expect(
      pathBreadcrumbs("C:\\Users\\Remy\\Documents\\").map((part) => part.path),
    ).toEqual([
      "C:\\",
      "C:\\Users",
      "C:\\Users\\Remy",
      "C:\\Users\\Remy\\Documents",
    ]);
    expect(
      pathBreadcrumbs("\\\\serveur\\partage\\Projet").map((part) => part.path),
    ).toEqual(["\\\\serveur\\partage\\", "\\\\serveur\\partage\\Projet"]);
    expect(pathBreadcrumbs("/home/remy").map((part) => part.path)).toEqual([
      "/",
      "/home",
      "/home/remy",
    ]);
    expect(pathBreadcrumbs("C:/Documents").map((part) => part.path)).toEqual([
      "C:/",
      "C:/Documents",
    ]);
    expect(pathBreadcrumbs("/")).toEqual([{ name: "/", path: "/" }]);
    expect(pathBreadcrumbs("C:\\")).toEqual([{ name: "C:", path: "C:\\" }]);
    expect(pathBreadcrumbs("relative")).toEqual([
      { name: "relative", path: "relative" },
    ]);
    expect(pathBreadcrumbs("")).toEqual([]);
  });
  it("recherche les commandes par caractères successifs", () => {
    expect(fuzzy("rnm", "Renommer")).toBe(true);
    expect(fuzzy("zz", "Renommer")).toBe(false);
  });
});
