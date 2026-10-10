import { afterEach, expect, it, vi } from "vitest";
vi.mock("./bridge", () => ({
  storageGet: vi.fn(),
  storageUpdate: vi.fn(),
  bridge: { request: vi.fn() },
}));
vi.mock("./downloads", async (original) => ({
  ...(await original<typeof import("./downloads")>()),
  verifyDownload: vi.fn(),
}));
import { storageGet, storageUpdate } from "./bridge";
import {
  downloadFilingKey,
  downloadRunsKey,
  verifyDownload,
} from "./downloads";
import { startDownloadFiling } from "./download-background";
const item = {
  id: 42,
  state: "complete",
  exists: true,
  danger: "safe",
  incognito: false,
  filename: "D:/Downloads/doc.txt",
  fileSize: 12,
  referrer: "https://exemple.fr/page?secret=x",
  startTime: "2026-10-07T12:00:00.000Z",
} as chrome.downloads.DownloadItem;
it("refuse une identité de téléchargement incomplète avant tout accès natif", async () => {
  const request = vi.fn();
  const file = startDownloadFiling(request as any);
  for (const download of [
    { ...item, filename: undefined },
    { ...item, startTime: "invalid" },
    { ...item, id: 1.5 },
  ])
    await expect(
      file({ download: download as any, destination: "D:/Project" }),
    ).rejects.toThrow("Demande de rangement invalide");
  expect(request).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function automaticHarness() {
  const rule = {
    id: "auto",
    name: "Documents",
    site: "exemple.fr",
    extension: ".txt",
    destination: "D:/Project",
    enabled: true,
    automatic: true,
    automaticSince: "2026-10-07T11:00:00.000Z",
  };
  const stored: Record<string, any> = {
    [downloadFilingKey]: { rules: [rule], destinations: [] },
    [downloadRunsKey]: [],
  };
  let listener: (delta: any) => Promise<unknown>;
  const allowed = vi.fn(async () => true);
  vi.stubGlobal("chrome", {
    downloads: {
      search: vi.fn(async () => [item]),
      onChanged: {
        hasListener: () => false,
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
        removeListener: vi.fn(),
      },
    },
    permissions: {
      contains: allowed,
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
  });
  vi.stubGlobal("navigator", {
    locks: { request: (_: string, run: () => unknown) => run() },
  });
  vi.mocked(storageGet).mockImplementation(
    async (key, fallback) => stored[key] ?? fallback,
  );
  vi.mocked(storageUpdate).mockImplementation(
    async (key, fallback, update) =>
      (stored[key] = update(stored[key] ?? fallback)),
  );
  vi.mocked(verifyDownload).mockResolvedValue(item);
  const request = vi.fn(async (action: string, payload: any): Promise<any> => {
    if (action === "FS_STAT")
      return payload.path === rule.destination
        ? { type: "directory", path: payload.path }
        : { type: "file", size: 12 };
    if (action === "FS_TRANSFER") return { jobId: "auto-job" };
    if (action === "JOBS")
      return [
        {
          id: "auto-job",
          state: "completed",
          audit: {
            entries: [
              {
                source: item.filename,
                destination: "D:/Project/doc.txt",
                status: "moved",
              },
            ],
          },
        },
      ];
    return true;
  });
  const file = startDownloadFiling(request as any);
  return {
    stored,
    rule,
    allowed,
    request,
    file,
    event: (state = "complete") =>
      listener!({ id: item.id, state: { current: state } }),
  };
}
it("écoute les nouveaux téléchargements après l’octroi de la permission optionnelle et s’arrête à son retrait", () => {
  let added: (permissions: chrome.permissions.Permissions) => void;
  let removed: (permissions: chrome.permissions.Permissions) => void;
  const api: any = {
    permissions: {
      onAdded: {
        addListener: (listener: typeof added) => {
          added = listener;
        },
      },
      onRemoved: {
        addListener: (listener: typeof removed) => {
          removed = listener;
        },
      },
    },
  };
  vi.stubGlobal("chrome", api);
  startDownloadFiling(vi.fn() as any);
  const listeners = new Set();
  api.downloads = {
    onChanged: {
      hasListener: (listener: unknown) => listeners.has(listener),
      addListener: (listener: unknown) => listeners.add(listener),
      removeListener: (listener: unknown) => listeners.delete(listener),
    },
  };
  added!({ permissions: ["downloads"] });
  added!({ permissions: ["downloads"] });
  expect(listeners.size).toBe(1);
  removed!({ permissions: ["debugger"] });
  expect(listeners.size).toBe(1);
  removed!({ permissions: ["downloads"] });
  expect(listeners.size).toBe(0);
});
it("range en arrière-plan avec conservation des collisions et ne rejoue pas après redémarrage", async () => {
  const test = automaticHarness();
  await test.event("in_progress");
  expect(test.request).not.toHaveBeenCalled();
  await test.event();
  await vi.waitFor(() =>
    expect(test.stored[downloadRunsKey][0].state).toBe("completed"),
  );
  expect(test.stored[downloadRunsKey][0].automatic).toBe(true);
  expect(test.request).toHaveBeenCalledWith("FS_TRANSFER", {
    paths: [item.filename],
    destination: "D:/Project",
    mode: "move",
    conflict: "rename",
    merge: false,
  });
  await test.event();
  startDownloadFiling(test.request as any);
  await test.event();
  expect(
    test.request.mock.calls.filter(([action]) => action === "FS_TRANSFER"),
  ).toHaveLength(1);
});
it("conserve les fichiers si la règle ou la permission change avant le transfert", async () => {
  for (const revoke of [false, true]) {
    const test = automaticHarness();
    test.request.mockImplementation(async (action: string, payload: any) => {
      if (revoke) test.allowed.mockResolvedValue(false);
      else test.rule.enabled = false;
      return { type: "directory", path: payload.path };
    });
    await test.event();
    expect(test.stored[downloadRunsKey][0]).toMatchObject({
      state: "blocked",
      automatic: true,
    });
    expect(test.request.mock.calls.map(([action]) => action)).not.toContain(
      "FS_TRANSFER",
    );
  }
});
it("signale les conflits de règles et les préconditions bloquées, avec reprise manuelle explicite", async () => {
  const missing = automaticHarness();
  missing.request.mockRejectedValueOnce(
    new Error("GetFileAttributesEx: missing"),
  );
  await missing.event();
  expect(missing.stored[downloadRunsKey][0]).toMatchObject({
    state: "blocked",
    message: expect.stringContaining(
      "Impossible d’accéder au dossier de destination",
    ),
  });
  expect(missing.request.mock.calls.map(([action]) => action)).not.toContain(
    "FS_TRANSFER",
  );
  const test = automaticHarness();
  test.stored[downloadFilingKey].rules.push({
    ...test.rule,
    id: "other",
    destination: "D:/Other",
  });
  await test.event();
  expect(test.stored[downloadRunsKey][0]).toMatchObject({
    state: "blocked",
    message: expect.stringContaining("Plusieurs règles"),
  });
  expect(test.request).not.toHaveBeenCalled();
  test.stored[downloadFilingKey].rules.pop();
  await test.event();
  expect(test.request).not.toHaveBeenCalled();
  await test.file({ download: item, destination: "D:/Project" });
  await vi.waitFor(() =>
    expect(test.stored[downloadRunsKey][0].state).toBe("completed"),
  );
  expect(
    test.request.mock.calls.filter(([action]) => action === "FS_TRANSFER"),
  ).toHaveLength(1);
});
it("ne rejoue pas une mutation dont l’accusé de réception a été perdu", async () => {
  const test = automaticHarness();
  test.request.mockImplementation(async (action: string, payload: any) => {
    if (action === "FS_TRANSFER") throw new Error("Accusé perdu");
    return { type: "directory", path: payload.path };
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await test.event();
    expect(test.stored[downloadRunsKey][0]).toMatchObject({
      state: "uncertain",
      message: "Accusé perdu",
    });
    await test.event();
    await expect(
      test.file({ download: item, destination: "D:/Project" }),
    ).rejects.toThrow("déjà une tentative");
    expect(
      test.request.mock.calls.filter(([action]) => action === "FS_TRANSFER"),
    ).toHaveLength(1);
  } finally {
    log.mockRestore();
  }
});
it("réserve avant le déplacement, suit le nom en collision et ne rejoue jamais le téléchargement", async () => {
  let stored: any[] = [];
  vi.stubGlobal("navigator", {
    locks: { request: (_: string, run: () => unknown) => run() },
  });
  vi.mocked(storageGet).mockImplementation(async () => stored as any);
  vi.mocked(storageUpdate).mockImplementation(
    async (_key, _fallback, update) => {
      stored = update(stored) as any[];
      return stored as any;
    },
  );
  vi.mocked(verifyDownload).mockResolvedValue(item);
  const request = vi.fn(async (action: string, payload: any) => {
    if (action === "FS_STAT")
      return payload.path === "D:/Project"
        ? { type: "directory", path: payload.path }
        : { type: "file", size: 12 };
    if (action === "FS_TRANSFER") {
      expect(stored[0].state).toBe("reserved");
      return { jobId: "job-test" };
    }
    if (action === "JOBS")
      return [
        {
          id: "job-test",
          state: "completed",
          audit: {
            entries: [
              {
                source: item.filename,
                destination: "D:/Project/doc (1).txt",
                status: "moved",
              },
            ],
          },
        },
      ];
    if (action === "FS_WRITE")
      throw new Error("Le fichier de provenance existe déjà");
    return true;
  });
  const file = startDownloadFiling(request as any);
  await expect(
    file({ download: item, destination: "D:/Project" }),
  ).resolves.toEqual({ jobId: "job-test" });
  await vi.waitFor(() => expect(stored[0].state).toBe("completed"));
  expect(stored[0].message).toContain(
    "Fichier rangé, provenance non enregistrée",
  );
  const write = request.mock.calls.find(
    ([action]) => action === "FS_WRITE",
  )![1];
  expect(write.name).toBe("doc (1).txt.source.json");
  expect(JSON.parse(write.text)).toMatchObject({
    file: "doc (1).txt",
    sourceUrl: "https://exemple.fr/page",
  });
  await expect(
    file({ download: item, destination: "D:/Project" }),
  ).rejects.toThrow("déjà une tentative");
  expect(
    request.mock.calls.filter(([action]) => action === "FS_TRANSFER"),
  ).toHaveLength(1);
  expect(storageUpdate).toHaveBeenCalledWith(
    downloadRunsKey,
    [],
    expect.any(Function),
  );
});
it("n’effectue aucune mutation si la réservation ne peut pas être enregistrée", async () => {
  vi.stubGlobal("navigator", {
    locks: { request: (_: string, run: () => unknown) => run() },
  });
  vi.mocked(storageGet).mockResolvedValue([]);
  vi.mocked(storageUpdate).mockRejectedValue(
    new Error("Stockage indisponible"),
  );
  vi.mocked(verifyDownload).mockResolvedValue(item);
  const request = vi.fn(async () => ({
    type: "directory",
    path: "D:/Project",
  }));
  await expect(
    startDownloadFiling(request as any)({
      download: item,
      destination: "D:/Project",
    }),
  ).rejects.toThrow("Stockage indisponible");
  expect(request.mock.calls).toHaveLength(1);
});
