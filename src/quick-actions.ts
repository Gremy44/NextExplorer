import { conversionKind } from "./media-conversion";
import type { Entry, Hello } from "./types";
export type QuickAction = "rotate" | "annotate" | "pdf-create" | "trim";
export const editableImage = (entry: Entry) =>
  entry.type === "file" && /\.(png|jpe?g|webp|gif|bmp)$/i.test(entry.name);
export const documentFile = (entry: Entry) =>
  editableImage(entry) || (entry.type === "file" && /\.pdf$/i.test(entry.name));
export const audioFile = (entry: Entry) =>
  entry.type === "file" &&
  /\.(mp3|flac|wav|ogg|opus|m4a|aac)$/i.test(entry.name);
export function quickActions(
  entries: Entry[],
  hello: Hello | null,
): { id: QuickAction; label: string; disabled: boolean; reason?: string }[] {
  if (!entries.length || entries.some((e) => e.type !== "file")) return [];
  const source = entries[0],
    same = entries.every((e) => conversionKind(e) === conversionKind(source));
  const native = !!hello?.features?.quickActions,
    media = !!hello?.tools.ffmpeg && !!hello?.tools.ffprobe;
  const items: ReturnType<typeof quickActions> = [];
  if (same && conversionKind(source))
    items.push({
      id: "rotate",
      label: "Faire pivoter",
      disabled:
        !native ||
        !(conversionKind(source) === "image" ? hello?.tools.magick : media),
      reason: "Moteur image ou vidéo requis",
    });
  if (entries.length === 1 && documentFile(source))
    items.push({
      id: "annotate",
      label: "Annoter",
      disabled: editableImage(source) && (!native || !hello?.tools.magick),
      reason: "Compagnon et moteur image à jour requis",
    });
  if (entries.length <= 20 && entries.every(documentFile))
    items.push({
      id: "pdf-create",
      label: "Créer un PDF",
      disabled:
        entries.some(editableImage) && (!native || !hello?.tools.magick),
      reason: "Compagnon et moteur image à jour requis",
    });
  if (
    entries.length === 1 &&
    (conversionKind(source) === "video" || audioFile(source))
  )
    items.push({
      id: "trim",
      label: "Raccourcir",
      disabled: !native || !media,
      reason: "Compagnon, FFmpeg et FFprobe requis",
    });
  return items;
}
export function validTrim(start: number, end: number, duration: number) {
  return (
    [start, end, duration].every(Number.isFinite) &&
    start >= 0 &&
    end > start &&
    end <= duration + 0.001 &&
    end - start <= 3600
  );
}
