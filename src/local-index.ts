import type { Entry, Listing } from "./types";
import { fileKey, sameFamilyFile } from "./file-families";
import { previewText } from "./preview-text";

export const INDEX_LIMIT = 1000;
export const INDEX_TEXT_BYTES = 16 * 1024;
export const INDEX_TEXT_LIMIT = 2 * 1024 * 1024;
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
};
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
export function searchIndex(index: LocalIndex, query: string, extension = "") {
  const terms = [...new Set(words(query))];
  return index.files.filter(({ entry, text, source }) => {
    const tokens = new Set(words(`${entry.name} ${text} ${source || ""}`));
    return (
      (!extension || entry.ext === extension) &&
      terms.every((term) => tokens.has(term))
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
  return files
    .map((file, i) => ({
      file,
      score:
        i === target
          ? 0
          : [...vectors[target]].reduce(
              (sum, [word, value]) => sum + value * (vectors[i].get(word) || 0),
              0,
            ) / (norm(vectors[target]) * norm(vectors[i]) || 1),
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
  progress: (count: number) => void,
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
  };
  const queue = [{ path: root, depth: 0 }],
    seen = new Set<string>();
  let textBudget = INDEX_TEXT_LIMIT,
    visited = 0;
  while (queue.length && visited < INDEX_LIMIT && result.directories < 100) {
    signal.throwIfAborted();
    const dir = queue.shift()!;
    if (seen.has(fileKey(dir.path))) continue;
    seen.add(fileKey(dir.path));
    let offset = 0,
      snapshot = "";
    result.directories++;
    try {
      const stamp = await io.stat(dir.path);
      signal.throwIfAborted();
      if (stamp.type !== "directory")
        throw new Error("Le dossier a changé pendant l’indexation");
      result.folders.push(stamp);
      do {
        const page = await io.list(dir.path, offset, snapshot, hidden);
        signal.throwIfAborted();
        snapshot = page.snapshot;
        for (const entry of page.entries) {
          signal.throwIfAborted();
          if (++visited > INDEX_LIMIT) {
            result.omitted += Math.max(
              1,
              page.total - offset - page.entries.indexOf(entry),
            );
            break;
          }
          if (entry.type === "directory") {
            if (dir.depth < 8)
              queue.push({ path: entry.path, depth: dir.depth + 1 });
            else result.omitted++;
            continue;
          }
          if (entry.type !== "file" || entry.name.endsWith(".source.json"))
            continue;
          const file: IndexedFile = {
            entry,
            text: "",
            note: "Nom uniquement · format non extrait",
          };
          try {
            if (
              /^\.(txt|md|markdown|csv|json|log|xml|html?|css|[cm]?js|tsx?|ya?ml|weblink)$/i.test(
                entry.ext,
              ) &&
              textBudget > 0
            ) {
              const value = await io.read(entry.path);
              signal.throwIfAborted();
              const parsed = previewText(value.bytes, value.size);
              file.text = parsed.text.slice(0, Math.min(8192, textBudget));
              file.note = parsed.binary
                ? "Nom uniquement · données binaires"
                : parsed.truncated || file.text.length < parsed.text.length
                  ? "Extrait tronqué (16 Kio / 1 000 lignes / 8 192 caractères)"
                  : "Texte extrait";
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
            }
          } catch (error) {
            signal.throwIfAborted();
            file.text = "";
            file.note = (error as Error).message.slice(0, 1024);
            result.errors++;
          }
          textBudget -= file.text.length;
          result.files.push(file);
          progress(result.files.length);
        }
        if (visited >= INDEX_LIMIT) {
          if (page.nextOffset < page.total)
            result.omitted += page.total - page.nextOffset;
          break;
        }
        if (page.nextOffset <= offset) break;
        offset = page.nextOffset;
        if (offset >= page.total) break;
      } while (true);
    } catch (error) {
      signal.throwIfAborted();
      if (dir.depth === 0) throw error;
      result.errors++;
    }
  }
  signal.throwIfAborted();
  result.omitted += queue.length;
  result.milliseconds = Math.round(performance.now() - started);
  return result;
}

export async function indexIsCurrent(
  index: LocalIndex,
  stat: IndexIO["stat"],
  signal: AbortSignal,
) {
  const entries = [...index.folders, ...index.files.map((file) => file.entry)];
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
