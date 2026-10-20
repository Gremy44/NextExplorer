import { describe, expect, it } from "vitest";
import { assignTag, emptyTags, relocateTags, restoreTags } from "./tags";
import {
  defaultPreferences,
  restorePreferences,
  shortcutKey,
  displaySize,
} from "./preferences";
import { orderFiles } from "./file-order";
import type { Entry } from "./types";
import { parseOrganizationExport } from "./organization-export";
import { restoreTextRules } from "./local-index";
const tagged = () => ({
  ...emptyTags(),
  labels: [{ id: "work", name: "Travail", color: "primary" as const }],
});
describe("tags, préférences et tri", () => {
  it("refuse les fonctions et types étrangers dans un import", () => {
    expect(() =>
      parseOrganizationExport(
        JSON.stringify({
          version: 1,
          preferences: { ...defaultPreferences, columns: ["secret"] },
          tags: tagged(),
        }),
      ),
    ).toThrow();
  });
  it("exporte les réglages de dossiers et les règles sans index ni champs étrangers", () => {
    const value = {
      version: 1,
      preferences: defaultPreferences,
      tags: tagged(),
      folders: {
        "C:/Docs": { viewMode: "columns", sortBy: "tags", sortOrder: "asc" },
      },
      rules: [
        { id: "atelier", name: "Atelier", keywords: "électricité atelier" },
      ],
      index: { secret: "contenu" },
    };
    const restored = parseOrganizationExport(JSON.stringify(value));
    expect(restored.folders["c:/docs"].viewMode).toBe("columns");
    expect(restored.rules[0].name).toBe("Atelier");
    expect("index" in restored).toBe(false);
    expect(() =>
      parseOrganizationExport(
        JSON.stringify({
          ...value,
          folders: {
            "../relatif": {
              viewMode: "details",
              sortBy: "name",
              sortOrder: "asc",
            },
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      restoreTextRules([{ id: "bad", name: "", keywords: "atelier" }]),
    ).toThrow();
  });
  it("ajoute plusieurs tags par lots et conserve les autres chemins", () => {
    let store = assignTag(
      tagged(),
      ["C:\\Docs\\a.txt", "C:/Docs/b.txt"],
      "work",
      true,
    );
    expect(store.files["c:/docs/a.txt"]).toEqual(["work"]);
    store = assignTag(store, ["C:/Docs/a.txt"], "work", false);
    expect(Object.keys(store.files)).toEqual(["c:/docs/b.txt"]);
    expect(() => assignTag(store, ["../a.txt"], "work", true)).toThrow();
  });
  it("suit les renommages et déplacements de dossiers sans confondre les préfixes", () => {
    const store = assignTag(
      tagged(),
      ["C:/Docs/a.txt", "C:/Docs/sub/b.txt", "C:/Docs2/c.txt"],
      "work",
      true,
    );
    const next = relocateTags(store, [{ from: "C:/Docs", to: "D:/Archive" }]);
    expect(Object.keys(next.files).sort()).toEqual([
      "c:/docs2/c.txt",
      "d:/archive/a.txt",
      "d:/archive/sub/b.txt",
    ]);
    expect(relocateTags(next, [{ from: "C:/Docs", to: "D:/Archive" }])).toEqual(
      next,
    );
  });
  it("importe uniquement les tags valides et applique les plafonds", () => {
    expect(restoreTags(JSON.parse(JSON.stringify(tagged())))).toEqual(tagged());
    expect(() =>
      restoreTags({ ...tagged(), files: { "C:/a.txt": ["inconnu"] } }),
    ).toThrow();
    expect(() =>
      restoreTags({
        ...tagged(),
        labels: [
          ...tagged().labels,
          { id: "other", name: "travail", color: "error" },
        ],
      }),
    ).toThrow();
    expect(() =>
      restoreTags({
        ...tagged(),
        files: Object.fromEntries(
          Array.from({ length: 2001 }, (_, i) => [`C:/${i}`, ["work"]]),
        ),
      }),
    ).toThrow();
  });
  it("refuse les collisions de raccourcis, les touches navigateur et les imports invalides", () => {
    expect(
      restorePreferences(JSON.parse(JSON.stringify(defaultPreferences))),
    ).toEqual(defaultPreferences);
    expect(() =>
      restorePreferences({
        ...defaultPreferences,
        shortcuts: { search: "Ctrl+K", palette: "Ctrl+K" },
      }),
    ).toThrow();
    expect(() =>
      restorePreferences({
        ...defaultPreferences,
        shortcuts: { search: "Ctrl+L" },
      }),
    ).toThrow();
    expect(() =>
      restorePreferences({
        ...defaultPreferences,
        startup: "folders",
        startupPaths: ["relatif"],
      }),
    ).toThrow();
    expect(() =>
      restorePreferences({ ...defaultPreferences, dateWidth: 99999 }),
    ).toThrow();
    expect(
      shortcutKey({
        key: "f",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe("Ctrl+Shift+F");
  });
  it("trie les tailles calculées, conserve les inconnues à la fin et choisit les unités", () => {
    const entry = (name: string, type: Entry["type"], size: number): Entry => ({
      name,
      path: `C:/${name}`,
      type,
      size,
      mtime: 10,
      ext: "",
    });
    const rows = [
      entry("inconnu", "directory", 1),
      entry("petit", "file", 5),
      entry("gros", "directory", 0),
    ];
    expect(
      orderFiles(
        rows,
        "size",
        "desc",
        false,
        { "c:/gros": { size: 10 } },
        emptyTags(),
      ).map((e) => e.name),
    ).toEqual(["gros", "petit", "inconnu"]);
    expect(displaySize(1024, "binary")).toBe("1 Kio");
    expect(displaySize(1000, "decimal")).toBe("1 Ko");
  });
});
