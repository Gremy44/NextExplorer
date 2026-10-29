import { mediaType, type Entry, type Listing } from "./types";
import { fileKey, sameFamilyFile } from "./file-families";
import { previewText } from "./preview-text";

export const INDEX_LIMIT = 50_000;
export const INDEX_DIRECTORIES = 5_000;
export const INDEX_DEPTH = 64;
export const INDEX_METADATA_BYTES = 32 * 1024 * 1024;
export const INDEX_TEXT_BYTES = 16 * 1024;
export const INDEX_TEXT_LIMIT = 16 * 1024 * 1024;
export const textRulesKey = "textKeywordRules";
export type TextRule = { id: string; name: string; keywords: string };
export function restoreTextRules(value: unknown): TextRule[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new Error("50 règles de mots-clés maximum");
  const names = new Set<string>(),
    ids = new Set<string>();
  return value.map((rule) => {
    if (
      !rule ||
      typeof rule.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(rule.id) ||
      ids.has(rule.id) ||
      typeof rule.name !== "string" ||
      !rule.name.trim() ||
      rule.name.length > 80 ||
      /\p{Cc}/u.test(rule.name) ||
      names.has(rule.name.trim().toLocaleLowerCase("fr")) ||
      typeof rule.keywords !== "string" ||
      rule.keywords.length > 400 ||
      !words(rule.keywords).length
    )
      throw new Error("Règle de mots-clés invalide ou nom déjà utilisé");
    names.add(rule.name.trim().toLocaleLowerCase("fr"));
    ids.add(rule.id);
    return { id: rule.id, name: rule.name.trim(), keywords: rule.keywords };
  });
}
export type IndexedFile = {
  entry: Entry;
  text: string;
  note: string;
  source?: string;
};
export type LocalIndex = {
  version: 1;
  root: string;
  date: string;
  files: IndexedFile[];
  folders: Entry[];
  directories: number;
  omitted: number;
  errors: number;
  milliseconds: number;
  hidden: boolean;
  coverage?: {
    scanned: number;
    extracted: number;
    partialTexts: number;
    skipped: number;
    reasons: string[];
    unreadable: string[];
    content: boolean;
  };
};
export type IndexProgress = {
  phase: "list" | "content";
  processed: number;
  files: number;
  directories: number;
  pending: number;
  path: string;
};
export type IndexIO = {
  list: (
    path: string,
    offset: number,
    snapshot: string,
    hidden: boolean,
  ) => Promise<Listing & { snapshot: string }>;
  stat: (path: string) => Promise<Entry>;
  read: (path: string) => Promise<{ bytes: Uint8Array; size: number }>;
  pdf?: (path: string) => Promise<{ text: string; note: string }>;
  office?: (path: string) => Promise<{ text: string; note: string }>;
};
export const normalizeSearch = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
export const searchTerms = (text: string) =>
  normalizeSearch(text).trim().split(/\s+/u).filter(Boolean).slice(0, 50);
const searchDocuments = new WeakMap<
  LocalIndex,
  { name: string; content: string; source: string }[]
>();
export function words(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("fr")
      .match(/[\p{L}\p{N}]{2,40}/gu)
      ?.slice(0, 5000) || []
  );
}
export function searchIndex(
  index: LocalIndex,
  query: string,
  extension = "",
  keyword = "",
) {
  let documents = searchDocuments.get(index);
  if (!documents) {
    documents = index.files.map(({ entry, text, source }) => ({
      name: normalizeSearch(entry.name),
      content: normalizeSearch(text),
      source: normalizeSearch(source || ""),
    }));
    searchDocuments.set(index, documents);
  }
  const terms = searchTerms(query),
    keywords = searchTerms(keyword);
  return index.files.filter(({ entry }, i) => {
    const doc = documents![i];
    return (
      (!extension || entry.ext === extension) &&
      terms.every(
        (term) =>
          doc.name.includes(term) ||
          doc.content.includes(term) ||
          doc.source.includes(term),
      ) &&
      keywords.every((term) => doc.content.includes(term))
    );
  });
}
const stopWords = new Set(
  "le la les des une un du de et est en au aux avec pour sur dans par ce ces qui que pas plus vous nous son ses se il elle".split(
    " ",
  ),
);
export function relatedTexts(files: IndexedFile[], path: string) {
  const docs = files.map((file) =>
    words(file.text).filter((word) => !stopWords.has(word)),
  );
  const frequency = new Map<string, number>();
  for (const doc of docs)
    for (const word of new Set(doc))
      frequency.set(word, (frequency.get(word) || 0) + 1);
  const vectors = docs.map((doc) => {
    const vector = new Map<string, number>();
    for (const word of doc) vector.set(word, (vector.get(word) || 0) + 1);
    for (const [word, count] of vector)
      vector.set(
        word,
        (1 + Math.log(count)) *
          (1 + Math.log((1 + files.length) / (1 + frequency.get(word)!))),
      );
    return vector;
  });
  const target = files.findIndex(
    (file) => fileKey(file.entry.path) === fileKey(path),
  );
  if (target < 0) return [];
  const norm = (v: Map<string, number>) =>
    Math.sqrt([...v.values()].reduce((sum, value) => sum + value * value, 0));
  const norms = vectors.map(norm);
  return files
    .map((file, i) => ({
      file,
      score:
        i === target
          ? 0
          : [...vectors[target]].reduce(
              (sum, [word, value]) => sum + value * (vectors[i].get(word) || 0),
              0,
            ) / (norms[target] * norms[i] || 1),
    }))
    .filter((item) => item.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function buildIndex(
  root: string,
  hidden: boolean,
  io: IndexIO,
  signal: AbortSignal,
  progress: (value: IndexProgress) => void,
  content = true,
) {
  const started = performance.now();
  const result: LocalIndex = {
    version: 1,
    root,
    hidden,
    date: new Date().toISOString(),
    files: [],
    folders: [],
    directories: 0,
    omitted: 0,
    errors: 0,
    milliseconds: 0,
    coverage: {
      scanned: 0,
      extracted: 0,
      partialTexts: 0,
      skipped: 0,
      reasons: [],
      unreadable: [],
      content,
    },
  };
  const coverage = result.coverage!;
  const reason = (message: string) => {
    if (!coverage.reasons.includes(message)) coverage.reasons.push(message);
  };
  const queue = [{ path: root, depth: 0 }],
    seen = new Set<string>();
  let textBudget = INDEX_TEXT_LIMIT,
    visited = 0,
    metadataBytes = 0,
    head = 0,
    lastProgress = 0,
    processed = 0;
  let phase: "list" | "content" = "list";
  const report = (path: string, force = false) => {
    if (force || performance.now() - lastProgress > 100) {
      lastProgress = performance.now();
      progress({
        phase,
        processed,
        files: result.files.length,
        directories: result.directories,
        pending: queue.length - head,
        path,
      });
    }
  };
  while (
    head < queue.length &&
    visited < INDEX_LIMIT &&
    result.directories < INDEX_DIRECTORIES &&
    metadataBytes < INDEX_METADATA_BYTES
  ) {
    signal.throwIfAborted();
    const dir = queue[head++];
    if (seen.has(fileKey(dir.path))) continue;
    seen.add(fileKey(dir.path));
    let offset = 0,
      snapshot = "";
    result.directories++;
    report(dir.path, true);
    try {
      const stamp = await io.stat(dir.path);
      signal.throwIfAborted();
      if (stamp.type !== "directory")
        throw new Error("Le dossier a changé pendant l’indexation");
      const folderBytes = new TextEncoder().encode(
        JSON.stringify(stamp),
      ).length;
      if (metadataBytes + folderBytes > INDEX_METADATA_BYTES) {
        reason("Budget de métadonnées de 32 Mio atteint");
        metadataBytes = INDEX_METADATA_BYTES;
        result.omitted++;
        break;
      }
      result.folders.push(stamp);
      metadataBytes += folderBytes;
      do {
        const page = await io.list(dir.path, offset, snapshot, hidden);
        signal.throwIfAborted();
        if (
          page.currentPath !== dir.path ||
          !Number.isSafeInteger(page.total) ||
          page.total < 0 ||
          !Array.isArray(page.entries) ||
          !page.snapshot ||
          (snapshot && page.snapshot !== snapshot) ||
          !Number.isSafeInteger(page.nextOffset) ||
          page.nextOffset !== offset + page.entries.length ||
          page.nextOffset > page.total
        )
          throw new Error(
            "Pagination du dossier invalide : relancez l’analyse",
          );
        if (page.truncated) {
          reason(
            "Liste native partielle : certains noms du dossier ne sont pas fournis par le compagnon",
          );
          if (offset === 0 && coverage.unreadable.length < 20)
            coverage.unreadable.push(dir.path);
        }
        if (offset === 0 && page.skipped) {
          result.errors += page.skipped;
          reason(
            "Métadonnées inaccessibles : certains fichiers ne sont pas indexés",
          );
        }
        snapshot = page.snapshot;
        for (const entry of page.entries) {
          signal.throwIfAborted();
          const weight = new TextEncoder().encode(JSON.stringify(entry)).length;
          if (
            visited >= INDEX_LIMIT ||
            metadataBytes + weight > INDEX_METADATA_BYTES
          ) {
            reason(
              visited >= INDEX_LIMIT
                ? "Plafond de 50 000 entrées atteint"
                : "Budget de métadonnées de 32 Mio atteint",
            );
            result.omitted += page.total - offset - page.entries.indexOf(entry);
            if (metadataBytes + weight > INDEX_METADATA_BYTES)
              metadataBytes = INDEX_METADATA_BYTES;
            break;
          }
          visited++;
          coverage.scanned = visited;
          metadataBytes += weight;
          if (entry.type === "directory") {
            if (dir.depth < INDEX_DEPTH && queue.length < INDEX_DIRECTORIES)
              queue.push({ path: entry.path, depth: dir.depth + 1 });
            else {
              result.omitted++;
              reason(
                dir.depth >= INDEX_DEPTH
                  ? "Profondeur maximale de 64 niveaux atteinte"
                  : "Plafond de 5 000 dossiers atteint",
              );
            }
            continue;
          }
          if (
            entry.type !== "file" ||
            entry.name.toLowerCase().endsWith(".source.json")
          ) {
            coverage.skipped++;
            continue;
          }
          const file: IndexedFile = {
            entry,
            text: "",
            note: "Nom uniquement · format non extrait",
          };
          result.files.push(file);
          report(dir.path);
        }
        if (visited >= INDEX_LIMIT || metadataBytes >= INDEX_METADATA_BYTES) {
          if (
            visited === INDEX_LIMIT &&
            page.nextOffset < page.total &&
            !coverage.reasons.includes("Plafond de 50 000 entrées atteint")
          ) {
            result.omitted += page.total - page.nextOffset;
            reason("Plafond de 50 000 entrées atteint");
          }
          break;
        }
        if (page.nextOffset <= offset && page.nextOffset < page.total)
          throw new Error("Pagination du dossier interrompue");
        offset = page.nextOffset;
        if (offset >= page.total) break;
      } while (true);
    } catch (error) {
      signal.throwIfAborted();
      if (dir.depth === 0) throw error;
      result.errors++;
      reason("Sous-dossiers inaccessibles ou modifiés pendant le parcours");
      if (coverage.unreadable.length < 20) coverage.unreadable.push(dir.path);
    }
  }
  signal.throwIfAborted();
  result.omitted += queue.length - head;
  if (head < queue.length)
    reason(
      visited >= INDEX_LIMIT
        ? "Plafond de 50 000 entrées atteint"
        : metadataBytes >= INDEX_METADATA_BYTES
          ? "Budget de métadonnées de 32 Mio atteint"
          : "Plafond de 5 000 dossiers atteint",
    );
  // Capture directory pages before slow document extraction can expire their snapshots.
  phase = "content";
  for (const file of result.files) {
    signal.throwIfAborted();
    const entry = file.entry;
    try {
      if (!content) file.note = "Nom uniquement · contenu non demandé";
      else if (entry.size === 0) file.note = "Fichier vide";
      else if (["text", "link"].includes(mediaType(entry)) && textBudget > 0) {
        const value = await io.read(entry.path);
        signal.throwIfAborted();
        const parsed = previewText(value.bytes, value.size);
        file.text = parsed.text.slice(0, Math.min(8192, textBudget));
        file.note = parsed.binary
          ? "Nom uniquement · données binaires"
          : parsed.truncated || file.text.length < parsed.text.length
            ? "Extrait tronqué (16 Kio / 1 000 lignes / 8 192 caractères)"
            : "Texte extrait";
      } else if (
        /^\.(docx|xlsx|pptx)$/i.test(entry.ext) &&
        io.office &&
        textBudget > 0
      ) {
        const parsed = await io.office(entry.path);
        signal.throwIfAborted();
        file.text = parsed.text.slice(0, Math.min(8192, textBudget));
        file.note = parsed.note;
      } else if (entry.ext === ".pdf") {
        file.note = "Nom uniquement · pdftotext non installé";
        if (io.pdf && textBudget > 0) {
          const parsed = await io.pdf(entry.path);
          signal.throwIfAborted();
          file.text = parsed.text.slice(0, Math.min(8192, textBudget));
          file.note = parsed.note;
        }
      } else if (textBudget <= 0)
        file.note = "Nom uniquement · budget de texte atteint";
      if (file.text) {
        const actual = await io.stat(entry.path);
        if (
          !sameFamilyFile(entry, actual) ||
          (entry.stamp && entry.stamp !== actual.stamp)
        )
          throw new Error("Fichier modifié pendant la lecture");
        coverage.extracted++;
        if (/tronqu|partiel/i.test(file.note)) coverage.partialTexts++;
      }
    } catch (error) {
      signal.throwIfAborted();
      file.text = "";
      file.note = (error as Error).message.slice(0, 1024);
      result.errors++;
    }
    textBudget -= file.text.length;
    processed++;
    report(entry.path);
  }
  report(root, true);
  result.milliseconds = Math.round(performance.now() - started);
  return result;
}

export async function indexIsCurrent(
  index: LocalIndex,
  stat: IndexIO["stat"],
  signal: AbortSignal,
  check?: (entries: Entry[]) => Promise<boolean>,
) {
  const entries = [...index.folders, ...index.files.map((file) => file.entry)];
  if (check) {
    let batch: Entry[] = [],
      bytes = 0;
    for (const entry of entries) {
      signal.throwIfAborted();
      const weight = new TextEncoder().encode(JSON.stringify(entry)).length;
      if (
        batch.length &&
        (batch.length === 100 || bytes + weight > 128 * 1024)
      ) {
        if (!(await check(batch))) {
          signal.throwIfAborted();
          return false;
        }
        batch = [];
        bytes = 0;
      }
      batch.push(entry);
      bytes += weight;
    }
    const current = !batch.length || (await check(batch));
    signal.throwIfAborted();
    return current;
  }
  let next = 0,
    current = true;
  await Promise.all(
    Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (next < entries.length && current) {
        signal.throwIfAborted();
        const expected = entries[next++];
        try {
          const actual = await stat(expected.path);
          signal.throwIfAborted();
          if (
            actual.type !== expected.type ||
            actual.size !== expected.size ||
            actual.mtime !== expected.mtime ||
            (expected.stamp && actual.stamp !== expected.stamp)
          )
            current = false;
        } catch (error) {
          signal.throwIfAborted();
          current = false;
        }
      }
    }),
  );
  signal.throwIfAborted();
  return current;
}
