import { fileRuleSuggestion, type DownloadRule } from "./downloads";
import { fileExtension, GROUP_ENTRY_LIMIT } from "./file-groups";
import { groupFileOrigins } from "./file-origins";
import type { Provenance } from "./provenance";
import type { CollectionEntry, Entry } from "./types";

export const GROUP_TRANSFER_LIMIT = 20;
export type GroupRuleDraft = Pick<
  DownloadRule,
  "name" | "site" | "extension" | "destination"
>;
export function groupRuleDraft(
  entries: Entry[],
  destination: string,
  origins?: Map<string, Provenance>,
): GroupRuleDraft | null {
  const firstExtension = entries.length ? fileExtension(entries[0]) : "";
  if (
    !entries.length ||
    entries.some(
      (entry) => entry.type !== "file" || /\.source\.json$/i.test(entry.name),
    )
  )
    return null;
  const extension =
    /^[a-z0-9]{1,16}$/.test(firstExtension) &&
    entries.every((entry) => fileExtension(entry) === firstExtension)
      ? "." + firstExtension
      : "";
  const sites = entries
    .map((entry) => origins?.get(entry.path)?.sourceUrl)
    .map((url) => (url ? new URL(url).hostname : ""));
  const site =
    sites[0] && sites.every((value) => value === sites[0]) ? sites[0] : "";
  if (!site && !extension) return null;
  return {
    name: `${extension ? extension.slice(1).toUpperCase() : "Fichiers"}${site ? ` de ${site}` : ""}`.slice(
      0,
      80,
    ),
    site,
    extension,
    destination,
  };
}

function folderKey(path: string) {
  const windows = /^(?:[a-z]:|[\\/]{2})/i.test(path);
  const key = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return windows ? key.toLowerCase() : key;
}

export function groupFileDestinations(
  entries: CollectionEntry[],
  rules: DownloadRule[],
  originResult?: Awaited<ReturnType<typeof groupFileOrigins>>,
) {
  const bounded = entries.slice(0, GROUP_ENTRY_LIMIT);
  const files = bounded.filter(
    (entry): entry is Entry =>
      entry.type === "file" && !/\.source\.json$/i.test(entry.name),
  );
  const groups = new Map<
    string,
    { name: string; reason: string; destination: string; entries: Entry[] }
  >();
  const notes = new Map<string, string>();
  const extensionRules = rules.filter((rule) => !rule.site);
  for (const [index, entry] of files.entries()) {
    const origin = originResult?.origins.get(entry.path);
    const unchecked = !!originResult && !origin;
    const suggestion = fileRuleSuggestion(
      entry.name,
      origin ? new URL(origin.sourceUrl).hostname : "",
      unchecked ? [] : originResult ? rules : extensionRules,
    );
    const already =
      suggestion.destination &&
      folderKey(entry.path.replace(/[\\/][^\\/]+$/, "")) ===
        folderKey(suggestion.destination);
    const destination = already ? "" : suggestion.destination;
    const name = unchecked
      ? index < originResult.examined
        ? "Sans origine vérifiable"
        : "Non analysés"
      : already
        ? "Déjà à destination"
        : suggestion.ambiguous
          ? "Règles en conflit"
          : destination || "Sans destination proposée";
    const reason = unchecked
      ? originResult.notes.get(entry.path) ||
        "Limite d’analyse atteinte ; sélectionnez ces fichiers et relancez."
      : suggestion.rules.length
        ? `Règle${suggestion.rules.length > 1 ? "s" : ""} : ${suggestion.rules.map((rule) => rule.name).join(", ")}`
        : originResult
          ? "Aucune règle active pour cette origine et cette extension."
          : "Aucune règle active par extension, sans critère de site.";
    notes.set(
      entry.path,
      reason +
        (origin ? ` · Origine déclarée : ${origin.sourceUrl}` : "") +
        (already
          ? ` · ${suggestion.destination}`
          : suggestion.ambiguous
            ? ` · ${[...new Set(suggestion.rules.map((rule) => rule.destination))].join(" ; ")}`
            : ""),
    );
    const group = groups.get(name) || {
      name,
      destination,
      reason: unchecked
        ? "Aucune destination proposée sans origine contrôlée. Relancez sur une sélection plus petite ou utilisez les règles d’extension seules."
        : destination
          ? "Destination proposée par vos règles actives, à examiner avant tout transfert."
          : already
            ? "Le fichier se trouve déjà dans le dossier proposé."
            : suggestion.ambiguous
              ? "Plusieurs règles de même priorité proposent des dossiers différents. Aucun dossier choisi."
              : originResult
                ? "Aucune règle existante ne propose de destination pour cette origine et cette extension."
                : "Les règles avec un site sont exclues de ce mode ; aucune origine déduite.",
      entries: [],
    };
    group.entries.push(entry);
    groups.set(name, group);
  }
  return {
    groups: [...groups.values()].sort(
      (a, b) =>
        Number(!!b.destination) - Number(!!a.destination) ||
        a.name.localeCompare(b.name, "fr"),
    ),
    notes,
    excluded: bounded.length - files.length,
    omitted: entries.length - bounded.length,
  };
}

export async function verifyGroupOrigins(
  entries: Entry[],
  expected: Map<string, Provenance>,
  stat: (path: string) => Promise<Entry>,
  readSource: (entry: Entry, signal: AbortSignal) => Promise<Provenance>,
) {
  const checked = await groupFileOrigins(
    entries,
    stat,
    readSource,
    new AbortController().signal,
  );
  for (const entry of entries) {
    const before = expected.get(entry.path),
      after = checked.origins.get(entry.path);
    if (!before || !after || JSON.stringify(before) !== JSON.stringify(after))
      throw new Error(
        `L’origine de « ${entry.name} » est indisponible ou a changé. Relancez le regroupement.`,
      );
  }
}

export async function verifyGroupTransfer(
  entries: Entry[],
  destination: string,
  stat: (path: string) => Promise<Entry>,
) {
  if (
    !entries.length ||
    entries.length > GROUP_TRANSFER_LIMIT ||
    new Set(entries.map((entry) => entry.path)).size !== entries.length
  )
    throw new Error(
      `Choisissez de 1 à ${GROUP_TRANSFER_LIMIT} fichiers distincts.`,
    );
  if ((await stat(destination))?.type !== "directory")
    throw new Error(
      "La destination doit être un dossier accessible, sans lien symbolique.",
    );
  for (const entry of entries) {
    const current = await stat(entry.path);
    if (
      entry.type !== "file" ||
      current?.type !== "file" ||
      current.name !== entry.name ||
      !Number.isSafeInteger(current.size) ||
      current.size < 0 ||
      !Number.isFinite(current.mtime) ||
      current.size !== entry.size ||
      current.mtime !== entry.mtime
    )
      throw new Error(
        `« ${entry.name} » est indisponible ou a changé. Relancez le regroupement.`,
      );
    if (
      folderKey(entry.path.replace(/[\\/][^\\/]+$/, "")) ===
      folderKey(destination)
    )
      throw new Error(`« ${entry.name} » se trouve déjà dans la destination.`);
  }
}
