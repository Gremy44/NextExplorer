import { afterEach, describe, expect, it, vi } from "vitest";
import {
  relocationCursorKey,
  synchronizeRelocations,
} from "./organization-background";
import { folderAppearanceKey } from "./folder-appearance";
import { emptyTags, tagsKey } from "./tags";

afterEach(() => vi.unstubAllGlobals());
function storage(cursor?: number) {
  const data: Record<string, any> = {
    [tagsKey]: {
      ...emptyTags(),
      labels: [{ id: "work", name: "Travail", color: "primary" }],
      files: { "c:/a": ["work"] },
    },
    ...(cursor === undefined ? {} : { [relocationCursorKey]: cursor }),
  };
  vi.stubGlobal("navigator", {
    locks: { request: async (_: unknown, callback: () => any) => callback() },
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => structuredClone(data),
        set: async (values: Record<string, unknown>) =>
          Object.assign(data, structuredClone(values)),
      },
    },
  });
  return data;
}
describe("durable tag relocations", () => {
  it("starts a new profile at the current cursor without replaying historical moves", async () => {
    const data = storage();
    await synchronizeRelocations(async () => ({
      events: [],
      cursor: 7,
      lost: false,
      more: false,
    }));
    expect(data[relocationCursorKey]).toBe(7);
    expect(data[tagsKey].files).toEqual({ "c:/a": ["work"] });
  });
  it("applies an unseen batch atomically and does not reapply an acknowledged move", async () => {
    const data = storage(7);
    data[folderAppearanceKey] = { "c:/a": { color: "purple", symbol: "📷" } };
    await synchronizeRelocations(async () => ({
      events: [
        {
          cursor: 8,
          changes: [
            { from: "C:/a", to: "C:/b" },
            { from: "C:/b", to: "C:/a" },
          ],
        },
      ],
      cursor: 8,
      lost: false,
      more: false,
    }));
    expect(data[tagsKey].files).toEqual({ "c:/b": ["work"] });
    expect(data[folderAppearanceKey]).toEqual({
      "c:/b": { color: "purple", symbol: "📷" },
    });
    expect(data[relocationCursorKey]).toBe(8);
    await synchronizeRelocations(async () => ({
      events: [],
      cursor: 8,
      lost: false,
      more: false,
    }));
    expect(data[tagsKey].files).toEqual({ "c:/b": ["work"] });
  });
  it("reports gaps and never guesses a missing path change", async () => {
    const data = storage(1);
    await expect(
      synchronizeRelocations(async () => ({
        events: [],
        cursor: 300,
        lost: true,
        more: false,
      })),
    ).rejects.toThrow(/dépassé/);
    expect(data[tagsKey].files).toEqual({ "c:/a": ["work"] });
    expect(data[relocationCursorKey]).toBe(300);
  });
  it("rejects corrupt or reordered events without advancing the cursor", async () => {
    const data = storage(1);
    await expect(
      synchronizeRelocations(async () => ({
        events: [{ cursor: 3, changes: [{ from: "C:/a", to: "C:/b" }] }],
        cursor: 3,
        lost: false,
        more: false,
      })),
    ).rejects.toThrow();
    expect(data[relocationCursorKey]).toBe(1);
    expect(data[tagsKey].files).toEqual({ "c:/a": ["work"] });
  });
});
