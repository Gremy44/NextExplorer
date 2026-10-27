import { useState } from "react";
import { compareFolders } from "./remote";
import type { Entry } from "./types";

const labels = {
  missing: "Absent à destination",
  different: "Type ou taille différente",
  newer: "Source plus récente",
  same: "Même taille et date compatible",
  folder: "Dossier présent",
};
export function RemoteComparison({
  source,
  destination,
  from,
  to,
  onCopy,
}: {
  source: Entry[];
  destination: Entry[];
  from: string;
  to: string;
  onCopy: (paths: string[]) => void;
}) {
  const rows = compareFolders(source, destination);
  const [selected, setSelected] = useState(() =>
    rows.filter((row) => row.status === "missing").map((row) => row.entry.path),
  );
  return (
    <section className="organization-dialog">
      <p className="muted">
        Comparaison du niveau affiché par nom, taille et date. Les contenus et
        les sous-dossiers ne sont pas comparés. Un fichier de même taille peut
        avoir un contenu différent.
      </p>
      <p className="remote-fingerprint">
        {from}
        <br />→ {to}
      </p>
      <div className="remote-compare-list">
        {rows.map(({ entry, status }) => (
          <label key={entry.path}>
            <input
              type="checkbox"
              disabled={status === "same" || status === "folder"}
              checked={selected.includes(entry.path)}
              onChange={(event) =>
                setSelected((old) =>
                  event.target.checked
                    ? [...old, entry.path]
                    : old.filter((path) => path !== entry.path),
                )
              }
            />
            <span>{entry.name}</span>
            <small>{labels[status]}</small>
          </label>
        ))}
      </div>
      {!rows.length && <p>Aucun élément à comparer.</p>}
      <div className="modal-actions">
        <button
          type="button"
          className="primary"
          disabled={!selected.length}
          onClick={() => onCopy(selected)}
        >
          Préparer la copie ({selected.length})
        </button>
      </div>
    </section>
  );
}
