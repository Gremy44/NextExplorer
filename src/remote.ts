import type { Entry } from "./types";

export type RemoteProfile = {
  id: string;
  label: string;
  protocol: "sftp" | "ftps" | "ftp";
  host: string;
  port: number;
  username: string;
  root: string;
  keyFile?: string;
  fingerprint?: string;
};
export type RemoteServer = {
  profile: RemoteProfile;
  connected: boolean;
  hasSecret: boolean;
};
export const isRemote = (path: string) => path.startsWith("nxe-remote://");
export function remotePath(path: string) {
  const url = new URL(path);
  if (
    url.protocol !== "nxe-remote:" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(url.host) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Chemin distant invalide");
  const directory = decodeURIComponent(url.pathname || "/");
  if (/[\\\x00\r\n]/.test(directory))
    throw new Error("Chemin distant invalide");
  return { id: url.host, directory };
}
export function remoteLocation(id: string, directory: string) {
  return (
    `nxe-remote://${id}/` +
    directory.split("/").filter(Boolean).map(encodeURIComponent).join("/")
  );
}
export const remoteActions = new Set([
  "preview",
  "copy",
  "paste",
  "rename",
  "mkdir",
  "favorite",
  "home",
  "settings",
  "drives",
  "remote-delete",
  "remote-permissions",
]);
export type FolderDifference = {
  entry: Entry;
  status: "missing" | "different" | "newer" | "same" | "folder";
};
export function compareFolders(
  source: Entry[],
  destination: Entry[],
): FolderDifference[] {
  const byName = new Map(destination.map((entry) => [entry.name, entry]));
  return source.map((entry) => {
    const other = byName.get(entry.name);
    const status = !other
      ? "missing"
      : entry.type !== other.type
        ? "different"
        : entry.type === "directory"
          ? "folder"
          : entry.size !== other.size
            ? "different"
            : entry.mtime > other.mtime + 2
              ? "newer"
              : "same";
    return { entry, status };
  });
}
