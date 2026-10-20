import { useEffect, useState } from "react";
import { bridge } from "./bridge";
import { pathBreadcrumbs, type Entry, type Listing } from "./types";
import { FileIcon } from "./Preview";

export function DirectoryColumns({
  path,
  onNavigate,
  hidden,
}: {
  path: string;
  onNavigate: (path: string) => void;
  hidden: boolean;
}) {
  const [columns, setColumns] = useState<
    {
      path: string;
      name: string;
      entries: Entry[];
      omitted: number;
      error?: string;
    }[]
  >([]);
  useEffect(() => {
    let live = true;
    const trail = pathBreadcrumbs(path).slice(-3);
    setColumns(trail.map((item) => ({ ...item, entries: [], omitted: 0 })));
    void Promise.all(
      trail.map(async (item) => {
        try {
          const listing = await bridge.request<Listing>("FS_LIST_DIR", {
            path: item.path,
            limit: 200,
            showHidden: hidden,
          });
          return {
            ...item,
            entries: listing.entries.filter(
              (entry) => entry.type === "directory",
            ),
            omitted: Math.max(0, listing.total - listing.entries.length),
          };
        } catch (error) {
          return {
            ...item,
            entries: [],
            omitted: 0,
            error: (error as Error).message,
          };
        }
      }),
    ).then((value) => {
      if (live) setColumns(value);
    });
    return () => {
      live = false;
    };
  }, [path, hidden]);
  return (
    <nav className="directory-columns" aria-label="Navigation en colonnes">
      {columns.map((column) => (
        <section key={column.path}>
          <button
            type="button"
            title={column.path}
            onClick={() => onNavigate(column.path)}
          >
            <strong>{column.name}</strong>
          </button>
          {column.error && <p role="status">{column.error}</p>}
          {column.entries.map((entry) => (
            <button
              type="button"
              key={entry.path}
              title={entry.path}
              aria-current={path === entry.path ? "location" : undefined}
              onClick={() => onNavigate(entry.path)}
            >
              <FileIcon entry={entry} />
              {entry.name}
            </button>
          ))}
          {column.omitted > 0 && (
            <small>
              {column.omitted} entrée(s) omises ; utilisez le chemin pour un
              autre dossier.
            </small>
          )}
        </section>
      ))}
    </nav>
  );
}
