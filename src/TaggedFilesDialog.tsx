import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bridge } from "./bridge";
import { useOrganization } from "./OrganizationContext";
import { FileIcon } from "./Preview";
import { basename, type Entry, type Listing } from "./types";
import { fileKey } from "./file-families";

export function TaggedFilesDialog({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (entry: Entry) => void;
}) {
  const { tags } = useOrganization(),
    label = tags.labels.find((tag) => tag.id === id);
  const [rows, setRows] = useState<
      { path: string; entry?: Entry; error?: string }[]
    >([]),
    [limit, setLimit] = useState(200),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const paths = Object.entries(tags.files)
      .filter(([, ids]) => ids.includes(id))
      .map(([path]) => path),
    key = JSON.stringify(paths);
  useEffect(() => {
    let live = true,
      index = 0;
    const selected = paths.slice(0, limit),
      result = new Array<{ path: string; entry?: Entry; error?: string }>(
        selected.length,
      );
    setBusy(true);
    setRows([]);
    void Promise.all(
      Array.from({ length: Math.min(4, selected.length) }, async () => {
        while (live && index < selected.length) {
          const position = index++,
            path = selected[position];
          try {
            let entry = await bridge.request<Entry>("FS_STAT", { path }, 5000);
            try {
              const parent = path.slice(
                0,
                Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
              );
              const listing = await bridge.request<Listing>(
                "FS_LIST_DIR",
                {
                  path: parent,
                  filter: entry.name,
                  limit: 200,
                  showHidden: true,
                },
                5000,
              );
              entry =
                listing.entries.find(
                  (item) => fileKey(item.path) === fileKey(path),
                ) || entry;
            } catch {
              /* The verified reference remains usable when its parent cannot be listed. */
            }
            result[position] = { path, entry };
          } catch {
            result[position] = { path, error: "Introuvable ou indisponible" };
          }
        }
      }),
    ).then(() => {
      if (live) {
        setRows(result);
        setBusy(false);
      }
    });
    return () => {
      live = false;
    };
  }, [key, limit, revision]);
  return (
    <section className="organization-dialog tagged-files">
      <div className="organization-actions">
        <span className={`tag-chip tag-${label?.color || "gray"}`}>
          {label?.name || "Tag supprimé"}
        </span>
        <span>{paths.length} élément(s), tous dossiers confondus</span>
        <button disabled={busy} onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>
      <p className="muted">
        Ces références sont vérifiées à l’ouverture, sans indexer le contenu de
        vos fichiers.
      </p>
      {busy && <p role="status">Vérification des références…</p>}
      {rows.map((row) => (
        <article className="organization-record" key={row.path}>
          <button
            disabled={!row.entry}
            onClick={() => row.entry && onOpen(row.entry)}
          >
            {row.entry && <FileIcon entry={row.entry} />}
            <span>
              <strong>{row.entry?.name || basename(row.path)}</strong>
              <small>{row.path}</small>
              {row.error && <small>{row.error}</small>}
            </span>
          </button>
        </article>
      ))}
      {!paths.length && <p>Aucun fichier ou dossier associé à ce tag.</p>}
      {paths.length > limit && (
        <button disabled={busy} onClick={() => setLimit((n) => n + 200)}>
          Afficher 200 références de plus
        </button>
      )}
    </section>
  );
}
