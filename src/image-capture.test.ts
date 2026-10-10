import { afterEach, expect, it, vi } from "vitest";
vi.mock("./web", () => ({
  grant: vi.fn(async (url) => url),
  writeChunks: vi.fn(async () => ({ path: "D:/Images/photo.png" })),
}));
vi.mock("./bridge", () => ({ bridge: { request: vi.fn(async () => ({})) } }));
import { bridge } from "./bridge";
import { writeChunks } from "./web";
import { imageCapture } from "./collection";
import {
  imageFormat,
  saveCapturedImage,
  IMAGE_CAPTURE_LIMIT,
} from "./image-capture";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("valide la capture et identifie le format réel", () => {
  expect(imageFormat(png)).toBe("png");
  expect(imageFormat(new Uint8Array([73, 73, 42, 0]))).toBe("tiff");
  expect(() => imageFormat(new TextEncoder().encode("<svg/>"))).toThrow();
  for (const srcUrl of [
    "blob:https://example.com/id",
    "data:image/png;base64,a",
    "https://user:password@example.com/a",
  ]) {
    expect(() =>
      imageCapture({ srcUrl, pageUrl: "https://example.com" }),
    ).toThrow();
  }
});
it("enregistre les octets et une provenance sans paramètres", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(png)),
  );
  const capture = imageCapture({
    srcUrl: "https://example.com/photo?token=secret#x",
    pageUrl: "https://example.com/article?secret=x",
  });
  await saveCapturedImage(capture, "D:/Images");
  expect(writeChunks).toHaveBeenCalledWith(
    "D:/Images",
    `Image-${capture.id}.png`,
    [png],
  );
  const payload = vi.mocked(bridge.request).mock.calls[0][1] as {
    text: string;
  };
  expect(JSON.parse(payload.text)).toMatchObject({
    imageUrl: "https://example.com/photo",
    sourceUrl: "https://example.com/article",
    size: 8,
  });
  expect(fetch).toHaveBeenCalledWith(
    capture.imageUrl,
    expect.objectContaining({ credentials: "omit", redirect: "error" }),
  );
});
it("refuse un téléchargement trop gros, annoncé ou réellement reçu, avant écriture", async () => {
  const capture = imageCapture({
    srcUrl: "https://example.com/photo",
    pageUrl: "https://example.com",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(png, {
          headers: { "content-length": String(IMAGE_CAPTURE_LIMIT + 1) },
        }),
    ),
  );
  await expect(saveCapturedImage(capture, "D:/Images")).rejects.toThrow(
    "16 Mo",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(IMAGE_CAPTURE_LIMIT + 1))),
  );
  await expect(saveCapturedImage(capture, "D:/Images")).rejects.toThrow(
    "16 Mo",
  );
  expect(writeChunks).not.toHaveBeenCalled();
  expect(bridge.request).not.toHaveBeenCalled();
});
it("refuse une page HTML déguisée en image", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<html>Erreur</html>")),
  );
  await expect(
    saveCapturedImage(
      imageCapture({
        srcUrl: "https://example.com/photo.png",
        pageUrl: "https://example.com",
      }),
      "D:/Images",
    ),
  ).rejects.toThrow("Format");
  expect(writeChunks).not.toHaveBeenCalled();
});
