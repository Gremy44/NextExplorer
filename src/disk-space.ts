export const DRIVES_PATH = "nextexplorer:drives";
export const spaceColors = [
  "#2457a7",
  "#00665e",
  "#845000",
  "#703ba8",
  "#aa2e43",
  "#455464",
] as const;
export function spacePercent(bytes: number, total: number) {
  const percent = total > 0 ? (bytes / total) * 100 : 0;
  return percent > 0 && percent < 0.1
    ? "< 0,1 %"
    : `${percent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}
export type Volume = {
  path: string;
  name: string;
  kind: "local" | "removable" | "network";
  total?: number;
  free?: number;
  available?: number;
  error?: string;
};
export type SpaceAnalysis = {
  path: string;
  jobId?: string;
  loading?: boolean;
  scanned?: number;
  error?: string;
  result?: {
    items: { path: string; size: number }[];
    total: number;
    skipped: number;
    truncated?: boolean;
    scanned?: number;
    omitted?: number;
  };
};
export type SpaceResultPage = NonNullable<SpaceAnalysis["result"]> & {
  path: string;
  itemCount?: number;
  nextOffset?: number;
};
export async function readSpaceResult(
  read: (offset: number) => Promise<SpaceResultPage>,
) {
  const items: SpaceResultPage["items"] = [];
  let first: SpaceResultPage | undefined;
  let offset = 0;
  while (true) {
    const page = await read(offset);
    if (
      !page ||
      !Array.isArray(page.items) ||
      page.items.some(
        (item) =>
          !item ||
          typeof item.path !== "string" ||
          !Number.isFinite(item.size) ||
          item.size < 0,
      )
    )
      throw new Error("Résultat d’analyse illisible.");
    if (
      first &&
      (page.path !== first.path ||
        page.total !== first.total ||
        page.itemCount !== first.itemCount)
    )
      throw new Error("Résultat d’analyse modifié pendant la lecture.");
    first ??= page;
    items.push(...page.items);
    if (page.nextOffset === undefined) {
      if (page.itemCount !== undefined && items.length !== page.itemCount)
        throw new Error("Résultat d’analyse incomplet.");
      return { ...first, items };
    }
    if (
      !Number.isSafeInteger(page.nextOffset) ||
      page.nextOffset !== items.length ||
      page.nextOffset <= offset ||
      !Number.isSafeInteger(page.itemCount) ||
      page.nextOffset >= page.itemCount!
    )
      throw new Error("Pagination d’analyse interrompue.");
    offset = page.nextOffset;
  }
}
export function volumeUsage(volume: Volume) {
  const { total, free, available } = volume;
  if (
    ![total, free, available].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    ) ||
    !total ||
    free! > total ||
    available! > total
  )
    return null;
  return {
    used: total - free!,
    free: free!,
    available: available!,
    total,
    percent: Math.min(100, Math.max(0, ((total - free!) / total) * 100)),
  };
}
export function spaceTiles(
  items: { path: string; size: number }[],
  total: number,
) {
  const top = items.filter((item) => item.size > 0).slice(0, 40);
  const remaining = total - top.reduce((sum, item) => sum + item.size, 0);
  if (remaining > 0) top.push({ path: "", size: remaining });
  const boxes: {
    path: string;
    size: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  function split(rows: typeof top, x: number, y: number, w: number, h: number) {
    if (!rows.length) return;
    if (rows.length === 1) {
      boxes.push({ ...rows[0], x, y, w, h });
      return;
    }
    const sum = rows.reduce((n, item) => n + item.size, 0);
    let weight = 0,
      index = 0;
    while (index < rows.length - 1 && weight < sum / 2)
      weight += rows[index++].size;
    const ratio = weight / sum;
    if (w > h) {
      split(rows.slice(0, index), x, y, w * ratio, h);
      split(rows.slice(index), x + w * ratio, y, w * (1 - ratio), h);
    } else {
      split(rows.slice(0, index), x, y, w, h * ratio);
      split(rows.slice(index), x, y + h * ratio, w, h * (1 - ratio));
    }
  }
  split(top, 0, 0, 100, 60);
  return boxes;
}
