import { expect, it, vi } from "vitest";
import { groupFileOrigins, ORIGIN_FILE_LIMIT } from "./file-origins";
import { parseProvenance, PROVENANCE_LIMIT } from "./provenance";
import { collectedLink, type Entry } from "./types";

const file = (name: string): Entry => ({
  name,
  path: `D:/Origins/${name}`,
  type: "file",
  size: 24 * 1024 * 1024,
  mtime: 1,
  ext: ".tiff",
});
const stat = (entry: Entry) =>
  entry.path.endsWith(".source.json") ? { ...entry, size: 100 } : entry;
const signal = () => new AbortController().signal;
const source = (
  entry: Entry,
  sourceUrl = "https://example.com/page?token=secret#section",
  size = entry.size,
) =>
  parseProvenance(
    JSON.stringify({
      version: 1,
      file: entry.name,
      title: "Article",
      sourceUrl,
      collectedAt: "2026-10-11T08:00:00Z",
      size,
    }),
    entry.name,
  );

it("groups by declared site with validated, sanitized sources while leaving input and files alone", async () => {
  const a = file("a.tiff"),
    b = file("b.pdf"),
    c = file("c.png");
  const entries = [
    a,
    b,
    c,
    { ...file("Folder"), type: "directory" as const },
    { ...file("Link"), type: "symlink" as const },
    file("a.tiff.source.json"),
    collectedLink("https://example.com", "Web"),
  ];
  const original = structuredClone(entries);
  const read = vi.fn(async (entry: Entry) =>
    source(entry, entry === c ? "http://example.com:8080/other" : undefined),
  );
  const request = vi.fn(async (path: string) =>
    stat(file(path.split("/").at(-1)!)),
  );
  const result = await groupFileOrigins(entries, request, read, signal());
  expect(result.groups.map((group) => group.name)).toEqual([
    "https://example.com",
    "http://example.com:8080",
  ]);
  expect(result.groups[0].entries).toEqual([a, b]);
  expect(result.groups[0].reason).toContain("site d’origine déclaré");
  expect(result.excluded).toBe(4);
  expect(result.origins.get(a.path)?.sourceUrl).toBe(
    "https://example.com/page",
  );
  expect(read).toHaveBeenCalledTimes(3);
  expect(request).toHaveBeenCalledTimes(12);
  expect(entries).toEqual(original);
});

it("leaves missing, corrupt, unsafe or mismatched provenance without an assigned site", async () => {
  const entries = [
    "missing.tiff",
    "corrupt.pdf",
    "wrong-size.png",
    "unsafe.txt",
    "too-big.tiff",
    "metadata-link.tiff",
    "changed.tiff",
  ].map(file);
  const read = vi.fn(async (entry: Entry) => {
    if (entry.name === "corrupt.pdf") throw new Error("Provenance endommagée");
    return source(
      entry,
      entry.name === "unsafe.txt"
        ? "https://user:pass@example.com/"
        : undefined,
      entry.name === "wrong-size.png" ? 1 : entry.size,
    );
  });
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("missing.tiff.source.json"))
      throw new Error("Provenance absente");
    const current = stat(file(path.split("/").at(-1)!));
    if (path.endsWith("too-big.tiff.source.json"))
      current.size = PROVENANCE_LIMIT + 1;
    if (path.endsWith("metadata-link.tiff.source.json"))
      current.type = "symlink";
    if (path.endsWith("changed.tiff")) current.mtime = 2;
    return current;
  });
  const result = await groupFileOrigins(entries, request, read, signal());
  expect(result.origins.size).toBe(0);
  expect(result.withoutOrigin).toBe(7);
  expect(result.groups[0].name).toBe("Sans origine vérifiable");
  expect(result.notes.get(entries[2].path)).toContain("taille enregistrée");
  expect(read.mock.calls.map((call) => call[0].name)).toEqual(
    expect.arrayContaining(["corrupt.pdf", "wrong-size.png", "unsafe.txt"]),
  );
  expect(read).toHaveBeenCalledTimes(3);
});

it("rejects a file or its provenance modified while reading the JSON", async () => {
  for (const changed of ["original", "metadata"]) {
    const entry = file("a.tiff");
    let read = false;
    const result = await groupFileOrigins(
      [entry],
      async (path) => {
        const current = stat(file(path.split("/").at(-1)!));
        if (read && (changed === "metadata") === path.endsWith(".source.json"))
          current.mtime++;
        return current;
      },
      async (entry) => {
        read = true;
        return source(entry);
      },
      signal(),
    );
    expect(result.withoutOrigin).toBe(1);
    expect(result.origins.size).toBe(0);
    expect(result.notes.get(entry.path)).toContain("modifié");
  }
});

it("caps analysis at 20 files, keeps unexamined files separate and limits parallel requests", async () => {
  const entries = Array.from({ length: 1003 }, (_, i) => file(`${i}.tiff`));
  let active = 0,
    peak = 0;
  const request = vi.fn(async (path: string) => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return stat(file(path.split("/").at(-1)!));
  });
  const read = vi.fn(async (entry: Entry) => source(entry));
  const result = await groupFileOrigins(entries, request, read, signal());
  expect(read).toHaveBeenCalledTimes(ORIGIN_FILE_LIMIT);
  expect(result.examined).toBe(20);
  expect(result.unexamined).toBe(980);
  expect(result.omitted).toBe(3);
  expect(result.groups.at(-1)?.name).toBe("Non analysés");
  expect(peak).toBeLessThanOrEqual(4);
  expect(result.origins.has(entries[20].path)).toBe(false);
});

it("ignores late replies after cancellation without reading JSON or starting further requests", async () => {
  const controller = new AbortController();
  const entries = Array.from({ length: 25 }, (_, i) => file(`${i}.tiff`));
  const request = vi.fn(async (path: string) => {
    controller.abort();
    return file(path.split("/").at(-1)!);
  });
  const read = vi.fn(async (entry: Entry) => source(entry));
  await expect(
    groupFileOrigins(entries, request, read, controller.signal),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  await expect(
    groupFileOrigins(entries, request, read, controller.signal),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
