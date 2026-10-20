import { describe, it, expect } from "vitest";
import { assignTag, emptyTags, restoreTags, finderColors } from "./tags";
import {
  restoreFolderAppearances,
  relocateFolderAppearances,
} from "./folder-appearance";
import {
  volumeUsage,
  spaceTiles,
  spaceColors,
  spacePercent,
} from "./disk-space";
import { quickActions, validTrim } from "./quick-actions";
import { parseOrganizationExport } from "./organization-export";
import { defaultPreferences } from "./preferences";
import type { Entry, Hello } from "./types";
const entry = (name: string, type: Entry["type"] = "file"): Entry => ({
  name,
  path: `C:/Docs/${name}`,
  type,
  size: 20,
  mtime: 10,
  ext: name.slice(name.lastIndexOf(".")),
});
const hello = {
  features: { quickActions: true },
  tools: { magick: true, ffmpeg: true, ffprobe: true },
} as unknown as Hello;
describe("organisation façon Finder", () => {
  it("conserve les anciens tags et permet les sept couleurs, le renommage et plusieurs tags par dossier", () => {
    const initial = {
      ...emptyTags(),
      labels: [
        { id: "legacy", name: "Travail", color: "primary" },
        ...finderColors.map((color) => ({ id: color, name: color, color })),
      ],
    };
    let tags = assignTag(initial, ["C:/Docs/Dossier"], "blue", true);
    tags = assignTag(tags, ["C:/Docs/Dossier"], "green", true);
    const renamed = restoreTags({
      ...tags,
      labels: tags.labels.map((tag) =>
        tag.id === "blue" ? { ...tag, name: "Client", color: "orange" } : tag,
      ),
    });
    expect(renamed.files["c:/docs/dossier"]).toEqual(["blue", "green"]);
    expect(renamed.labels[0].color).toBe("primary");
    expect(() =>
      restoreTags({
        ...renamed,
        labels: [
          ...renamed.labels,
          { id: "duplicate", name: "client", color: "red" },
        ],
      }),
    ).toThrow();
  });
  it("valide et exporte les apparences sans modifier les chemins réels", () => {
    const appearances = restoreFolderAppearances({
      "C:\\Docs\\Photos": { color: "purple", symbol: "📷" },
    });
    expect(appearances["c:/docs/photos"].symbol).toBe("📷");
    const exported = parseOrganizationExport(
      JSON.stringify({
        version: 1,
        preferences: defaultPreferences,
        tags: emptyTags(),
        appearances,
      }),
    );
    expect(exported.appearances).toEqual(appearances);
    expect(
      parseOrganizationExport(
        JSON.stringify({
          version: 1,
          preferences: defaultPreferences,
          tags: emptyTags(),
        }),
      ).appearances,
    ).toEqual({});
    for (const value of [
      { "../relatif": { color: "blue", symbol: "x" } },
      { "C:/Docs": { color: "url(evil)", symbol: "" } },
      { "C:/Docs": { color: "blue", symbol: "\u202e" } },
    ])
      expect(() => restoreFolderAppearances(value)).toThrow();
  });
  it("déplace les apparences des dossiers imbriqués sans confondre les préfixes ni rejouer une permutation", () => {
    const source = {
      "C:/A": { color: "blue", symbol: "📁" },
      "C:/A/Sub": { color: "green", symbol: "" },
      "C:/A2": { color: "red", symbol: "" },
    };
    const target = relocateFolderAppearances(source, [
      { from: "C:/A", to: "D:/B" },
    ]);
    expect(Object.keys(target).sort()).toEqual(["c:/a2", "d:/b", "d:/b/sub"]);
    expect(
      relocateFolderAppearances(target, [{ from: "C:/A", to: "D:/B" }]),
    ).toEqual(target);
    const swapped = relocateFolderAppearances(
      {
        "C:/A": { color: "blue", symbol: "" },
        "C:/B": { color: "red", symbol: "" },
      },
      [
        { from: "C:/A", to: "C:/B" },
        { from: "C:/B", to: "C:/A" },
      ],
    );
    expect(swapped["c:/a"].color).toBe("red");
    expect(swapped["c:/b"].color).toBe("blue");
  });
  it("affiche une capacité réelle, y compris les quotas, et refuse les mesures incohérentes", () => {
    expect(
      volumeUsage({
        path: "C:\\",
        name: "C",
        kind: "local",
        total: 1000,
        free: 300,
        available: 200,
      }),
    ).toEqual({
      total: 1000,
      free: 300,
      available: 200,
      used: 700,
      percent: 70,
    });
    for (const values of [
      {},
      { total: 0, free: 0, available: 0 },
      { total: 10, free: 11, available: 1 },
      { total: 10, free: 1, available: NaN },
    ])
      expect(
        volumeUsage({ path: "C:\\", name: "C", kind: "local", ...values }),
      ).toBeNull();
  });
  it("donne à la carte des surfaces proportionnelles, avec les éléments restants", () => {
    const tiles = spaceTiles(
      [
        { path: "large", size: 900 },
        { path: "small", size: 50 },
      ],
      1000,
    );
    expect(
      (tiles.find((tile) => tile.path === "large")!.w *
        tiles.find((tile) => tile.path === "large")!.h) /
        6000,
    ).toBeCloseTo(0.9);
    expect(tiles.find((tile) => tile.path === "")!.size).toBe(50);
    expect(tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0)).toBeCloseTo(
      6000,
    );
    expect(spaceTiles([], 0)).toEqual([]);
  });
  it("garde un contraste de texte supérieur à 4,5 sur chaque couleur de la carte", () => {
    expect(new Set(spaceColors).size).toBe(spaceColors.length);
    for (const color of spaceColors) {
      const rgb = [1, 3, 5].map(
        (offset) => parseInt(color.slice(offset, offset + 2), 16) / 255,
      );
      const linear = rgb.map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
      const luminance =
        linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      expect(1.05 / (luminance + 0.05), color).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("ne fait pas passer une petite surface non nulle pour zéro pour cent", () => {
    expect(spacePercent(1, 1000000)).toBe("< 0,1 %");
    expect(spacePercent(1, 1000)).toBe("0,1 %");
    expect(spacePercent(1, 4)).toBe("25 %");
    expect(spacePercent(0, 0)).toBe("0 %");
  });
  it("propose uniquement les outils adaptés et borne les extraits", () => {
    expect(quickActions([entry("a.txt")], hello)).toEqual([]);
    expect(
      quickActions([entry("a.pdf")], hello).map((item) => item.id),
    ).toEqual(["annotate", "pdf-create"]);
    expect(
      quickActions([entry("a.mp3")], hello).map((item) => item.id),
    ).toEqual(["trim"]);
    expect(
      quickActions([entry("a.png"), entry("b.pdf")], hello).map(
        (item) => item.id,
      ),
    ).toEqual(["pdf-create"]);
    expect(
      quickActions([entry("a.tiff")], hello).map((item) => item.id),
    ).toEqual(["rotate"]);
    expect(quickActions([entry("folder", "directory")], hello)).toEqual([]);
    expect(
      quickActions([entry("a.png")], { ...hello, tools: {} }).every(
        (item) => item.disabled,
      ),
    ).toBe(true);
    expect(validTrim(0.25, 1.25, 2)).toBe(true);
    for (const [start, end, duration] of [
      [-1, 1, 2],
      [2, 1, 3],
      [0, 3, 2],
      [0, 3601, 4000],
      [NaN, 1, 3],
    ])
      expect(validTrim(start, end, duration)).toBe(false);
  });
});
