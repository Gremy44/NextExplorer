import { expect, it, vi } from "vitest";
vi.mock("./bridge", () => ({ bridge: {}, storageUpdate: vi.fn() }));
import {
  groupFileDestinations,
  GROUP_TRANSFER_LIMIT,
  verifyGroupOrigins,
  verifyGroupTransfer,
} from "./file-destinations";
import { restoreDownloadFiling } from "./downloads";
import type { Entry } from "./types";
import { groupFileOrigins } from "./file-origins";
import type { Provenance } from "./provenance";

const file = (name = "rapport.PDF", folder = "C:/Inbox"): Entry => ({
  name,
  path: `${folder}/${name}`,
  type: "file",
  size: 12,
  mtime: 1700000000,
  ext: ".wrong",
});

const source: Provenance = {
  title: "Document",
  sourceUrl: "https://example.com/page",
  imageUrl: undefined,
  collectedAt: "2026-10-11T00:00:00Z",
  size: 12,
};
const originStat = async (path: string) =>
  path.endsWith(".source.json")
    ? { ...file(), path, size: 200 }
    : { ...file(path.split("/").pop()!), path };

it("utilise les origines contrôlées, les domaines exacts et la priorité des règles existantes", async () => {
  const entries = [
    file(),
    file("other.pdf"),
    file("absent.pdf"),
    file("done.pdf", "C:/Site"),
  ];
  const read = vi.fn(async (entry: Entry) => {
    if (entry.name === "absent.pdf") throw new Error("Provenance absente");
    return {
      ...source,
      sourceUrl:
        entry.name === "other.pdf"
          ? "https://sub.example.com/page"
          : "https://example.com:8443/page",
    };
  });
  const origins = await groupFileOrigins(
    entries,
    originStat,
    read,
    new AbortController().signal,
  );
  const rules = [
    rule,
    {
      ...rule,
      id: "site",
      name: "Site PDF",
      site: "example.com",
      destination: "C:/Site",
    },
    {
      ...rule,
      id: "disabled",
      site: "example.com",
      enabled: false,
      destination: "C:/Other",
    },
  ];
  const before = structuredClone(rules);
  const result = groupFileDestinations(entries, rules, origins);
  expect(
    result.groups.find((group) => group.destination === "C:/Site")?.entries,
  ).toEqual([entries[0]]);
  expect(
    result.groups.find((group) => group.destination === rule.destination)
      ?.entries,
  ).toEqual([entries[1]]);
  expect(
    result.groups.find((group) => group.name === "Sans origine vérifiable")
      ?.entries,
  ).toEqual([entries[2]]);
  expect(
    result.groups.find((group) => group.name === "Déjà à destination")?.entries,
  ).toEqual([entries[3]]);
  expect(result.notes.get(entries[0].path)).toContain(
    "Site PDF · Origine déclarée : https://example.com:8443/page",
  );
  expect(result.notes.get(entries[2].path)).toContain("Provenance absente");
  expect(rules).toEqual(before);
  const conflict = groupFileDestinations(
    [entries[0]],
    [...rules, { ...rules[1], id: "conflict", destination: "C:/Other" }],
    origins,
  );
  expect(conflict.groups[0]).toMatchObject({
    name: "Règles en conflit",
    destination: "",
  });
  const tie = groupFileDestinations(
    [entries[0]],
    [rule, { ...rules[1], extension: "" }],
    origins,
  );
  expect(tie.groups[0].name).toBe("Règles en conflit");
});

it("ne propose aucun transfert aux fichiers au-delà des 20 origines contrôlées", async () => {
  const entries = Array.from({ length: 25 }, (_, i) => file(`${i}.pdf`));
  const read = vi.fn(async () => source);
  const origins = await groupFileOrigins(
    entries,
    originStat,
    read,
    new AbortController().signal,
  );
  const result = groupFileDestinations(entries, [rule], origins);
  expect(read).toHaveBeenCalledTimes(20);
  expect(
    result.groups.find((group) => group.destination === rule.destination)
      ?.entries,
  ).toHaveLength(20);
  expect(
    result.groups.find((group) => group.name === "Non analysés"),
  ).toMatchObject({ destination: "", entries: entries.slice(20) });
});

it("revérifie les origines de tout le lot et bloque changements, absences et JSON trop lourds", async () => {
  const entries = [file(), file("second.pdf")];
  const expected = new Map(entries.map((entry) => [entry.path, source]));
  const read = vi.fn(async () => source);
  await verifyGroupOrigins(entries, expected, originStat, read);
  expect(read).toHaveBeenCalledTimes(2);
  for (const changed of [
    { ...source, sourceUrl: "https://other.com/page" },
    { ...source, title: "Other" },
    { ...source, collectedAt: "2026-10-10T00:00:00Z" },
    { ...source, size: 13 },
  ]) {
    await expect(
      verifyGroupOrigins(entries, expected, originStat, async (entry) =>
        entry.name === "second.pdf" ? changed : source,
      ),
    ).rejects.toThrow("second.pdf");
  }
  await expect(
    verifyGroupOrigins(entries, new Map(), originStat, read),
  ).rejects.toThrow("origine");
  await expect(
    verifyGroupOrigins(entries, expected, originStat, async () => {
      throw new Error("missing");
    }),
  ).rejects.toThrow("origine");
  read.mockClear();
  await expect(
    verifyGroupOrigins(
      entries,
      expected,
      async (path) => ({
        ...(await originStat(path)),
        size: path.endsWith(".source.json") ? 65537 : 12,
      }),
      read,
    ),
  ).rejects.toThrow("origine");
  expect(read).not.toHaveBeenCalled();
});
const rule = {
  id: "pdf",
  name: "PDF",
  extension: ".pdf",
  site: "",
  enabled: true,
  destination: "C:/Documents",
};

it("réutilise les règles actives d’extension, explique chaque fichier et exclut sites et provenances", () => {
  const entries = [
    file(),
    file("image.pdf.exe"),
    file("note.txt"),
    file("rapport.PDF", "c:/documents"),
    file("rapport.pdf.source.json"),
    { ...file("Dossier"), type: "directory" as const },
    { ...file("Lien.pdf"), type: "symlink" as const },
    {
      name: "Web",
      path: "https://example.com",
      type: "web" as const,
      collectedAt: "2026-10-11",
    },
  ];
  const before = structuredClone(entries);
  const rules = restoreDownloadFiling({
    rules: [
      rule,
      { ...rule, id: "disabled", enabled: false, destination: "C:/Other" },
      { ...rule, id: "site", site: "example.com", destination: "C:/Site" },
      { ...rule, id: "text", extension: ".txt", enabled: false },
    ],
  }).rules;
  const result = groupFileDestinations(entries, rules);
  expect(result.groups[0]).toMatchObject({
    destination: "C:/Documents",
    entries: [entries[0]],
  });
  expect(
    result.groups.find((group) => group.name === "Déjà à destination")?.entries,
  ).toEqual([entries[3]]);
  expect(
    result.groups.find((group) => group.name === "Sans destination proposée")
      ?.entries,
  ).toEqual([entries[1], entries[2]]);
  expect(result.notes.get(entries[0].path)).toBe("Règle : PDF");
  expect(result.excluded).toBe(4);
  expect(entries).toEqual(before);
});

it("sépare les conflits et accepte plusieurs règles pour une même destination sans activer d’automatisme", () => {
  const other = {
    ...rule,
    id: "other",
    name: "Autre",
    destination: "C:/Other",
    automatic: true,
  };
  const conflict = groupFileDestinations([file()], [rule, other]);
  expect(conflict.groups[0]).toMatchObject({
    name: "Règles en conflit",
    destination: "",
  });
  expect(conflict.notes.get(file().path)).toContain("C:/Documents ; C:/Other");
  const same = groupFileDestinations(
    [file()],
    [rule, { ...other, destination: rule.destination }],
  );
  expect(same.groups[0].destination).toBe(rule.destination);
  expect(same.notes.get(file().path)).toBe("Règles : PDF, Autre");
});

it("borne le regroupement et reconnaît les dossiers Windows racines et UNC sans confondre les chemins POSIX", () => {
  const result = groupFileDestinations(
    Array.from({ length: 1003 }, (_, i) => file(`${i}.pdf`)),
    [rule],
  );
  expect(result.groups[0].entries).toHaveLength(1000);
  expect(result.omitted).toBe(3);
  for (const [folder, destination] of [
    ["C:", "c:\\"],
    ["\\\\SERVER\\Share", "//server/share/"],
  ]) {
    expect(
      groupFileDestinations(
        [file("doc.pdf", folder)],
        [{ ...rule, destination }],
      ).groups[0].name,
    ).toBe("Déjà à destination");
  }
  expect(
    groupFileDestinations(
      [file("doc.pdf", "/Docs")],
      [{ ...rule, destination: "/docs" }],
    ).groups[0].destination,
  ).toBe("/docs");
});

it("contrôle tout le lot et la destination avant un transfert, sans lire ni écrire", async () => {
  const entries = [file(), file("second.pdf")];
  const stat = vi.fn(async (path: string) =>
    path === rule.destination
      ? { ...file("Documents"), type: "directory" as const }
      : entries.find((entry) => entry.path === path)!,
  );
  await verifyGroupTransfer(entries, rule.destination, stat);
  expect(stat.mock.calls.map(([path]) => path)).toEqual([
    rule.destination,
    ...entries.map((entry) => entry.path),
  ]);
  for (const entries of [
    [],
    [file(), file()],
    Array.from({ length: GROUP_TRANSFER_LIMIT + 1 }, (_, i) =>
      file(`${i}.pdf`),
    ),
  ]) {
    stat.mockClear();
    await expect(
      verifyGroupTransfer(entries, rule.destination, stat),
    ).rejects.toThrow("distincts");
    expect(stat).not.toHaveBeenCalled();
  }
});

it("refuse destinations non dossiers, absences, changements et liens avant toute mutation", async () => {
  const entry = file();
  for (const type of ["file", "symlink"] as const) {
    const stat = vi.fn(async () => ({ ...entry, type }));
    await expect(
      verifyGroupTransfer([entry], rule.destination, stat),
    ).rejects.toThrow("destination");
    expect(stat).toHaveBeenCalledTimes(1);
  }
  for (const change of [
    { size: 13 },
    { mtime: entry.mtime + 1 },
    { name: "other.pdf" },
    { type: "symlink" as const },
    { size: NaN },
    { mtime: Infinity },
  ]) {
    const stat = async (path: string) =>
      path === rule.destination
        ? { ...entry, type: "directory" as const }
        : { ...entry, ...change };
    await expect(
      verifyGroupTransfer([entry], rule.destination, stat),
    ).rejects.toThrow("a changé");
  }
  await expect(
    verifyGroupTransfer([entry], rule.destination, async () => {
      throw new Error("absent");
    }),
  ).rejects.toThrow("absent");
  await expect(
    verifyGroupTransfer(
      [file("rapport.pdf", "c:/DOCUMENTS")],
      rule.destination,
      async (path) =>
        path === rule.destination
          ? { ...entry, type: "directory" }
          : file("rapport.pdf", "c:/DOCUMENTS"),
    ),
  ).rejects.toThrow("déjà");
});
