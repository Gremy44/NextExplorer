import { checkCollection, COLLECTION_CHECK_LIMIT } from "./collection";
import { familyFile, fileKey, sameFamilyFile } from "./file-families";
import { GROUP_ENTRY_LIMIT } from "./file-groups";
import type { CollectionEntry, Entry } from "./types";

export const COPY_HASH_LIMIT = 100;
export const COPY_FILE_BYTES = 64 * 1024 * 1024;
export const COPY_READ_BUDGET = 256 * 1024 * 1024;
export type CopyHash = { algorithm: "blake3"; hash: string; entry: Entry };
export type CopyHashCache = Map<string, CopyHash>;
export type CopyProgress = { checked: number; hashed: number; cached: number };

function sameSnapshot(expected: Entry, actual: Entry) {
  return (
    actual.type === "file" &&
    sameFamilyFile(expected, actual) &&
    (!expected.stamp || expected.stamp === actual.stamp)
  );
}

function checkedResult(value: unknown, expected: Entry): CopyHash {
  const result = value as CopyHash;
  if (
    !result ||
    result.algorithm !== "blake3" ||
    typeof result.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(result.hash) ||
    !result.entry
  )
    throw new Error(
      "Empreinte ou métadonnées incompatibles. Mettez le compagnon à jour si nécessaire.",
    );
  familyFile(result.entry);
  if (
    !sameSnapshot(expected, result.entry) ||
    result.entry.stamp !== expected.stamp
  )
    throw new Error("Fichier modifié pendant le calcul de l’empreinte.");
  return result;
}

export async function groupIdenticalFiles(
  entries: CollectionEntry[],
  io: {
    stat: (path: string) => Promise<Entry>;
    hash: (entry: Entry) => Promise<unknown>;
  },
  signal: AbortSignal,
  cache: CopyHashCache,
  progress: (value: CopyProgress) => void,
) {
  signal.throwIfAborted();
  const files: Entry[] = [],
    seen = new Set<string>(),
    notes = new Map<string, string>();
  let excluded = 0;
  for (const entry of entries.slice(0, GROUP_ENTRY_LIMIT)) {
    if (entry.type !== "file" || /\.source\.json$/i.test(entry.name)) {
      excluded++;
      continue;
    }
    try {
      familyFile(entry);
    } catch {
      excluded++;
      continue;
    }
    const key = fileKey(entry.path);
    if (seen.has(key)) {
      excluded++;
      continue;
    }
    seen.add(key);
    files.push(entry);
  }
  const bounded = files.slice(0, COLLECTION_CHECK_LIMIT),
    current = new Map<string, Entry>();
  const counts: CopyProgress = { checked: 0, hashed: 0, cached: 0 };
  const publish = () => {
    signal.throwIfAborted();
    progress({ ...counts });
  };
  await checkCollection(bounded, io.stat, signal, (check) => {
    counts.checked++;
    const key = fileKey(check.entry.path);
    try {
      if (!check.current || check.status !== "present")
        throw new Error(
          "Référence absente ou modifiée ; actualisez la source.",
        );
      familyFile(check.current);
      if (!check.current.stamp || !/^-?\d{1,24}$/.test(check.current.stamp))
        throw new Error(
          "Métadonnées précises indisponibles : mettez le compagnon à jour.",
        );
      if (!sameSnapshot(check.entry, check.current))
        throw new Error("Référence modifiée ; actualisez la source.");
      current.set(key, check.current);
    } catch (error) {
      notes.set(check.entry.path, (error as Error).message);
      cache.delete(key);
    }
    publish();
  });
  signal.throwIfAborted();
  const sizes = new Map<number, number>();
  for (const file of current.values())
    sizes.set(file.size, (sizes.get(file.size) || 0) + 1);
  const hashes = new Map<string, CopyHash>(),
    distinct: Entry[] = [];
  let attempted = 0,
    budget = 0;
  for (const original of bounded) {
    signal.throwIfAborted();
    const key = fileKey(original.path),
      file = current.get(key);
    if (!file) continue;
    if (sizes.get(file.size) === 1) {
      distinct.push(file);
      notes.set(
        file.path,
        "Aucun autre fichier de cette taille parmi les références contrôlées.",
      );
      continue;
    }
    if (attempted >= COPY_HASH_LIMIT) {
      notes.set(original.path, "Limite de 100 empreintes atteinte.");
      continue;
    }
    if (file.size > COPY_FILE_BYTES) {
      notes.set(original.path, "Plus de 64 Mio : contenu non lu.");
      continue;
    }
    attempted++;
    try {
      const saved = cache.get(key);
      if (saved && sameSnapshot(file, saved.entry)) {
        hashes.set(key, checkedResult(saved, file));
        counts.cached++;
      } else {
        cache.delete(key);
        if (budget + file.size > COPY_READ_BUDGET) {
          notes.set(original.path, "Budget de lecture de 256 Mio atteint.");
          continue;
        }
        budget += file.size;
        const raw = await io.hash(file);
        signal.throwIfAborted();
        const value = checkedResult(raw, file);
        hashes.set(key, value);
        if (cache.size >= COPY_HASH_LIMIT)
          cache.delete(cache.keys().next().value!);
        cache.set(key, value);
        counts.hashed++;
      }
    } catch (error) {
      signal.throwIfAborted();
      cache.delete(key);
      notes.set(original.path, (error as Error).message.slice(0, 1024));
    }
    publish();
  }
  // A file hashed early may change while the remaining files are being read.
  await checkCollection([...current.values()], io.stat, signal, (check) => {
    if (!check.current || !sameSnapshot(check.entry, check.current)) {
      const key = fileKey(check.entry.path);
      current.delete(key);
      hashes.delete(key);
      cache.delete(key);
      notes.set(
        check.entry.path,
        "Fichier modifié pendant l’analyse ; relancez le regroupement.",
      );
    }
  });
  signal.throwIfAborted();
  const buckets = new Map<string, Entry[]>();
  for (const result of hashes.values()) {
    const key = `${result.entry.size}:${result.hash}`;
    buckets.set(key, [...(buckets.get(key) || []), result.entry]);
  }
  const groups = [...buckets.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([hash, entries], index) => ({
      id: `copy:${hash}`,
      name: `Copies identiques · groupe ${index + 1}`,
      entries,
      reason: `Même taille et empreinte BLAKE3 complète identique : ${hash.split(":")[1]}. Résultat à l’instant de l’analyse ; aucune suppression proposée.`,
    }));
  const matched = new Set(
    groups.flatMap((group) =>
      group.entries.map((entry) => fileKey(entry.path)),
    ),
  );
  const singles = [...hashes.values()]
    .map((result) => result.entry)
    .filter((entry) => !matched.has(fileKey(entry.path)));
  groups.push({
    id: "distinct",
    name: "Sans copie identique trouvée",
    entries: [
      ...distinct.filter((entry) => current.has(fileKey(entry.path))),
      ...singles,
    ],
    reason:
      "Tailles distinctes ou empreintes différentes parmi les fichiers contrôlés. Les fichiers non comparés peuvent encore contenir des copies.",
  });
  const processed = new Set(
    groups.flatMap((group) =>
      group.entries.map((entry) => fileKey(entry.path)),
    ),
  );
  const unexamined = files.filter(
    (entry) => !processed.has(fileKey(entry.path)),
  );
  for (const file of files.slice(COLLECTION_CHECK_LIMIT))
    notes.set(file.path, "Limite de 200 références contrôlées atteinte.");
  groups.push({
    id: "unexamined",
    name: "Non comparés",
    entries: unexamined,
    reason:
      "Limite, fichier indisponible ou modifié, ou empreinte non obtenue. Le motif est indiqué sous chaque fichier.",
  });
  return {
    groups,
    excluded,
    omitted: Math.max(0, entries.length - GROUP_ENTRY_LIMIT),
    examined: counts.checked,
    hashed: counts.hashed,
    cached: counts.cached,
    unexamined: unexamined.length,
    copies: matched.size,
    notes,
  };
}
