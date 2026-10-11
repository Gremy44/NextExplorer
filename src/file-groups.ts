import type { CollectionEntry, Entry, Listing } from "./types";

export const groupCategoriesKey = "nextexplorer:group-categories";
export const GROUP_ENTRY_LIMIT = 1000;
export type FileCategory = { name: string; extensions: string[] };
export type GroupCategories = { version: 1; categories: FileCategory[] };
export const defaultGroupCategories: GroupCategories = {
  version: 1,
  categories: [
    {
      name: "Documents",
      extensions: [
        "pdf",
        "doc",
        "docx",
        "odt",
        "rtf",
        "txt",
        "md",
        "csv",
        "xls",
        "xlsx",
        "ods",
        "ppt",
        "pptx",
        "odp",
        "epub",
      ],
    },
    {
      name: "Images",
      extensions: [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "avif",
        "bmp",
        "tif",
        "tiff",
        "heic",
        "heif",
        "svg",
        "ico",
        "raw",
        "dng",
      ],
    },
    {
      name: "Audio et vidéo",
      extensions: [
        "mp3",
        "wav",
        "flac",
        "ogg",
        "m4a",
        "aac",
        "mp4",
        "mkv",
        "avi",
        "mov",
        "webm",
      ],
    },
    {
      name: "Archives",
      extensions: ["zip", "7z", "rar", "tar", "gz", "bz2", "xz"],
    },
  ],
};

export function restoreGroupCategories(value: unknown): GroupCategories {
  if (value === null) return structuredClone(defaultGroupCategories);
  const data = value as GroupCategories;
  if (
    data?.version !== 1 ||
    !Array.isArray(data.categories) ||
    !data.categories.length ||
    data.categories.length > 12
  )
    throw new Error(
      "Catégories illisibles : rétablissez les catégories par défaut.",
    );
  const names = new Set<string>(),
    extensions = new Set<string>();
  const categories = data.categories.map((category) => {
    if (
      typeof category?.name !== "string" ||
      !Array.isArray(category.extensions)
    )
      throw new Error("Chaque catégorie demande un nom et des extensions.");
    const name = category.name.normalize("NFC").trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("fr");
    if (
      !name ||
      name.length > 60 ||
      /[\x00-\x1f\x7f]/.test(name) ||
      key === "autres" ||
      names.has(key)
    )
      throw new Error(
        "Choisissez des noms distincts de 1 à 60 caractères ; Autres est réservé.",
      );
    names.add(key);
    if (!category.extensions.length || category.extensions.length > 40)
      throw new Error("Chaque catégorie demande de 1 à 40 extensions.");
    const normalized = category.extensions.map((extension) => {
      if (typeof extension !== "string") throw new Error("Extension invalide.");
      const ext = extension.trim().toLowerCase().replace(/^\./, "");
      if (!/^[a-z0-9]{1,16}$/.test(ext))
        throw new Error(
          "Extensions : utilisez pdf, jpg, tiff… sans caractères spéciaux.",
        );
      if (extensions.has(ext))
        throw new Error(`L’extension .${ext} appartient déjà à une catégorie.`);
      extensions.add(ext);
      return ext;
    });
    return { name, extensions: normalized };
  });
  return { version: 1, categories };
}

export function changeGroupCategories(
  current: unknown,
  expected: unknown,
  next: unknown,
): GroupCategories {
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(
      "Catégories modifiées dans une autre vue. Fermez puis rouvrez la personnalisation.",
    );
  return restoreGroupCategories(next);
}

export function fileExtension(entry: Entry) {
  // The final suffix is a naming rule, not proof of the file's contents.
  const dot = entry.name.lastIndexOf(".");
  return dot > 0 && dot < entry.name.length - 1
    ? entry.name.slice(dot + 1).toLowerCase()
    : "";
}

export function groupFiles(
  entries: CollectionEntry[],
  config: GroupCategories,
) {
  const groups = [
    ...config.categories.map((category) => ({
      name: category.name,
      entries: [] as Entry[],
      reason:
        "Extension affectée à cette catégorie. Le suffixe ne prouve pas le format réel.",
    })),
    {
      name: "Autres",
      entries: [] as Entry[],
      reason: "Extension non affectée à une catégorie, ou absente.",
    },
  ];
  const byExtension = new Map(
    config.categories.flatMap((category, index) =>
      category.extensions.map((ext) => [ext, index] as const),
    ),
  );
  let excluded = 0;
  for (const entry of entries.slice(0, GROUP_ENTRY_LIMIT)) {
    if (entry.type !== "file") {
      excluded++;
      continue;
    }
    groups[
      byExtension.get(fileExtension(entry)) ?? groups.length - 1
    ].entries.push(entry);
  }
  return {
    groups,
    excluded,
    omitted: Math.max(0, entries.length - GROUP_ENTRY_LIMIT),
  };
}

export function groupModifiedDates(entries: CollectionEntry[]) {
  const byMonth = new Map<
    number,
    { name: string; entries: Entry[]; reason: string }
  >();
  const unknown: Entry[] = [];
  let excluded = 0;
  for (const entry of entries.slice(0, GROUP_ENTRY_LIMIT)) {
    if (entry.type !== "file") {
      excluded++;
      continue;
    }
    const date = new Date(entry.mtime * 1000);
    if (!Number.isFinite(entry.mtime) || !Number.isFinite(date.getTime())) {
      unknown.push(entry);
      continue;
    }
    const month = date.getFullYear() * 12 + date.getMonth();
    const group = byMonth.get(month);
    if (group) group.entries.push(entry);
    else {
      const name = date.toLocaleDateString("fr", {
        month: "long",
        year: "numeric",
      });
      byMonth.set(month, {
        name,
        entries: [entry],
        reason: `Modifiés en ${name}, selon la date du système de fichiers et le fuseau horaire de ce navigateur. Cela ne prouve pas un sujet commun.`,
      });
    }
  }
  const groups = [...byMonth]
    .sort(([a], [b]) => b - a)
    .map(([, group]) => group);
  if (unknown.length)
    groups.push({
      name: "Date indisponible",
      entries: unknown,
      reason:
        "Date de modification absente ou invalide. Aucune date déduite du nom ou du contenu.",
    });
  return {
    groups,
    excluded,
    omitted: Math.max(0, entries.length - GROUP_ENTRY_LIMIT),
  };
}

const genericNameWords = new Set(
  "de du des le la les un une et pour sans avec document documents fichier fichiers image images photo photos scan scans rapport rapports facture factures copie copies final finale export exports version revision titre nouveau nouvelle the a an of and for file files picture pictures report invoice copy draft untitled new img dsc dscn capture screenshot".split(
    " ",
  ),
);

export function groupRelatedNames(entries: CollectionEntry[]) {
  const byName = new Map<string, Entry[]>();
  const unmatched: Entry[] = [];
  let excluded = 0;
  for (const entry of entries.slice(0, GROUP_ENTRY_LIMIT)) {
    if (entry.type !== "file") {
      excluded++;
      continue;
    }
    const ext = fileExtension(entry);
    const stem = ext ? entry.name.slice(0, -ext.length - 1) : entry.name;
    const name = stem
      .trim()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae")
      // Preserve bare numbers/dates; only explicit versions and terminal copy markers are ignored.
      .replace(
        /(?:[\s_.–—-]+(?:v|version|rev|revision)[\s_-]*\d+|[\s_.–—-]+copie|\s*\(\d{1,3}\))+$/g,
        "",
      )
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const words = name.split(" ");
    if (
      words.length < 2 ||
      !words.some(
        (word) =>
          word.length >= 3 &&
          /\p{L}/u.test(word) &&
          !genericNameWords.has(word),
      )
    ) {
      unmatched.push(entry);
      continue;
    }
    const family = byName.get(name);
    if (family) family.push(entry);
    else byName.set(name, [entry]);
  }
  // shortcut: Exact normalized names only; add approximate matches after measuring false positives on a real corpus.
  const groups: { name: string; entries: Entry[]; reason: string }[] = [];
  for (const [name, files] of byName) {
    if (files.length < 2) unmatched.push(...files);
    else
      groups.push({
        name,
        entries: files,
        reason: `Même nom normalisé : « ${name} ». Extension, casse, accents et séparateurs ignorés ; suffixes explicites de version/copie retirés.`,
      });
  }
  const families = groups.length;
  if (unmatched.length)
    groups.push({
      name: "Sans rapprochement fiable",
      entries: unmatched,
      reason:
        "Nom trop général, trop court ou sans autre fichier portant le même nom normalisé. Aucun rapprochement proposé.",
    });
  return {
    groups,
    families,
    unmatched: unmatched.length,
    excluded,
    omitted: Math.max(0, entries.length - GROUP_ENTRY_LIMIT),
  };
}

type GroupListing = Listing & { snapshot: string };
// shortcut: Native snapshots enumerate the whole directory; use streaming listing for massive folders in J4.
export async function listGroupFolder(
  path: string,
  showHidden: boolean,
  request: (payload: Record<string, unknown>) => Promise<GroupListing>,
  signal: AbortSignal,
) {
  const entries: Entry[] = [];
  let snapshot = "",
    total = 0;
  do {
    signal.throwIfAborted();
    const offset = entries.length;
    const page = await request({
      path,
      showHidden,
      filter: "",
      sortBy: "name",
      sortOrder: "asc",
      offset,
      limit: Math.min(500, GROUP_ENTRY_LIMIT - offset),
      snapshot,
    });
    signal.throwIfAborted();
    if (
      !Array.isArray(page.entries) ||
      page.entries.length > Math.min(500, GROUP_ENTRY_LIMIT - offset) ||
      !Number.isSafeInteger(page.total) ||
      page.total < offset + page.entries.length ||
      page.nextOffset !== offset + page.entries.length ||
      typeof page.snapshot !== "string" ||
      !page.snapshot ||
      (snapshot && (page.snapshot !== snapshot || page.total !== total)) ||
      (!page.entries.length && offset < page.total)
    )
      throw new Error(
        "Liste du dossier incohérente : relancez le regroupement.",
      );
    entries.push(...page.entries);
    snapshot = page.snapshot;
    total = page.total;
  } while (entries.length < Math.min(total, GROUP_ENTRY_LIMIT));
  return { entries, total };
}
