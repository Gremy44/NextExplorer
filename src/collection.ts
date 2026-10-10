import { collectedLink, type CollectionEntry, type Entry } from "./types";

export const COLLECTION_CHECK_LIMIT = 200;
export type CollectionCheck = {
  entry: Entry;
  status: "present" | "changed" | "unavailable";
  current?: Entry;
};

export async function checkCollection(
  entries: CollectionEntry[],
  stat: (path: string) => Promise<Entry>,
  signal: AbortSignal,
  onResult: (result: CollectionCheck) => void,
) {
  const local = entries
    .filter((entry): entry is Entry => entry.type !== "web")
    .slice(0, COLLECTION_CHECK_LIMIT);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, local.length) }, async () => {
      while (!signal.aborted) {
        const entry = local[next++];
        if (!entry) return;
        let result: CollectionCheck;
        try {
          const current = await stat(entry.path);
          if (
            !["file", "directory", "symlink"].includes(current?.type) ||
            !Number.isSafeInteger(current.size) ||
            current.size < 0 ||
            !Number.isFinite(current.mtime)
          )
            throw new Error("Informations locales invalides.");
          const changed =
            current.type !== entry.type ||
            (entry.type !== "directory" &&
              (current.size !== entry.size || current.mtime !== entry.mtime));
          result = { entry, status: changed ? "changed" : "present", current };
        } catch {
          result = {
            entry,
            status: "unavailable",
          };
        }
        if (!signal.aborted) onResult(result);
      }
    }),
  );
}

export type TextCapture = {
  kind?: "text";
  id: string;
  text: string;
  title: string;
  sourceUrl: string;
  collectedAt: string;
};
export type ImageCapture = {
  kind: "image";
  id: string;
  imageUrl: string;
  title: string;
  sourceUrl: string;
  collectedAt: string;
};
export type PendingCapture = TextCapture | ImageCapture;

export function selectionCapture(
  info: { selectionText?: string; pageUrl?: string },
  tab?: { title?: string; url?: string },
): TextCapture {
  const value = info.selectionText || "";
  if (!value.trim() || value.length > 262144)
    throw new Error("Sélection requise (262 144 caractères maximum)");
  const source = collectedLink(info.pageUrl || "", "").path;
  const url = new URL(source);
  url.search = "";
  url.hash = "";
  return {
    id: crypto.randomUUID(),
    text: value,
    title: info.pageUrl === tab?.url ? (tab?.title || "").slice(0, 200) : "",
    sourceUrl: url.href,
    collectedAt: new Date().toISOString(),
  };
}

export const capturedText = (capture: TextCapture) =>
  `Titre : ${capture.title || "Page web"}\nSource : ${capture.sourceUrl}\nDate : ${capture.collectedAt}\n\n${capture.text}`;

export function imageCapture(
  info: { srcUrl?: string; pageUrl?: string },
  tab?: { title?: string; url?: string },
): ImageCapture {
  const imageUrl = collectedLink(info.srcUrl || "", "").path;
  const source = new URL(collectedLink(info.pageUrl || "", "").path);
  source.search = "";
  source.hash = "";
  return {
    kind: "image",
    id: crypto.randomUUID(),
    imageUrl,
    sourceUrl: source.href,
    title: info.pageUrl === tab?.url ? (tab?.title || "").slice(0, 200) : "",
    collectedAt: new Date().toISOString(),
  };
}

export function contextualLink(
  info: { menuItemId: string | number; pageUrl?: string; linkUrl?: string },
  tab?: { title?: string; url?: string },
) {
  if (info.menuItemId !== "collect-page" && info.menuItemId !== "collect-link")
    throw new Error("Action de collecte inconnue");
  const address =
    info.menuItemId === "collect-link" ? info.linkUrl : info.pageUrl;
  const entry = collectedLink(
    address || "",
    info.menuItemId === "collect-page" && info.pageUrl === tab?.url
      ? tab?.title || ""
      : "",
  );
  if (info.pageUrl) {
    const source = new URL(collectedLink(info.pageUrl, "").path);
    source.search = "";
    source.hash = "";
    entry.sourceUrl = source.href;
  }
  return entry;
}

export type SavedCollection = {
  id: string;
  name: string;
  entries: CollectionEntry[];
};
export const mergeCollection = (
  current: CollectionEntry[],
  entries: CollectionEntry[],
) => [
  ...new Map(
    [...current, ...entries].map((entry) => [entry.path, entry]),
  ).values(),
];

export function saveCollection(
  lists: SavedCollection[],
  name: string,
  entries: CollectionEntry[],
): SavedCollection[] {
  name = name.trim();
  if (!name || name.length > 80)
    throw new Error("Nom requis, de 1 à 80 caractères");
  if (!entries.length) throw new Error("Le panier est vide");
  if (
    lists.some(
      (list) =>
        list.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
    )
  )
    throw new Error("Ce nom existe déjà : choisissez un autre nom");
  return [...lists, { id: crypto.randomUUID(), name, entries }];
}
