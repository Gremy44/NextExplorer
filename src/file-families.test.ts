import { expect, it, vi } from "vitest";
import {
  changeFileFamily,
  familyFile,
  groupFileRelations,
  restoreFileFamilies,
  verifyFamilyMembers,
  type FileFamily,
} from "./file-families";
import type { ImagePreparation } from "./image-preparations";
import type { Entry } from "./types";

const file = (name = "atlas.pdf", folder = "C:/Source"): Entry => ({
  name,
  path: `${folder}/${name}`,
  type: "file",
  size: 12,
  mtime: 100,
  ext: ".wrong",
});
const record: FileFamily = {
  version: 1,
  id: "family-1",
  name: "Atlas",
  date: "2026-10-17T10:00:00Z",
  members: [file(), file("atlas.docx")],
};
const restored = () => restoreFileFamilies([record])[0];
const signal = () => new AbortController().signal;

it("valide les familles, chemins et limites sans conserver de champs étrangers", () => {
  expect(restored().members[0].ext).toBe(".pdf");
  expect(familyFile({ ...file(), secret: "ignored" })).not.toHaveProperty(
    "secret",
  );
  for (const value of [
    null,
    {},
    Array(51).fill(record),
    [{ ...record, name: " " }],
    [{ ...record, name: "a".repeat(81) }],
    [record, { ...record, id: "other", name: "ATLAS" }],
    [{ ...record, members: [file()] }],
    [{ ...record, members: Array(21).fill(file()) }],
    [
      {
        ...record,
        members: [
          file(),
          { ...file(), path: "c:/source/ATLAS.pdf", name: "ATLAS.pdf" },
        ],
      },
    ],
  ])
    expect(() => restoreFileFamilies(value)).toThrow();
  for (const patch of [
    { path: "relative.pdf" },
    { path: "C:/../atlas.pdf" },
    { path: "https://example.com/atlas.pdf" },
    { path: "C:/atlas.pdf\0" },
    { name: "wrong.pdf" },
    { type: "symlink" },
    { size: NaN },
    { size: -1 },
    { mtime: Infinity },
  ])
    expect(() => familyFile({ ...file(), ...patch })).toThrow();
});
it("préserve les autres familles et refuse les brouillons dépassés ou un stockage endommagé", () => {
  const first = restored(),
    other = { ...first, id: "other", name: "Autre" };
  const updated = changeFileFamily([first, other], first, {
    ...first,
    name: "Voyage Atlas",
  });
  expect(updated[0]).toEqual(other);
  expect(() => changeFileFamily(updated, first, null)).toThrow("autre vue");
  expect(changeFileFamily(updated, other, null)).toHaveLength(1);
  expect(() => changeFileFamily("corrupt", null, first)).toThrow("illisibles");
  expect(() => changeFileFamily([first], null, first)).toThrow("existe déjà");
  expect(() =>
    changeFileFamily([first], first, { ...first, id: "changed" }),
  ).toThrow("Identité");
  expect(() =>
    changeFileFamily(
      Array.from({ length: 50 }, (_, i) => ({
        ...first,
        id: String(i),
        name: String(i),
      })),
      null,
      first,
    ),
  ).toThrow("50");
});
it("enregistre seulement des références distinctes et encore concordantes, sans lecture de contenu", async () => {
  const entries = restored().members,
    stat = vi.fn(async (path) => entries.find((entry) => entry.path === path)!);
  expect(await verifyFamilyMembers(entries, stat, signal())).toEqual(entries);
  expect(stat).toHaveBeenCalledTimes(2);
  for (const change of [
    { size: 13 },
    { name: "changed.pdf" },
    { type: "symlink" as const },
    { mtime: 101 },
  ])
    await expect(
      verifyFamilyMembers(
        entries,
        async (path) => ({
          ...entries.find((entry) => entry.path === path)!,
          ...change,
        }),
        signal(),
      ),
    ).rejects.toThrow("a changé");
  for (const entries of [
    [],
    [file()],
    [file(), file()],
    Array(21).fill(file()),
  ]) {
    stat.mockClear();
    await expect(verifyFamilyMembers(entries, stat, signal())).rejects.toThrow(
      "2 à 20",
    );
    expect(stat).not.toHaveBeenCalled();
  }
});
it("retrouve des liens manuels et des copies hors dossier sans déduire les anciennes préparations", async () => {
  const source = familyFile(file("photo.png")),
    copy = familyFile(file("photo.jpg", "C:/Copies"));
  const preparation: ImagePreparation = {
    version: 1,
    id: "prepared-1",
    date: record.date,
    count: 1,
    destination: "C:/Copies",
    constraints: {
      format: "jpg",
      width: 64,
      quality: 85,
      strip: true,
      maxBytes: 1000000,
    },
    paths: [copy.path],
    sources: [source],
    copies: [copy],
  };
  const files = [
    ...restored().members,
    source,
    copy,
    familyFile(file("isolé.txt")),
  ];
  const stat = vi.fn(
    async (path) => files.find((entry) => entry.path === path)!,
  );
  const result = await groupFileRelations(
    [restored().members[0], source, files[4]],
    [restored()],
    [preparation],
    stat,
    signal(),
  );
  expect(
    result.groups.find((group) => group.name === "Famille : Atlas")?.entries,
  ).toEqual(restored().members);
  expect(
    result.groups.find((group) => group.name.startsWith("Préparation"))
      ?.entries,
  ).toEqual([source, copy]);
  expect(
    result.groups.find((group) => group.name === "Sans relation enregistrée")
      ?.entries,
  ).toEqual([files[4]]);
  expect(result.examined).toBe(5);
  const preparedGroup = result.groups.find((group) =>
    group.name.startsWith("Préparation"),
  )!;
  expect(preparedGroup.id).toBe("preparation:prepared-1");
  expect(preparedGroup.name).toContain("photo.jpg");
  expect(preparedGroup.name).not.toContain("prepared-1");
  expect(new Set(stat.mock.calls.map(([path]) => path)).size).toBe(5);
  const old = { ...preparation, sources: undefined, copies: undefined };
  const legacy = await groupFileRelations([copy], [], [old], stat, signal());
  expect(legacy.groups.map((group) => group.name)).toEqual([
    "Sans relation enregistrée",
  ]);
});
it("sépare les relations périmées, liens symboliques, absences et chemins natifs incohérents", async () => {
  const first = restored();
  for (const patch of [
    { size: 20 },
    { mtime: 101 },
    { type: "symlink" },
    { name: "other.pdf" },
    { path: "C:/other/atlas.pdf" },
  ]) {
    const result = await groupFileRelations(
      first.members,
      [first],
      [],
      async (path) =>
        ({
          ...first.members.find((entry) => entry.path === path)!,
          ...patch,
        }) as Entry,
      signal(),
    );
    expect(
      result.groups.find((group) => group.name === "Famille : Atlas"),
    ).toBeUndefined();
    expect(
      result.groups.find((group) => group.name === "Relations à revérifier")
        ?.entries,
    ).toHaveLength(2);
  }
  const result = await groupFileRelations(
    [file()],
    [],
    [],
    async () => {
      throw new Error("missing");
    },
    signal(),
  );
  expect(result.groups[0].name).toBe("Relations à revérifier");
  expect(result.notes.get(file().path)).toContain("absent");
});
it("borne les métadonnées à 200 fichiers et ignore les réponses reçues après arrêt", async () => {
  const entries = Array.from({ length: 1003 }, (_, i) =>
    familyFile(file(`${i}.txt`)),
  );
  const stat = vi.fn(
    async (path) => entries.find((entry) => entry.path === path)!,
  );
  const result = await groupFileRelations(entries, [], [], stat, signal());
  expect(stat).toHaveBeenCalledTimes(200);
  expect(result.examined).toBe(200);
  expect(result.unexamined).toBe(800);
  expect(result.omitted).toBe(3);
  const controller = new AbortController();
  const pending = groupFileRelations(
    entries,
    [],
    [],
    async (path) => {
      controller.abort();
      return entries.find((entry) => entry.path === path)!;
    },
    controller.signal,
  );
  await expect(pending).rejects.toThrow();
  const aborted = new AbortController();
  aborted.abort();
  stat.mockClear();
  await expect(
    groupFileRelations(entries, [], [], stat, aborted.signal),
  ).rejects.toThrow();
  expect(stat).not.toHaveBeenCalled();
});
