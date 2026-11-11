import { restorePreferences, type Preferences } from "./preferences";
import {
  restoreFolderAppearances,
  type FolderAppearances,
} from "./folder-appearance";
import { restoreTags, tagPath, type TagStore } from "./tags";
import { restoreTextRules, type TextRule } from "./local-index";
import { fileViews, type ViewMode } from "./FileView";
import {
  restoreConversionPresets,
  type ConversionPreset,
} from "./conversion-presets";
export type FolderPreferences = Record<
  string,
  { viewMode: ViewMode; sortBy: string; sortOrder: string }
>;
export type OrganizationExport = {
  version: 1;
  preferences: Preferences;
  tags: TagStore;
  appearances: FolderAppearances;
  folders: FolderPreferences;
  rules: TextRule[];
  presets: ConversionPreset[];
};
export function restoreFolderPreferences(value: unknown): FolderPreferences {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 200
  )
    throw new Error("200 préférences de dossiers maximum");
  return Object.fromEntries(
    Object.entries(value).map(([path, view]) => {
      const key = tagPath(path);
      if (
        !view ||
        !fileViews.some((item) => item.value === view.viewMode) ||
        !["name", "mtime", "size", "type", "tags"].includes(view.sortBy) ||
        !["asc", "desc"].includes(view.sortOrder)
      )
        throw new Error("Affichage de dossier invalide");
      return [
        key,
        {
          viewMode: view.viewMode,
          sortBy: view.sortBy,
          sortOrder: view.sortOrder,
        },
      ];
    }),
  );
}
export function parseOrganizationExport(text: string): OrganizationExport {
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    throw new Error("Import limité à 1 Mio");
  const data = JSON.parse(text);
  if (data?.version !== 1) throw new Error("Version d’export incompatible");
  return {
    version: 1,
    // Importing a backup must never enable an assistant endpoint silently.
    preferences: restorePreferences({
      ...data.preferences,
      mcpEnabled: false,
      mcpWrite: false,
    }),
    tags: restoreTags(data.tags),
    appearances: restoreFolderAppearances(data.appearances || {}),
    folders: restoreFolderPreferences(data.folders || {}),
    rules: restoreTextRules(data.rules || []),
    presets: restoreConversionPresets(data.presets || []),
  };
}
