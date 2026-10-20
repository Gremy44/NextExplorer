import { checkCollection, COLLECTION_CHECK_LIMIT } from "./collection";
import { GROUP_ENTRY_LIMIT } from "./file-groups";
import type { ImagePreparation } from "./image-preparations";
import { basename, type CollectionEntry, type Entry } from "./types";

export const fileFamiliesKey = "fileFamilies";
export const FILE_FAMILY_LIMIT = 50;
export const FAMILY_MEMBER_LIMIT = 20;
export function fileKey(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return /^(?:[a-z]:|\/\/)/i.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}
export function familyFile(value: unknown): Entry {
  const entry = value as Entry;
  if (
    !entry ||
    entry.type !== "file" ||
    typeof entry.path !== "string" ||
    entry.path.length > 4096 ||
    !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(entry.path) ||
    /[\0\r\n]/.test(entry.path) ||
    entry.path.split(/[\\/]/).some((part) => part === "." || part === "..") ||
    typeof entry.name !== "string" ||
    !entry.name ||
    entry.name !== basename(entry.path) ||
    !Number.isSafeInteger(entry.size) ||
    entry.size < 0 ||
    !Number.isFinite(entry.mtime)
  )
    throw new Error("Référence de fichier invalide.");
  return {
    name: entry.name,
    path: entry.path,
    type: "file",
    size: entry.size,
    mtime: entry.mtime,
    ext: entry.name.match(/\.[^.]+$/)?.[0].toLowerCase() || "",
  };
}
export function sameFamilyFile(a: Entry, b: Entry) {
  return (
    fileKey(a.path) === fileKey(b.path) &&
    a.name === b.name &&
    a.size === b.size &&
    a.mtime === b.mtime
  );
}
export type FileFamily = {
  version: 1;
  id: string;
  name: string;
  date: string;
  members: Entry[];
};
export function restoreFileFamilies(value: unknown): FileFamily[] {
  if (!Array.isArray(value) || value.length > FILE_FAMILY_LIMIT)
    throw new Error(
      "Familles illisibles (50 maximum). Aucune donnée remplacée.",
    );
  const ids = new Set<string>(),
    names = new Set<string>();
  return value.map((raw) => {
    const name =
      typeof raw?.name === "string" ? raw.name.normalize("NFKC").trim() : "";
    if (
      !raw ||
      raw.version !== 1 ||
      typeof raw.id !== "string" ||
      !raw.id ||
      raw.id.length > 80 ||
      ids.has(raw.id) ||
      !name ||
      name.length > 80 ||
      /\p{Cc}/u.test(name) ||
      names.has(name.toLocaleLowerCase("fr")) ||
      typeof raw.date !== "string" ||
      raw.date.length > 40 ||
      !Number.isFinite(Date.parse(raw.date)) ||
      !Array.isArray(raw.members) ||
      raw.members.length < 2 ||
      raw.members.length > FAMILY_MEMBER_LIMIT
    )
      throw new Error(
        "Famille invalide : nom distinct de 80 caractères et 2 à 20 fichiers requis.",
      );
    ids.add(raw.id);
    names.add(name.toLocaleLowerCase("fr"));
    const members: Entry[] = raw.members.map(familyFile);
    if (
      new Set(members.map((entry) => fileKey(entry.path))).size !==
      members.length
    )
      throw new Error("Les fichiers d’une famille doivent être distincts.");
    return { version: 1, id: raw.id, name, date: raw.date, members };
  });
}
export function changeFileFamily(
  value: unknown,
  expected: FileFamily | null,
  next: FileFamily | null,
) {
  const current = restoreFileFamilies(value);
  if (expected) {
    const record = current.find((record) => record.id === expected.id);
    if (
      !record ||
      JSON.stringify(record) !==
        JSON.stringify(restoreFileFamilies([expected])[0])
    )
      throw new Error(
        "Cette famille a changé dans une autre vue. Rechargez avant de réessayer.",
      );
  } else if (!next || current.some((record) => record.id === next.id))
    throw new Error("Cette famille existe déjà.");
  if (expected && next && expected.id !== next.id)
    throw new Error("Identité de famille différente.");
  return restoreFileFamilies([
    ...current.filter((record) => record.id !== (expected?.id || next?.id)),
    ...(next ? [next] : []),
  ]);
}
export async function verifyFamilyMembers(
  entries: Entry[],
  stat: (path: string) => Promise<Entry>,
  signal: AbortSignal,
) {
  if (
    entries.length < 2 ||
    entries.length > FAMILY_MEMBER_LIMIT ||
    new Set(entries.map((entry) => fileKey(entry.path))).size !== entries.length
  )
    throw new Error(
      "Choisissez de 2 à 20 fichiers distincts pour cette famille.",
    );
  const checked = new Map<string, Entry>();
  await checkCollection(entries, stat, signal, (result) => {
    if (!result.current) return;
    try {
      const current = familyFile(result.current);
      if (sameFamilyFile(familyFile(result.entry), current))
        checked.set(fileKey(current.path), current);
    } catch {
      /* An invalid reference never authorizes a saved relation. */
    }
  });
  signal.throwIfAborted();
  if (checked.size !== entries.length)
    throw new Error(
      "Un fichier est absent ou a changé. Relancez le regroupement avant d’enregistrer la famille.",
    );
  return entries.map((entry) => checked.get(fileKey(entry.path))!);
}

export async function groupFileRelations(
  entries: CollectionEntry[],
  families: FileFamily[],
  preparations: ImagePreparation[],
  stat: (path: string) => Promise<Entry>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const bounded = entries.slice(0, GROUP_ENTRY_LIMIT),
    seeds = bounded.filter(
      (entry): entry is Entry =>
        entry.type === "file" && !/\.source\.json$/i.test(entry.name),
    );
  const keys = new Set(seeds.map((entry) => fileKey(entry.path)));
  const records = [
    ...families.map((family) => ({
      id: `family:${family.id}`,
      name: `Famille : ${family.name}`,
      members: family.members,
      reason:
        "Lien enregistré par vous. Aucun contenu comparé ; ce lien ne prouve pas un doublon.",
    })),
    ...preparations
      .filter((record) => record.sources?.length && record.copies?.length)
      .map((record) => ({
        id: `preparation:${record.id}`,
        name: `Préparation ${record.constraints.format.toUpperCase()} · ${basename(record.copies![0].path)} · ${new Date(record.date).toLocaleString("fr")}`,
        members: [...record.sources!, ...record.copies!],
        reason:
          "Sources et copies de la même préparation enregistrée. Aucune correspondance fichier à fichier ni identité de contenu déduite.",
      })),
  ].filter((record) =>
    record.members.some((entry) => keys.has(fileKey(entry.path))),
  );
  const allCandidates = [
    ...new Map(
      [...records.flatMap((record) => record.members), ...seeds].map(
        (entry) => [fileKey(entry.path), entry],
      ),
    ).values(),
  ];
  const candidates = allCandidates.slice(0, GROUP_ENTRY_LIMIT);
  const examinedKeys = new Set(
    candidates
      .slice(0, COLLECTION_CHECK_LIMIT)
      .map((entry) => fileKey(entry.path)),
  );
  const current = new Map<string, Entry>(),
    notes = new Map<string, string>();
  await checkCollection(candidates, stat, signal, (result) => {
    const key = fileKey(result.entry.path);
    try {
      const file = familyFile(result.current);
      if (fileKey(file.path) !== key) throw new Error();
      current.set(key, file);
    } catch {
      notes.set(
        result.entry.path,
        "Fichier absent, inaccessible ou devenu autre qu’un fichier ordinaire. Lien non confirmé.",
      );
    }
  });
  signal.throwIfAborted();
  const linked = new Set<string>();
  const groups: {
    id?: string;
    name: string;
    reason: string;
    entries: Entry[];
  }[] = [];
  const stale = new Map<string, Entry>();
  for (const record of records) {
    const valid: Entry[] = [];
    for (const entry of record.members) {
      const now = current.get(fileKey(entry.path));
      if (now && sameFamilyFile(entry, now)) {
        valid.push(now);
        linked.add(fileKey(now.path));
      } else if (examinedKeys.has(fileKey(entry.path))) {
        stale.set(fileKey(entry.path), entry);
        if (now)
          notes.set(
            entry.path,
            "Au moins un lien enregistré a un nom, une taille ou une date différents. Ce lien n’est pas confirmé ; créez une nouvelle famille après vérification.",
          );
      }
    }
    if (valid.length)
      groups.push({
        id: record.id,
        name: record.name,
        reason: `${record.reason} ${valid.length}/${record.members.length} références concordantes ; les autres sont absentes, modifiées ou hors limite. Des fichiers peuvent se trouver hors du dossier choisi.`,
        entries: valid,
      });
  }
  for (const entry of seeds)
    if (notes.has(entry.path)) stale.set(fileKey(entry.path), entry);
  const unmatched = seeds.flatMap((entry) => {
    const now = current.get(fileKey(entry.path));
    return now &&
      !linked.has(fileKey(entry.path)) &&
      !stale.has(fileKey(entry.path))
      ? [now]
      : [];
  });
  if (unmatched.length)
    groups.push({
      name: "Sans relation enregistrée",
      reason:
        "Aucune famille ni préparation avec sources connues. Aucun lien déduit du nom.",
      entries: unmatched,
    });
  if (stale.size)
    groups.push({
      name: "Relations à revérifier",
      reason:
        "Au moins un lien enregistré ne concorde plus. Un fichier peut encore appartenir à une autre famille concordante.",
      entries: [...stale.values()],
    });
  const unexamined = candidates.slice(COLLECTION_CHECK_LIMIT);
  if (unexamined.length)
    groups.push({
      name: "Non vérifiés",
      reason: `Limite de ${COLLECTION_CHECK_LIMIT} fichiers contrôlés atteinte ; réduisez la sélection. Aucun contenu ouvert.`,
      entries: unexamined,
    });
  return {
    groups,
    notes,
    examined: Math.min(candidates.length, COLLECTION_CHECK_LIMIT),
    unexamined: unexamined.length,
    excluded: bounded.length - seeds.length,
    omitted:
      Math.max(0, entries.length - GROUP_ENTRY_LIMIT) +
      allCandidates.length -
      candidates.length,
  };
}
