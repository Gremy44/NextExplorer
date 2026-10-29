import { describe, it, expect } from "vitest";
import {
  DocumentDraftStore,
  draftPrefix,
  type TextDocument,
} from "./document-drafts";

function storage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (n: number) => [...data.keys()][n] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  } as Storage;
}
const doc = (path = "C:\\Notes\\note.txt"): TextDocument => ({
  text: "Original\r\n",
  hash: "a".repeat(64),
  entry: {
    path,
    name: "note.txt",
    type: "file",
    size: 10,
    ext: ".txt",
    mtime: 1,
    stamp: "stamp",
  },
});
describe("récupération locale des documents", () => {
  it("persiste immédiatement le texte, y compris vide, et le snapshot après fermeture", () => {
    const disk = storage(),
      first = new DocumentDraftStore(() => disk);
    const saved = first.write(doc(), "");
    expect(saved.error).toBe("");
    const reopened = new DocumentDraftStore(() => disk);
    expect(reopened.get(doc().entry.path)).toEqual(saved.draft);
    expect(reopened.get(doc().entry.path)?.document.hash).toBe("a".repeat(64));
    reopened.remove(saved.draft);
    expect(first.list()).toHaveLength(0);
  });
  it("conserve des variantes distinctes si deux fenêtres reprennent le même brouillon", () => {
    const disk = storage(),
      a = new DocumentDraftStore(() => disk),
      b = new DocumentDraftStore(() => disk);
    const old = a.write(doc(), "Première version").draft;
    const second = b.write(old.document, "Autre fenêtre", old).draft;
    const newer = a.write(old.document, "Suite première fenêtre", old).draft;
    expect(newer.id).not.toBe(second.id);
    expect(
      a
        .list()
        .map((d) => d.text)
        .sort(),
    ).toEqual(["Autre fenêtre", "Suite première fenêtre"]);
    a.remove(old);
    expect(a.list()).toHaveLength(2);
    a.remove(newer);
    expect(b.list()).toEqual([second]);
  });
  it("ne remplace ni n'efface un brouillon si le stockage est plein", () => {
    const disk = storage(),
      store = new DocumentDraftStore(() => disk);
    const old = store.write(doc(), "Conservé").draft;
    const set = disk.setItem;
    disk.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const failed = store.write(doc(), "Dernière saisie", old);
    expect(failed.error).toContain("uniquement dans cette page");
    expect(store.get(doc().entry.path)?.text).toBe("Dernière saisie");
    expect(new DocumentDraftStore(() => disk).get(doc().entry.path)?.text).toBe(
      "Conservé",
    );
    disk.setItem = set;
    store.write(doc(), "Dernière saisie", failed.draft);
    expect(new DocumentDraftStore(() => disk).list()).toHaveLength(1);
    expect(new DocumentDraftStore(() => disk).get(doc().entry.path)?.text).toBe(
      "Dernière saisie",
    );
  });
  it("n'évince aucun brouillon au plafond de 20", () => {
    const disk = storage(),
      store = new DocumentDraftStore(() => disk);
    for (let i = 0; i < 20; i++)
      expect(store.write(doc(`C:\\${i}.txt`), "Texte").error).toBe("");
    expect(store.write(doc("C:\\21.txt"), "Non durable").error).toContain(
      "20 brouillons",
    );
    expect(new DocumentDraftStore(() => disk).list()).toHaveLength(20);
    expect(store.list()).toHaveLength(21);
  });
  it("un abandon explicite efface aussi la dernière copie durable après un échec de quota", () => {
    const disk = storage(),
      store = new DocumentDraftStore(() => disk);
    const old = store.write(doc(), "Durable").draft;
    disk.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const failed = store.write(doc(), "Non durable", old).draft;
    store.remove(failed);
    expect(store.list()).toHaveLength(0);
    expect(new DocumentDraftStore(() => disk).list()).toHaveLength(0);
  });
  it("borne les octets stockés et refuse les données invalides sans casser les autres", () => {
    const disk = storage(),
      store = new DocumentDraftStore(() => disk);
    const large = { ...doc(), text: "x".repeat(128 * 1024) };
    for (let i = 0; i < 5; i++)
      expect(
        store.write(
          { ...large, entry: { ...large.entry, path: `C:\\${i}.txt` } },
          "y".repeat(128 * 1024),
        ).error,
      ).toBe("");
    expect(
      store.write(
        { ...large, entry: { ...large.entry, path: "C:\\6.txt" } },
        "y".repeat(128 * 1024),
      ).error,
    ).toContain("3 Mio");
    disk.setItem(draftPrefix + "damaged", "{");
    disk.setItem(
      draftPrefix + "invalid",
      JSON.stringify({ version: 1, id: "invalid", document: {} }),
    );
    disk.setItem("preferences", "{}");
    expect(new DocumentDraftStore(() => disk).list()).toHaveLength(5);
    expect(() => store.write(doc(), "x".repeat(128 * 1024 + 1))).toThrow();
    expect(() => store.write({ ...doc(), hash: "bad" }, "test")).toThrow();
  });
  it("garde la saisie en mémoire si le stockage est inaccessible", () => {
    const store = new DocumentDraftStore(() => {
      throw new Error("SecurityError");
    });
    const saved = store.write(doc(), "Local");
    expect(saved.error).toContain("Ne la fermez pas");
    expect(store.get(doc().entry.path)).toEqual(saved.draft);
  });
});
