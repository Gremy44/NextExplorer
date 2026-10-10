import type { Entry } from "./types";
import { acceptsFile } from "./uploads";
export type ImageConstraints = {
  format: "jpg" | "png" | "webp";
  width: number;
  quality: number;
  maxBytes: number;
  strip: boolean;
};
export const preparableImage = (entry: Entry) =>
  entry.type === "file" &&
  /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|heic|heif)$/i.test(entry.name);
export function imageFormatsForField(field: {
  accept: string;
  disabled: boolean;
}) {
  return field.disabled
    ? []
    : (["jpg", "png", "webp"] as const).filter((format) =>
        acceptsFile(`copy.${format}`, field.accept),
      );
}
export function imageConstraints(value: ImageConstraints): ImageConstraints {
  if (
    !["jpg", "png", "webp"].includes(value.format) ||
    !Number.isInteger(value.width) ||
    value.width < 16 ||
    value.width > 8000 ||
    !Number.isInteger(value.quality) ||
    value.quality < 1 ||
    value.quality > 100 ||
    !Number.isSafeInteger(value.maxBytes) ||
    value.maxBytes < 1024 ||
    value.maxBytes > 100 * 1024 * 1024
  )
    throw new Error(
      "Choisissez un format, une largeur de 16 à 8 000 px, une qualité de 1 à 100 et un poids de 1 Ko à 100 Mo.",
    );
  return { ...value, strip: value.strip === true };
}
export function checkPreparedImage(
  entry: Entry,
  metadata: unknown,
  constraints: ImageConstraints,
) {
  constraints = imageConstraints(constraints);
  const data = Array.isArray(metadata) ? metadata[0] : null;
  if (
    entry.type !== "file" ||
    !Number.isSafeInteger(entry.size) ||
    entry.size <= 0 ||
    !data ||
    ![data.ImageWidth, data.ImageHeight].every(
      (value) => Number.isInteger(value) && value > 0,
    )
  )
    throw new Error("Format ou dimensions de la copie non vérifiables.");
  const reasons: string[] = [];
  const types = {
    jpg: ["JPEG"],
    png: ["PNG"],
    webp: ["WEBP", "Extended WEBP"],
  };
  if (!types[constraints.format].includes(data.FileType))
    reasons.push("Format différent de celui demandé");
  if (data.ImageWidth > constraints.width)
    reasons.push("Largeur supérieure à la limite");
  if (entry.size > constraints.maxBytes)
    reasons.push(
      "Poids supérieur à la limite ; réduisez la qualité ou la largeur",
    );
  return {
    width: data.ImageWidth as number,
    height: data.ImageHeight as number,
    compatible: reasons.length === 0,
    reasons,
  };
}
