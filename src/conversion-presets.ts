export const conversionPresetsKey = "conversionPresets.v1";
export type ConversionPreset = {
  name: string;
  context: "convert" | "prepare";
  values: Record<string, string | boolean>;
};
const formats =
  "webp avif png jpg jpeg gif bmp tiff svg mp3 flac aac wav ogg m4a opus mp4 mkv webm mov avi".split(
    " ",
  );
const ranges: Record<string, [number, number]> = {
  width: [0, 20000],
  quality: [1, 100],
  bitrate: [32, 512],
  targetMB: [0, 100000],
  maxMB: [0.001, 100],
};
const checks = ["strip", "normalize", "archive"];
const codecs = [
  "",
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "h264_nvenc",
  "h264_qsv",
  "h264_vaapi",
];
export function restoreConversionPresets(value: unknown): ConversionPreset[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("30 préréglages maximum.");
  const seen = new Set<string>();
  return value.map((record) => {
    if (
      !record ||
      typeof record.name !== "string" ||
      !record.name.trim() ||
      record.name.length > 60 ||
      !["convert", "prepare"].includes(record.context) ||
      !record.values ||
      typeof record.values !== "object" ||
      Array.isArray(record.values)
    )
      throw new Error("Préréglage invalide.");
    const key = `${record.context}:${record.name.trim().toLocaleLowerCase("fr")}`;
    if (seen.has(key)) throw new Error("Nom de préréglage déjà utilisé.");
    seen.add(key);
    const values: Record<string, string | boolean> = {};
    for (const [key, field] of Object.entries(record.values)) {
      if (checks.includes(key)) {
        if (typeof field !== "boolean")
          throw new Error("Option de préréglage invalide.");
      } else if (
        typeof field !== "string" ||
        field.length > 32 ||
        (key === "format"
          ? !formats.includes(field)
          : key === "codec"
            ? !codecs.includes(field)
            : key === "videoQuality"
              ? !["high", "balanced", "small"].includes(field)
              : key === "mode"
                ? !["convert", "remux"].includes(field)
                : !Object.hasOwn(ranges, key) ||
                  !Number.isFinite(Number(field)) ||
                  Number(field) < ranges[key][0] ||
                  Number(field) > ranges[key][1])
      )
        throw new Error("Valeur de préréglage invalide.");
      values[key] = field as string | boolean;
    }
    if (typeof values.format !== "string")
      throw new Error("Format du préréglage requis.");
    if (
      record.context === "prepare" &&
      (!["jpg", "png", "webp"].includes(values.format) ||
        Number(values.width) < 16 ||
        Number(values.width) > 8000 ||
        !values.maxMB ||
        !values.quality)
    )
      throw new Error("Contraintes d’image invalides.");
    return { name: record.name.trim(), context: record.context, values };
  });
}
export const defaultConversionPresets: ConversionPreset[] = [
  {
    name: "Images pour le web",
    context: "convert",
    values: {
      format: "webp",
      mode: "convert",
      width: "1600",
      quality: "82",
      strip: true,
      normalize: false,
      archive: false,
    },
  },
  {
    name: "Images pour courriel + ZIP",
    context: "convert",
    values: {
      format: "jpg",
      mode: "convert",
      width: "1280",
      quality: "80",
      strip: true,
      normalize: false,
      archive: true,
    },
  },
  {
    name: "Vidéo 720p",
    context: "convert",
    values: {
      format: "mp4",
      mode: "convert",
      width: "1280",
      codec: "libx264",
      videoQuality: "balanced",
      targetMB: "0",
      normalize: false,
      strip: false,
      archive: false,
    },
  },
  {
    name: "Image pour formulaire",
    context: "prepare",
    values: {
      format: "jpg",
      width: "1600",
      quality: "85",
      maxMB: "2",
      strip: true,
    },
  },
];

export function presetFormValues(
  form: HTMLFormElement,
  context: ConversionPreset["context"],
) {
  const values: Record<string, string | boolean> = {};
  const keys =
    context === "prepare"
      ? ["format", "width", "quality", "maxMB", "strip"]
      : [
          "format",
          "mode",
          "width",
          "quality",
          "bitrate",
          "codec",
          "videoQuality",
          "targetMB",
          "strip",
          "normalize",
          "archive",
        ];
  for (const key of keys) {
    const field = form.elements.namedItem(key);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
      values[key] =
        field instanceof HTMLInputElement && field.type === "checkbox"
          ? field.checked
          : field.value;
  }
  return values;
}
