import { mcpIO } from "./mcp-view";
import type { MCPMessage } from "./mcp-background";
import type { Entry } from "./types";
import type { DocumentSource, DocumentOverlay } from "./document-operations";

export function mcpOverlay(value: any): DocumentOverlay {
  if (
    !value ||
    typeof value.data !== "string" ||
    value.data.length > 512 * 1024 ||
    !Number.isInteger(value.page) ||
    value.page < 0 ||
    ![value.x, value.y, value.width, value.height, value.angle].every(
      Number.isFinite,
    ) ||
    value.width <= 0 ||
    value.height <= 0
  )
    throw new Error("Calque PNG base64 et coordonnées valides requis");
  const data = Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0));
  if (
    data.length < 24 ||
    data[0] !== 137 ||
    data[1] !== 80 ||
    data[2] !== 78 ||
    data[3] !== 71
  )
    throw new Error("Calque PNG requis");
  const view = new DataView(data.buffer),
    width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width * height > 16000000)
    throw new Error("Calque limité à 16 mégapixels");
  return {
    page: value.page,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    angle: value.angle,
    data,
  };
}
export async function mcpDocument(message: MCPMessage) {
  const a = message.arguments,
    operation = a.operation || "",
    image = operation === "annotate-image";
  if (
    !a.path ||
    !a.name?.toLowerCase().endsWith(image ? ".png" : ".pdf") ||
    !a.paths?.length ||
    a.paths.length > 20 ||
    !["combine", "annotate", "annotate-image"].includes(operation)
  )
    throw new Error(
      "combine/annotate : nom .pdf ; annotate-image : nom .png. paths (1 à 20) et dossier path requis.",
    );
  if (operation !== "combine" && a.paths.length !== 1)
    throw new Error("Un seul original à annoter");
  const raw = a.value?.overlays || [];
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error("100 calques maximum");
  const overlays = raw.map(mcpOverlay);
  if (image && overlays.some((o) => o.page !== 0))
    throw new Error("Une image comporte une seule page (index 0)");
  const controller = new AbortController(),
    timer = setTimeout(
      () => controller.abort(),
      Math.max(1, message.deadline - Date.now() - 500),
    );
  try {
    const { readDocument, imageDocument, documentWorker, saveDocument } =
      await import("./document-files");
    const io = mcpIO(message),
      entries = await Promise.all(
        a.paths.map((path) => io.request<Entry>("FS_STAT", { path })),
      ),
      sources: DocumentSource[] = [];
    let total = 0;
    for (const entry of entries) {
      const pdf = entry.ext === ".pdf";
      if ((operation === "annotate" && !pdf) || (image && pdf))
        throw new Error("Type d'original incompatible avec cette annotation");
      const loaded = pdf
        ? await readDocument(entry, controller.signal, io)
        : await imageDocument(entry, controller.signal, io);
      total += loaded.data.length;
      if (total > 64 * 1024 * 1024) throw new Error("64 Mio maximum");
      sources.push({
        name: entry.name,
        kind: pdf ? "pdf" : "image",
        data: loaded.data,
      });
    }
    let output: Uint8Array;
    if (image) {
      const bitmap = await createImageBitmap(
        new Blob([sources[0].data as BlobPart]),
      );
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponible");
        ctx.drawImage(bitmap, 0, 0);
        for (const overlay of overlays) {
          controller.signal.throwIfAborted();
          const layer = await createImageBitmap(
            new Blob([overlay.data as BlobPart]),
          );
          try {
            ctx.save();
            ctx.translate(overlay.x, overlay.y);
            ctx.rotate((overlay.angle * Math.PI) / 180);
            ctx.drawImage(layer, 0, 0, overlay.width, overlay.height);
            ctx.restore();
          } finally {
            layer.close();
          }
        }
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (v) => (v ? resolve(v) : reject(new Error("Image non exportable"))),
            "image/png",
          ),
        );
        output = new Uint8Array(await blob.arrayBuffer());
      } finally {
        bitmap.close();
      }
    } else
      output = await documentWorker(
        operation as "combine" | "annotate",
        sources,
        overlays,
        controller.signal,
      );
    for (const entry of entries) {
      const current = await io.request<Entry>("FS_STAT", { path: entry.path });
      if (current.stamp !== entry.stamp || current.size !== entry.size)
        throw new Error("Original modifié ; copie non enregistrée");
    }
    controller.signal.throwIfAborted();
    return saveDocument(a.path, a.name, output, io.request);
  } finally {
    clearTimeout(timer);
  }
}
