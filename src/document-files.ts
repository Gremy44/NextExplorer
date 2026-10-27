import { bridge } from "./bridge";
import { writeChunks } from "./web";
import { sameFamilyFile } from "./file-families";
import type { Entry, Listing } from "./types";
import { quickCopyName } from "./quick-actions";
import type { DocumentSource, DocumentOverlay } from "./document-operations";
export const DOCUMENT_FILE_LIMIT = 32 * 1024 * 1024;
export async function readDocument(entry: Entry, signal: AbortSignal) {
  const before = await bridge.request<Entry>(
    "FS_STAT",
    { path: entry.path },
    5000,
  );
  if (
    before.type !== "file" ||
    before.size <= 0 ||
    before.size > DOCUMENT_FILE_LIMIT ||
    !sameFamilyFile(entry, before) ||
    (entry.stamp && entry.stamp !== before.stamp)
  )
    throw new Error("Fichier modifié, vide ou supérieur à 32 Mio");
  const data = await bridge.bytes(before.path, DOCUMENT_FILE_LIMIT, signal);
  signal.throwIfAborted();
  const after = await bridge.request<Entry>(
    "FS_STAT",
    { path: entry.path },
    5000,
  );
  if (!sameFamilyFile(before, after) || before.stamp !== after.stamp)
    throw new Error("Le fichier a changé pendant sa lecture");
  return { entry: before, data };
}
export async function imageDocument(entry: Entry, signal: AbortSignal) {
  const expected = await bridge.request<Entry>(
    "FS_STAT",
    { path: entry.path },
    5000,
  );
  if (
    !sameFamilyFile(expected, entry) ||
    (entry.stamp && entry.stamp !== expected.stamp)
  )
    throw new Error("Image modifiée : actualisez le dossier");
  await bridge.request(
    "QUICK_IMAGE_INFO",
    { path: entry.path, expected },
    20000,
  );
  signal.throwIfAborted();
  const source = await readDocument(expected, signal);
  const image = await createImageBitmap(new Blob([source.data as BlobPart]));
  try {
    signal.throwIfAborted();
    if (image.width * image.height > 16000000)
      throw new Error("Image limitée à 16 mégapixels");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Image non exportable")),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    if (blob.size > DOCUMENT_FILE_LIMIT)
      throw new Error("Copie PNG supérieure à 32 Mio");
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    image.close();
  }
}
export function documentWorker(
  operation: "combine" | "annotate",
  sources: DocumentSource[],
  overlays: DocumentOverlay[],
  signal: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(
      new URL("./document.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(
      () =>
        finish(new Error("Traitement PDF trop long : réduisez le document")),
      60000,
    );
    const abort = () => finish(new DOMException("Annulé", "AbortError"));
    function finish(error?: Error, bytes?: Uint8Array) {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(bytes!);
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) =>
      finish(new Error(event.message || "Traitement PDF interrompu"));
    worker.onmessage = (event) =>
      event.data.error
        ? finish(new Error(event.data.error))
        : finish(undefined, event.data.bytes);
    worker.postMessage([operation, sources, overlays]);
  });
}
export async function saveDocument(
  destination: string,
  name: string,
  data: Uint8Array,
) {
  if (!data.length || data.length > DOCUMENT_FILE_LIMIT)
    throw new Error("Copie limitée à 32 Mio");
  const existing = await bridge.request<Listing>("FS_LIST_DIR", {
    path: destination,
    filter: name.replace(/\.[^.]+$/, ""),
    showHidden: true,
    limit: 1000,
  });
  if (existing.truncated)
    throw new Error(
      "Trop de noms similaires : choisissez un autre nom de copie.",
    );
  name = quickCopyName(
    name,
    existing.entries.map((entry) => entry.name),
  );
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += 384 * 1024)
    chunks.push(data.slice(offset, offset + 384 * 1024));
  return writeChunks(destination, name, chunks);
}
