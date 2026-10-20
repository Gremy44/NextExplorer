import { beforeEach, describe, expect, it, vi } from "vitest";
import { bridge, storageUpdate } from "./bridge";
import { saveSelectionTags } from "./tag-selection";
import {
  addNamedTag,
  assignTag,
  clearSelectionTags,
  colorTags,
  emptyTags,
  restoreTags,
  tagSelectionState,
  toggleColorTag,
  toggleTag,
} from "./tags";
import type { Entry } from "./types";

vi.mock("./bridge", () => ({
  bridge: { request: vi.fn() },
  storageUpdate: vi.fn(),
}));
const a = "C:/Docs/a.txt",
  b = "C:/Docs/b.txt";
const entry: Entry = {
  name: "a.txt",
  path: a,
  type: "file",
  ext: ".txt",
  size: 12,
  mtime: 100,
};

describe("attribution directe des tags", () => {
  it("présente sept couleurs sans écrire et crée seulement le tag choisi", () => {
    const original = emptyTags();
    expect(colorTags(original).map((tag) => tag.name)).toEqual([
      "Rouge",
      "Orange",
      "Jaune",
      "Vert",
      "Bleu",
      "Violet",
      "Gris",
    ]);
    const next = toggleColorTag(original, [a], "blue");
    expect(next.labels).toHaveLength(1);
    expect(next.labels[0]).toMatchObject({ color: "blue", name: "Bleu" });
    expect(next.files["c:/docs/a.txt"]).toEqual([next.labels[0].id]);
    expect(original).toEqual(emptyTags());
  });
  it("réutilise un tag renommé et ajoute à toute une sélection mixte puis retire sans toucher aux autres tags", () => {
    const initial = restoreTags({
      ...emptyTags(),
      labels: [
        { id: "client", name: "Projet client", color: "blue" },
        { id: "keep", name: "À conserver", color: "green" },
      ],
    });
    let store = assignTag(initial, [a], "client", true);
    store = assignTag(store, [a, b], "keep", true);
    expect(tagSelectionState(store, [a, b], "client")).toBe("mixed");
    expect(colorTags(store).find((tag) => tag.color === "blue")?.name).toBe(
      "Projet client",
    );
    store = toggleColorTag(store, [a, b], "blue");
    expect(tagSelectionState(store, [a, b], "client")).toBe(true);
    store = toggleColorTag(store, [a, b], "blue");
    expect(store.files).toEqual({
      "c:/docs/a.txt": ["keep"],
      "c:/docs/b.txt": ["keep"],
    });
    expect(store.labels).toHaveLength(2);
  });
  it("évite les homonymes d’une autre couleur et crée/applique un nom en une opération", () => {
    let store = addNamedTag(emptyTags(), [a], "Bleu", "green");
    expect(colorTags(store).find((tag) => tag.color === "blue")?.name).toBe(
      "Bleu (2)",
    );
    store = toggleColorTag(store, [a], "blue");
    expect(store.labels.map((tag) => tag.name)).toEqual(["Bleu", "Bleu (2)"]);
    store = addNamedTag(store, [a, b], "  À relire  ");
    const id = store.labels.find((tag) => tag.name === "À relire")!.id;
    expect(tagSelectionState(store, [a, b], id)).toBe(true);
    store = addNamedTag(store, [a], "à relire");
    expect(store.labels).toHaveLength(3);
    expect(tagSelectionState(store, [a], id)).toBe(true);
    store = toggleTag(store, [a], id);
    expect(tagSelectionState(store, [a, b], id)).toBe("mixed");
  });
  it("retire les associations sélectionnées, en conservant les noms et les autres chemins", () => {
    const store = addNamedTag(emptyTags(), [a, b], "Travail");
    const next = clearSelectionTags(store, [a]);
    expect(next.labels).toEqual(store.labels);
    expect(Object.keys(next.files)).toEqual(["c:/docs/b.txt"]);
    expect(store.files["c:/docs/a.txt"]).toHaveLength(1);
  });
  it("refuse les entrées invalides et plafonds sans modifier le magasin", () => {
    const store = addNamedTag(emptyTags(), [a], "Travail");
    expect(() => toggleColorTag(store, [], "red")).toThrow();
    expect(() => clearSelectionTags(store, ["../secret"])).toThrow();
    expect(() => addNamedTag(store, [b], "\u0000")).toThrow();
    expect(() => toggleTag(store, [a], "supprimé")).toThrow();
    expect(() => toggleColorTag(store, Array(1001).fill(a), "red")).toThrow();
    const full = restoreTags({
      ...emptyTags(),
      labels: Array.from({ length: 32 }, (_, i) => ({
        id: `id-${i}`,
        name: `Tag ${i}`,
        color: "gray",
      })),
      files: {},
    });
    expect(() => toggleColorTag(full, [a], "red")).toThrow();
    expect(() =>
      toggleColorTag({ ...store, files: { [a]: ["inconnu"] } }, [b], "red"),
    ).toThrow();
    expect(store.labels).toHaveLength(1);
    expect(Object.keys(store.files)).toEqual(["c:/docs/a.txt"]);
  });
});

describe("vérification de la sélection avant attribution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("vérifie les métadonnées avant l’écriture protégée", async () => {
    vi.mocked(bridge.request).mockResolvedValue({
      ...entry,
      path: "c:\\Docs\\a.txt",
    });
    const update = vi.fn((value) => toggleColorTag(value, [a], "red"));
    await saveSelectionTags([entry], update);
    expect(bridge.request).toHaveBeenCalledWith("FS_STAT", { path: a }, 5000);
    expect(storageUpdate).toHaveBeenCalledWith("fileTags", emptyTags(), update);
  });
  it("ne lance aucune écriture si un élément du lot a changé ou est absent", async () => {
    vi.mocked(bridge.request)
      .mockResolvedValueOnce(entry)
      .mockResolvedValueOnce({ ...entry, path: b, size: 13 });
    await expect(
      saveSelectionTags([entry, { ...entry, path: b }], () => emptyTags()),
    ).rejects.toThrow("sélection a changé");
    expect(storageUpdate).not.toHaveBeenCalled();
    vi.mocked(bridge.request).mockRejectedValueOnce(
      new Error("Fichier absent"),
    );
    await expect(saveSelectionTags([entry], () => emptyTags())).rejects.toThrow(
      "Fichier absent",
    );
    expect(storageUpdate).not.toHaveBeenCalled();
  });
  it("refuse les chemins invalides et une autre identité avant de stocker", async () => {
    await expect(
      saveSelectionTags([{ ...entry, path: "../secret" }], () => emptyTags()),
    ).rejects.toThrow();
    expect(bridge.request).not.toHaveBeenCalled();
    vi.mocked(bridge.request).mockResolvedValue({ ...entry, path: b });
    await expect(saveSelectionTags([entry], () => emptyTags())).rejects.toThrow(
      "sélection a changé",
    );
    expect(storageUpdate).not.toHaveBeenCalled();
  });
});
