import { useState } from "react";
import { bridge } from "./bridge";
import type { Entry } from "./types";

export function RemoteEntryDialog({
  entry,
  mode,
  onDone,
}: {
  entry: Entry;
  mode: "delete" | "permissions";
  onDone: () => void;
}) {
  const [permissions, setPermissions] = useState(() => {
      const mode = entry.stamp?.split(":").at(-1) || "";
      return /^[0-7]{1,3}$/.test(mode)
        ? mode.padStart(3, "0")
        : entry.type === "directory"
          ? "755"
          : "644";
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="organization-dialog">
      <p>
        <strong>{entry.name}</strong>
      </p>
      {mode === "delete" ? (
        <p>
          Supprimer définitivement cet élément du serveur ? Il ne passera pas
          par la corbeille. Seuls les fichiers et dossiers vides peuvent être
          supprimés.
        </p>
      ) : (
        <label className="field">
          Permissions Unix (SFTP)
          <input
            aria-label="Permissions Unix"
            pattern="[0-7]{3}"
            maxLength={3}
            value={permissions}
            onChange={(event) => setPermissions(event.target.value)}
          />
          <small>
            Exemples : 644 pour un fichier, 755 pour un dossier. Aucun
            changement récursif.
          </small>
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          disabled={
            busy || (mode === "permissions" && !/^[0-7]{3}$/.test(permissions))
          }
          className={mode === "delete" ? "danger" : "primary"}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await bridge.request(
                mode === "delete" ? "REMOTE_DELETE" : "REMOTE_CHMOD",
                {
                  path: entry.path,
                  expected: entry,
                  mode: parseInt(permissions, 8),
                },
              );
              onDone();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "En cours…"
            : mode === "delete"
              ? "Supprimer définitivement"
              : "Appliquer"}
        </button>
      </div>
    </section>
  );
}
