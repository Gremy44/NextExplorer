import { describe, expect, it, vi } from "vitest";
import {
  changeGroupCategories,
  defaultGroupCategories,
  fileExtension,
  GROUP_ENTRY_LIMIT,
  groupFiles,
  groupFileSizes,
  groupModifiedDates,
  groupRelatedNames,
  listGroupFolder,
  restoreGroupCategories,
} from "./file-groups";
import { collectedLink, type Entry, type Listing } from "./types";

const file = (name: string, type: Entry["type"] = "file"): Entry => ({
  name,
  path: `C:\\Référence\\${name}`,
  type,
  size: 24 * 1024 * 1024,
  mtime: 1,
  ext: ".wrong",
});

describe("groupes virtuels", () => {
  it("classe les tailles aux bornes exactes et sépare les données invalides sans ouvrir de fichier", () => {
    const bytes = [
      0,
      1,
      1048575,
      1048576,
      10485759,
      10485760,
      104857599,
      104857600,
      Number.MAX_SAFE_INTEGER,
      -1,
      NaN,
      Infinity,
    ];
    const result = groupFileSizes([
      ...bytes.map((size, i) => ({ ...file(`${i}.bin`), size })),
      file("Dossier", "directory"),
    ]);
    expect(result.groups.map((group) => group.entries.length)).toEqual([
      1, 2, 2, 2, 2, 3,
    ]);
    expect(result.excluded).toBe(1);
    expect(
      groupFileSizes(Array.from({ length: 1003 }, (_, i) => file(`${i}.txt`)))
        .omitted,
    ).toBe(3);
  });
  it("regroupe les mois de modification locaux par année, du plus récent au plus ancien", () => {
    const modified = (
      name: string,
      year: number,
      month: number,
      day: number,
    ) => ({
      ...file(name),
      mtime: new Date(year, month, day, 12).getTime() / 1000,
    });
    const january = modified("scan.TIFF", 2026, 0, 31);
    const february = modified("photo.pdf", 2026, 1, 1);
    const sameMonth = modified("autre.txt", 2026, 1, 28);
    const priorYear = modified("ancien.png", 2025, 1, 1);
    const entries = [january, february, sameMonth, priorYear];
    const original = structuredClone(entries);
    const result = groupModifiedDates(entries);
    expect(result.groups.map((group) => group.name)).toEqual([
      "février 2026",
      "janvier 2026",
      "février 2025",
    ]);
    expect(result.groups[0].entries).toEqual([february, sameMonth]);
    expect(result.groups[0].reason).toContain("fuseau horaire");
    expect(entries).toEqual(original);
  });
  it("laisse les dates invalides à part et exclut dossiers et liens sans dépasser le plafond", () => {
    const invalid = [NaN, Infinity, 1e20].map((mtime, i) => ({
      ...file(`${i}.txt`),
      mtime,
    }));
    const entries = [
      ...invalid,
      file("Dossier", "directory"),
      file("Lien", "symlink"),
      collectedLink("https://example.com", "Web"),
      ...Array.from({ length: 1000 }, (_, i) => file(`date-${i}.txt`)),
    ];
    const result = groupModifiedDates(entries);
    expect(result.excluded).toBe(3);
    expect(result.omitted).toBe(6);
    expect(result.groups.at(-1)?.name).toBe("Date indisponible");
    expect(result.groups.at(-1)?.entries).toEqual(invalid);
    expect(
      result.groups.reduce((n, group) => n + group.entries.length, 0),
    ).toBe(997);
  });
  it("rapproche les noms normalisés avec un motif sans analyser leurs contenus", () => {
    const entries = [
      file("Été_Atlas-v1.PDF"),
      file("ete atlas version 2.docx"),
      file("ETE–ATLAS (1).TIFF"),
      file("ete atlas copie-v3.png"),
      file("ete atlas – révision 4 .txt"),
      file("Ete Atlas", "directory"),
      file("ete atlas.pdf", "symlink"),
      collectedLink("https://example.com/ete-atlas", "Été Atlas"),
    ];
    const original = structuredClone(entries);
    const result = groupRelatedNames(entries);
    expect(result.families).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.excluded).toBe(3);
    expect(result.groups[0].name).toBe("ete atlas");
    expect(result.groups[0].entries).toEqual(entries.slice(0, 5));
    expect(result.groups[0].reason).toContain(
      "Même nom normalisé : « ete atlas »",
    );
    expect(entries).toEqual(original);
  });
  it("garde les noms vagues, dates et identités distinctes sans rapprochement", () => {
    const entries = [
      "scan-v1.pdf",
      "scan-v2.tif",
      "document final.pdf",
      "document_final.txt",
      "scan sans titre.pdf",
      "scan_sans_titre.tif",
      "new document.pdf",
      "new_document.docx",
      "rapport 2026.pdf",
      "rapport_2026.docx",
      "facture dupont 001.pdf",
      "facture dupont 002.pdf",
      "projet atlas 2025-10-11.pdf",
      "projet atlas 2025-10-12.pdf",
      "projet atlas (2025).pdf",
      "projet atlas (2026).pdf",
      "contrat dupont.pdf",
      "contrat dupond.pdf",
      "projet atlas.pdf",
      "atlas projet.docx",
      "projet atlas photo.png",
      "projet atlas.photo.jpg.exe",
      "README",
      ".gitignore",
    ].map((name) => file(name));
    const result = groupRelatedNames(entries);
    expect(result.families).toBe(0);
    expect(result.unmatched).toBe(entries.length);
    expect(result.groups[0].name).toBe("Sans rapprochement fiable");
    expect(result.groups[0].reason).toContain("Aucun rapprochement proposé");
    expect(new Set(result.groups[0].entries)).toEqual(new Set(entries));
  });
  it("conserve les nombres ordinaires et sépare les familles sans liens transitifs", () => {
    const entries = [
      "projet atlas 2026-01-02.pdf",
      "projet_atlas_2026_01_02.docx",
      "facture dupont 001.pdf",
      "facture-dupont-001.png",
      "projet atlas lyon.pdf",
      "projet atlas lyons.pdf",
    ].map((name) => file(name));
    const result = groupRelatedNames(entries);
    expect(result.families).toBe(2);
    expect(result.unmatched).toBe(2);
    expect(result.groups[0].entries).toEqual(entries.slice(0, 2));
    expect(result.groups[1].entries).toEqual(entries.slice(2, 4));
  });
  it("borne aussi les familles par nom à 1000 entrées", () => {
    const entries = Array.from({ length: 1002 }, (_, i) =>
      file(`projet atlas v${i}.pdf`),
    );
    const result = groupRelatedNames(entries);
    expect(result.groups[0].entries).toHaveLength(GROUP_ENTRY_LIMIT);
    expect(result.families).toBe(1);
    expect(result.omitted).toBe(2);
    expect(groupRelatedNames([]).groups).toEqual([]);
  });
  it("classe les noms ambigus et TIFF volumineux par suffixe sans altérer les entrées", () => {
    const entries = [
      file("final-v2.PDF"),
      file("scan sans titre.TIFF"),
      file("image.pdf.exe"),
      file("README"),
      file(".gitignore"),
      file("Sous-dossier", "directory"),
      file("alias.tif", "symlink"),
      collectedLink("https://example.com", "Lien"),
    ];
    const original = structuredClone(entries);
    const result = groupFiles(entries, defaultGroupCategories);
    expect(
      result.groups
        .find((group) => group.name === "Documents")
        ?.entries.map((entry) => entry.name),
    ).toEqual(["final-v2.PDF"]);
    expect(
      result.groups.find((group) => group.name === "Images")?.entries,
    ).toEqual([entries[1]]);
    expect(result.groups.at(-1)?.entries.map((entry) => entry.name)).toEqual([
      "image.pdf.exe",
      "README",
      ".gitignore",
    ]);
    expect(result.excluded).toBe(3);
    expect(entries).toEqual(original);
    expect(fileExtension(file("rapport."))).toBe("");
    expect(
      groupFiles(
        Array.from({ length: 1002 }, (_, i) => file(`${i}.pdf`)),
        defaultGroupCategories,
      ).omitted,
    ).toBe(2);
  });
  it("normalise les catégories et refuse les règles ambiguës ou illisibles", () => {
    expect(
      restoreGroupCategories({
        version: 1,
        categories: [{ name: "  Mes   scans  ", extensions: [".TIFF", "pdf"] }],
      }).categories[0],
    ).toEqual({ name: "Mes scans", extensions: ["tiff", "pdf"] });
    const defaults = restoreGroupCategories(null);
    defaults.categories[0].name = "Changed";
    expect(defaultGroupCategories.categories[0].name).toBe("Documents");
    for (const value of [
      undefined,
      {},
      { version: 2, categories: [] },
      { version: 1, categories: [] },
      { version: 1, categories: [{ name: "Autres", extensions: ["pdf"] }] },
      { version: 1, categories: [{ name: "A", extensions: ["pdf", ".PDF"] }] },
      { version: 1, categories: [{ name: "A", extensions: ["*.pdf"] }] },
      {
        version: 1,
        categories: [
          { name: "A", extensions: ["pdf"] },
          { name: "a", extensions: ["tif"] },
        ],
      },
    ])
      expect(() => restoreGroupCategories(value)).toThrow();
    expect(() =>
      restoreGroupCategories({
        version: 1,
        categories: [
          { name: "A", extensions: ["pdf"] },
          { name: "B", extensions: ["pdf"] },
        ],
      }),
    ).toThrow(/appartient déjà/);
    expect(() =>
      changeGroupCategories(
        defaultGroupCategories,
        null,
        defaultGroupCategories,
      ),
    ).toThrow(/autre vue/);
    expect(changeGroupCategories(null, null, defaultGroupCategories)).toEqual(
      defaultGroupCategories,
    );
  });
  it("lit un instantané paginé borné et ignore le filtre du dossier", async () => {
    const entries = Array.from({ length: 1003 }, (_, i) => file(`${i}.txt`));
    const request = vi.fn(async (payload: Record<string, unknown>) => {
      const offset = payload.offset as number,
        limit = payload.limit as number;
      const page = entries.slice(offset, offset + limit);
      return {
        currentPath: "C:\\Référence",
        parentPath: "C:\\",
        entries: page,
        total: entries.length,
        nextOffset: offset + page.length,
        snapshot: "snapshot",
      };
    });
    const result = await listGroupFolder(
      "C:\\Référence",
      true,
      request,
      new AbortController().signal,
    );
    expect(result.entries).toHaveLength(GROUP_ENTRY_LIMIT);
    expect(result.total).toBe(1003);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toMatchObject({
      filter: "",
      showHidden: true,
      offset: 0,
      snapshot: "",
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      offset: 500,
      snapshot: "snapshot",
    });
  });
  it("ignore une réponse tardive après arrêt et ne lance plus de demandes", async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => {
      controller.abort();
      return {
        currentPath: "C:\\",
        parentPath: null,
        entries: [file("x.pdf")],
        total: 2,
        nextOffset: 1,
        snapshot: "s",
      };
    });
    await expect(
      listGroupFolder("C:\\", false, request, controller.signal),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    await expect(
      listGroupFolder("C:\\", false, request, controller.signal),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("refuse pagination bloquée, total changé et remplacement de l’instantané", async () => {
    const base = {
      currentPath: "C:\\",
      parentPath: null,
      entries: [],
      total: 2,
      nextOffset: 0,
      snapshot: "s",
    };
    for (const page of [
      base,
      { ...base, total: -1 },
      { ...base, total: 0, snapshot: "" },
      { ...base, entries: [file("x.pdf")], nextOffset: 0 },
    ]) {
      await expect(
        listGroupFolder(
          "C:\\",
          false,
          async () => page,
          new AbortController().signal,
        ),
      ).rejects.toThrow(/incohérente/);
    }
    for (const change of [{ snapshot: "new" }, { total: 3 }]) {
      let n = 0;
      await expect(
        listGroupFolder(
          "C:\\",
          false,
          async () => ({
            ...base,
            entries: [file(`${++n}.pdf`)],
            nextOffset: n,
            ...(n > 1 ? change : {}),
          }),
          new AbortController().signal,
        ),
      ).rejects.toThrow(/incohérente/);
    }
    const result = await listGroupFolder(
      "C:\\",
      false,
      async (): Promise<Listing & { snapshot: string }> => ({
        ...base,
        total: 0,
      }),
      new AbortController().signal,
    );
    expect(result).toEqual({ entries: [], total: 0 });
  });
});
