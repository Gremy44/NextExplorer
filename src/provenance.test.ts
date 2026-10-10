import { afterEach, expect, it, vi } from "vitest";
vi.mock("./bridge", () => ({ bridge: { textPrefix: vi.fn() } }));
import { bridge } from "./bridge";
import {
  parseProvenance,
  readProvenance,
  PROVENANCE_LIMIT,
  downloadedProvenance,
} from "./provenance";
import type { Entry } from "./types";
const data = {
  version: 1,
  file: "photo.png",
  title: "Article",
  sourceUrl: "https://example.com/page?secret=x#section",
  imageUrl: "https://example.com/image?token=x",
  collectedAt: "2026-10-04T10:00:00.000Z",
  size: 128,
};
afterEach(() => vi.clearAllMocks());

it("associe la provenance du téléchargement au nom final et épure ses sources", () => {
  const item = {
    filename: "D:/Downloads/rapport.txt",
    referrer: "https://exemple.fr/form?token=secret#suite",
    finalUrl: "https://cdn.exemple.fr/rapport?key=secret",
    url: "https://cdn.exemple.fr/rapport",
    startTime: data.collectedAt,
  } as chrome.downloads.DownloadItem;
  const result = downloadedProvenance(item, "rapport (1).txt", 128);
  expect(result).toMatchObject({
    file: "rapport (1).txt",
    sourceUrl: "https://exemple.fr/form",
    format: "download",
  });
  expect(
    parseProvenance(JSON.stringify(result), "rapport (1).txt"),
  ).toMatchObject({ size: 128 });
  expect(
    downloadedProvenance(
      { ...item, referrer: "javascript:alert(1)" },
      "rapport.txt",
      128,
    ).sourceUrl,
  ).toBe("https://cdn.exemple.fr/rapport");
  expect(() =>
    downloadedProvenance(
      { ...item, referrer: "", finalUrl: "", url: "data:text/plain,a" },
      "rapport.txt",
      128,
    ),
  ).toThrow();
});

it("lit les métadonnées de la bonne capture et épure les adresses", () => {
  expect(parseProvenance(JSON.stringify(data), "photo.png")).toMatchObject({
    sourceUrl: "https://example.com/page",
    imageUrl: "https://example.com/image",
    title: "Article",
  });
});
it("refuse les URL non web et les identifiants intégrés", () => {
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///secret",
    "https://user:pass@example.com/",
  ]) {
    expect(() =>
      parseProvenance(JSON.stringify({ ...data, sourceUrl }), "photo.png"),
    ).toThrow();
  }
});
it("refuse mauvais fichier, version inconnue, date invalide et taille invalide", () => {
  for (const change of [
    { file: "autre.png" },
    { version: 2 },
    { collectedAt: "invalide" },
    { size: -1 },
    { title: null },
  ]) {
    expect(() =>
      parseProvenance(JSON.stringify({ ...data, ...change }), "photo.png"),
    ).toThrow();
  }
  expect(() => parseProvenance("null", "photo.png")).toThrow();
  expect(() => parseProvenance("{", "photo.png")).toThrow();
});
it("borne la lecture et signale une provenance absente ou trop volumineuse", async () => {
  const entry = { path: "D:/photo.png", name: "photo.png" } as Entry;
  vi.mocked(bridge.textPrefix).mockResolvedValueOnce({
    bytes: new TextEncoder().encode(JSON.stringify(data)),
    size: 500,
  });
  await expect(readProvenance(entry)).resolves.toMatchObject({
    title: "Article",
  });
  expect(bridge.textPrefix).toHaveBeenCalledWith(
    "D:/photo.png.source.json",
    PROVENANCE_LIMIT,
    undefined,
  );
  vi.mocked(bridge.textPrefix).mockResolvedValueOnce({
    bytes: new Uint8Array(),
    size: PROVENANCE_LIMIT + 1,
  });
  await expect(readProvenance(entry)).rejects.toThrow("64 Ko");
  vi.mocked(bridge.textPrefix).mockRejectedValueOnce(new Error("missing"));
  await expect(readProvenance(entry)).rejects.toThrow("absent ou inaccessible");
});
