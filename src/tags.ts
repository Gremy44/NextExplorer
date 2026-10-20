import { fileKey } from "./file-families";
export const tagsKey = "fileTags";
export const tagColors = [
  "primary",
  "tertiary",
  "error",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
] as const;
export const colorNames: Record<(typeof tagColors)[number], string> = {
  primary: "Couleur principale",
  tertiary: "Couleur secondaire",
  error: "Rouge du thème",
  red: "Rouge",
  orange: "Orange",
  yellow: "Jaune",
  green: "Vert",
  blue: "Bleu",
  purple: "Violet",
  gray: "Gris",
};
export const finderColors = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
] as const;
export type FinderColor = (typeof finderColors)[number];
export type FileTag = {
  id: string;
  name: string;
  color: (typeof tagColors)[number];
};
export type TagStore = {
  version: 1;
  labels: FileTag[];
  files: Record<string, string[]>;
};
export const emptyTags = (): TagStore => ({
  version: 1,
  labels: [],
  files: {},
});
export function tagPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value) ||
    /[\0\r\n]/.test(value) ||
    value.split(/[\\/]/).some((part) => part === "." || part === "..")
  )
    throw new Error("Chemin de tag invalide");
  return fileKey(value);
}
export function restoreTags(value: unknown): TagStore {
  const raw = value as TagStore;
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.labels) ||
    raw.labels.length > 32 ||
    !raw.files ||
    typeof raw.files !== "object" ||
    Array.isArray(raw.files) ||
    Object.keys(raw.files).length > 2000
  )
    throw new Error("Tags invalides : 32 tags et 2 000 associations maximum.");
  const names = new Set<string>(),
    ids = new Set<string>();
  const labels = raw.labels.map((tag) => {
    const name =
      typeof tag?.name === "string" ? tag.name.trim().normalize("NFC") : "";
    if (
      !tag ||
      typeof tag.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(tag.id) ||
      ids.has(tag.id) ||
      !name ||
      name.length > 40 ||
      /\p{Cc}/u.test(name) ||
      names.has(name.toLocaleLowerCase("fr")) ||
      !tagColors.includes(tag.color)
    )
      throw new Error("Tag invalide ou nom déjà utilisé");
    ids.add(tag.id);
    names.add(name.toLocaleLowerCase("fr"));
    return { id: tag.id, name, color: tag.color };
  });
  const files: Record<string, string[]> = {};
  for (const [path, list] of Object.entries(raw.files)) {
    const key = tagPath(path);
    if (
      !Array.isArray(list) ||
      list.length > 32 ||
      list.some((id) => !ids.has(id)) ||
      new Set(list).size !== list.length ||
      key in files
    )
      throw new Error("Association de tags invalide");
    if (list.length) files[key] = [...list];
  }
  return { version: 1, labels, files };
}
export function assignTag(
  value: unknown,
  paths: string[],
  id: string,
  add: boolean,
) {
  const store = restoreTags(value);
  if (
    !store.labels.some((tag) => tag.id === id) ||
    !paths.length ||
    paths.length > 1000
  )
    throw new Error("Tag ou sélection invalide");
  for (const path of paths) {
    const key = tagPath(path),
      tags = new Set(store.files[key] || []);
    if (add) tags.add(id);
    else tags.delete(id);
    if (tags.size) store.files[key] = [...tags];
    else delete store.files[key];
  }
  return restoreTags(store);
}
export function tagSelectionState(
  store: TagStore,
  paths: string[],
  id?: string,
): boolean | "mixed" {
  const count = id
    ? paths.filter((path) => store.files[fileKey(path)]?.includes(id)).length
    : 0;
  return count > 0 && count === paths.length ? true : count ? "mixed" : false;
}
export function colorTags(store: TagStore) {
  return finderColors.map((color) => {
    const tag = store.labels.find((tag) => tag.color === color);
    return {
      color,
      name: tag?.name || unusedTagName(store, colorNames[color]),
      id: tag?.id,
    };
  });
}
function unusedTagName(store: TagStore, base: string) {
  let name = base,
    suffix = 2;
  while (
    store.labels.some(
      (tag) =>
        tag.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
    )
  )
    name = `${base} (${suffix++})`;
  return name;
}
export function toggleTag(value: unknown, paths: string[], id: string) {
  const store = restoreTags(value);
  return assignTag(
    store,
    paths,
    id,
    tagSelectionState(store, paths, id) !== true,
  );
}
export function addNamedTag(
  value: unknown,
  paths: string[],
  name: string,
  color: FileTag["color"] = "gray",
) {
  const store = restoreTags(value);
  name = name.trim().normalize("NFC");
  let tag = store.labels.find(
    (tag) => tag.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
  );
  if (!tag) {
    tag = { id: crypto.randomUUID(), name, color };
    store.labels.push(tag);
  }
  return assignTag(store, paths, tag.id, true);
}
export function toggleColorTag(
  value: unknown,
  paths: string[],
  color: FinderColor,
) {
  const store = restoreTags(value);
  if (!finderColors.includes(color)) throw new Error("Couleur de tag invalide");
  const tag = store.labels.find((tag) => tag.color === color);
  if (tag) return toggleTag(store, paths, tag.id);
  return addNamedTag(
    store,
    paths,
    unusedTagName(store, colorNames[color]),
    color,
  );
}
export function clearSelectionTags(value: unknown, paths: string[]) {
  const store = restoreTags(value);
  if (!paths.length || paths.length > 1000)
    throw new Error("Sélection invalide");
  for (const path of paths) delete store.files[tagPath(path)];
  return restoreTags(store);
}
export function relocateTags(
  value: unknown,
  changes: { from: string; to: string }[],
) {
  const store = restoreTags(value),
    files: Record<string, string[]> = {};
  const mappings = changes
    .map((change) => ({ from: tagPath(change.from), to: tagPath(change.to) }))
    .sort((a, b) => b.from.length - a.from.length);
  for (const [path, labels] of Object.entries(store.files)) {
    const match = mappings.find(
      (change) =>
        path === change.from ||
        path.startsWith(change.from.replace(/\/$/, "") + "/"),
    );
    const target = match ? match.to + path.slice(match.from.length) : path;
    files[target] = [...new Set([...(files[target] || []), ...labels])];
  }
  return restoreTags({ ...store, files });
}
