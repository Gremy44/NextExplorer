import { bridge } from "./bridge";
import type { ImageCapture } from "./collection";
import { grant, writeChunks } from "./web";

export const IMAGE_CAPTURE_LIMIT = 16 * 1024 * 1024;

export function imageFormat(bytes: Uint8Array) {
  const ascii = new TextDecoder("latin1").decode(bytes.slice(0, 32));
  if (bytes[0] === 137 && ascii.slice(1, 8) === "PNG\r\n\x1a\n") return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (/^GIF8[79]a/.test(ascii)) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  if (ascii.startsWith("BM")) return "bmp";
  if (/^(II[\x2a\x2b]\x00|MM\x00[\x2a\x2b])/.test(ascii)) return "tiff";
  if (ascii.slice(4, 8) === "ftyp" && /avif|avis/.test(ascii.slice(8)))
    return "avif";
  throw new Error(
    "Format d’image non pris en charge : PNG, JPEG, GIF, WebP, BMP, AVIF ou TIFF requis.",
  );
}

export async function saveCapturedImage(
  capture: ImageCapture,
  destination: string,
) {
  const url = await grant(capture.imageUrl);
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Image inaccessible (HTTP ${response.status})`);
  if (Number(response.headers.get("content-length")) > IMAGE_CAPTURE_LIMIT) {
    await response.body?.cancel();
    throw new Error("Capture d’image limitée à 16 Mo");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("L’image ne contient aucune donnée accessible");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > IMAGE_CAPTURE_LIMIT)
        throw new Error("Capture d’image limitée à 16 Mo");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = new Blob(chunks);
  const format = imageFormat(
    new Uint8Array(await data.slice(0, 32).arrayBuffer()),
  );
  const name = `Image-${capture.id}.${format}`;
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < data.size; offset += 256 * 1024)
    parts.push(
      new Uint8Array(
        await data.slice(offset, offset + 256 * 1024).arrayBuffer(),
      ),
    );
  const saved = await writeChunks(destination, name, parts);
  const source = new URL(capture.imageUrl);
  source.search = "";
  source.hash = "";
  try {
    await bridge.request("FS_WRITE", {
      path: destination,
      name: `${name}.source.json`,
      text: JSON.stringify(
        {
          version: 1,
          file: name,
          title: capture.title,
          sourceUrl: capture.sourceUrl,
          imageUrl: source.href,
          collectedAt: capture.collectedAt,
          size: total,
        },
        null,
        2,
      ),
    });
  } catch (error) {
    throw new Error(
      `Image enregistrée (${saved.path}), mais provenance non écrite : ${(error as Error).message}. Écartez la capture après vérification.`,
    );
  }
  return saved;
}
