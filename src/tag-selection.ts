import { bridge, storageUpdate } from "./bridge";
import { emptyTags, tagsKey, tagPath, type TagStore } from "./tags";
import type { Entry } from "./types";

export async function saveSelectionTags(
  selection: Entry[],
  update: (value: unknown) => TagStore,
) {
  if (!selection.length || selection.length > 1000)
    throw new Error("Sélection invalide : 1 à 1 000 éléments requis");
  for (const entry of selection) {
    const path = tagPath(entry.path);
    const current = await bridge.request<Entry>(
      "FS_STAT",
      { path: entry.path },
      5000,
    );
    if (
      tagPath(current.path) !== path ||
      current.type !== entry.type ||
      current.size !== entry.size ||
      current.mtime !== entry.mtime
    )
      throw new Error("La sélection a changé : actualisez le dossier");
  }
  await storageUpdate(tagsKey, emptyTags(), update);
}
