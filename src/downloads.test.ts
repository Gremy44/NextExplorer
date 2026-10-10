import { afterEach, expect, it, vi } from "vitest";
vi.mock("./bridge", () => ({
  bridge: { request: vi.fn() },
  storageUpdate: vi.fn(),
}));
import { bridge, storageUpdate } from "./bridge";
import {
  automaticDownloadSuggestion,
  canFileDownload,
  downloadSite,
  downloadSuggestion,
  normalizeDownloadRule,
  restoreDownloadFiling,
  rememberDownloadDestination,
  restoreDownloadRuns,
  verifyDownload,
} from "./downloads";
const item = {
  id: 1,
  state: "complete",
  exists: true,
  filename: "D:/Downloads/document.pdf",
  fileSize: 12,
  danger: "safe",
  incognito: false,
  startTime: "2026-10-04T12:00:00.000Z",
  referrer: "https://exemple.fr/formulaire?token=secret",
  url: "https://cdn.exemple.fr/document.pdf",
  finalUrl: "https://cdn.exemple.fr/document.pdf",
} as chrome.downloads.DownloadItem;
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("ne propose que les fichiers terminés, disponibles et acceptés par Chrome", () => {
  expect(canFileDownload(item)).toBe(true);
  for (const change of [
    { state: "in_progress" },
    { state: "interrupted" },
    { exists: false },
    { filename: "" },
    { incognito: true },
    { danger: "dangerous" },
  ])
    expect(
      canFileDownload({ ...item, ...change } as chrome.downloads.DownloadItem),
    ).toBe(false);
});
it("revérifie l'identité et la fin du téléchargement avant toute opération native", async () => {
  const search = vi.fn(async () => [{ ...item, state: "in_progress" }]);
  vi.stubGlobal("chrome", { downloads: { search } });
  await expect(verifyDownload(item)).rejects.toThrow("plus disponible");
  expect(bridge.request).not.toHaveBeenCalled();
  search.mockResolvedValueOnce([{ ...item, filename: "D:/changed.pdf" }]);
  await expect(verifyDownload(item)).rejects.toThrow("plus disponible");
});
it("contrôle le fichier réel malgré une existence Chrome périmée", async () => {
  vi.stubGlobal("chrome", { downloads: { search: vi.fn(async () => [item]) } });
  vi.mocked(bridge.request).mockRejectedValueOnce(new Error("missing"));
  await expect(verifyDownload(item)).rejects.toThrow("Impossible d’accéder");
  vi.mocked(bridge.request).mockResolvedValueOnce({ type: "file", size: 13 });
  await expect(verifyDownload(item)).rejects.toThrow("changé");
  vi.mocked(bridge.request).mockResolvedValueOnce({ type: "file", size: 12 });
  await expect(verifyDownload(item)).resolves.toEqual(item);
  expect(bridge.request).toHaveBeenLastCalledWith("FS_STAT", {
    path: item.filename,
  });
});

const rule = {
  id: "test-rule",
  name: "Documents",
  site: "exemple.fr",
  extension: ".pdf",
  destination: "D:/Documents",
  enabled: true,
};
it("réserve l’automatisme aux règles explicitement activées avant le début du téléchargement", () => {
  const automatic = {
    ...rule,
    automatic: true,
    automaticSince: "2026-10-03T12:00:00.000Z",
  };
  expect(automaticDownloadSuggestion(item, [rule]).automatic).toBe(false);
  expect(automaticDownloadSuggestion(item, [automatic]).automatic).toBe(true);
  expect(
    automaticDownloadSuggestion(item, [
      { ...automatic, automaticSince: "2026-10-05T12:00:00.000Z" },
    ]).automatic,
  ).toBe(false);
  expect(
    automaticDownloadSuggestion(item, [{ ...automatic, enabled: false }])
      .automatic,
  ).toBe(false);
  expect(
    automaticDownloadSuggestion(item, [automatic, { ...rule, id: "manual" }])
      .automatic,
  ).toBe(false);
  expect(
    automaticDownloadSuggestion(item, [
      automatic,
      { ...automatic, id: "other", destination: "D:/Other" },
    ]),
  ).toMatchObject({ automatic: true, ambiguous: true, destination: "" });
  const generic = { ...automatic, id: "generic", site: "" };
  expect(automaticDownloadSuggestion(item, [generic, rule]).automatic).toBe(
    false,
  );
  // A corrupt opt-in still leaves the specific manual rule blocking the generic one.
  const restored = restoreDownloadFiling({
    rules: [generic, { ...automatic, automaticSince: "broken" }],
  }).rules;
  expect(automaticDownloadSuggestion(item, restored).automatic).toBe(false);
});
it("refuse un suivi corrompu pour empêcher un rejeu silencieux", () => {
  const run = {
    key: "1/date",
    name: "doc.pdf",
    source: "D:/Downloads/doc.pdf",
    destination: "D:/Documents/doc.pdf",
    date: item.startTime,
    state: "reserved",
  };
  expect(restoreDownloadRuns([run])).toEqual([run]);
  for (const value of [
    null,
    [null],
    [{ ...run, source: "../doc.pdf" }],
    [{ ...run, state: "invalid" }],
  ])
    expect(() => restoreDownloadRuns(value)).toThrow();
});
it("normalise site et extension et refuse les critères dangereux ou trop larges", () => {
  expect(
    normalizeDownloadRule({
      ...rule,
      site: "HTTPS://EXEMPLE.FR/page",
      extension: " PDF ",
    }),
  ).toEqual(rule);
  for (const change of [
    { site: "https://user:password@exemple.fr" },
    { site: "*.exemple.fr" },
    { site: "javascript://exemple.fr" },
    { site: "", extension: "" },
    { extension: "../pdf" },
    { destination: "Documents" },
    { destination: "D:/bad\0folder" },
  ])
    expect(() => normalizeDownloadRule({ ...rule, ...change })).toThrow();
});
it("utilise le site référent, applique les deux critères et privilégie la règle précise", () => {
  expect(downloadSite(item)).toBe("exemple.fr");
  expect(downloadSite({ ...item, referrer: "" })).toBe("cdn.exemple.fr");
  const generic = { ...rule, id: "generic", site: "", destination: "D:/PDF" };
  expect(downloadSuggestion(item, [generic, rule]).destination).toBe(
    "D:/Documents",
  );
  expect(
    downloadSuggestion({ ...item, referrer: "https://exemple.fr.evil.test" }, [
      rule,
    ]).destination,
  ).toBe("");
  expect(
    downloadSuggestion({ ...item, filename: "D:/Downloads/document.pdf.exe" }, [
      rule,
    ]).destination,
  ).toBe("");
  expect(
    downloadSuggestion(item, [{ ...rule, enabled: false }]).destination,
  ).toBe("");
  expect(
    downloadSuggestion({ ...item, incognito: true }, [rule]).destination,
  ).toBe("");
  expect(
    downloadSuggestion({ ...item, state: "in_progress" }, [rule]).destination,
  ).toBe("");
});
it("ne choisit pas silencieusement entre deux règles contradictoires", () => {
  const result = downloadSuggestion(item, [
    rule,
    { ...rule, id: "other", destination: "D:/Other" },
  ]);
  expect(result.ambiguous).toBe(true);
  expect(result.destination).toBe("");
  expect(
    downloadSuggestion(item, [rule, { ...rule, id: "same" }]).destination,
  ).toBe("D:/Documents");
});
it("ignore les préférences corrompues sans réactiver les règles désactivées", () => {
  expect(restoreDownloadFiling(null)).toEqual({ rules: [], destinations: [] });
  expect(
    restoreDownloadFiling({
      rules: [
        null,
        { ...rule, enabled: false },
        rule,
        { ...rule, id: "unsafe", site: "*" },
      ],
      destinations: [null, "relative", "D:/Documents", "D:/Documents"],
    }),
  ).toEqual({
    rules: [{ ...rule, enabled: false }],
    destinations: ["D:/Documents"],
  });
});
it("mémorise la destination la plus récente sans perdre les règles et borne l’historique", async () => {
  const previous = {
    rules: [rule],
    destinations: Array.from({ length: 20 }, (_, i) => `D:/Folder${i}`),
  };
  vi.mocked(storageUpdate).mockImplementation(async (_key, _fallback, update) =>
    update(previous),
  );
  const saved = (await rememberDownloadDestination("D:/Folder5")) as ReturnType<
    typeof restoreDownloadFiling
  >;
  expect(saved.rules).toEqual([rule]);
  expect(saved.destinations[0]).toBe("D:/Folder5");
  expect(saved.destinations.length).toBe(20);
  expect(new Set(saved.destinations).size).toBe(20);
});
