import { collectedLink, type CollectionEntry, type Quicklink } from "./types";
import { restoreViewMode, type ViewMode } from "./FileView";

export const spacesKey = "hybridSpaces";
export const SPACE_FILE_LIMIT = 2 * 1024 * 1024;
export const SPACE_TASK_LIMIT = 20;
export type SpaceTask = { id: string; label: string; done: boolean };
export type SpaceTaskChange =
  | { kind: "add"; id: string; label: string }
  | { kind: "set"; id: string; done: boolean }
  | { kind: "remove"; id: string };
export type SpaceTab = {
  paths: string[];
  modes: ViewMode[];
  active: number;
  dual: boolean;
  split: number;
};
export type BrowserSession = {
  tabs: { url: string; title: string; groupId: number }[];
  groups: { id: number; title: string; color: chrome.tabGroups.ColorEnum }[];
};
export type HybridSpace = {
  version: 1;
  id: string;
  name: string;
  date: string;
  tabs: SpaceTab[];
  current: number;
  entries: CollectionEntry[];
  links: Record<string, Quicklink[]>;
  browser: BrowserSession;
  tasks: SpaceTask[];
};
function normalizeTasks(value: unknown): SpaceTask[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SPACE_TASK_LIMIT)
    throw new Error("20 tâches maximum par espace.");
  const tasks: SpaceTask[] = [];
  for (const task of value) {
    if (
      typeof task?.id !== "string" ||
      !task.id.trim() ||
      task.id.length > 80 ||
      typeof task.label !== "string" ||
      !task.label.trim() ||
      task.label.trim().length > 160 ||
      /[\u0000-\u001f\u007f]/.test(task.label) ||
      typeof task.done !== "boolean"
    )
      throw new Error("Tâche invalide : libellé de 1 à 160 caractères requis.");
    const label = task.label.trim().normalize("NFC");
    if (
      tasks.some(
        (item) =>
          item.id === task.id ||
          item.label.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr"),
      )
    )
      throw new Error("Cette tâche existe déjà dans l’espace.");
    tasks.push({ id: task.id, label, done: task.done });
  }
  return tasks;
}
function path(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    value.includes("\0") ||
    !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value)
  )
    throw new Error("Chemin d’espace invalide.");
  return value;
}
export function normalizeBrowserSession(value: any): BrowserSession {
  if (
    !Array.isArray(value?.tabs) ||
    value.tabs.length > 100 ||
    !Array.isArray(value.groups) ||
    value.groups.length > 100
  )
    throw new Error("Session invalide (100 onglets maximum).");
  return {
    tabs: value.tabs.map((tab: any) => {
      if (typeof tab?.url !== "string") throw new Error("Onglet web invalide.");
      return {
        url: collectedLink(tab.url, "").path,
        title: typeof tab.title === "string" ? tab.title.slice(0, 200) : "",
        groupId: Number.isInteger(tab.groupId) ? tab.groupId : -1,
      };
    }),
    groups: value.groups.map((group: any) => {
      if (
        !Number.isInteger(group?.id) ||
        ![
          "grey",
          "blue",
          "red",
          "yellow",
          "green",
          "pink",
          "purple",
          "cyan",
          "orange",
        ].includes(group.color)
      )
        throw new Error("Groupe de navigateur invalide.");
      return {
        id: group.id,
        title: typeof group.title === "string" ? group.title.slice(0, 200) : "",
        color: group.color,
      };
    }),
  };
}
export function normalizeSpace(value: any): HybridSpace {
  if (
    value?.version !== 1 ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 80 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.trim().length > 80 ||
    typeof value.date !== "string" ||
    !Number.isFinite(Date.parse(value.date))
  )
    throw new Error("Espace invalide.");
  if (
    !Array.isArray(value.tabs) ||
    !value.tabs.length ||
    value.tabs.length > 30 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 200
  )
    throw new Error(
      "Limite : 30 onglets locaux et 200 éléments collectés par espace.",
    );
  const tabs = value.tabs.map((tab: any) => {
    if (!Array.isArray(tab?.paths) || tab.paths.length !== 2)
      throw new Error("Dossiers d’espace invalides.");
    return {
      paths: tab.paths.map(path),
      modes: [0, 1].map((i) =>
        restoreViewMode(tab.modes?.[i], undefined, "details"),
      ),
      active: tab.active === 1 ? 1 : 0,
      dual: tab.dual === true,
      split:
        typeof tab.split === "number" && Number.isFinite(tab.split)
          ? Math.max(30, Math.min(70, tab.split))
          : 50,
    };
  });
  const entries: CollectionEntry[] = value.entries.map((entry: any) => {
    if (entry?.type === "web") {
      if (
        typeof entry.path !== "string" ||
        (entry.sourceUrl !== undefined && typeof entry.sourceUrl !== "string")
      )
        throw new Error("Référence web invalide.");
      return {
        ...collectedLink(
          entry.path,
          typeof entry.name === "string" ? entry.name : "",
        ),
        collectedAt:
          typeof entry.collectedAt === "string" &&
          Number.isFinite(Date.parse(entry.collectedAt))
            ? entry.collectedAt
            : value.date,
        ...(entry.sourceUrl
          ? { sourceUrl: collectedLink(entry.sourceUrl, "").path }
          : {}),
      };
    }
    if (
      !["file", "directory", "symlink"].includes(entry?.type) ||
      typeof entry.name !== "string" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !Number.isFinite(entry.mtime)
    )
      throw new Error("Référence locale invalide.");
    return {
      path: path(entry.path),
      name: entry.name.slice(0, 255),
      type: entry.type,
      size: entry.size,
      mtime: entry.mtime,
      ext: typeof entry.ext === "string" ? entry.ext.slice(0, 32) : "",
    };
  });
  const links: Record<string, Quicklink[]> = {};
  for (const folder of new Set<string>(
    tabs.flatMap((tab: SpaceTab) => tab.paths),
  )) {
    const items = value.links?.[folder];
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.length > 100)
      throw new Error("Trop de liens dans cet espace.");
    links[folder] = items.map((link: any) => {
      if (typeof link?.url !== "string")
        throw new Error("Lien épinglé invalide.");
      const entry = collectedLink(
        link.url,
        typeof link.title === "string" ? link.title : "",
      );
      return { title: entry.name, url: entry.path };
    });
  }
  return {
    version: 1,
    id: value.id,
    name: value.name.trim(),
    date: value.date,
    tabs,
    current:
      Number.isInteger(value.current) &&
      value.current >= 0 &&
      value.current < tabs.length
        ? value.current
        : 0,
    entries,
    links,
    browser: normalizeBrowserSession(value.browser),
    tasks: normalizeTasks(value.tasks),
  };
}
export function restoreSpaces(value: unknown): HybridSpace[] {
  const result: HybridSpace[] = [];
  for (const item of Array.isArray(value) ? value.slice(0, 30) : []) {
    try {
      const space = normalizeSpace(item);
      if (!result.some((existing) => existing.id === space.id))
        result.push(space);
    } catch {
      /* Corrupt snapshots never open files or websites. */
    }
  }
  return result;
}
export function serializeSpaceFile(space: HybridSpace): string {
  const text = JSON.stringify(
    { format: "nextexplorer-space", version: 1, space: normalizeSpace(space) },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > SPACE_FILE_LIMIT)
    throw new Error("Le fichier d’espace dépasse la limite de 2 Mio.");
  return text;
}
export function parseSpaceFile(text: string): HybridSpace {
  if (new TextEncoder().encode(text).length > SPACE_FILE_LIMIT)
    throw new Error("Le fichier d’espace dépasse la limite de 2 Mio.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Le fichier d’espace est endommagé ou n’est pas du JSON.");
  }
  if (value?.format !== "nextexplorer-space" || value.version !== 1)
    throw new Error(
      "Ce fichier n’est pas un export d’espace NextExplorer compatible.",
    );
  return normalizeSpace(value.space);
}
export function addSpace(current: HybridSpace[], space: HybridSpace) {
  space = normalizeSpace(space);
  if (current.length >= 30)
    throw new Error(
      "30 espaces maximum. Supprimez un espace avant d’en enregistrer un autre.",
    );
  if (
    current.some(
      (value) =>
        value.name.toLocaleLowerCase("fr") ===
        space.name.toLocaleLowerCase("fr"),
    )
  )
    throw new Error("Ce nom d’espace existe déjà.");
  return [space, ...current];
}

export function updateSpace(
  current: HybridSpace[],
  previous: HybridSpace,
  space: HybridSpace,
): HybridSpace[] {
  previous = normalizeSpace(previous);
  space = normalizeSpace(space);
  if (space.id !== previous.id) throw new Error("Identité d’espace invalide.");
  const existing = current.find((item) => item.id === previous.id);
  if (!existing)
    throw new Error("Cet espace a été supprimé. Annulez l’actualisation.");
  if (JSON.stringify(existing) !== JSON.stringify(previous))
    throw new Error(
      "Cet espace a changé dans une autre vue. Annulez puis recommencez l’actualisation.",
    );
  return addSpace(
    current.filter((item) => item.id !== previous.id),
    { ...space, tasks: existing.tasks },
  );
}

export function editSpaceTasks(
  value: unknown,
  spaceId: string,
  change: SpaceTaskChange,
): HybridSpace[] {
  // Refuse unreadable snapshots before writing instead of dropping them.
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("Espaces illisibles. Aucune tâche modifiée.");
  const current = value.map(normalizeSpace);
  if (new Set(current.map((space) => space.id)).size !== current.length)
    throw new Error("Identités d’espaces en double. Aucune tâche modifiée.");
  const space = current.find((space) => space.id === spaceId);
  if (!space)
    throw new Error(
      "Cet espace a été supprimé. Aucune tâche ajoutée ou modifiée.",
    );
  let tasks: SpaceTask[];
  if (change.kind === "add") {
    tasks = normalizeTasks([
      ...space.tasks,
      { id: change.id, label: change.label, done: false },
    ]);
  } else {
    if (!space.tasks.some((task) => task.id === change.id))
      throw new Error("Cette tâche a été retirée dans une autre vue.");
    tasks = normalizeTasks(
      change.kind === "remove"
        ? space.tasks.filter((task) => task.id !== change.id)
        : space.tasks.map((task) =>
            task.id === change.id ? { ...task, done: change.done } : task,
          ),
    );
  }
  return current.map((item) =>
    item.id === spaceId ? { ...item, tasks } : item,
  );
}
