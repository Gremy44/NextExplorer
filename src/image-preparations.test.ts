import { beforeEach, expect, it, vi } from "vitest";
let stored: unknown;
vi.mock("./web", () => ({ sendFiles: vi.fn() }));
vi.mock("./bridge", () => ({
  bridge: { request: vi.fn() },
  storageUpdate: vi.fn(
    async (
      _key: string,
      _fallback: unknown,
      update: (value: unknown) => unknown,
    ) => {
      stored = update(stored);
      return stored;
    },
  ),
}));
import { bridge, storageUpdate } from "./bridge";
import {
  readImagePreparation,
  insertImagePreparation,
  restoreImagePreparations,
  startImagePreparation,
  type ImagePreparation,
} from "./image-preparations";
import { sendFiles, type UploadTarget } from "./web";
import type { Entry } from "./types";

const constraints = {
  format: "jpg" as const,
  width: 64,
  quality: 85,
  maxBytes: 1024 * 1024,
  strip: true,
};
const preparation: ImagePreparation = {
  version: 1,
  id: "receipt-1",
  date: "2026-10-09T12:00:00Z",
  destination: "D:/Prepared",
  count: 1,
  constraints,
  jobId: "job-1",
};
const copy = {
  name: "photo.jpg",
  path: "D:/Prepared/photo.jpg",
  type: "file",
  size: 123,
  mtime: 1,
  ext: ".jpg",
};
const source: Entry = {
  name: "photo.png",
  path: "D:/photo.png",
  type: "file",
  size: 456,
  mtime: 1,
  ext: ".png",
};
it("conserve les sources fournies et les premières copies vérifiées sans inventer de paires", async () => {
  const started = await startImagePreparation(
    [source.path],
    preparation.destination,
    constraints,
    [source],
  );
  expect(started.sources).toEqual([source]);
  expect(started.copies).toBeUndefined();
  stored = [{ ...preparation, sources: [source] }];
  await readImagePreparation({ ...preparation, sources: [source] }, signal());
  expect(restoreImagePreparations(stored)[0].copies).toEqual([copy]);
  const known = restoreImagePreparations(stored)[0];
  vi.mocked(storageUpdate).mockClear();
  await readImagePreparation(known, signal());
  expect(storageUpdate).not.toHaveBeenCalled();
});
it("refuse les sources incohérentes et les liens corrompus avant tout lancement", async () => {
  await expect(
    startImagePreparation(
      ["D:/other.png"],
      preparation.destination,
      constraints,
      [source],
    ),
  ).rejects.toThrow("Sources différentes");
  expect(bridge.request).not.toHaveBeenCalled();
  for (const extra of [
    { sources: [] },
    { copies: [copy] },
    {
      sources: [source],
      paths: [copy.path],
      copies: [{ ...copy, path: "D:/Outside/photo.jpg" }],
    },
    { sources: [{ ...source, size: -1 }] },
    { sources: [{ ...source, type: "symlink" }] },
  ])
    expect(() =>
      restoreImagePreparations([{ ...preparation, ...extra }]),
    ).toThrow();
});
const signal = () => new AbortController().signal;
const target: UploadTarget = {
  page: { id: 7, windowId: 2, url: "https://example.com/form", title: "Form" },
  documentId: "document-1",
  fields: [],
  field: {
    index: 1,
    label: "Photo",
    accept: "image/jpeg",
    multiple: false,
    disabled: false,
    signature: "field-1",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  stored = [preparation];
  vi.mocked(bridge.request).mockImplementation(async (action) => {
    if (action === "CONVERT") return { jobId: "job-2" };
    if (action === "JOBS")
      return [{ id: "job-1", kind: "convert", state: "completed" }];
    if (action === "JOB_RESULT") return [copy.path];
    if (action === "FS_STAT") return copy;
    if (action === "METADATA")
      return [{ FileType: "JPEG", ImageWidth: 64, ImageHeight: 32 }];
    throw new Error("Unexpected request");
  });
});
it("rechecks real copy constraints before an explicit insertion into the locked target, without conversion or collection", async () => {
  const cancellation = signal();
  await insertImagePreparation(
    { ...preparation, paths: [copy.path] },
    target,
    cancellation,
  );
  expect(bridge.request).toHaveBeenCalledTimes(3);
  expect(sendFiles).toHaveBeenCalledWith([copy.path], target, {
    expected: [copy],
    signal: cancellation,
  });
  expect(storageUpdate).not.toHaveBeenCalled();
});
it("refuses changed image dimensions, excessive weight or an incompatible field before transmission", async () => {
  vi.mocked(bridge.request).mockImplementation(async (action) => {
    if (action === "FS_STAT") return copy;
    if (action === "METADATA")
      return [{ FileType: "JPEG", ImageWidth: 65, ImageHeight: 32 }];
    throw new Error("Unexpected request");
  });
  await expect(
    insertImagePreparation(
      { ...preparation, paths: [copy.path] },
      target,
      signal(),
    ),
  ).rejects.toThrow("compatibles");
  vi.mocked(bridge.request).mockImplementation(async (action) => {
    if (action === "FS_STAT")
      return { ...copy, size: constraints.maxBytes + 1 };
    if (action === "METADATA")
      return [{ FileType: "JPEG", ImageWidth: 64, ImageHeight: 32 }];
    throw new Error("Unexpected request");
  });
  await expect(
    insertImagePreparation(
      { ...preparation, paths: [copy.path] },
      target,
      signal(),
    ),
  ).rejects.toThrow("compatibles");
  vi.mocked(bridge.request).mockImplementation(async (action) =>
    action === "FS_STAT"
      ? copy
      : [{ FileType: "JPEG", ImageWidth: 64, ImageHeight: 32 }],
  );
  await expect(
    insertImagePreparation(
      { ...preparation, paths: [copy.path] },
      { ...target, field: { ...target.field, accept: "image/png" } },
      signal(),
    ),
  ).rejects.toThrow("format non reconnu");
  expect(sendFiles).not.toHaveBeenCalled();
});
it("refuses an unfinished preparation without a new conversion or upload", async () => {
  vi.mocked(bridge.request).mockResolvedValueOnce([
    { id: "job-1", kind: "convert", state: "running" },
  ]);
  await expect(
    insertImagePreparation(preparation, target, signal()),
  ).rejects.toThrow("prêtes");
  expect(sendFiles).not.toHaveBeenCalled();
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it("reserves persistent tracking before launching and records the returned job without file contents or page URLs", async () => {
  const result = await startImagePreparation(
    ["D:/photo.png"],
    preparation.destination,
    constraints,
  );
  expect(vi.mocked(storageUpdate).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(bridge.request).mock.invocationCallOrder[0],
  );
  expect(result).toMatchObject({
    count: 1,
    destination: preparation.destination,
    constraints,
    jobId: "job-2",
  });
  expect(restoreImagePreparations(stored)).toHaveLength(2);
  expect(bridge.request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(stored)).not.toContain("photo.png");
});
it("refuses full or invalid storage before any conversion", async () => {
  stored = Array.from({ length: 20 }, (_, i) => ({
    ...preparation,
    id: `receipt-${i}`,
  }));
  await expect(
    startImagePreparation(
      ["D:/photo.png"],
      preparation.destination,
      constraints,
    ),
  ).rejects.toThrow("20 préparations");
  stored = "corrupt";
  await expect(
    startImagePreparation(
      ["D:/photo.png"],
      preparation.destination,
      constraints,
    ),
  ).rejects.toThrow("invalide");
  expect(bridge.request).not.toHaveBeenCalled();
});
it("preserves an uncertain launch and cannot resume it by starting another conversion", async () => {
  vi.mocked(bridge.request).mockRejectedValueOnce(new Error("Connection lost"));
  await expect(
    startImagePreparation(
      ["D:/photo.png"],
      preparation.destination,
      constraints,
    ),
  ).rejects.toThrow("Lancement non confirmé");
  const [reserved] = restoreImagePreparations(stored);
  expect(reserved.jobId).toBeUndefined();
  await expect(readImagePreparation(reserved, signal())).rejects.toThrow(
    "aucune relance",
  );
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it("does not recreate a tracking entry removed in another view during launch", async () => {
  vi.mocked(bridge.request).mockImplementationOnce(async () => {
    stored = [preparation];
    return { jobId: "job-2" };
  });
  await expect(
    startImagePreparation(
      ["D:/photo.png"],
      preparation.destination,
      constraints,
    ),
  ).rejects.toThrow("Conversion lancée, mais suivi non enregistré");
  expect(stored).toEqual([preparation]);
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it("recovers a completed job, persists its paths and verifies existing copies without conversion", async () => {
  expect(await readImagePreparation(preparation, signal())).toMatchObject([
    { entry: copy, check: { compatible: true, width: 64 } },
  ]);
  expect(restoreImagePreparations(stored)[0].paths).toEqual([copy.path]);
  expect(vi.mocked(bridge.request).mock.calls.map((call) => call[0])).toEqual([
    "JOBS",
    "JOB_RESULT",
    "FS_STAT",
    "METADATA",
    "FS_STAT",
  ]);
});
it("verifies recorded paths after a companion restart without needing the old job", async () => {
  const recorded = { ...preparation, paths: [copy.path] };
  expect(await readImagePreparation(recorded, signal())).toHaveLength(1);
  expect(vi.mocked(bridge.request).mock.calls.map((call) => call[0])).toEqual([
    "FS_STAT",
    "METADATA",
    "FS_STAT",
  ]);
  expect(storageUpdate).not.toHaveBeenCalled();
});
it("distinguishes a running job from missing, failed or stopped tasks without retry", async () => {
  vi.mocked(bridge.request).mockResolvedValueOnce([
    { id: "job-1", kind: "convert", state: "running" },
  ]);
  expect(await readImagePreparation(preparation, signal())).toBeNull();
  vi.mocked(bridge.request).mockResolvedValueOnce([]);
  await expect(readImagePreparation(preparation, signal())).rejects.toThrow(
    "ne connaît plus",
  );
  vi.mocked(bridge.request).mockResolvedValueOnce([
    { id: "job-1", kind: "convert", state: "cancelled" },
  ]);
  await expect(readImagePreparation(preparation, signal())).rejects.toThrow(
    "copies partielles",
  );
  expect(bridge.request).toHaveBeenCalledTimes(3);
  expect(stored).toEqual([preparation]);
});
it("refuses incomplete results and paths outside the chosen folder before checking files", async () => {
  for (const paths of [
    [],
    ["D:/Other/photo.jpg"],
    ["D:/Prepared/../secret.jpg"],
  ]) {
    vi.mocked(bridge.request)
      .mockResolvedValueOnce([
        { id: "job-1", kind: "convert", state: "completed" },
      ])
      .mockResolvedValueOnce(paths);
    await expect(readImagePreparation(preparation, signal())).rejects.toThrow();
  }
  expect(
    vi
      .mocked(bridge.request)
      .mock.calls.every((call) => ["JOBS", "JOB_RESULT"].includes(call[0])),
  ).toBe(true);
});
it("refuses corrupt records and bounds counts, constraints and stored paths", () => {
  for (const value of [
    [{ ...preparation, count: 21 }],
    [{ ...preparation, constraints: null }],
    [{ ...preparation, paths: ["https://example.com/photo.jpg"] }],
    [preparation, preparation],
  ])
    expect(() => restoreImagePreparations(value)).toThrow();
  expect(
    restoreImagePreparations([
      {
        ...preparation,
        destination: "D:\\Prepared",
        paths: ["d:/prepared/photo.jpg"],
      },
    ]),
  ).toHaveLength(1);
});
it("rejects a removed tracking entry without recreating it or reading file metadata", async () => {
  stored = [];
  await expect(readImagePreparation(preparation, signal())).rejects.toThrow(
    "retirée du suivi",
  );
  expect(stored).toEqual([]);
  expect(bridge.request).toHaveBeenCalledTimes(2);
});
it("rechecks changed or missing copies and retains incompatible format or size as disabled results", async () => {
  const recorded = { ...preparation, paths: [copy.path] };
  vi.mocked(bridge.request)
    .mockResolvedValueOnce(copy)
    .mockResolvedValueOnce([
      { FileType: "PNG", ImageWidth: 65, ImageHeight: 32 },
    ])
    .mockResolvedValueOnce(copy);
  expect(await readImagePreparation(recorded, signal())).toMatchObject([
    { check: { compatible: false, reasons: expect.any(Array) } },
  ]);
  vi.mocked(bridge.request)
    .mockResolvedValueOnce({ ...copy, size: constraints.maxBytes + 1 })
    .mockResolvedValueOnce([
      { FileType: "JPEG", ImageWidth: 64, ImageHeight: 32 },
    ])
    .mockResolvedValueOnce({ ...copy, size: constraints.maxBytes + 1 });
  expect(await readImagePreparation(recorded, signal())).toMatchObject([
    {
      check: {
        compatible: false,
        reasons: [expect.stringContaining("Poids supérieur")],
      },
    },
  ]);
  vi.mocked(bridge.request)
    .mockResolvedValueOnce(copy)
    .mockResolvedValueOnce([
      { FileType: "JPEG", ImageWidth: 64, ImageHeight: 32 },
    ])
    .mockResolvedValueOnce({ ...copy, mtime: 2 });
  await expect(readImagePreparation(recorded, signal())).rejects.toThrow(
    "modifiée",
  );
  vi.mocked(bridge.request).mockRejectedValueOnce(new Error("Missing"));
  await expect(readImagePreparation(recorded, signal())).rejects.toThrow(
    "inaccessible",
  );
});
it("stops checking subsequent metadata after the dialog closes", async () => {
  const controller = new AbortController();
  vi.mocked(bridge.request).mockImplementationOnce(async () => {
    controller.abort();
    return copy;
  });
  await expect(
    readImagePreparation(
      { ...preparation, paths: [copy.path] },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
