import { beforeEach, expect, it, vi } from "vitest";
let stored: unknown;
vi.mock("./bridge", () => ({
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
import {
  finishInsertion,
  INSERTION_LIMIT,
  reserveInsertion,
  restoreInsertions,
} from "./insertions";
import { UPLOAD_TOTAL_BYTES } from "./uploads";
const sample = {
  version: 1,
  id: "one",
  date: "2026-10-10T10:00:00Z",
  origin: "https://example.com",
  field: "Pièces jointes",
  files: [{ name: "cv.pdf", size: 12 }],
  state: "uncertain",
};
beforeEach(() => {
  stored = [];
  vi.clearAllMocks();
});

it("keeps only bounded receipt metadata, without paths, contents or a replay target", () => {
  const raw = {
    ...sample,
    path: "D:/private",
    data: "secret",
    tabId: 7,
    documentId: "old",
    url: "https://example.com/token?secret=1",
    files: [
      {
        ...sample.files[0],
        path: "D:/secret/cv.pdf",
        data: "secret",
        mtime: 1,
      },
    ],
  };
  expect(restoreInsertions([raw])).toEqual([sample]);
  expect(raw.files[0].data).toBe("secret");
  expect(restoreInsertions([])).toEqual([]);
});
it("refuses corrupt storage, duplicate identities, non-origin URLs and invalid file metadata", () => {
  for (const value of [
    null,
    {},
    [null],
    [{ ...sample, version: 99 }],
    [sample, sample],
    [{ ...sample, id: "" }],
    [{ ...sample, date: "not a date" }],
    [{ ...sample, state: "received" }],
    ...[
      "javascript:alert(1)",
      "https://example.com/path",
      "https://user:pass@example.com",
      "https://example.com?secret=1",
      "https://example.com/",
    ].map((origin) => [{ ...sample, origin }]),
    ...["", "x".repeat(161), "bad\nlabel"].map((field) => [
      { ...sample, field },
    ]),
    [{ ...sample, files: [] }],
    [{ ...sample, files: Array(21).fill(sample.files[0]) }],
    ...["../cv.pdf", "D:\\cv.pdf", "bad\0name", "x".repeat(256)].map((name) => [
      { ...sample, files: [{ name, size: 1 }] },
    ]),
    ...[-1, Infinity, 0.5, "12", UPLOAD_TOTAL_BYTES + 1].map((size) => [
      { ...sample, files: [{ name: "cv.pdf", size }] },
    ]),
    [
      {
        ...sample,
        files: [
          { name: "a.txt", size: UPLOAD_TOTAL_BYTES },
          { name: "b.txt", size: 1 },
        ],
      },
    ],
    Array(21).fill(sample),
  ])
    expect(() => restoreInsertions(value)).toThrow(
      "Suivi des insertions illisible",
    );
});
it("reserves uncertainty with an origin only, normalizes the label and retains the latest 20 attempts", async () => {
  stored = Array.from({ length: INSERTION_LIMIT }, (_, i) => ({
    ...sample,
    id: String(i),
  }));
  const record = await reserveInsertion(
    "https://user:pass@example.com/application?secret=1#private",
    " Pièces\n jointes ",
    [{ name: "cv.pdf", size: 12 }],
  );
  expect(record).toMatchObject({
    origin: "https://example.com",
    field: "Pièces  jointes",
    state: "uncertain",
  });
  expect(restoreInsertions(stored)).toHaveLength(20);
  expect(restoreInsertions(stored)[0]).toEqual(record);
  expect(restoreInsertions(stored).at(-1)?.id).toBe("18");
});
it("settles only its own latest receipt and never recreates a removed receipt", async () => {
  const first = await reserveInsertion(
    sample.origin,
    sample.field,
    sample.files,
  );
  const second = await reserveInsertion(
    sample.origin,
    sample.field,
    sample.files,
  );
  await finishInsertion(first.id, "inserted");
  expect(restoreInsertions(stored)).toEqual([
    second,
    { ...first, state: "inserted" },
  ]);
  stored = restoreInsertions(stored).filter((record) => record.id !== first.id);
  await finishInsertion(first.id, "inserted");
  expect(stored).toEqual([second]);
  await finishInsertion(second.id, "not-inserted");
  expect(restoreInsertions(stored)[0].state).toBe("not-inserted");
});
it("does not overwrite unreadable storage when reserving or settling an insertion", async () => {
  stored = [sample, { ...sample, id: "bad", files: null }];
  const previous = structuredClone(stored);
  await expect(
    reserveInsertion(sample.origin, sample.field, sample.files),
  ).rejects.toThrow("illisible");
  await expect(finishInsertion(sample.id, "inserted")).rejects.toThrow(
    "illisible",
  );
  expect(stored).toEqual(previous);
});
