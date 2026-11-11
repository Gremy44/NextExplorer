import { storageGet, storageSet, storageUpdate } from "./bridge";
import {
  defaultPreferences,
  preferencesKey,
  restorePreferences,
} from "./preferences";
import { tagsKey, emptyTags, restoreTags, assignTag, tagPath } from "./tags";
import {
  folderAppearanceKey,
  restoreFolderAppearances,
} from "./folder-appearance";
import { restoreFolderPreferences } from "./organization-export";
import { spacesKey, restoreSpaces } from "./spaces";
import {
  conversionPresetsKey,
  restoreConversionPresets,
} from "./conversion-presets";
import {
  textRulesKey,
  restoreTextRules,
  buildIndex,
  searchIndex,
  relatedTexts,
} from "./local-index";
import { fileFamiliesKey, restoreFileFamilies } from "./file-families";
import {
  imagePreparationsKey,
  restoreImagePreparations,
  startImagePreparation,
  readImagePreparation,
} from "./image-preparations";
import { imageConstraints } from "./prepare-images";
import { compareFolders } from "./remote";
import { restoreInsertions, insertionsKey } from "./insertions";
import {
  groupCategoriesKey,
  restoreGroupCategories,
  groupFiles,
  groupModifiedDates,
  groupFileSizes,
} from "./file-groups";
import {
  downloadFilingKey,
  downloadRunsKey,
  restoreDownloadFiling,
  restoreDownloadRuns,
  normalizeDownloadRule,
  verifyDownload,
} from "./downloads";
import {
  consoleColorsKey,
  defaultConsoleColors,
  restoreConsoleColors,
} from "./console-colors";
import {
  captureBrowserSession,
  restoreBrowserSession,
  currentBrowserPage,
} from "./web";
import { normalizeBrowserSession } from "./spaces";
import {
  collectedLink,
  type Entry,
  type Listing,
  type CollectionEntry,
} from "./types";
import { mergeCollection } from "./collection";

export type MCPArgs = {
  operation?: string;
  domain?: string;
  path?: string;
  paths?: string[];
  id?: string;
  query?: string;
  name?: string;
  url?: string;
  mode?: string;
  viewId?: string;
  offset?: number;
  limit?: number;
  value?: any;
};
export type MCPMessage = {
  ticket: string;
  profile: string;
  action: string;
  arguments: MCPArgs;
  roots: string[];
  remoteRoots: string[];
  capabilities: string[];
  deadline: number;
};
type Request = <T = any>(action: string, payload?: any) => Promise<T>;
export type MCPViewCall = (message: MCPMessage) => Promise<any>;
const domains = {
  tags: { key: tagsKey, fallback: emptyTags(), restore: restoreTags },
  appearances: {
    key: folderAppearanceKey,
    fallback: {},
    restore: restoreFolderAppearances,
  },
  folders: {
    key: "folderPreferences",
    fallback: {},
    restore: restoreFolderPreferences,
  },
  preferences: {
    key: preferencesKey,
    fallback: defaultPreferences,
    restore: restorePreferences,
  },
  rules: { key: textRulesKey, fallback: [], restore: restoreTextRules },
  presets: {
    key: conversionPresetsKey,
    fallback: [],
    restore: restoreConversionPresets,
  },
  families: {
    key: fileFamiliesKey,
    fallback: [],
    restore: restoreFileFamilies,
  },
  spaces: { key: spacesKey, fallback: [], restore: restoreSpaces },
  collection: {
    key: "stash",
    fallback: [],
    restore: (v: any) => collection(v),
  },
  captures: {
    key: "pendingCapture",
    fallback: null,
    restore: (v: any) =>
      v === null
        ? null
        : (() => {
            if (typeof v?.id !== "string" || typeof v.sourceUrl !== "string")
              throw new Error("Capture invalide");
            collectedLink(v.sourceUrl, "");
            return v;
          })(),
  },
  collections: {
    key: "savedCollections",
    fallback: [],
    restore: (v: any) =>
      array(v, 50).map((row) => {
        if (
          typeof row?.id !== "string" ||
          typeof row.name !== "string" ||
          !row.name.trim() ||
          row.name.length > 80
        )
          throw new Error("Collecte enregistrée invalide");
        return { id: row.id, name: row.name, entries: collection(row.entries) };
      }),
  },
  preparations: {
    key: imagePreparationsKey,
    fallback: [],
    restore: restoreImagePreparations,
  },
  insertionHistory: {
    key: insertionsKey,
    fallback: [],
    restore: restoreInsertions,
  },
  favorites: {
    key: "favorites",
    fallback: [],
    restore: (v: any) => array(v, 200).map(favorite),
  },
  quicklinks: { key: "quicklinks", fallback: {}, restore: quicklinks },
  downloadRules: {
    key: downloadFilingKey,
    fallback: {},
    restore: restoreDownloadFiling,
  },
  downloadHistory: {
    key: downloadRunsKey,
    fallback: [],
    restore: restoreDownloadRuns,
  },
  categories: {
    key: groupCategoriesKey,
    fallback: null,
    restore: restoreGroupCategories,
  },
  console: {
    key: consoleColorsKey,
    fallback: defaultConsoleColors,
    restore: restoreConsoleColors,
  },
} as const;
function array(value: any, max: number): any[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`Liste invalide (${max} maximum).`);
  return value;
}
function favorite(v: any) {
  tagPath(v?.path);
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 200)
    throw new Error("Favori invalide");
  return { name: v.name.trim(), path: v.path };
}
function collection(v: any): CollectionEntry[] {
  return array(v, 200).map((e) => {
    if (e?.type === "web")
      return {
        ...collectedLink(e.path, e.name || ""),
        ...(typeof e.collectedAt === "string" &&
        Number.isFinite(Date.parse(e.collectedAt))
          ? { collectedAt: e.collectedAt }
          : {}),
        ...(typeof e.sourceUrl === "string"
          ? { sourceUrl: collectedLink(e.sourceUrl, "").path }
          : {}),
      };
    tagPath(e?.path);
    if (
      !["file", "directory", "symlink"].includes(e.type) ||
      typeof e.name !== "string" ||
      !Number.isSafeInteger(e.size) ||
      e.size < 0 ||
      !Number.isFinite(e.mtime)
    )
      throw new Error("Référence de collecte invalide");
    return {
      path: e.path,
      name: e.name,
      type: e.type,
      size: e.size,
      mtime: e.mtime,
      ext: typeof e.ext === "string" ? e.ext : "",
      ...(typeof e.stamp === "string" ? { stamp: e.stamp } : {}),
    };
  });
}
function quicklinks(v: any) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length > 200
  )
    throw new Error("Liens invalides");
  return Object.fromEntries(
    Object.entries(v).map(([path, links]) => [
      tagPath(path),
      array(links, 100).map((link: any) => {
        const url = collectedLink(link.url, link.title || "").path;
        return { title: String(link.title || "").slice(0, 200), url };
      }),
    ]),
  );
}
const localPath = (v: unknown): v is string =>
  typeof v === "string" && /^(?:[a-z]:[\\/]|\\\\|\/|nxe-remote:\/\/)/i.test(v);
export function mcpPaths(value: unknown): string[] {
  const paths = new Set<string>();
  function visit(v: any) {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [key, child] of Object.entries(v)) {
      if (localPath(key)) paths.add(key);
      if (
        [
          "path",
          "root",
          "destination",
          "source",
          "filename",
          "keyFile",
        ].includes(key) &&
        localPath(child)
      )
        paths.add(child);
      if (
        ["paths", "startupPaths", "destinations"].includes(key) &&
        Array.isArray(child)
      )
        child.filter(localPath).forEach((p) => paths.add(p));
      visit(child);
    }
  }
  visit(value);
  return [...paths];
}
export async function executeMCPBrowser(
  message: MCPMessage,
  native: Request,
  ui: MCPViewCall,
): Promise<any> {
  const a = message.arguments,
    operation = a.operation || "";
  const alive = () => {
    if (Date.now() >= message.deadline)
      throw new Error(
        "Requête MCP expirée ; consulter l'état avant de répéter une écriture.",
      );
  };
  const request: Request = (action, args = {}) => {
    alive();
    return native("MCP_SCOPED_CALL", {
      ticket: message.ticket,
      action,
      arguments: args,
    });
  };
  const access = async (value: any) => {
    const paths = mcpPaths(value),
      result: Record<string, boolean> = {};
    for (let i = 0; i < paths.length; i += 1000) {
      alive();
      Object.assign(
        result,
        await native("MCP_SCOPE_CHECK", {
          ticket: message.ticket,
          paths: paths.slice(i, i + 1000),
        }),
      );
    }
    return (v: any) => mcpPaths(v).every((path) => result[path] === true);
  };
  const requireScope = async (value: any) => {
    if (!(await access(value))(value))
      throw new Error("Données hors des dossiers MCP autorisés.");
  };
  const domain = a.domain as keyof typeof domains,
    def = Object.hasOwn(domains, domain) ? domains[domain] : undefined;
  if (message.action === "BROWSER_CONTEXT")
    return {
      profile: message.profile,
      roots: message.roots,
      remoteRoots: message.remoteRoots,
      capabilities: message.capabilities,
      views: await ui(message),
    };
  if (message.action === "BROWSER_ORGANIZATION_READ") {
    if (!def) throw new Error("Domaine MCP inconnu");
    let value: any = def.restore(await storageGet(def.key, def.fallback));
    const allowed = await access(value);
    if (domain === "tags")
      value.files = Object.fromEntries(
        Object.entries(value.files).filter(([path]) => allowed({ path })),
      );
    else if (["appearances", "folders", "quicklinks"].includes(domain))
      value = Object.fromEntries(
        Object.entries(value).filter(([path]) => allowed({ path })),
      );
    else if (domain === "preferences")
      value = {
        ...value,
        startupPaths: value.startupPaths.filter((path: string) =>
          allowed({ path }),
        ),
      };
    else if (domain === "downloadRules")
      value = {
        rules: value.rules.filter(allowed),
        destinations: value.destinations.filter((path: string) =>
          allowed({ path }),
        ),
      };
    else if (Array.isArray(value)) value = value.filter(allowed);
    if (Array.isArray(value)) {
      const offset = Math.max(0, a.offset || 0),
        limit = Math.max(1, Math.min(200, a.limit || 100));
      return {
        items: value.slice(offset, offset + limit),
        total: value.length,
        offset,
      };
    }
    return value;
  }
  if (message.action === "BROWSER_PREFERENCES") {
    return storageUpdate(preferencesKey, defaultPreferences, (raw) => {
      alive();
      const old = restorePreferences(raw);
      if (
        !a.value ||
        typeof a.value !== "object" ||
        ["mcpEnabled", "mcpWrite", "remoteEnabled", "startupPaths"].some(
          (k) => k in a.value,
        )
      )
        throw new Error(
          "MCP ne peut pas modifier ses autorisations, les connexions ou les dossiers de démarrage.",
        );
      return restorePreferences({ ...old, ...a.value });
    });
  }
  if (message.action === "BROWSER_CONSOLE_SETTINGS") {
    alive();
    if (!a.value || typeof a.value !== "object" || Array.isArray(a.value))
      throw new Error("Réglages de console invalides");
    return storageUpdate(consoleColorsKey, defaultConsoleColors, (current) => {
      alive();
      return restoreConsoleColors({
        ...restoreConsoleColors(current),
        ...a.value,
      });
    });
  }
  if (message.action === "BROWSER_ORGANIZATION_WRITE") {
    if (
      !def ||
      ["preferences", "downloadRules", "downloadHistory", "console"].includes(
        domain,
      )
    )
      throw new Error("Utilisez l'outil de réglage dédié.");
    if (["preparations", "insertionHistory"].includes(domain))
      throw new Error(
        "Historique en lecture seule ; utiliser les outils de préparation et d'insertion.",
      );
    await requireScope({ value: a.value, paths: a.paths });
    // Acquire the same Web Lock as the UI before reading, validating and writing.
    return navigator.locks.request(`nextexplorer:${def.key}`, async () => {
      const old: any = def.restore(await storageGet(def.key, def.fallback));
      const allowed = await access(old);
      let next: any;
      if (domain === "captures") {
        if (operation !== "remove" || !old || old.id !== a.id)
          throw new Error("Capture introuvable ou opération remove requise");
        next = null;
      } else if (domain === "tags") {
        if (["assign", "unassign"].includes(operation)) {
          if (!a.paths?.length || !a.id) throw new Error("paths et id requis");
          next = assignTag(old, a.paths, a.id, operation === "assign");
        } else if (operation === "label") {
          next = restoreTags({
            ...old,
            labels: [
              ...old.labels.filter((r: any) => r.id !== a.value?.id),
              a.value,
            ],
          });
        } else throw new Error("Opération de tag inconnue");
      } else if (["appearances", "folders"].includes(domain)) {
        const path = a.paths?.[0];
        if (!path || a.paths?.length !== 1)
          throw new Error("Un seul chemin requis dans paths");
        next = { ...old };
        if (operation === "remove") delete next[tagPath(path)];
        else if (operation === "set") next[tagPath(path)] = a.value;
        else throw new Error("Opération inconnue");
      } else if (domain === "quicklinks") {
        const path = a.paths?.[0];
        if (!path || a.paths?.length !== 1)
          throw new Error("Un dossier requis dans paths");
        next = { ...old };
        if (operation === "add")
          next[tagPath(path)] = [...(old[tagPath(path)] || []), a.value];
        else if (operation === "remove")
          next[tagPath(path)] = (old[tagPath(path)] || []).filter(
            (l: any) => l.url !== a.value?.url,
          );
        else throw new Error("Opération inconnue");
      } else if (domain === "categories") {
        if (operation !== "set") throw new Error("Opération set requise");
        next = a.value;
      } else {
        const key = ["collection", "favorites"].includes(domain)
          ? "path"
          : "id";
        const id = a.id || a.value?.[key];
        if (!id) throw new Error("Identifiant requis");
        const previous = old.find((r: any) => r[key] === id);
        if (previous && !allowed(previous))
          throw new Error("Élément hors périmètre MCP");
        if (operation === "remove") {
          if (!previous) throw new Error("Élément introuvable");
          next = old.filter((r: any) => r[key] !== id);
        } else if (["upsert", "add"].includes(operation)) {
          if (a.value?.[key] !== id) throw new Error("Identifiant différent");
          next =
            domain === "collection"
              ? mergeCollection(old, collection([a.value]))
              : [...old.filter((r: any) => r[key] !== id), a.value];
        } else throw new Error("Opération inconnue");
      }
      const valid = def.restore(next);
      alive();
      await storageSet(def.key, valid);
      return { saved: true };
    });
  }
  if (message.action === "BROWSER_DOWNLOAD_RULE") {
    const rule =
      operation === "upsert"
        ? normalizeDownloadRule({
            ...a.value,
            ...(a.value?.automatic === true
              ? { automaticSince: new Date().toISOString() }
              : {}),
          })
        : null;
    if (!["upsert", "remove"].includes(operation))
      throw new Error("Opération upsert/remove requise");
    if (rule) await requireScope(rule);
    if (
      rule?.automatic &&
      !(await chrome.permissions.contains({ permissions: ["downloads"] }))
    )
      throw new Error(
        "Accordez d'abord la permission téléchargements dans l'interface.",
      );
    return navigator.locks.request(
      `nextexplorer:${downloadFilingKey}`,
      async () => {
        const old = restoreDownloadFiling(
            await storageGet(downloadFilingKey, {}),
          ),
          id = rule?.id || a.id;
        const previous = old.rules.find((r) => r.id === id);
        if (previous) await requireScope(previous);
        if (!rule && !previous) throw new Error("Règle introuvable");
        if (rule?.automatic) rule.automaticSince = new Date().toISOString();
        const rules = [
          ...old.rules.filter((r) => r.id !== id),
          ...(rule ? [rule] : []),
        ];
        if (rules.length > 50) throw new Error("50 règles maximum");
        alive();
        await storageSet(downloadFilingKey, { ...old, rules });
        return { saved: true };
      },
    );
  }
  if (message.action === "BROWSER_DOWNLOADS") {
    if (!(await chrome.permissions.contains({ permissions: ["downloads"] })))
      throw new Error(
        "Accordez la permission téléchargements depuis l'interface.",
      );
    const items = await chrome.downloads.search({
      state: "complete",
      exists: true,
      limit: 100,
      orderBy: ["-startTime"],
    });
    const allowed = await access(items);
    if (operation === "list")
      return items
        .filter(allowed)
        .map(({ id, filename, fileSize, url, finalUrl, startTime }) => ({
          id,
          path: filename,
          size: fileSize,
          url: finalUrl || url,
          startTime,
        }));
    if (
      operation !== "file" ||
      !a.path ||
      !["copy", "move"].includes(a.mode || "")
    )
      throw new Error("Opération file : id, path et mode copy/move requis");
    const item = items.find((i) => String(i.id) === a.id);
    if (!item || !allowed(item))
      throw new Error("Téléchargement indisponible ou hors périmètre");
    await verifyDownload(item, (path) => request("FS_STAT", { path }));
    return request("FS_TRANSFER", {
      paths: [item.filename],
      destination: a.path,
      mode: a.mode,
      conflict: "skip",
    });
  }
  if (message.action === "BROWSER_COMPARE") {
    if (a.paths?.length !== 2)
      throw new Error("Deux dossiers requis dans paths");
    const list = async (path: string) => {
      let entries: Entry[] = [],
        offset = 0,
        snapshot = "";
      do {
        const result = await request<Listing & { snapshot: string }>(
          "FS_LIST_DIR",
          { path, offset, snapshot, limit: 500 },
        );
        entries.push(...result.entries);
        snapshot = result.snapshot;
        if (entries.length > 10000)
          throw new Error(
            "Comparaison limitée à 10 000 éléments par dossier ; filtrer dans l'interface",
          );
        if (result.nextOffset >= result.total) break;
        if (result.nextOffset <= offset)
          throw new Error(
            "Pagination de comparaison bloquée ; aucune copie lancée",
          );
        offset = result.nextOffset;
      } while (true);
      return entries;
    };
    const rows = compareFolders(await list(a.paths[0]), await list(a.paths[1]));
    const offset = Math.max(0, a.offset || 0);
    return {
      rows: rows.slice(
        offset,
        offset + Math.max(1, Math.min(200, a.limit || 100)),
      ),
      total: rows.length,
      recursive: false,
      method: "name-size-date",
    };
  }
  if (message.action === "BROWSER_PREPARE_IMAGES") {
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        Math.max(1, message.deadline - Date.now() - 500),
      );
    try {
      if (operation === "start") {
        if (!a.path || !a.paths?.length)
          throw new Error("paths et path requis");
        const constraints = imageConstraints(a.value);
        const sources = await Promise.all(
          a.paths.map((path) => request<Entry>("FS_STAT", { path })),
        );
        return startImagePreparation(
          a.paths,
          a.path,
          constraints,
          sources,
          request,
        );
      }
      const preparations = restoreImagePreparations(
          await storageGet(imagePreparationsKey, []),
        ),
        preparation = preparations.find((p) => p.id === a.id);
      if (operation !== "check" || !preparation)
        throw new Error("Préparation introuvable ou opération inconnue");
      await requireScope(preparation);
      return readImagePreparation(preparation, controller.signal, request);
    } finally {
      clearTimeout(timer);
    }
  }
  if (message.action === "BROWSER_SEARCH") {
    if (
      !a.path ||
      !["names", "content", "related", "groups", "dates", "sizes"].includes(
        a.mode || "names",
      )
    )
      throw new Error("Mode de recherche invalide");
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        Math.max(1, message.deadline - Date.now() - 1000),
      );
    try {
      const index = await buildIndex(
        a.path,
        false,
        {
          list: (path, offset, snapshot, showHidden) =>
            request<Listing & { snapshot: string }>("FS_LIST_DIR", {
              path,
              offset,
              snapshot,
              showHidden,
              limit: 500,
            }),
          stat: (path) => request<Entry>("FS_STAT", { path }),
          read: async (path) => {
            const r = await request("FS_READ", {
              path,
              offset: 0,
              limit: 128 * 1024,
            });
            return {
              bytes: Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)),
              size: r.size,
            };
          },
          pdf: (path) => request("FS_TEXT", { path }),
          office: (path) => request("OFFICE_TEXT", { path }),
        },
        controller.signal,
        () => {},
        ["content", "related"].includes(a.mode || ""),
      );
      const results =
        a.mode === "related"
          ? relatedTexts(index.files, a.query || "")
          : a.mode === "groups"
            ? groupFiles(
                index.files.map((f) => f.entry),
                restoreGroupCategories(
                  await storageGet(groupCategoriesKey, null),
                ),
              )
            : a.mode === "dates"
              ? groupModifiedDates(index.files.map((f) => f.entry))
              : a.mode === "sizes"
                ? groupFileSizes(index.files.map((f) => f.entry))
                : searchIndex(index, a.query || "").map(({ entry, text }) => ({
                    entry,
                    snippet: text.slice(0, 400),
                  }));
      return {
        results: Array.isArray(results)
          ? results.slice(0, Math.max(1, Math.min(200, a.limit || 50)))
          : results,
        coverage: index.coverage,
        omitted: index.omitted,
        errors: index.errors,
        complete: !controller.signal.aborted,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  if (message.action === "BROWSER_WEB") {
    if (operation === "page") return currentBrowserPage();
    if (operation === "session")
      return normalizeBrowserSession(await captureBrowserSession());
    if (operation === "restore") {
      alive();
      await restoreBrowserSession(normalizeBrowserSession(a.value));
      return { restored: true };
    }
    return ui(message);
  }
  if (
    [
      "BROWSER_UI",
      "BROWSER_TOOL",
      "BROWSER_DRAFTS",
      "BROWSER_DOCUMENT",
    ].includes(message.action)
  )
    return ui(message);
  throw new Error("Outil navigateur MCP inconnu");
}

export function startMCPBridge(native: Request, ui: MCPViewCall) {
  let profile = "";
  const register = async () => {
    const preferences = restorePreferences(
      await storageGet(preferencesKey, defaultPreferences),
    );
    if (!profile) {
      profile = await navigator.locks.request(
        "nextexplorer:mcp-profile",
        async () => {
          let id = await storageGet("mcpProfileId", "");
          if (!id) {
            id = crypto.randomUUID();
            await storageSet("mcpProfileId", id);
          }
          return id;
        },
      );
    }
    try {
      await native("MCP_BROWSER_REGISTER", {
        id: profile,
        name: "NextExplorer · navigateur",
        enabled: preferences.mcpEnabled,
        write: preferences.mcpWrite,
      });
      await storageSet("mcpStatus", {
        connected: preferences.mcpEnabled,
        error: "",
      });
    } catch (error) {
      if (preferences.mcpEnabled)
        await storageSet("mcpStatus", {
          connected: false,
          error: `MCP indisponible : mettre à jour le compagnon et reconnecter l’extension. ${(error as Error).message}`,
        });
      throw error;
    }
  };
  return {
    register,
    async receive(message: MCPMessage) {
      let value: any,
        error = "";
      try {
        const preferences = restorePreferences(
          await storageGet(preferencesKey, defaultPreferences),
        );
        if (!preferences.mcpEnabled || message.profile !== profile)
          throw new Error("Accès MCP désactivé ou autre profil");
        if (
          !preferences.mcpWrite &&
          ![
            "BROWSER_CONTEXT",
            "BROWSER_ORGANIZATION_READ",
            "BROWSER_SEARCH",
            "BROWSER_COMPARE",
          ].includes(message.action)
        )
          throw new Error("Modifications MCP désactivées");
        value = await executeMCPBrowser(message, native, ui);
        if (
          new TextEncoder().encode(JSON.stringify(value ?? null)).length >
          700 * 1024
        )
          throw new Error("Résultat trop volumineux ; utiliser offset/limit.");
      } catch (e) {
        error = (e as Error).message;
      }
      await native("MCP_BROWSER_REPLY", {
        ticket: message.ticket,
        ...(error ? { error } : { value: value ?? null }),
      });
    },
  };
}
