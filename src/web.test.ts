import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./bridge", () => ({
  bridge: { request: vi.fn(), bytes: vi.fn() },
  storageUpdate: vi.fn(),
}));
import { bridge, storageUpdate } from "./bridge";
import { sendFiles, type UploadTarget } from "./web";
import { UPLOAD_TOTAL_BYTES } from "./uploads";

const page = {
  id: 7,
  windowId: 2,
  url: "https://example.com/form",
  title: "Form",
};
const field = {
  index: 1,
  label: "Attachments",
  accept: ".txt",
  multiple: true,
  disabled: false,
  signature: "field-1",
};
const target: UploadTarget = {
  page,
  documentId: "document-1",
  fields: [field],
  field,
};
const entry = {
  path: "D:/notes.txt",
  name: "notes.txt",
  type: "file",
  size: 3,
  mtime: 1,
  ext: ".txt",
};
const script = vi.fn();
const query = vi.fn();
let history: unknown;
beforeEach(() => {
  history = [];
  vi.mocked(storageUpdate).mockImplementation(
    async (_key, _fallback, update) => {
      history = update(history);
      return history as any;
    },
  );
  query.mockResolvedValue([page]);
  script.mockImplementation(async ({ args }) => [
    {
      documentId: "document-1",
      result:
        args[0] === null
          ? {
              fields: [{ ...field, index: 0, signature: "field-0" }, field],
              focused: 1,
              inserted: false,
            }
          : { inserted: true },
    },
  ]);
  vi.mocked(bridge.request).mockResolvedValue(entry);
  vi.mocked(bridge.bytes).mockResolvedValue(new TextEncoder().encode("abc"));
  vi.stubGlobal("chrome", {
    tabs: { query, get: vi.fn(async () => page) },
    permissions: { request: vi.fn(async () => true) },
    scripting: { executeScript: script },
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("reads current metadata before contents, preserves bytes and supplies the inferred MIME to the locked document", async () => {
  const bytes = new Uint8Array(800001).map((_, i) => i % 256);
  vi.mocked(bridge.request).mockResolvedValue({ ...entry, size: bytes.length });
  vi.mocked(bridge.bytes).mockResolvedValue(bytes);
  await sendFiles([entry.path], target);
  expect(bridge.request).toHaveBeenNthCalledWith(
    1,
    "FS_STAT",
    { path: entry.path },
    5000,
  );
  expect(vi.mocked(bridge.request).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(bridge.bytes).mock.invocationCallOrder[0],
  );
  const insertion = script.mock.calls[1][0];
  expect(insertion.target).toEqual({ tabId: 7, documentIds: ["document-1"] });
  expect(insertion.args[1]).toEqual(field);
  expect(insertion.args[0][0]).toMatchObject({
    name: "notes.txt",
    type: "text/plain",
  });
  expect(
    Uint8Array.from(atob(insertion.args[0][0].data), (c) => c.charCodeAt(0)),
  ).toEqual(bytes);
});
it("refuses incompatible formats before any metadata or content read", async () => {
  await expect(sendFiles(["D:/photo.png"], target)).rejects.toThrow(
    "format non reconnu",
  );
  expect(bridge.request).not.toHaveBeenCalled();
  expect(bridge.bytes).not.toHaveBeenCalled();
  expect(script).toHaveBeenCalledTimes(1);
});
it("refuses aggregate size, unavailable files and symbolic links before reading contents", async () => {
  vi.mocked(bridge.request).mockResolvedValue({
    ...entry,
    size: UPLOAD_TOTAL_BYTES / 2 + 1,
  });
  await expect(sendFiles([entry.path, "D:/other.txt"], target)).rejects.toThrow(
    "20 Mo au total",
  );
  vi.mocked(bridge.request).mockRejectedValueOnce(new Error("Windows error"));
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "fichier inaccessible",
  );
  vi.mocked(bridge.request).mockResolvedValueOnce({
    ...entry,
    type: "symlink",
  });
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "fichier ordinaire",
  );
  expect(bridge.bytes).not.toHaveBeenCalled();
});
it("refuses too many files before inspecting the page", async () => {
  await expect(sendFiles(Array(21).fill(entry.path), target)).rejects.toThrow(
    "20 fichiers",
  );
  expect(script).not.toHaveBeenCalled();
  expect(bridge.request).not.toHaveBeenCalled();
});
it("refuses disabled and single-file fields before any local reads", async () => {
  for (const restricted of [
    { ...field, disabled: true },
    { ...field, multiple: false },
  ]) {
    script.mockResolvedValueOnce([
      { documentId: "document-1", result: { fields: [field, restricted] } },
    ]);
    await expect(
      sendFiles([entry.path, "D:/other.txt"], { ...target, field: restricted }),
    ).rejects.toThrow();
  }
  expect(bridge.request).not.toHaveBeenCalled();
  expect(bridge.bytes).not.toHaveBeenCalled();
});
it("refuses a changed field or document before reading", async () => {
  script.mockResolvedValueOnce([
    {
      documentId: "document-1",
      result: { fields: [field, { ...field, signature: "changed" }] },
    },
  ]);
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "formulaire a changé",
  );
  script.mockResolvedValueOnce([
    { documentId: "document-2", result: { fields: [field, field] } },
  ]);
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "page a changé",
  );
  expect(bridge.bytes).not.toHaveBeenCalled();
});
it("does not insert when the source size or date changes during preparation", async () => {
  vi.mocked(bridge.request)
    .mockResolvedValueOnce(entry)
    .mockResolvedValueOnce({ ...entry, mtime: 2 });
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "fichier a changé",
  );
  expect(script).toHaveBeenCalledTimes(1);
  vi.mocked(bridge.bytes).mockResolvedValueOnce(new Uint8Array(2));
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "fichier a changé",
  );
  expect(script).toHaveBeenCalledTimes(2);
});
it("does not insert when the active page changes after file reads", async () => {
  query
    .mockResolvedValueOnce([page])
    .mockResolvedValueOnce([page])
    .mockResolvedValueOnce([{ ...page, url: page.url + "next" }]);
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "page a changé",
  );
  expect(script).toHaveBeenCalledTimes(1);
});
it("explains a failed native read in French and leaves the field untouched", async () => {
  vi.mocked(bridge.bytes).mockRejectedValueOnce(
    new Error("Windows read error"),
  );
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "notes.txt : lecture impossible",
  );
  expect(script).toHaveBeenCalledTimes(1);
});
it("locks the focused field and document for the full explorer's existing insertion command", async () => {
  await sendFiles([entry.path]);
  expect(script.mock.calls[0][0].target).toEqual({ tabId: 7 });
  expect(script.mock.calls[1][0].target).toEqual({
    tabId: 7,
    documentIds: ["document-1"],
  });
  expect(script.mock.calls[1][0].args[1]).toEqual(field);
});
it("binds prepared copies to their verified paths, sizes and modification dates before reading", async () => {
  for (const expected of [
    [],
    [{ ...entry, path: "D:/other.txt" }],
    [{ ...entry, size: entry.size + 1 }],
    [{ ...entry, mtime: entry.mtime + 1 }],
  ]) {
    await expect(sendFiles([entry.path], target, { expected })).rejects.toThrow(
      "copies ont changé",
    );
  }
  expect(bridge.bytes).not.toHaveBeenCalled();
  await sendFiles([entry.path], target, { expected: [entry] });
  expect(bridge.bytes).toHaveBeenCalledTimes(1);
  expect(
    script.mock.calls.filter(([call]) => call.args[0] !== null),
  ).toHaveLength(1);
});
it("ignores late content replies when the preparation dialog closes", async () => {
  const controller = new AbortController();
  vi.mocked(bridge.bytes).mockImplementationOnce(async () => {
    controller.abort();
    return new TextEncoder().encode("abc");
  });
  await expect(
    sendFiles([entry.path], target, {
      expected: [entry],
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(script).toHaveBeenCalledTimes(1);
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it("stops an already cancelled insertion before granting permissions or inspecting the page", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    sendFiles([entry.path], target, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(chrome.permissions.request).not.toHaveBeenCalled();
  expect(script).not.toHaveBeenCalled();
  expect(bridge.request).not.toHaveBeenCalled();
});
it("reserves a private receipt before page mutation, then confirms only insertion into the field", async () => {
  script.mockImplementationOnce(async () => [
    { documentId: "document-1", result: { fields: [field, field] } },
  ]);
  script.mockImplementationOnce(async () => {
    expect(history).toEqual([
      expect.objectContaining({
        origin: "https://example.com",
        field: "Attachments",
        state: "uncertain",
        files: [{ name: "notes.txt", size: 3 }],
      }),
    ]);
    return [{ result: { inserted: true } }];
  });
  await sendFiles([entry.path], target);
  expect(history).toEqual([expect.objectContaining({ state: "inserted" })]);
  expect(JSON.stringify(history)).not.toContain("D:/");
  expect(JSON.stringify(history)).not.toContain("/form");
});
it("does not attempt insertion if reserving its receipt fails", async () => {
  vi.mocked(storageUpdate).mockRejectedValueOnce(
    new Error("Storage unavailable"),
  );
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "Insertion non lancée",
  );
  expect(script).toHaveBeenCalledTimes(1);
  expect(history).toEqual([]);
});
it("retains uncertainty and never replays an injection with a lost or missing reply", async () => {
  for (const reply of ["lost", "missing"]) {
    history = [];
    script.mockClear();
    script.mockImplementationOnce(async () => [
      { documentId: "document-1", result: { fields: [field, field] } },
    ]);
    script.mockImplementationOnce(async () => {
      if (reply === "lost") throw new Error("Disconnected");
      return [];
    });
    await expect(sendFiles([entry.path], target)).rejects.toThrow(
      "Résultat d’insertion non confirmé",
    );
    expect(history).toEqual([expect.objectContaining({ state: "uncertain" })]);
    expect(script).toHaveBeenCalledTimes(2);
  }
});
it("records a refusal before mutation and keeps uncertainty when confirmation storage fails", async () => {
  script.mockImplementationOnce(async () => [
    { documentId: "document-1", result: { fields: [field, field] } },
  ]);
  script.mockImplementationOnce(async () => [
    { result: { error: "Le formulaire a changé." } },
  ]);
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "formulaire a changé",
  );
  expect(history).toEqual([expect.objectContaining({ state: "not-inserted" })]);
  history = [];
  const save = vi.mocked(storageUpdate).getMockImplementation()!;
  vi.mocked(storageUpdate)
    .mockImplementationOnce(save)
    .mockRejectedValueOnce(new Error("Storage full"));
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "Fichiers insérés dans le champ, mais suivi non confirmé",
  );
  expect(history).toEqual([expect.objectContaining({ state: "uncertain" })]);
});
it("rechecks cancellation after receipt storage, before page mutation", async () => {
  const controller = new AbortController();
  const save = vi.mocked(storageUpdate).getMockImplementation()!;
  vi.mocked(storageUpdate).mockImplementationOnce(async (...args) => {
    const value = await save(...args);
    controller.abort();
    return value;
  });
  await expect(
    sendFiles([entry.path], target, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(script).toHaveBeenCalledTimes(1);
  expect(history).toEqual([expect.objectContaining({ state: "not-inserted" })]);
});
it("refuses a page changed while its receipt was being saved, without page mutation", async () => {
  const save = vi.mocked(storageUpdate).getMockImplementation()!;
  vi.mocked(storageUpdate).mockImplementationOnce(async (...args) => {
    const value = await save(...args);
    query.mockResolvedValue([{ ...page, url: page.url + "next" }]);
    return value;
  });
  await expect(sendFiles([entry.path], target)).rejects.toThrow(
    "page a changé",
  );
  expect(script).toHaveBeenCalledTimes(1);
  expect(history).toEqual([expect.objectContaining({ state: "not-inserted" })]);
});
