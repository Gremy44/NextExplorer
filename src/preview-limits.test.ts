import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "./bridge";
import {
  IMAGE_PREVIEW_BYTES,
  imagePreviewError,
  readImagePreview,
} from "./image-preview";
import { pdfPreviewScale } from "./pdf-preview";
import { mediaType, type Entry } from "./types";
import { nativeThumbnail } from "./native-thumbnail";

const entry: Entry = {
  path: "C:/Tests/photo.tiff",
  name: "photo.tiff",
  ext: ".tiff",
  type: "file",
  size: 1024,
  mtime: 1,
  stamp: "1000000000",
};
afterEach(() => vi.restoreAllMocks());
describe("aperçus bornés et arrêt", () => {
  it("retire les miniatures annulées de la file sans bloquer les suivantes", async () => {
    const pending: ((value: Entry) => void)[] = [];
    const request = vi
      .spyOn(bridge, "request")
      .mockImplementation(
        () => new Promise((resolve) => pending.push(resolve)),
      );
    const controllers = Array.from({ length: 42 }, () => new AbortController());
    const results = controllers.map((controller) =>
      nativeThumbnail(entry, controller.signal).then(
        () => null,
        (error) => error,
      ),
    );
    controllers.forEach((controller) => controller.abort());
    const next = new AbortController();
    const result = nativeThumbnail(entry, next.signal).then(
      () => null,
      (error) => error,
    );
    next.abort();
    pending.forEach((resolve) => resolve(entry));
    expect((await result).name).toBe("AbortError");
    expect(
      (await Promise.all(results)).every(
        (error) => error.name === "AbortError",
      ),
    ).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("raccorde les formats pris en charge et refuse SVG ou image trop grande avant décodage", () => {
    for (const ext of [".heic", ".heif", ".tif", ".avif"])
      expect(mediaType({ ...entry, ext })).toBe("image");
    expect(mediaType({ ...entry, ext: ".m4v" })).toBe("video");
    expect(imagePreviewError({ ...entry, ext: ".svg" })).toMatch(/SVG/);
    expect(
      imagePreviewError({ ...entry, size: IMAGE_PREVIEW_BYTES + 1 }),
    ).toMatch(/256 Mio/);
  });
  it("calcule une page PDF de 3,2 mégapixels maximum et refuse les dimensions invalides", () => {
    for (const [width, height] of [
      [100, 100],
      [595, 842],
      [20000, 40000],
      [40000, 20000],
    ]) {
      const scale = pdfPreviewScale(width, height);
      expect(
        Math.ceil(width * scale) * Math.ceil(height * scale),
      ).toBeLessThanOrEqual(3_200_000);
    }
    for (const [width, height] of [
      [0, 10],
      [-1, 10],
      [Infinity, 2],
      [NaN, 2],
    ])
      expect(() => pdfPreviewScale(width, height)).toThrow();
  });
  it("annule le décodage natif et ignore un résultat arrivé après l’arrêt", async () => {
    let finish!: (value: { data: string }) => void;
    const request = vi.spyOn(bridge, "request").mockImplementation((action) =>
      action === "IMAGE_PREVIEW"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(true),
    );
    const controller = new AbortController();
    const preview = readImagePreview(entry, 640, controller.signal);
    controller.abort();
    finish({ data: "/9j/2Q==" });
    await expect(preview).rejects.toMatchObject({ name: "AbortError" });
    const session = (request.mock.calls[0][1] as { session: string }).session;
    expect(request).toHaveBeenCalledWith(
      "IMAGE_PREVIEW_CANCEL",
      { session },
      3000,
    );
  });
  it("contrôle la sortie et ne décode pas une source hors limite", async () => {
    const request = vi
      .spyOn(bridge, "request")
      .mockResolvedValue({ data: "invalid !" });
    await expect(
      readImagePreview(entry, 640, new AbortController().signal),
    ).rejects.toThrow(/invalide/);
    request.mockClear();
    await expect(
      readImagePreview(
        { ...entry, size: IMAGE_PREVIEW_BYTES + 1 },
        640,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/256 Mio/);
    expect(request).not.toHaveBeenCalled();
  });
  it("lit par lots, publie les octets réellement lus et détecte un changement de taille", async () => {
    const request = vi
      .spyOn(bridge, "request")
      .mockResolvedValueOnce({
        data: btoa("abc"),
        size: 6,
        nextOffset: 3,
        eof: false,
      })
      .mockResolvedValueOnce({
        data: btoa("def"),
        size: 6,
        nextOffset: 6,
        eof: true,
      });
    const progress = vi.fn();
    expect(
      new TextDecoder().decode(
        await bridge.bytes(entry.path, 10, undefined, progress),
      ),
    ).toBe("abcdef");
    expect(progress.mock.calls).toEqual([
      [3, 6],
      [6, 6],
    ]);
    request
      .mockResolvedValueOnce({
        data: btoa("abc"),
        size: 6,
        nextOffset: 3,
        eof: false,
      })
      .mockResolvedValueOnce({
        data: btoa("def"),
        size: 7,
        nextOffset: 6,
        eof: false,
      });
    await expect(bridge.bytes(entry.path, 10)).rejects.toThrow(/changé/);
  });
  it("refuse les plages incohérentes et ne poursuit pas une lecture arrêtée", async () => {
    const request = vi.spyOn(bridge, "request").mockResolvedValue({
      data: btoa("abc"),
      size: 6,
      nextOffset: 6,
      eof: true,
    });
    await expect(bridge.bytes(entry.path, 10)).rejects.toThrow(/interrompue/);
    const controller = new AbortController();
    request.mockResolvedValue({
      data: btoa("abc"),
      size: 6,
      nextOffset: 3,
      eof: false,
    });
    request.mockClear();
    await expect(
      bridge.bytes(entry.path, 10, controller.signal, () => controller.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
