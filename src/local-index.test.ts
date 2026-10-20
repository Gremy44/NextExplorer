import { describe, expect, it } from "vitest";
import {
  buildIndex,
  relatedTexts,
  searchIndex,
  words,
  indexIsCurrent,
  type IndexIO,
  type IndexedFile,
} from "./local-index";
import type { Entry } from "./types";
import { restoreIndex } from "./index-store";
const file = (
  name: string,
  text = "",
  type: Entry["type"] = "file",
): IndexedFile => ({
  entry: {
    name,
    path: `C:/Corpus/${name}`,
    type,
    size: 10,
    mtime: 10,
    ext: name.match(/\.[^.]+$/)?.[0] || "",
  },
  text,
  note: "",
});
function ioFor(files: IndexedFile[]): IndexIO & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    list: async () => ({
      currentPath: "C:/Corpus",
      parentPath: "C:/",
      entries: files.map((f) => f.entry),
      total: files.length,
      nextOffset: files.length,
      snapshot: "snapshot",
    }),
    stat: async (path) =>
      path === "C:/Corpus"
        ? { ...file("Corpus", "", "directory").entry, path }
        : files.find((file) => file.entry.path === path)!.entry,
    read: async (path) => {
      reads.push(path);
      const text = files.find((file) => file.entry.path === path)!.text;
      return {
        bytes: new TextEncoder().encode(text),
        size: new TextEncoder().encode(text).length,
      };
    },
  };
}
describe("index local borné", () => {
  it("refuse un cache malformé et les extraits trop longs", async () => {
    const io = ioFor([file("a.txt", "atelier")]),
      index = await buildIndex(
        "C:/Corpus",
        false,
        io,
        new AbortController().signal,
        () => {},
      );
    expect(restoreIndex(index)).toEqual(index);
    expect(() =>
      restoreIndex({
        ...index,
        files: [{ entry: undefined, text: "secret", note: "" }],
      }),
    ).toThrow();
    expect(() =>
      restoreIndex({
        ...index,
        files: [{ ...index.files[0], text: "a".repeat(8193) }],
      }),
    ).toThrow();
  });
  it("détecte un changement à taille et seconde identiques grâce à la date précise", async () => {
    const io = ioFor([file("a.txt", "atelier")]),
      base = io.stat;
    io.stat = async (path) => ({ ...(await base(path)), stamp: "10000000001" });
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
    );
    result.files[0].entry.stamp = "10000000001";
    io.stat = async (path) => ({
      ...(await base(path)),
      stamp: path.endsWith("a.txt") ? "10000000002" : "10000000001",
    });
    expect(
      await indexIsCurrent(result, io.stat, new AbortController().signal),
    ).toBe(false);
  });
  it("contrôle les dossiers pour les ajouts et les fichiers pour les modifications", async () => {
    const io = ioFor([file("a.txt", "atelier")]),
      result = await buildIndex(
        "C:/Corpus",
        false,
        io,
        new AbortController().signal,
        () => {},
      );
    expect(
      await indexIsCurrent(result, io.stat, new AbortController().signal),
    ).toBe(true);
    const stat = io.stat;
    io.stat = async (path) => ({ ...(await stat(path)), mtime: 20 });
    expect(
      await indexIsCurrent(result, io.stat, new AbortController().signal),
    ).toBe(false);
  });
  it("indexe les noms et le texte sans lire les TIFF ni les liens symboliques", async () => {
    const files = [
        file("devis.md", "Électricité pour l’atelier"),
        file("gros.tiff"),
        file("lien.txt", "secret", "symlink"),
        file("scan.pdf"),
        file("photo.source.json", "secret"),
      ],
      io = ioFor(files);
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
    );
    expect(io.reads).toEqual([files[0].entry.path]);
    expect(result.files).toHaveLength(3);
    expect(
      searchIndex(result, "electricite atelier").map((f) => f.entry.name),
    ).toEqual(["devis.md"]);
    expect(searchIndex(result, "scan", ".pdf")).toHaveLength(1);
    expect(result.files[2].note).toMatch(/non installé/);
  });
  it("la reconstruction répercute ajout, modification et suppression", async () => {
    const a = [file("a.txt", "ancien"), file("supprime.txt", "ancien")];
    const before = await buildIndex(
      "C:/Corpus",
      false,
      ioFor(a),
      new AbortController().signal,
      () => {},
    );
    const after = await buildIndex(
      "C:/Corpus",
      false,
      ioFor([file("a.txt", "nouveau"), file("ajout.md", "nouveau")]),
      new AbortController().signal,
      () => {},
    );
    expect(searchIndex(before, "ancien")).toHaveLength(2);
    expect(searchIndex(after, "ancien")).toHaveLength(0);
    expect(searchIndex(after, "nouveau")).toHaveLength(2);
  });
  it("refuse un texte modifié pendant la lecture et distingue le binaire", async () => {
    const io = ioFor([
      file("change.txt", "texte"),
      file("binaire.txt", "\0\0\0"),
    ]);
    const original = io.stat;
    io.stat = async (path) =>
      path === "C:/Corpus"
        ? original(path)
        : { ...file("change.txt").entry, mtime: 12 };
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
    );
    expect(result.files.every((file) => !file.text)).toBe(true);
    expect(result.errors).toBe(1);
    expect(result.files[1].note).toMatch(/binaires/);
  });
  it("borne le nombre d’entrées, le texte et annule sans publier un résultat partiel", async () => {
    const files = Array.from({ length: 1003 }, (_, i) =>
        file(`${i}.txt`, "atelier ".repeat(3000)),
      ),
      io = ioFor(files);
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
    );
    expect(result.files).toHaveLength(1000);
    expect(result.omitted).toBeGreaterThanOrEqual(3);
    expect(
      result.files.reduce((n, f) => n + f.text.length, 0),
    ).toBeLessThanOrEqual(2 * 1024 * 1024);
    const controller = new AbortController();
    io.read = async () => {
      controller.abort();
      return { bytes: new Uint8Array(), size: 0 };
    };
    await expect(
      buildIndex("C:/Corpus", false, io, controller.signal, () => {}),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("TF-IDF rapproche le vocabulaire et ignore les textes vides", () => {
    const docs = [
      file("a.txt", "facture électricité atelier"),
      file("b.txt", "facture electricite atelier devis"),
      file("c.txt", "vacances plage soleil"),
      file("vide.txt"),
    ];
    const results = relatedTexts(docs, docs[0].entry.path);
    expect(results[0].file.entry.name).toBe("b.txt");
    expect(results.some((item) => item.file.entry.name === "vide.txt")).toBe(
      false,
    );
    expect(words("Électricité")).toEqual(["electricite"]);
  });
});
