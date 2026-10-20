import type { LocalIndex } from "./local-index";
import { familyFile } from "./file-families";
import { tagPath } from "./tags";

export function restoreIndex(value: unknown): LocalIndex | null {
  if (value === null) return null;
  const index = value as LocalIndex;
  if (
    !index ||
    index.version !== 1 ||
    !Array.isArray(index.files) ||
    index.files.length > 1000 ||
    !Array.isArray(index.folders) ||
    index.folders.length > 100 ||
    typeof index.date !== "string" ||
    !Number.isFinite(Date.parse(index.date))
  )
    throw new Error("Index incompatible : effacez-le puis relancez l’analyse");
  tagPath(index.root);
  let length = 0;
  for (const file of index.files) {
    familyFile(file.entry);
    if (
      typeof file.text !== "string" ||
      file.text.length > 8192 ||
      typeof file.note !== "string" ||
      file.note.length > 4096 ||
      (file.source !== undefined &&
        (typeof file.source !== "string" || file.source.length > 16384))
    )
      throw new Error("Contenu d’index invalide : effacez l’index");
    length += file.text.length;
  }
  if (length > 2 * 1024 * 1024) throw new Error("Budget de l’index dépassé");
  for (const directory of index.folders) {
    tagPath(directory.path);
    if (
      directory.type !== "directory" ||
      !Number.isSafeInteger(directory.size) ||
      directory.size < 0 ||
      !Number.isFinite(directory.mtime)
    )
      throw new Error("Dossier d’index invalide");
  }
  return index;
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nextexplorer-search", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("index");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function indexStore(
  value?: LocalIndex | null,
  expectedRevision?: number,
): Promise<{ index: LocalIndex | null; revision: number }> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        "index",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = transaction.objectStore("index");
      const request = store.get("current"),
        stamp = store.get("revision");
      let revision = 0;
      stamp.onsuccess = () => {
        revision = stamp.result || 0;
        if (value === undefined) return;
        if (expectedRevision !== undefined && expectedRevision !== revision) {
          transaction.abort();
          return;
        }
        if (value === null) store.delete("current");
        else store.put(value, "current");
        store.put(++revision, "revision");
      };
      transaction.oncomplete = () => {
        try {
          resolve({
            index: restoreIndex(
              value === undefined ? request.result || null : value,
            ),
            revision,
          });
        } catch (error) {
          reject(error);
        }
      };
      transaction.onabort = () =>
        reject(transaction.error || new Error("Index non enregistré"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
