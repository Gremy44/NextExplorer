import type { Entry } from "./types";

export type TextDocument = { text: string; hash: string; entry: Entry };
export type DocumentDraft = {
  version: 1;
  id: string;
  writer: string;
  updated: number;
  document: TextDocument;
  text: string;
};
export const draftPrefix = "nextexplorer:document-draft:";
const textLimit = 128 * 1024;
const budget = 3 * 1024 * 1024;

function valid(value: unknown): value is DocumentDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as DocumentDraft,
    e = d.document?.entry;
  return (
    d.version === 1 &&
    typeof d.id === "string" &&
    /^[\w-]{1,80}$/.test(d.id) &&
    typeof d.writer === "string" &&
    Number.isFinite(d.updated) &&
    d.updated > 0 &&
    typeof d.text === "string" &&
    d.text.length <= textLimit &&
    typeof d.document?.text === "string" &&
    d.document.text.length <= textLimit &&
    d.text !== d.document.text &&
    typeof d.document.hash === "string" &&
    /^[a-f0-9]{64}$/.test(d.document.hash) &&
    !!e &&
    e.type === "file" &&
    typeof e.path === "string" &&
    e.path.length > 0 &&
    e.path.length <= 32768 &&
    typeof e.name === "string" &&
    typeof e.ext === "string" &&
    Number.isSafeInteger(e.size) &&
    e.size >= 0 &&
    e.size <= textLimit &&
    Number.isFinite(e.mtime) &&
    (e.stamp === undefined || typeof e.stamp === "string")
  );
}

// One key per draft: two windows never rewrite a shared collection or each other's text.
export class DocumentDraftStore {
  private writer = crypto.randomUUID();
  private pending = new Map<string, DocumentDraft>();
  private pendingBase = new Map<string, string | null>();
  constructor(
    private storage: () => Storage,
    private changed = () => {},
  ) {}
  list(): DocumentDraft[] {
    const records = new Map<string, DocumentDraft>();
    try {
      const storage = this.storage();
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(draftPrefix)) continue;
        const raw = storage.getItem(key);
        if (!raw || raw.length * 2 > budget) continue;
        try {
          const d: unknown = JSON.parse(raw);
          if (valid(d) && key === draftPrefix + d.id) records.set(d.id, d);
        } catch {
          /* A damaged record must not stop recovery of the others. */
        }
      }
    } catch {
      /* Pending text stays available even when storage is disabled. */
    }
    this.pending.forEach((d, id) => records.set(id, d));
    return [...records.values()].sort(
      (a, b) => b.updated - a.updated || a.id.localeCompare(b.id),
    );
  }
  get(path: string, id?: string) {
    return this.list().find(
      (d) => d.document.entry.path === path && (!id || d.id === id),
    );
  }
  isPending(id: string) {
    return this.pending.has(id);
  }
  remove(draft: DocumentDraft) {
    const key = draftPrefix + draft.id;
    const raw = JSON.stringify(draft);
    const storage = this.storage();
    // An older editor must never discard a newer persisted revision.
    const pending = JSON.stringify(this.pending.get(draft.id)) === raw;
    const stored = storage.getItem(key);
    if (
      stored === raw ||
      (pending && this.pendingBase.get(draft.id) === stored)
    )
      storage.removeItem(key);
    if (pending) {
      this.pending.delete(draft.id);
      this.pendingBase.delete(draft.id);
    }
    this.changed();
  }
  write(document: TextDocument, text: string, previous?: DocumentDraft) {
    const draft: DocumentDraft = {
      version: 1,
      id: previous?.writer === this.writer ? previous.id : crypto.randomUUID(),
      writer: this.writer,
      updated: Date.now(),
      document,
      text,
    };
    if (!valid(draft))
      throw new Error("Brouillon invalide ou supérieur à 128 Kio.");
    let error = "";
    let before: string | null | undefined;
    try {
      const storage = this.storage(),
        raw = JSON.stringify(draft);
      before = storage.getItem(draftPrefix + draft.id);
      const others = this.list().filter(
        (d) => d.id !== draft.id && d.id !== previous?.id,
      );
      if (
        others.length >= 20 ||
        others.reduce(
          (n, d) => n + JSON.stringify(d).length * 2,
          raw.length * 2,
        ) > budget
      )
        throw new Error(
          "Limite de récupération atteinte (20 brouillons / 3 Mio).",
        );
      storage.setItem(draftPrefix + draft.id, raw);
      this.pending.delete(draft.id);
      this.pendingBase.delete(draft.id);
      if (previous && previous.id !== draft.id) this.remove(previous);
    } catch (e) {
      this.pending.set(draft.id, draft);
      if (before !== undefined) this.pendingBase.set(draft.id, before);
      error = `Brouillon conservé uniquement dans cette page. Ne la fermez pas : ${(e as Error).message}`;
    }
    this.changed();
    return { draft, error };
  }
}

export const documentDrafts = new DocumentDraftStore(
  () => localStorage,
  () => window.dispatchEvent(new Event("nxe-drafts-changed")),
);
export const hasDocumentDraft = (path?: string) =>
  path ? !!documentDrafts.get(path) : documentDrafts.list().length > 0;

export function downloadDraft(draft: DocumentDraft) {
  const url = URL.createObjectURL(
    new Blob([draft.text], { type: "text/plain;charset=utf-8" }),
  );
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `brouillon-${draft.document.entry.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
