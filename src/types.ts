import { isRemote, remotePath, remoteLocation } from "./remote";
export type Entry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  mtime: number;
  ext: string;
  stamp?: string;
};
export type Listing = {
  skipped?: number;
  truncated?: boolean;
  currentPath: string;
  parentPath: string | null;
  entries: Entry[];
  total: number;
  nextOffset: number;
};
export type CollectedLink = {
  type: "web";
  name: string;
  path: string;
  collectedAt: string;
  sourceUrl?: string;
};
export type CollectionEntry = Entry | CollectedLink;
export function collectedLink(address: string, title: string): CollectedLink {
  const url = safeURL(address.trim());
  if (!url || url.length > 8192)
    throw new Error(
      "Adresse HTTP(S) valide requise (8 192 caractères maximum)",
    );
  const parsed = new URL(url);
  if (parsed.username || parsed.password)
    throw new Error("Utilisez une adresse sans identifiants intégrés");
  return {
    type: "web",
    path: url,
    name: title.trim().slice(0, 200) || parsed.hostname,
    collectedAt: new Date().toISOString(),
  };
}
export type Hello = {
  workerError?: string;
  features?: {
    remoteVersion?: number;
    spaceAnalysisVersion?: number;
    searchChecks?: boolean;
    imagePreviewCancel?: boolean;
    documentTools?: number;
    consoleVersion?: number;
    diskVolumes?: boolean;
    quickActions?: boolean;
    contextualConversion?: boolean;
    imageSamples?: boolean;
    durableJobs?: boolean;
    mediaStream?: boolean;
    checkedHash?: boolean;
    nativeDrag?: boolean;
    nativeDragVersion?: number;
    transferMerge?: boolean;
    operationJournal?: boolean;
    transferUndo?: boolean;
    zipExtract?: boolean;
    archiveExtract?: boolean;
    extractMerge?: boolean;
  };
  protocolVersion: number;
  version: string;
  platform: string;
  home: string;
  roots: { name: string; path: string }[];
  aliases: Record<string, string>;
  tools: Record<string, boolean>;
};
export type Job = {
  durable?: boolean;
  recoverable?: boolean;
  needsPassword?: boolean;
  archived?: boolean;
  startedAt?: string;
  journalError?: string;
  audit?: {
    copied: number;
    moved: number;
    skipped: number;
    sourceRetained: number;
    omitted: number;
    entries: { source: string; destination: string; status: string }[];
  };
  id: string;
  kind: string;
  state: string;
  done: number;
  total: number;
  speed: number;
  eta: number;
  error?: string;
  result?: unknown;
};
export type UndoReport = {
  eligible: boolean;
  undone: boolean;
  reason: string;
  count: number;
  paths: string[];
  mode?: "copy" | "move";
  targets?: string[];
  replacements?: number;
  directories?: number;
  resume?: boolean;
  completed?: number;
  reconciled?: number;
};
export type Quicklink = { title: string; url: string };
export type RenameOptions = {
  pattern: string;
  replacement: string;
  prefix: string;
  suffix: string;
  case: string;
  number: boolean;
  start: number;
  step: number;
  digits: number;
};
export const size = (n: number) =>
  n < 1024
    ? `${n} o`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} Ko`
      : n < 1073741824
        ? `${(n / 1048576).toFixed(1)} Mo`
        : `${(n / 1073741824).toFixed(2)} Go`;
export const basename = (p: string): string =>
  isRemote(p)
    ? remotePath(p).directory.split("/").filter(Boolean).pop() || "Serveur"
    : p === "nextexplorer:drives"
      ? "Ce PC"
      : p.split(/[\\/]/).filter(Boolean).pop() || p;
export const join = (p: string, n: string) =>
  isRemote(p)
    ? remoteLocation(
        remotePath(p).id,
        remotePath(p).directory.replace(/\/$/, "") + "/" + n,
      )
    : p.replace(/[\\/]$/, "") + (p.includes("\\") ? "\\" : "/") + n;
export function pathBreadcrumbs(path: string) {
  if (!path) return [];
  if (isRemote(path)) {
    const { id, directory } = remotePath(path);
    const trail = [{ name: "Serveur", path: remoteLocation(id, "/") }];
    let current = "";
    for (const name of directory.split("/").filter(Boolean)) {
      current += "/" + name;
      trail.push({ name, path: remoteLocation(id, current) });
    }
    return trail;
  }
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const network = /^[\\/]{2}[^\\/]+[\\/]+[^\\/]+(?:[\\/]|$)/.test(path);
  const drive = /^[a-z]:[\\/]/i.test(path);
  const separator = path.includes("\\") ? "\\" : "/";
  const root = network
    ? separator + separator + parts.slice(0, 2).join(separator) + separator
    : drive
      ? parts[0] + separator
      : path.startsWith("/")
        ? "/"
        : "";
  if (!root) return [{ name: basename(path), path }];
  const trail = [{ name: root.replace(/[\\/]$/, "") || root, path: root }];
  let current = root;
  for (const name of parts.slice(network ? 2 : drive ? 1 : 0)) {
    current = join(current, name);
    trail.push({ name, path: current });
  }
  return trail;
}
export function safeURL(s: string) {
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function fuzzy(q: string, s: string) {
  let i = 0;
  const text = s.toLowerCase();
  for (const c of q.toLowerCase()) {
    i = text.indexOf(c, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}
export const mediaType = (e: Entry) =>
  e.type === "directory"
    ? "folder"
    : /\.(png|jpe?g|webp|gif|avif|bmp|svg|tiff?|heic|heif)$/i.test(e.ext)
      ? "image"
      : /\.(mp4|m4v|webm|mov|mkv|avi)$/i.test(e.ext)
        ? "video"
        : /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(e.ext)
          ? "audio"
          : e.ext === ".pdf"
            ? "pdf"
            : /\.(zip|rar|7z|gz|tar)$/i.test(e.ext)
              ? "archive"
              : e.ext === ".weblink"
                ? "link"
                : !e.ext ||
                    /\.(txt|md|markdown|json|jsonl|log|csv|tsv|js|jsx|ts|tsx|css|scss|html?|xml|ya?ml|toml|ini|cfg|conf|sql|py|go|rs|c|cpp|h|hpp|java|sh|bat|cmd|ps1|srt|vtt)$/i.test(
                      e.ext,
                    )
                  ? "text"
                  : "binary";
