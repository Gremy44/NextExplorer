import { describe, expect, it } from "vitest";
import { defaultPreferences, restorePreferences } from "./preferences";
import { fileMetrics, moveTab, tabDropIndex } from "./interface-layout";

describe("réglages d’ergonomie", () => {
  it("vise la position de dépôt même quand les onglets bougent ou défilent", () => {
    expect(tabDropIndex(330, 100, 0, 200, 4)).toBe(1);
    expect(tabDropIndex(330, 100, 200, 200, 4)).toBe(2);
    expect(tabDropIndex(0, 100, 0, 200, 4)).toBe(0);
    expect(tabDropIndex(2000, 100, 0, 200, 4)).toBe(3);
    expect(tabDropIndex(100, 100, 0, 0, 4)).toBe(-1);
    expect(tabDropIndex(100, 100, 0, 200, 0)).toBe(-1);
  });
  it("migre les préférences existantes et refuse les tailles invalides", () => {
    const { density, textSize, menuSize, tooltips, ...legacy } =
      defaultPreferences;
    expect(restorePreferences(legacy)).toEqual(defaultPreferences);
    for (const invalid of [
      { density: "tiny" },
      { textSize: 151 },
      { textSize: 90.5 },
      { menuSize: "huge" },
      { tooltips: "yes" },
    ]) {
      expect(() =>
        restorePreferences({ ...defaultPreferences, ...invalid }),
      ).toThrow();
    }
    expect(
      restorePreferences({
        ...defaultPreferences,
        textSize: 150,
        density: "compact",
        menuSize: "compact",
        tooltips: false,
      }).textSize,
    ).toBe(150);
  });
  it("conserve l’onglet actif pour tous les déplacements", () => {
    const tabs = [
      { path: "A" },
      { path: "B", dual: true },
      { path: "C" },
      { path: "D" },
    ];
    for (let current = 0; current < tabs.length; current++)
      for (let from = 0; from < tabs.length; from++)
        for (let to = 0; to < tabs.length; to++) {
          const result = moveTab({ tabs, current }, from, to);
          expect(result.tabs[result.current]).toBe(tabs[current]);
          expect(result.tabs[to]).toBe(tabs[from]);
          expect(result.tabs).toHaveLength(tabs.length);
          expect(new Set(result.tabs).size).toBe(tabs.length);
        }
    expect(tabs.map((t) => t.path)).toEqual(["A", "B", "C", "D"]);
    const original = { tabs, current: 1 };
    expect(moveTab(original, -1, 2)).toBe(original);
    expect(moveTab(original, 1, 99)).toBe(original);
  });
  it("dimensionne les lignes virtualisées pour le texte agrandi et les modes compacts", () => {
    const view = { width: 0, height: 40, iconSize: 18 };
    expect(fileMetrics(view, defaultPreferences)).toEqual(view);
    expect(
      fileMetrics(view, { density: "compact", textSize: 100 }).height,
    ).toBe(32);
    expect(
      fileMetrics(view, { density: "compact", textSize: 150 }).height,
    ).toBeGreaterThanOrEqual(42);
  });
});
