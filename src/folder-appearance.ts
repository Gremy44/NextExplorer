import { tagPath, tagColors, type FileTag } from "./tags";

export const folderAppearanceKey = "folderAppearance.v1";
export type FolderAppearance = {
  color: FileTag["color"] | "default";
  symbol: string;
};
export type FolderAppearances = Record<string, FolderAppearance>;
export function restoreFolderAppearances(value: unknown): FolderAppearances {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 1000
  )
    throw new Error("1 000 dossiers personnalisés maximum");
  const result: FolderAppearances = {};
  for (const [path, raw] of Object.entries(value)) {
    const key = tagPath(path),
      item = raw as FolderAppearance;
    if (
      !item ||
      (item.color !== "default" && !tagColors.includes(item.color)) ||
      typeof item.symbol !== "string" ||
      [...item.symbol].length > 12 ||
      [
        ...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(
          item.symbol.trim(),
        ),
      ].length > 1 ||
      /[\p{Cc}\p{Cf}]/u.test(item.symbol.replace(/\u200d/g, "")) ||
      key in result
    )
      throw new Error("Personnalisation de dossier invalide");
    result[key] = { color: item.color, symbol: item.symbol.trim() };
  }
  return result;
}
export function relocateFolderAppearances(
  value: unknown,
  changes: { from: string; to: string }[],
) {
  const mappings = changes
    .map(({ from, to }) => ({ from: tagPath(from), to: tagPath(to) }))
    .sort((a, b) => b.from.length - a.from.length);
  const result: FolderAppearances = {};
  for (const [path, appearance] of Object.entries(
    restoreFolderAppearances(value),
  )) {
    const match = mappings.find(
      ({ from }) =>
        path === from || path.startsWith(from.replace(/\/$/, "") + "/"),
    );
    result[match ? match.to + path.slice(match.from.length) : path] =
      appearance;
  }
  return restoreFolderAppearances(result);
}
