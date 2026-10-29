import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { matchesSetting } from "./preferences";
import { QuickActions } from "./QuickActions";
import { defaultQuickAction } from "./quick-actions";
import type { Entry } from "./types";

const file = (name: string, type: Entry["type"] = "file"): Entry => ({
  name,
  path: `C:/Test/${name}`,
  ext: name.slice(name.lastIndexOf(".")),
  size: 42,
  mtime: 1,
  type,
});
describe("cohérence des accès et des libellés", () => {
  it("retrouve les réglages sans accents, par mots dans un ordre différent", () => {
    expect(matchesSetting(" REGLAGES ", "Réglages de l’interface")).toBe(true);
    expect(matchesSetting("texte taille", "Taille du texte : 150 %")).toBe(
      true,
    );
    expect(matchesSetting("réglages", "Re\u0301glages")).toBe(true);
    expect(matchesSetting("menu inexistant", "Taille du menu contextuel")).toBe(
      false,
    );
    expect(matchesSetting("  ", "Moteurs facultatifs")).toBe(true);
  });
  it("ne propose pas d’action rapide pour le texte ou un dossier", () => {
    expect(defaultQuickAction([file("note.txt")], null)).toBeUndefined();
    expect(
      defaultQuickAction([file("Photos", "directory")], null),
    ).toBeUndefined();
    expect(defaultQuickAction([file("photo.png")], null)).toBe("rotate");
  });
  it("permet de convertir les fichiers compatibles d’une sélection mixte", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        entries={[file("image.png"), file("note.txt")]}
        hello={null}
        onAction={() => {}}
        onConvert={() => {}}
      />,
    );
    expect(html).toContain("Convertir");
    expect(html).not.toContain("Faire pivoter");
    expect(
      renderToStaticMarkup(
        <QuickActions
          entries={[file("note.txt")]}
          hello={null}
          onAction={() => {}}
          onConvert={() => {}}
        />,
      ),
    ).toBe("");
  });
  it("conserve une explication accessible pour les outils désactivés", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        entries={[file("image.png")]}
        hello={null}
        onAction={() => {}}
        onConvert={() => {}}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-description="Moteur image ou vidéo requis"');
  });
});
