import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerURL from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
export function openPDF(data: Uint8Array) {
  return pdfjs.getDocument({
    data: data.slice(),
    enableXfa: false,
    useWasm: false,
    useSystemFonts: false,
    cMapUrl: new URL("pdfjs/cmaps/", document.baseURI).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("pdfjs/standard_fonts/", document.baseURI)
      .href,
  });
}
