import type { Entry } from "./types";

export type MediaKind = "image" | "video";
export const CONVERSION_LIMIT = 200;
export const imageFormats = [
  "webp",
  "jpg",
  "png",
  "avif",
  "tiff",
  "bmp",
  "gif",
];
export const videoFormats = ["mp4", "webm", "mkv", "mov"];
export const formatLabels: Record<string, string> = {
  webp: "WebP · léger pour le web",
  jpg: "JPEG · photos et compatibilité",
  png: "PNG · transparence, sans perte",
  avif: "AVIF · forte compression",
  tiff: "TIFF · image sans perte",
  bmp: "BMP · bitmap sans compression",
  gif: "GIF · image fixe, 256 couleurs",
  mp4: "MP4 · lecture courante",
  webm: "WebM · diffusion sur le web",
  mkv: "MKV · conteneur polyvalent",
  mov: "MOV · conteneur QuickTime",
};
export const videoCodecs: Record<string, string[]> = {
  mp4: ["libx264", "libx265", "libsvtav1"],
  webm: ["libvpx-vp9", "libsvtav1"],
  mkv: ["libx264", "libx265", "libvpx-vp9", "libsvtav1"],
  mov: ["libx264", "libx265"],
};
export const codecLabels: Record<string, string> = {
  libx264: "H.264 · grande compatibilité",
  libx265: "H.265 / HEVC · plus compact",
  "libvpx-vp9": "VP9 · adapté au WebM",
  libsvtav1: "AV1 · compact, plus lent",
};
export function conversionKind(
  entry: Pick<Entry, "type" | "path">,
): MediaKind | null {
  if (entry.type !== "file") return null;
  if (/\.(jpe?g|png|webp|avif|gif|bmp|tiff?|heic|heif)$/i.test(entry.path))
    return "image";
  if (
    /\.(mp4|m4v|mkv|webm|mov|avi|mpg|mpeg|wmv|m2ts|mts|ts|ogv|3gp)$/i.test(
      entry.path,
    )
  )
    return "video";
  return null;
}
export type ConversionOptions = {
  format: string;
  mode: string;
  width: string;
  quality: string;
  codec: string;
  videoQuality: string;
  bitrate: string;
  targetMB: string;
  strip: boolean;
  normalize: boolean;
  archive: boolean;
};
export function conversionOptions(
  kind: MediaKind,
  values: Record<string, unknown> = {},
  encoders?: string[],
): ConversionOptions {
  const formats = kind === "image" ? imageFormats : videoFormats;
  const requested =
    values.format === "jpeg" ? "jpg" : String(values.format || "");
  const format = formats.includes(requested) ? requested : formats[0];
  const codecs =
    kind === "video"
      ? videoCodecs[format].filter(
          (codec) => !encoders || encoders.includes(codec),
        )
      : [];
  const number = (key: string, fallback: number, max: number, min = 0) => {
    const n = Number(values[key]);
    return String(
      values[key] !== undefined && Number.isInteger(n) && n >= min && n <= max
        ? n
        : fallback,
    );
  };
  return {
    format,
    mode: kind === "video" && values.mode === "remux" ? "remux" : "convert",
    width: number("width", 0, kind === "image" ? 20000 : 7680),
    quality: number("quality", 85, 100, 1),
    codec:
      kind === "video" && codecs.includes(String(values.codec))
        ? String(values.codec)
        : kind === "video"
          ? codecs[0] || ""
          : "",
    videoQuality: ["high", "balanced", "small"].includes(
      String(values.videoQuality),
    )
      ? String(values.videoQuality)
      : "balanced",
    bitrate: number("bitrate", 192, 512, 32),
    targetMB: number("targetMB", 0, 100000),
    strip: typeof values.strip === "boolean" ? values.strip : kind === "image",
    normalize: kind === "video" && values.normalize === true,
    archive: values.archive === true,
  };
}
export function conversionPayload(kind: MediaKind, options: ConversionOptions) {
  const {
    format,
    mode,
    width,
    quality,
    codec,
    videoQuality,
    bitrate,
    targetMB,
    strip,
    normalize,
    archive,
  } = options;
  if (!(kind === "image" ? imageFormats : videoFormats).includes(format))
    throw new Error("Format de sortie incompatible.");
  if (
    kind === "video" &&
    mode !== "remux" &&
    !videoCodecs[format].includes(codec)
  )
    throw new Error("Encodage incompatible avec le format choisi.");
  return {
    format,
    strip,
    archive,
    ...(kind === "image"
      ? { width: Number(width), quality: Number(quality) }
      : mode === "remux"
        ? { mode }
        : {
            mode,
            width: Number(width),
            codec,
            videoQuality,
            bitrate: Number(bitrate),
            targetMB: Number(targetMB),
            normalize,
          }),
  };
}
