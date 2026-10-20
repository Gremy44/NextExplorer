import { fileKey } from "./file-families";
import type { Entry } from "./types";
import type { TagStore } from "./tags";
export function orderFiles(
  entries: Entry[],
  sortBy: string,
  sortOrder: string,
  foldersFirst: boolean,
  sizes: Record<string, { size: number }>,
  tags: TagStore,
) {
  const label = (entry: Entry) =>
    (tags.files[fileKey(entry.path)] || [])
      .map((id) => tags.labels.find((tag) => tag.id === id)?.name || "")
      .sort()
      .join(" ");
  const bytes = (entry: Entry) =>
    entry.type === "directory" ? sizes[fileKey(entry.path)]?.size : entry.size;
  return [...entries].sort((a, b) => {
    if (foldersFirst && (a.type === "directory") !== (b.type === "directory"))
      return a.type === "directory" ? -1 : 1;
    let cmp = 0;
    if (sortBy === "size") {
      const aa = bytes(a),
        bb = bytes(b);
      if (aa === undefined || bb === undefined)
        return aa === bb
          ? a.name.localeCompare(b.name, "fr", { numeric: true })
          : aa === undefined
            ? 1
            : -1;
      cmp = aa - bb;
    } else if (sortBy === "mtime") cmp = a.mtime - b.mtime;
    else if (sortBy === "tags") cmp = label(a).localeCompare(label(b), "fr");
    else if (sortBy === "type") cmp = a.ext.localeCompare(b.ext, "fr");
    if (!cmp)
      cmp = a.name.localeCompare(b.name, "fr", {
        numeric: true,
        sensitivity: "base",
      });
    return sortOrder === "desc" ? -cmp : cmp;
  });
}
