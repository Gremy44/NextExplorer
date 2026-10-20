import { PDFDocument, PDFSignature, degrees } from "pdf-lib";
export const DOCUMENT_FILE_LIMIT = 32 * 1024 * 1024,
  DOCUMENT_TOTAL_LIMIT = 64 * 1024 * 1024,
  DOCUMENT_PAGE_LIMIT = 100;
export type DocumentSource = {
  name: string;
  data: Uint8Array;
  kind: "pdf" | "image";
};
export type DocumentOverlay = {
  page: number;
  data: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};
async function loadPDF(data: Uint8Array) {
  if (
    data.length > DOCUMENT_FILE_LIMIT ||
    !new TextDecoder().decode(data.slice(0, 1024)).includes("%PDF-")
  )
    throw new Error("PDF invalide ou supérieur à 32 Mio");
  const pdf = await PDFDocument.load(data, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  if (pdf.getPageCount() > DOCUMENT_PAGE_LIMIT)
    throw new Error("100 pages maximum par PDF");
  if (
    pdf
      .getForm()
      .getFields()
      .some((field) => field instanceof PDFSignature)
  )
    throw new Error(
      "PDF avec champ de signature : utilisez son application dédiée pour préserver sa signature",
    );
  return pdf;
}
export async function createDocument(
  operation: "combine" | "annotate",
  sources: DocumentSource[],
  overlays: DocumentOverlay[] = [],
) {
  if (operation !== "combine" && operation !== "annotate")
    throw new Error("Opération PDF inconnue");
  if (
    !sources.length ||
    sources.length > 20 ||
    sources.reduce((sum, source) => sum + source.data.length, 0) >
      DOCUMENT_TOTAL_LIMIT
  )
    throw new Error("Sélection limitée à 20 fichiers et 64 Mio au total");
  if (sources.some((source) => source.data.length > DOCUMENT_FILE_LIMIT))
    throw new Error("32 Mio maximum par fichier");
  if (
    operation === "annotate" &&
    (sources.length !== 1 || sources[0].kind !== "pdf")
  )
    throw new Error("Un seul PDF à annoter");
  const result =
    operation === "annotate"
      ? await loadPDF(sources[0].data)
      : await PDFDocument.create();
  if (operation === "combine")
    for (const source of sources) {
      if (source.kind === "pdf") {
        const pdf = await loadPDF(source.data);
        if (result.getPageCount() + pdf.getPageCount() > DOCUMENT_PAGE_LIMIT)
          throw new Error("Le document final est limité à 100 pages");
        for (const page of await result.copyPages(pdf, pdf.getPageIndices()))
          result.addPage(page);
      } else {
        if (result.getPageCount() >= DOCUMENT_PAGE_LIMIT)
          throw new Error("Le document final est limité à 100 pages");
        if (
          source.data.length < 24 ||
          source.data[0] !== 137 ||
          source.data[1] !== 80
        )
          throw new Error("Image PNG requise");
        const view = new DataView(
            source.data.buffer,
            source.data.byteOffset,
            source.data.byteLength,
          ),
          width = view.getUint32(16),
          height = view.getUint32(20);
        if (!width || !height || width * height > 16000000)
          throw new Error("Image limitée à 16 mégapixels");
        const image = await result.embedPng(source.data);
        const page = result.addPage([595.28, 841.89]),
          scale = Math.min(
            (page.getWidth() - 48) / image.width,
            (page.getHeight() - 48) / image.height,
          );
        const w = image.width * scale,
          h = image.height * scale;
        page.drawImage(image, {
          x: (page.getWidth() - w) / 2,
          y: (page.getHeight() - h) / 2,
          width: w,
          height: h,
        });
      }
    }
  if (
    overlays.length > DOCUMENT_PAGE_LIMIT ||
    overlays.reduce((sum, item) => sum + item.data.length, 0) >
      DOCUMENT_TOTAL_LIMIT
  )
    throw new Error("Annotations trop volumineuses");
  for (const overlay of overlays) {
    if (
      !Number.isInteger(overlay.page) ||
      overlay.page < 0 ||
      overlay.page >= result.getPageCount() ||
      ![
        overlay.x,
        overlay.y,
        overlay.width,
        overlay.height,
        overlay.angle,
      ].every(Number.isFinite) ||
      overlay.width <= 0 ||
      overlay.height <= 0 ||
      overlay.data.length > DOCUMENT_FILE_LIMIT
    )
      throw new Error("Annotation invalide");
    const image = await result.embedPng(overlay.data);
    result
      .getPage(overlay.page)
      .drawImage(image, {
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        rotate: degrees(overlay.angle),
      });
  }
  result.setProducer("NextExplorer · traitement local");
  const bytes = await result.save();
  if (bytes.length > DOCUMENT_FILE_LIMIT)
    throw new Error("PDF produit supérieur à 32 Mio : réduisez la sélection");
  return bytes;
}
