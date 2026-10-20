import { describe, expect, it } from "vitest";
import {
  compareImageSamples,
  groupSimilarImages,
  readImageSample,
  SIMILAR_IMAGE_BYTES,
  type ImageSample,
} from "./image-similarity";
import type { Entry } from "./types";

const file = (name: string, size = 4096): Entry => ({
  name,
  path: `C:\\images\\${name}`,
  type: "file",
  size,
  mtime: 1,
  stamp: "1000000000",
  ext: ".png",
});
function sample(entry: Entry, delta = 0): ImageSample {
  const pixels = Array.from({ length: 216 }, (_, i) =>
    Math.min(255, (Math.floor(i / 3) % 9) * 24 + delta),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return { entry, width: 900, height: 800, pixels };
}
describe("visual variants", () => {
  it("finds conservative resizing/reencoding candidates and rejects colors, aspect and flat images", () => {
    const a = sample(file("source.png")),
      b = { ...sample(file("copy.jpg"), 3), width: 450, height: 400 };
    expect(compareImageSamples(a, b).similar).toBe(true);
    expect(compareImageSamples(a, { ...b, width: 400 }).similar).toBe(false);
    expect(
      compareImageSamples(a, sample(file("different.png"), 60)).similar,
    ).toBe(false);
    const flat = { ...a, pixels: "80".repeat(216) };
    expect(compareImageSamples(flat, { ...flat, entry: b.entry }).similar).toBe(
      false,
    );
  });
  it("validates native output and precise source metadata", () => {
    const a = file("a.png");
    expect(readImageSample(sample(a), a).entry).toEqual(a);
    expect(() => readImageSample({ ...sample(a), pixels: "ff" }, a)).toThrow();
    expect(() => readImageSample(sample({ ...a, stamp: "2" }), a)).toThrow(
      /modifiée/,
    );
    expect(() =>
      readImageSample({ ...sample(a), width: 100000, height: 100000 }, a),
    ).toThrow();
  });
  it("keeps failed/large/changed references separate without decoding them", async () => {
    const a = file("a.png"),
      b = file("b.jpg"),
      large = file("large.tiff", SIMILAR_IMAGE_BYTES + 1),
      stale = file("stale.png");
    const calls: string[] = [];
    const result = await groupSimilarImages(
      [
        a,
        b,
        large,
        stale,
        { ...a, path: "C:\\folder", name: "folder", type: "directory" },
      ],
      {
        stat: async (path) => {
          const e = [a, b, large, stale].find((f) => f.path === path)!;
          return path === stale.path ? { ...e, mtime: 2 } : e;
        },
        sample: async (entry) => {
          calls.push(entry.path);
          return sample(entry);
        },
      },
      new AbortController().signal,
      () => {},
    );
    expect(calls).toEqual([a.path, b.path]);
    expect(result.similar).toBe(2);
    expect(result.unexamined).toBe(2);
    expect(result.excluded).toBe(1);
  });
  it("limits analysis to 60 images and ignores late replies after cancellation", async () => {
    const files = Array.from({ length: 65 }, (_, i) => file(`${i}.png`, 1));
    let calls = 0;
    const result = await groupSimilarImages(
      files,
      {
        stat: async (path) => files.find((e) => e.path === path)!,
        sample: async (entry) => {
          calls++;
          return sample(entry);
        },
      },
      new AbortController().signal,
      () => {},
    );
    expect(calls).toBe(60);
    expect(result.unexamined).toBe(5);
    const controller = new AbortController();
    calls = 0;
    await expect(
      groupSimilarImages(
        files,
        {
          stat: async (path) => files.find((e) => e.path === path)!,
          sample: async (entry) => {
            calls++;
            controller.abort();
            return sample(entry);
          },
        },
        controller.signal,
        () => {},
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it("removes an image changed after its sample", async () => {
    const a = file("a.png"),
      b = file("b.png");
    let sampled = false;
    const result = await groupSimilarImages(
      [a, b],
      {
        stat: async (path) => {
          const e = path === a.path ? a : b;
          return sampled && path === a.path ? { ...e, stamp: "2000000000" } : e;
        },
        sample: async (entry) => {
          if (entry.path === b.path) sampled = true;
          return sample(entry);
        },
      },
      new AbortController().signal,
      () => {},
    );
    expect(result.similar).toBe(0);
    expect(result.unexamined).toBe(1);
  });
});
