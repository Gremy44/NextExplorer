import { expect, it, vi } from "vitest";
import {
  COPY_FILE_BYTES,
  COPY_READ_BUDGET,
  groupIdenticalFiles,
  type CopyHashCache,
} from "./file-copies";
import type { CollectionEntry, Entry } from "./types";

const file = (name: string, size = 4, stamp = "100000000001"): Entry => ({
  name,
  path: `C:/Copies/${name}`,
  type: "file",
  size,
  mtime: 100,
  stamp,
  ext: name.match(/\.[^.]+$/)?.[0] || "",
});
const signal = () => new AbortController().signal;
const hash = (entry: Entry, digit = "a") => ({
  algorithm: "blake3",
  hash: digit.repeat(64),
  entry,
});
const copies = (result: Awaited<ReturnType<typeof groupIdenticalFiles>>) =>
  result.groups.filter((group) => group.id.startsWith("copy:"));
function fixture(entries: Entry[]) {
  const current = new Map(entries.map((entry) => [entry.path, entry]));
  return {
    current,
    stat: vi.fn(async (path: string) => {
      const entry = current.get(path);
      if (!entry) throw Error("absent");
      return entry;
    }),
    hash: vi.fn(async (entry: Entry) => hash(entry)),
  };
}

it("compare le contenu complet des tailles communes, sépare les différences et exclut les liens", async () => {
  const a = file("facture.pdf"),
    b = file("copie.txt"),
    c = file("autre.pdf"),
    unique = file("unique.bin", 7);
  const io = fixture([a, b, c, unique]);
  io.hash.mockImplementation(async (entry) =>
    hash(entry, entry === c ? "b" : "a"),
  );
  const entries: CollectionEntry[] = [
    a,
    b,
    c,
    unique,
    a,
    { ...a, path: "C:/Copies/dossier", name: "dossier", type: "directory" },
    { ...a, name: "link", path: "C:/Copies/link", type: "symlink" },
    { ...a, name: "a.source.json", path: "C:/Copies/a.source.json" },
    {
      type: "web",
      name: "Web",
      path: "https://example.com",
      collectedAt: new Date().toISOString(),
    },
  ];
  const result = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    new Map(),
    () => {},
  );
  expect(copies(result).map((group) => group.entries)).toEqual([[a, b]]);
  expect(io.hash.mock.calls.map(([entry]) => entry.path)).toEqual([
    a.path,
    b.path,
    c.path,
  ]);
  expect(result.excluded).toBe(5);
  expect(result.unexamined).toBe(0);
  expect(result.notes.get(unique.path)).toContain("taille");
});

it("réutilise les empreintes précises et invalide une écriture de même taille dans la même seconde", async () => {
  const entries = [file("a"), file("b")],
    io = fixture(entries),
    cache: CopyHashCache = new Map();
  await groupIdenticalFiles(entries, io, signal(), cache, () => {});
  const second = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    cache,
    () => {},
  );
  expect(second.cached).toBe(2);
  expect(io.hash).toHaveBeenCalledTimes(2);
  const changed = { ...entries[0], stamp: "100000000002" };
  io.current.set(changed.path, changed);
  io.hash.mockImplementation(async (entry) =>
    hash(entry, entry.stamp === changed.stamp ? "b" : "a"),
  );
  const third = await groupIdenticalFiles(
    [changed, entries[1]],
    io,
    signal(),
    cache,
    () => {},
  );
  expect(third.hashed).toBe(1);
  expect(third.cached).toBe(1);
  expect(copies(third)).toEqual([]);
});

it("refuse une ancienne référence modifiée, absente ou sans date précise avant de lire", async () => {
  const entries = [file("a"), file("b"), file("c")],
    io = fixture(entries);
  io.current.set(entries[0].path, { ...entries[0], stamp: "100000000002" });
  io.current.delete(entries[1].path);
  io.current.set(entries[2].path, { ...entries[2], stamp: undefined });
  const result = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    new Map(),
    () => {},
  );
  expect(io.hash).not.toHaveBeenCalled();
  expect(result.unexamined).toBe(3);
  expect(result.notes.get(entries[2].path)).toContain("compagnon");
});

it("refuse les empreintes malformées et les métadonnées renvoyées incompatibles", async () => {
  const entries = [file("a"), file("b")];
  for (const invalid of [
    "a".repeat(64),
    { ...hash(entries[0]), algorithm: "md5" },
    { ...hash(entries[0]), hash: "wrong" },
    hash({ ...entries[0], stamp: "changed" }),
    hash({ ...entries[0], path: "C:/Else/a" }),
  ]) {
    const io = fixture(entries);
    io.hash.mockResolvedValue(invalid as ReturnType<typeof hash>);
    const result = await groupIdenticalFiles(
      entries,
      io,
      signal(),
      new Map(),
      () => {},
    );
    expect(copies(result)).toEqual([]);
    expect(result.unexamined).toBe(2);
  }
});

it("retire un fichier changé après son hash mais avant la fin de l’analyse", async () => {
  const entries = [file("a"), file("b")],
    io = fixture(entries),
    cache: CopyHashCache = new Map();
  io.hash.mockImplementation(async (entry) => {
    if (entry.path === entries[1].path)
      io.current.set(entries[0].path, { ...entries[0], stamp: "100000000002" });
    return hash(entry);
  });
  const result = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    cache,
    () => {},
  );
  expect(copies(result)).toEqual([]);
  expect(cache.has(entries[0].path.toLowerCase())).toBe(false);
  expect(result.notes.get(entries[0].path)).toContain("pendant");
});

it("annule sans lecture suivante ni empreinte tardive remise en cache", async () => {
  const entries = [file("a"), file("b")],
    io = fixture(entries),
    cache: CopyHashCache = new Map(),
    controller = new AbortController();
  io.hash.mockImplementation(async (entry) => {
    controller.abort();
    return hash(entry);
  });
  await expect(
    groupIdenticalFiles(entries, io, controller.signal, cache, () => {}),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(io.hash).toHaveBeenCalledTimes(1);
  expect(cache.size).toBe(0);
});

it("borne le contenu lu et refuse les fichiers trop lourds", async () => {
  const entries = Array.from({ length: 8 }, (_, i) =>
    file(`large-${i}`, COPY_FILE_BYTES),
  );
  entries.push(
    file("oversized-a", COPY_FILE_BYTES + 1),
    file("oversized-b", COPY_FILE_BYTES + 1),
  );
  const io = fixture(entries),
    result = await groupIdenticalFiles(
      entries,
      io,
      signal(),
      new Map(),
      () => {},
    );
  expect(io.hash).toHaveBeenCalledTimes(COPY_READ_BUDGET / COPY_FILE_BYTES);
  expect(result.notes.get(entries[4].path)).toContain("256 Mio");
  expect(result.notes.get(entries[8].path)).toContain("64 Mio");
});

it("borne les références, empreintes et cache et annonce les omissions", async () => {
  const entries = Array.from({ length: 1003 }, (_, i) => file(`file-${i}`)),
    io = fixture(entries),
    cache: CopyHashCache = new Map();
  let active = 0,
    maximum = 0;
  io.stat.mockImplementation(async (path) => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    return io.current.get(path)!;
  });
  const result = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    cache,
    () => {},
  );
  expect(result.examined).toBe(200);
  expect(io.hash).toHaveBeenCalledTimes(100);
  expect(cache.size).toBe(100);
  expect(result.omitted).toBe(3);
  expect(result.unexamined).toBe(900);
  expect(maximum).toBeLessThanOrEqual(4);
});

it("inclut les fichiers vides et exige une lecture explicite même avec un nom similaire", async () => {
  const entries = [file("zero-a", 0), file("zero-b", 0)],
    io = fixture(entries);
  const result = await groupIdenticalFiles(
    entries,
    io,
    signal(),
    new Map(),
    () => {},
  );
  expect(io.hash).toHaveBeenCalledTimes(2);
  expect(copies(result)[0].entries).toEqual(entries);
});
