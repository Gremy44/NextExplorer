import { useEffect, useState } from "react";
import { History, Trash2, X } from "lucide-react";
import { storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { insertionsKey, restoreInsertions, type Insertion } from "./insertions";
import { size } from "./types";

const states = {
  uncertain: "Résultat à vérifier sur le site",
  inserted: "Insérée dans le champ",
  "not-inserted": "Non insérée",
};

export function InsertionHistory() {
  const [records, setRecords] = useState<Insertion[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const read = () =>
      navigator.locks
        .request(`nextexplorer:${insertionsKey}`, async () => {
          const records = restoreInsertions(
            await storageGet(insertionsKey, []),
          );
          if (live) {
            setRecords(records);
            setError("");
            setReady(true);
          }
        })
        .catch((error) => {
          if (live) {
            setRecords([]);
            setReady(true);
            setError((error as Error).message);
          }
        });
    const unsubscribe = storageSubscribe([insertionsKey], read);
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  async function remove(id?: string) {
    setBusy(true);
    setError("");
    try {
      const value = await storageUpdate<unknown>(insertionsKey, [], (value) =>
        id === undefined
          ? []
          : restoreInsertions(value).filter((record) => record.id !== id),
      );
      setRecords(restoreInsertions(value));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="companion-disclosure insertion-history">
      <summary>
        <History size={18} aria-hidden="true" /> Insertions récentes (
        {records.length})
      </summary>
      <div className="companion-disclosure-content">
        <p className="muted">
          20 dernières tentatives, conservées localement : sites, champs, noms
          et tailles seulement. Une insertion ne confirme pas la réception ; le
          site peut commencer un envoi dès l’insertion.
        </p>
        {(records.length > 0 || error) && (
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => void remove()}
          >
            <Trash2 size={18} aria-hidden="true" /> Effacer le suivi des
            insertions
          </button>
        )}
        {!ready && <p>Chargement du suivi…</p>}
        {busy && <p role="status">Retrait du suivi…</p>}
        {ready && !busy && !records.length && !error && (
          <p>Aucune insertion enregistrée.</p>
        )}
        {records.map((record) => (
          <article key={record.id} data-insertion-id={record.id}>
            <div className="insertion-history-heading">
              <div>
                <strong>{record.origin}</strong>
                <small>{new Date(record.date).toLocaleString("fr-FR")}</small>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label={`Retirer le suivi de l’insertion vers ${record.origin} du ${new Date(record.date).toLocaleString("fr-FR")}`}
                onClick={() => void remove(record.id)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p>Champ : {record.field}</p>
            <strong className="insertion-history-state">
              {states[record.state]}
            </strong>
            {record.state === "uncertain" && (
              <p className="muted">
                Le résultat n’a pas été confirmé. Vérifiez le formulaire avant
                toute nouvelle insertion ; aucune relance automatique.
              </p>
            )}
            <ul>
              {record.files.map((file, index) => (
                <li key={index}>
                  {file.name} · {size(file.size)}
                </li>
              ))}
            </ul>
          </article>
        ))}
        <p className="muted">
          Retirer le suivi conserve les fichiers et le formulaire. Cela n’annule
          pas une insertion ou un envoi déjà lancé. Les dépôts par
          glisser-déposer ne sont pas suivis.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
