import { storageUpdate } from "./bridge";
import { emptyTags, relocateTags, tagsKey } from "./tags";
import {
  folderAppearanceKey,
  restoreFolderAppearances,
  relocateFolderAppearances,
} from "./folder-appearance";

export const relocationCursorKey = "nativeRelocationCursor.v1";
export async function synchronizeRelocations(
  request: (action: string, payload?: unknown) => Promise<any>,
) {
  return navigator.locks.request(`nextexplorer:${tagsKey}`, () =>
    navigator.locks.request(`nextexplorer:${folderAppearanceKey}`, async () => {
      const stored = await chrome.storage.local.get([
        tagsKey,
        relocationCursorKey,
        folderAppearanceKey,
      ]);
      let cursor = stored[relocationCursorKey] as number | undefined;
      if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 0))
        throw new Error("Suivi des déplacements illisible ; tags à vérifier.");
      let tags = stored[tagsKey] || emptyTags();
      let appearances = restoreFolderAppearances(
        stored[folderAppearanceKey] || {},
      );
      for (let batch = 0; batch < 10; batch++) {
        const result = await request("RELOCATIONS", { cursor: cursor ?? null });
        if (
          !result ||
          !Number.isSafeInteger(result.cursor) ||
          result.cursor < 0 ||
          !Array.isArray(result.events) ||
          result.events.length > 50 ||
          typeof result.more !== "boolean" ||
          typeof result.lost !== "boolean"
        )
          throw new Error("Historique natif incompatible.");
        if (result.lost) {
          await chrome.storage.local.set({
            [relocationCursorKey]: result.cursor,
          });
          throw new Error(
            "Historique des déplacements dépassé : vérifiez les tags des fichiers déplacés pendant la fermeture.",
          );
        }
        let previous = cursor ?? result.cursor;
        for (const event of result.events) {
          if (
            !Number.isSafeInteger(event.cursor) ||
            event.cursor !== previous + 1 ||
            !Array.isArray(event.changes) ||
            !event.changes.length ||
            event.changes.length > 1000
          )
            throw new Error("Historique des déplacements incomplet.");
          tags = relocateTags(tags, event.changes);
          appearances = relocateFolderAppearances(appearances, event.changes);
          previous = event.cursor;
        }
        if (previous !== result.cursor)
          throw new Error("Curseur de déplacements incohérent.");
        await chrome.storage.local.set({
          [tagsKey]: tags,
          [folderAppearanceKey]: appearances,
          [relocationCursorKey]: result.cursor,
        });
        cursor = result.cursor;
        if (!result.more) return;
      }
      throw new Error(
        "Historique en cours de rattrapage ; reconnectez le compagnon.",
      );
    }),
  );
}

export async function recordRelocations(
  changes: { from: string; to: string }[],
) {
  await storageUpdate(tagsKey, emptyTags(), (value) =>
    relocateTags(value, changes),
  );
  await storageUpdate(folderAppearanceKey, {}, (value) =>
    relocateFolderAppearances(value, changes),
  );
}
