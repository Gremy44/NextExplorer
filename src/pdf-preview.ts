export const PDF_PREVIEW_BYTES = 32 * 1024 * 1024;
export function pdfPreviewScale(width: number, height: number) {
  if (width <= 0 || height <= 0 || !Number.isFinite(width * height))
    throw new Error("Dimensions de page PDF invalides.");
  return Math.min(1600 / width, 2000 / height, 2);
}
