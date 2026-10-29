import { describe, expect, it } from "vitest";
import {
  buildIndex,
  relatedTexts,
  searchIndex,
  words,
  indexIsCurrent,
  INDEX_LIMIT,
  INDEX_TEXT_LIMIT,
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
  const byPath = new Map(files.map((file) => [file.entry.path, file]));
  return {
    reads,
    list: async (_path, offset) => ({
      currentPath: "C:/Corpus",
      parentPath: "C:/",
      entries: files.slice(offset, offset + 200).map((f) => f.entry),
      total: files.length,
      nextOffset: Math.min(offset + 200, files.length),
      snapshot: "snapshot",
    }),
    stat: async (path) =>
      path === "C:/Corpus"
        ? { ...file("Corpus", "", "directory").entry, path }
        : byPath.get(path)!.entry,
    read: async (path) => {
      reads.push(path);
      const text = byPath.get(path)!.text;
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
  it("dépasse les anciens plafonds et borne le texte sans perdre les noms", async () => {
    const files = Array.from({ length: 2503 }, (_, i) =>
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
    expect(result.files).toHaveLength(2503);
    expect(result.omitted).toBe(0);
    expect(
      result.files.reduce((n, f) => n + f.text.length, 0),
    ).toBeLessThanOrEqual(INDEX_TEXT_LIMIT);
    expect(result.files.at(-1)!.note).toContain("budget");
    const controller = new AbortController();
    io.read = async () => {
      controller.abort();
      return { bytes: new Uint8Array(), size: 0 };
    };
    await expect(
      buildIndex("C:/Corpus", false, io, controller.signal, () => {}),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("borne un grand index à 50 000 entrées et indique le parcours incomplet", async () => {
    const io = ioFor(
      Array.from({ length: INDEX_LIMIT + 3 }, (_, i) => file(`${i}.bin`)),
    );
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
      false,
    );
    expect(result.files).toHaveLength(INDEX_LIMIT);
    expect(result.omitted).toBe(3);
    expect(result.coverage?.reasons).toContain(
      "Plafond de 50 000 entrées atteint",
    );
    expect(restoreIndex(result)).toBe(result);
    expect(io.reads).toHaveLength(0);
  });
  it("recherche des fragments accentués, noms composés, extensions et caractères seuls", async () => {
    const index = await buildIndex(
      "C:/Corpus",
      false,
      ioFor([
        file("Électricité-2026.pdf"),
        file("a.txt", "L’atelier familial"),
      ]),
      new AbortController().signal,
      () => {},
    );
    expect(
      searchIndex(index, "elect 2026.pdf").map((f) => f.entry.name),
    ).toEqual(["Électricité-2026.pdf"]);
    expect(searchIndex(index, "a.txt")).toHaveLength(1);
    expect(searchIndex(index, "famil")).toHaveLength(1);
    expect(searchIndex(index, "a", "", "atelier")).toHaveLength(1);
    expect(searchIndex(index, "", ".pdf", "atelier")).toHaveLength(0);
  });
  it("signale une liste native tronquée et refuse une pagination bloquée", async () => {
    const io = ioFor([file("a.bin")]),
      base = io.list;
    io.list = async (...args) => ({
      ...(await base(...args)),
      truncated: true,
      skipped: 2,
    });
    const result = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
    );
    expect(result.coverage?.reasons).toHaveLength(2);
    expect(result.errors).toBe(2);
    expect(result.coverage?.unreadable).toEqual(["C:/Corpus"]);
    expect(restoreIndex(result)).toBe(result);
    io.list = async (...args) => ({
      ...(await base(...args)),
      entries: [],
      nextOffset: 0,
    });
    await expect(
      buildIndex(
        "C:/Corpus",
        false,
        io,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow(/Pagination/);
  });
  it("contrôle les métadonnées par lots bornés et interrompt au premier changement", async () => {
    const io = ioFor(Array.from({ length: 230 }, (_, i) => file(`${i}.bin`)));
    const index = await buildIndex(
      "C:/Corpus",
      false,
      io,
      new AbortController().signal,
      () => {},
      false,
    );
    const batches: Entry[][] = [];
    expect(
      await indexIsCurrent(
        index,
        async () => {
          throw new Error("contrôle isolé inattendu");
        },
        new AbortController().signal,
        async (entries) => {
          batches.push(entries);
          return true;
        },
      ),
    ).toBe(true);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 31]);
    expect(
      await indexIsCurrent(
        index,
        io.stat,
        new AbortController().signal,
        async () => false,
      ),
    ).toBe(false);
    const controller = new AbortController();
    await expect(
      indexIsCurrent(index, io.stat, controller.signal, async () => {
        controller.abort();
        return false;
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(() =>
      restoreIndex({
        ...index,
        files: [
          {
            ...index.files[0],
            entry: { ...index.files[0].entry, path: "C:/Autre/0.bin" },
          },
        ],
      }),
    ).toThrow(/périmètre/);
  });
  it("parcourt plus de 100 dossiers et signale le plafond de profondeur", async () => {
    const root = "C:/Corpus",
      tree = new Map<string, Entry[]>(),
      stamps = new Map<string, Entry>();
    const directory = (path: string): Entry => ({
      ...file(path.split("/").at(-1)!, "", "directory").entry,
      path,
    });
    tree.set(root, []);
    stamps.set(root, directory(root));
    for (let i = 0; i < 130; i++) {
      const path = `${root}/Dossier-${i}`,
        entry = directory(path);
      tree.get(root)!.push(entry);
      tree.set(path, []);
      stamps.set(path, entry);
      const item = { ...file(`${i}.bin`).entry, path: `${path}/${i}.bin` };
      tree.get(path)!.push(item);
      stamps.set(item.path, item);
    }
    let path = root;
    for (let i = 0; i < 66; i++) {
      const child = `${path}/Niveau`,
        entry = directory(child);
      tree.get(path)!.push(entry);
      tree.set(child, []);
      stamps.set(child, entry);
      path = child;
    }
    const result = await buildIndex(
      root,
      false,
      {
        list: async (path) => ({
          currentPath: path,
          parentPath: root,
          entries: tree.get(path)!,
          total: tree.get(path)!.length,
          nextOffset: tree.get(path)!.length,
          snapshot: "snapshot",
        }),
        stat: async (path) => stamps.get(path)!,
        read: async () => {
          throw new Error("Lecture de contenu inattendue");
        },
      },
      new AbortController().signal,
      () => {},
      false,
    );
    expect(result.directories).toBe(195);
    expect(result.files).toHaveLength(130);
    expect(result.coverage?.reasons).toContain(
      "Profondeur maximale de 64 niveaux atteinte",
    );
    expect(result.omitted).toBe(1);
    expect(restoreIndex(result)).toBe(result);
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
