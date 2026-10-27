import { describe, expect, it } from "vitest";
import {
  defaultQuickAction,
  quickTime,
  reorderQuickFiles,
  quickCopyName,
} from "./quick-actions";
import type { Entry, Hello } from "./types";
const entry = (name: string): Entry => ({
  name,
  path: `C:/Photos/${name}`,
  type: "file",
  ext: name.slice(name.lastIndexOf(".")),
  size: 20,
  mtime: 1,
});
const hello = {
  features: { quickActions: true },
  tools: { magick: true, ffmpeg: true, ffprobe: true },
} as unknown as Hello;
describe("atelier d’actions rapides", () => {
  it("numérote les copies sans remplacer un nom existant, quelle que soit la casse", () => {
    expect(
      quickCopyName("Rapport.pdf", [
        "rapport.PDF",
        "Rapport (2).pdf",
        "rapport (4).pdf",
      ]),
    ).toBe("Rapport (3).pdf");
    expect(quickCopyName("Rapport.pdf", ["Autre.pdf"])).toBe("Rapport.pdf");
    expect(quickCopyName("Copie", ["Copie"])).toBe("Copie (2)");
  });
  it("ouvre directement un outil adapté, disponible en priorité", () => {
    expect(defaultQuickAction([entry("photo.png")], hello)).toBe("rotate");
    expect(defaultQuickAction([entry("film.mp4")], hello)).toBe("trim");
    expect(defaultQuickAction([entry("document.pdf")], null)).toBe("annotate");
    expect(defaultQuickAction([entry("a.png"), entry("b.pdf")], hello)).toBe(
      "pdf-create",
    );
    expect(defaultQuickAction([entry("readme.txt")], hello)).toBeUndefined();
    expect(defaultQuickAction([], hello)).toBeUndefined();
  });
  it("réordonne les sources PDF sans modifier la sélection originale", () => {
    const original = [entry("a.pdf"), entry("b.png"), entry("c.pdf")];
    expect(reorderQuickFiles(original, 0, 2).map((file) => file.name)).toEqual([
      "b.png",
      "c.pdf",
      "a.pdf",
    ]);
    expect(reorderQuickFiles(original, 2, 0).map((file) => file.name)).toEqual([
      "c.pdf",
      "a.pdf",
      "b.png",
    ]);
    expect(original.map((file) => file.name)).toEqual([
      "a.pdf",
      "b.png",
      "c.pdf",
    ]);
    for (const [from, to] of [
      [-1, 1],
      [0, 10],
      [0.5, 1],
      [0, 0],
    ])
      expect(reorderQuickFiles(original, from, to)).toBe(original);
  });
  it("affiche des durées lisibles sans arrondi à 60 secondes", () => {
    expect(quickTime(0)).toBe("0:00.0");
    expect(quickTime(65.25)).toBe("1:05.3");
    expect(quickTime(59.99)).toBe("1:00.0");
    expect(quickTime(3600)).toBe("60:00.0");
    expect(quickTime(NaN)).toBe("0:00.0");
  });
});
