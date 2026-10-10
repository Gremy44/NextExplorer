import { expect, it } from "vitest";
import {
  checkCollection,
  COLLECTION_CHECK_LIMIT,
  type CollectionCheck,
} from "./collection";
import { collectedLink, type Entry } from "./types";

const file: Entry = {
  path: "D:/Projet/document.txt",
  name: "document.txt",
  type: "file",
  size: 12,
  mtime: 123,
  ext: ".txt",
};

it("contrôle les métadonnées locales sans visiter les liens ni modifier les références", async () => {
  const changed = { ...file, path: "D:/Projet/change.txt" };
  const folder = {
    ...file,
    path: "D:/Projet/Dossier",
    type: "directory" as const,
  };
  const link = { ...file, path: "D:/Projet/lien", type: "symlink" as const };
  const differentType = { ...file, path: "D:/Projet/autre.txt" };
  const entries = [
    file,
    changed,
    folder,
    link,
    differentType,
    collectedLink("https://example.com/", "Lien"),
  ];
  const before = structuredClone(entries);
  const calls: string[] = [];
  const results: CollectionCheck[] = [];
  await checkCollection(
    entries,
    async (path) => {
      calls.push(path);
      const current = entries.find((entry) => entry.path === path) as Entry;
      if (path === changed.path || path === folder.path)
        return { ...current, size: 100, mtime: 456 };
      if (path === differentType.path) return { ...current, type: "directory" };
      return current;
    },
    new AbortController().signal,
    (result) => results.push(result),
  );
  expect(calls).toEqual(
    entries.filter((entry) => entry.type !== "web").map((entry) => entry.path),
  );
  expect(results.map((result) => result.status)).toEqual([
    "present",
    "changed",
    "present",
    "present",
    "changed",
  ]);
  expect(results[1].current).toMatchObject({ size: 100, mtime: 456 });
  expect(entries).toEqual(before);
});

it("signale les erreurs et réponses invalides sans interrompre les autres contrôles", async () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    ...file,
    path: `D:/Projet/${i}.txt`,
  }));
  const results: CollectionCheck[] = [];
  await checkCollection(
    entries,
    async (path) => {
      if (path === entries[0].path) throw new Error("Accès refusé");
      if (path === entries[1].path) return null as unknown as Entry;
      if (path === entries[2].path) return { ...file, size: -1 };
      if (path === entries[3].path) return { ...file, mtime: Number.NaN };
      return file;
    },
    new AbortController().signal,
    (result) => results.push(result),
  );
  expect(
    results.filter((result) => result.status === "unavailable"),
  ).toHaveLength(4);
  expect(
    results.find((result) => result.entry.path === entries[0].path)?.status,
  ).toBe("unavailable");
  expect(
    results.find((result) => result.entry.path === entries[4].path)?.status,
  ).toBe("present");
});

it("borne le lot à 200 références et quatre demandes simultanées", async () => {
  const entries = Array.from(
    { length: COLLECTION_CHECK_LIMIT + 5 },
    (_, i) => ({ ...file, path: `D:/Projet/${i}.txt` }),
  );
  let active = 0,
    peak = 0,
    calls = 0;
  const results: CollectionCheck[] = [];
  await checkCollection(
    entries,
    async () => {
      calls++;
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      return file;
    },
    new AbortController().signal,
    (result) => results.push(result),
  );
  expect(calls).toBe(COLLECTION_CHECK_LIMIT);
  expect(peak).toBe(4);
  expect(results).toHaveLength(COLLECTION_CHECK_LIMIT);
  expect(
    results.some(
      (result) => result.entry.path === entries[COLLECTION_CHECK_LIMIT].path,
    ),
  ).toBe(false);
});

it("l’arrêt empêche de nouvelles demandes et ignore les réponses encore en vol", async () => {
  const controller = new AbortController();
  const entries = Array.from({ length: 10 }, (_, i) => ({
    ...file,
    path: `D:/Projet/${i}.txt`,
  }));
  const results: CollectionCheck[] = [];
  let calls = 0;
  let finish!: (entry: Entry) => void;
  const response = new Promise<Entry>((resolve) => {
    finish = resolve;
  });
  const run = checkCollection(
    entries,
    () => {
      calls++;
      return response;
    },
    controller.signal,
    (result) => results.push(result),
  );
  expect(calls).toBe(4);
  controller.abort();
  finish(file);
  await run;
  expect(calls).toBe(4);
  expect(results).toEqual([]);
  await checkCollection(
    entries,
    async () => {
      calls++;
      return file;
    },
    controller.signal,
    (result) => results.push(result),
  );
  expect(calls).toBe(4);
});
