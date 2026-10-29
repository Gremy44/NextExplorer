import { bridge } from "./bridge";
import type { Entry } from "./types";

export const IMAGE_PREVIEW_BYTES = 256 * 1024 * 1024;
export function imagePreviewError(entry: Entry) {
  if (entry.ext.toLowerCase() === ".svg")
    return "L’aperçu SVG n’est pas disponible dans cette version. Ouvrez ce fichier dans son application.";
  if (entry.size > IMAGE_PREVIEW_BYTES)
    return "Aperçu limité aux images de 256 Mio maximum. Ouvrez ce fichier dans son application.";
  return "";
}

export async function readImagePreview(
  expected: Entry,
  width: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const error = imagePreviewError(expected);
  if (error) throw new Error(error);
  const session = crypto.randomUUID();
  const cancel = () => {
    void bridge
      .request("IMAGE_PREVIEW_CANCEL", { session }, 3000)
      .catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const result = await bridge.request<{ data: string }>(
      "IMAGE_PREVIEW",
      { path: expected.path, expected, width, session },
      12000,
    );
    signal.throwIfAborted();
    if (!/^[A-Za-z0-9+/]+=*$/.test(result.data) || result.data.length > 956000)
      throw new Error("Aperçu d’image invalide.");
    return `data:image/jpeg;base64,${result.data}`;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
