import { bridge } from "./bridge";
import { collectedLink, type Entry } from "./types";

export const PROVENANCE_LIMIT = 64 * 1024;
export type Provenance = {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  collectedAt: string;
  size: number;
};

function sourceURL(value: unknown) {
  if (typeof value !== "string") throw new Error("Adresse source manquante");
  const url = new URL(collectedLink(value, "").path);
  url.search = "";
  url.hash = "";
  return url.href;
}

export function downloadedProvenance(
  item: chrome.downloads.DownloadItem,
  file: string,
  size: number,
) {
  let sourceUrl = "";
  for (const address of [item.referrer, item.finalUrl, item.url]) {
    try {
      sourceUrl = sourceURL(address);
      break;
    } catch {
      /* Try the next web source. */
    }
  }
  const data = {
    version: 1,
    file,
    title: item.filename.split(/[\\/]/).pop() || file,
    sourceUrl,
    collectedAt: item.startTime,
    size,
    format: "download",
  };
  parseProvenance(JSON.stringify(data), file);
  return data;
}

export function parseProvenance(text: string, file: string): Provenance {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier de provenance est endommagé");
  }
  if (!data || data.version !== 1 || data.file !== file)
    throw new Error(
      "Cette provenance ne correspond pas au fichier ou utilise un format inconnu",
    );
  if (
    typeof data.title !== "string" ||
    data.title.length > 4096 ||
    typeof data.collectedAt !== "string" ||
    data.collectedAt.length > 64 ||
    !Number.isFinite(Date.parse(data.collectedAt)) ||
    !Number.isSafeInteger(data.size) ||
    data.size < 0
  )
    throw new Error("Métadonnées de capture invalides");
  return {
    title: data.title,
    sourceUrl: sourceURL(data.sourceUrl),
    imageUrl:
      data.imageUrl === undefined ? undefined : sourceURL(data.imageUrl),
    collectedAt: data.collectedAt,
    size: data.size,
  };
}

export async function readProvenance(entry: Entry, signal?: AbortSignal) {
  let prefix;
  try {
    prefix = await bridge.textPrefix(
      entry.path + ".source.json",
      PROVENANCE_LIMIT,
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Provenance indisponible : le fichier .source.json est absent ou inaccessible.",
    );
  }
  if (prefix.size > PROVENANCE_LIMIT)
    throw new Error("Le fichier de provenance dépasse la limite de 64 Ko");
  return parseProvenance(new TextDecoder().decode(prefix.bytes), entry.name);
}
