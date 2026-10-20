import { createContext, useContext } from "react";
import { defaultPreferences, type Preferences } from "./preferences";
import { emptyTags, type TagStore } from "./tags";
import type { FolderAppearances } from "./folder-appearance";
import type { Volume } from "./disk-space";
export type FolderSize = { size: number; partial: boolean };
export const OrganizationContext = createContext<{
  preferences: Preferences;
  tags: TagStore;
  sizes: Record<string, FolderSize>;
  appearances: FolderAppearances;
  volumes: Volume[];
} | null>(null);
export const useOrganization = () =>
  useContext(OrganizationContext) || {
    preferences: defaultPreferences,
    tags: emptyTags(),
    sizes: {},
    appearances: {},
    volumes: [],
  };
