import { GROUP_ENTRY_LIMIT } from "./file-groups";
import { PROVENANCE_LIMIT, type Provenance } from "./provenance";
import type { CollectionEntry, Entry } from "./types";

export const ORIGIN_FILE_LIMIT = 20;

export async function groupFileOrigins(
  entries: CollectionEntry[],
  stat: (path: string) => Promise<Entry>,
  readSource: (entry: Entry, signal: AbortSignal) => Promise<Provenance>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const bounded = entries.slice(0, GROUP_ENTRY_LIMIT);
  const files = bounded.filter(
    (entry): entry is Entry =>
      entry.type === "file" && !/\.source\.json$/i.test(entry.name),
  );
  const candidates = files.slice(0, ORIGIN_FILE_LIMIT);
  const origins = new Map<string, Provenance>();
  const notes = new Map<string, string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (next < candidates.length) {
        signal.throwIfAborted();
        const entry = candidates[next++];
        try {
          const current = await stat(entry.path);
          signal.throwIfAborted();
          if (
            current?.type !== "file" ||
            current.name !== entry.name ||
            !Number.isSafeInteger(current.size) ||
            current.size < 0 ||
            !Number.isFinite(current.mtime) ||
            current.size !== entry.size ||
            current.mtime !== entry.mtime
          )
            throw new Error(
              "Fichier indisponible ou différent de l’instantané. Relancez le regroupement.",
            );
          const metadata = await stat(entry.path + ".source.json");
          signal.throwIfAborted();
          if (
            metadata?.type !== "file" ||
            !Number.isSafeInteger(metadata.size) ||
            metadata.size < 0 ||
            metadata.size > PROVENANCE_LIMIT ||
            !Number.isFinite(metadata.mtime)
          )
            throw new Error(
              "Provenance non régulière ou dépassant la limite de 64 Kio ; aucune lecture.",
            );
          const source = await readSource(entry, signal);
          signal.throwIfAborted();
          if (source.size !== current.size)
            throw new Error(
              "La taille enregistrée dans la provenance ne correspond pas au fichier.",
            );
          const metadataAfter = await stat(entry.path + ".source.json");
          signal.throwIfAborted();
          if (
            metadataAfter?.type !== "file" ||
            metadataAfter.size !== metadata.size ||
            metadataAfter.mtime !== metadata.mtime
          )
            throw new Error(
              "Provenance modifiée pendant le contrôle. Relancez le regroupement.",
            );
          const after = await stat(entry.path);
          signal.throwIfAborted();
          if (
            after?.type !== "file" ||
            after.name !== current.name ||
            after.size !== current.size ||
            after.mtime !== current.mtime
          )
            throw new Error(
              "Fichier modifié pendant le contrôle. Relancez le regroupement.",
            );
          origins.set(entry.path, source);
        } catch (error) {
          signal.throwIfAborted();
          notes.set(entry.path, (error as Error).message);
        }
      }
    }),
  );
  signal.throwIfAborted();
  const bySite = new Map<string, Entry[]>();
  const unknown: Entry[] = [];
  for (const entry of candidates) {
    const source = origins.get(entry.path);
    if (!source) {
      unknown.push(entry);
      continue;
    }
    const site = new URL(source.sourceUrl).origin;
    const group = bySite.get(site);
    if (group) group.push(entry);
    else bySite.set(site, [entry]);
  }
  const groups = [...bySite].map(([name, entries]) => ({
    name,
    entries,
    reason: `Même site d’origine déclaré : ${name}. Métadonnées .source.json associées au nom et à la taille ; fichier stable pendant le contrôle.`,
  }));
  if (unknown.length)
    groups.push({
      name: "Sans origine vérifiable",
      entries: unknown,
      reason:
        "Provenance absente ou invalide, ou fichier modifié. Aucune origine attribuée ; le motif est indiqué sous chaque fichier.",
    });
  const remaining = files.slice(ORIGIN_FILE_LIMIT);
  if (remaining.length)
    groups.push({
      name: "Non analysés",
      entries: remaining,
      reason: `Limite de ${ORIGIN_FILE_LIMIT} fichiers atteinte. Sélectionnez ces fichiers pour une nouvelle analyse ; aucune origine déduite.`,
    });
  return {
    groups,
    origins,
    notes,
    examined: candidates.length,
    withoutOrigin: unknown.length,
    unexamined: remaining.length,
    excluded: bounded.length - files.length,
    omitted: Math.max(0, entries.length - GROUP_ENTRY_LIMIT),
  };
}
