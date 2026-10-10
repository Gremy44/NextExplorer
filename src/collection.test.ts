import { expect, it } from "vitest";
import { capturedText, contextualLink, mergeCollection, saveCollection, selectionCapture } from "./collection";
import { collectedLink } from "./types";

it("collecte le contexte exact sans confondre page source et lien cible", () => {
  const pageUrl = "https://example.com/article?token=private#section";
  const page = contextualLink({ menuItemId: "collect-page", pageUrl }, { url: pageUrl, title: "Article" });
  expect(page.name).toBe("Article");
  expect(page.path).toBe(pageUrl);
  expect(page.sourceUrl).toBe("https://example.com/article");
  const link = contextualLink({ menuItemId: "collect-link", pageUrl, linkUrl: "https://target.example/doc" }, { title: "Titre source" });
  expect(link.name).toBe("target.example");
  expect(link.path).toBe("https://target.example/doc");
  for (const linkUrl of [undefined, "javascript:alert(1)", "https://user:secret@example.com"]) {
    expect(() => contextualLink({ menuItemId: "collect-link", linkUrl, pageUrl })).toThrow();
  }
});

it("conserve les instantanés et fusionne sans perdre le panier courant", () => {
  const a = collectedLink("https://example.com/a", "A");
  const b = collectedLink("https://example.com/b", "B");
  const lists = saveCollection([], " Voyage ", [a]);
  expect(lists[0].name).toBe("Voyage");
  expect(mergeCollection([b, a], lists[0].entries)).toEqual([b, a]);
  expect(lists[0].entries).toEqual([a]);
  expect(() => saveCollection(lists, "voyage", [b])).toThrow();
  expect(() => saveCollection(lists, "Vide", [])).toThrow();
  expect(() => saveCollection(lists, " ", [b])).toThrow();
});

it("prépare un extrait fidèle avec sa provenance sans secrets d'URL", () => {
  const pageUrl = "https://example.com/article?token=secret#texte";
  const capture = selectionCapture({ selectionText: "  Bonjour\nmonde  ", pageUrl }, { url: pageUrl, title: "Article" });
  expect(capture.sourceUrl).toBe("https://example.com/article");
  expect(capture.title).toBe("Article");
  expect(capturedText(capture)).toContain("\n\n  Bonjour\nmonde  ");
  expect(capturedText(capture)).not.toContain("secret");
  expect(() => selectionCapture({ selectionText: "  ", pageUrl })).toThrow();
  expect(() => selectionCapture({ selectionText: "a".repeat(262145), pageUrl })).toThrow();
  expect(() => selectionCapture({ selectionText: "texte", pageUrl: "javascript:alert(1)" })).toThrow();
});
