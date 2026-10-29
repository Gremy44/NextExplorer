import {
  INDEX_LIMIT,
  INDEX_DIRECTORIES,
  INDEX_TEXT_LIMIT,
  INDEX_METADATA_BYTES,
  type LocalIndex,
} from "./local-index";
import { familyFile, fileKey } from "./file-families";
import { tagPath } from "./tags";

export function restoreIndex(value: unknown): LocalIndex | null {
  if (value === null) return null;
  const index = value as LocalIndex;
  if (
    !index ||
    index.version !== 1 ||
    !Array.isArray(index.files) ||
    index.files.length > INDEX_LIMIT ||
    !Array.isArray(index.folders) ||
    index.folders.length > INDEX_DIRECTORIES ||
    typeof index.hidden !== "boolean" ||
    ![index.directories, index.omitted, index.errors, index.milliseconds].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    typeof index.date !== "string" ||
    !Number.isFinite(Date.parse(index.date))
  )
    throw new Error("Index incompatible : effacez-le puis relancez l’analyse");
  tagPath(index.root);
  const root = fileKey(index.root).replace(/\/$/, ""),
    seen = new Set<string>();
  let length = 0,
    metadata = 0;
  const reference = (
    entry: LocalIndex["files"][number]["entry"],
    directory = false,
  ) => {
    const key = tagPath(entry.path);
    if (
      (!key.startsWith(root + "/") && !(directory && key === root)) ||
      seen.has(key) ||
      (entry.stamp !== undefined &&
        (typeof entry.stamp !== "string" || !/^-?\d{1,30}$/.test(entry.stamp)))
    )
      throw new Error("Référence d’index hors périmètre ou dupliquée");
    seen.add(key);
    metadata += new TextEncoder().encode(JSON.stringify(entry)).length;
  };
  for (const file of index.files) {
    familyFile(file.entry);
    reference(file.entry);
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
  if (length > INDEX_TEXT_LIMIT) throw new Error("Budget de l’index dépassé");
  for (const directory of index.folders) {
    tagPath(directory.path);
    reference(directory, true);
    if (
      directory.type !== "directory" ||
      !Number.isSafeInteger(directory.size) ||
      directory.size < 0 ||
      !Number.isFinite(directory.mtime)
    )
      throw new Error("Dossier d’index invalide");
  }
  if (metadata > INDEX_METADATA_BYTES)
    throw new Error("Budget de métadonnées de l’index dépassé");
  if (
    index.coverage &&
    (!Number.isSafeInteger(index.coverage.scanned) ||
      index.coverage.scanned < 0 ||
      index.coverage.scanned > INDEX_LIMIT ||
      ![
        index.coverage.extracted,
        index.coverage.partialTexts,
        index.coverage.skipped,
      ].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= INDEX_LIMIT) ||
      typeof index.coverage.content !== "boolean" ||
      !Array.isArray(index.coverage.reasons) ||
      index.coverage.reasons.length > 10 ||
      index.coverage.reasons.some(
        (reason) => typeof reason !== "string" || reason.length > 1024,
      ) ||
      !Array.isArray(index.coverage.unreadable) ||
      index.coverage.unreadable.length > 20)
  )
    throw new Error("Périmètre d’index invalide");
  for (const path of index.coverage?.unreadable || []) {
    const key = tagPath(path);
    if (key !== root && !key.startsWith(root + "/"))
      throw new Error("Dossier non parcouru hors périmètre");
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
  if (value !== undefined) restoreIndex(value);
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
