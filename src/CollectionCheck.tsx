import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { bridge } from "./bridge";
import {
  checkCollection,
  COLLECTION_CHECK_LIMIT,
  type CollectionCheck as CheckResult,
} from "./collection";
import { size, type CollectionEntry, type Entry } from "./types";

const kinds = {
  file: "Fichier",
  directory: "Dossier",
  symlink: "Lien symbolique",
};

export function CollectionCheck({
  entries,
  connected,
}: {
  entries: CollectionEntry[];
  connected: boolean;
}) {
  const controller = useRef<AbortController | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [stopped, setStopped] = useState(false);
  const count = entries.filter((entry) => entry.type !== "web").length;
  useEffect(() => {
    controller.current?.abort();
    setResults([]);
    setChecking(false);
    setCheckedAt(null);
    setStopped(false);
    return () => controller.current?.abort();
  }, [entries, connected]);

  async function check() {
    const current = new AbortController();
    controller.current = current;
    setResults([]);
    setCheckedAt(null);
    setStopped(false);
    setChecking(true);
    try {
      await checkCollection(
        entries,
        (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
        current.signal,
        (result) => setResults((previous) => [...previous, result]),
      );
    } finally {
      if (!current.signal.aborted && controller.current === current) {
        setChecking(false);
        setCheckedAt(new Date());
      }
    }
  }

  return (
    <section aria-label="Vérification des références locales">
      <div className="download-rule-actions">
        <button
          type="button"
          disabled={!connected || !count || checking}
          onClick={() => void check()}
        >
          <ShieldCheck size={18} aria-hidden="true" /> Vérifier les fichiers
        </button>
        {checking && (
          <button
            type="button"
            onClick={() => {
              controller.current?.abort();
              setChecking(false);
              setStopped(true);
              setCheckedAt(new Date());
            }}
          >
            Arrêter la vérification
          </button>
        )}
      </div>
      <p className="muted">
        Contrôle de présence, taille et date, sans lire le contenu ni visiter
        les liens web. L’intérieur des dossiers et les cibles des liens
        symboliques ne sont pas vérifiés. Les références collectées restent
        inchangées.
      </p>
      {!connected && (
        <p className="muted">
          Connectez le compagnon pour vérifier vos fichiers.
        </p>
      )}
      {count > COLLECTION_CHECK_LIMIT && (
        <p>
          Contrôle limité aux {COLLECTION_CHECK_LIMIT} premières références
          locales sur {count}. Les autres ne sont pas vérifiées.
        </p>
      )}
      {(checking || checkedAt) && (
        <p role="status">
          {checking
            ? "Vérification en cours"
            : stopped
              ? "Vérification arrêtée"
              : "Contrôle terminé"}
          {" : "}
          {results.length}/{count} références locales examinées.{" "}
          {results.filter((result) => result.status === "present").length}{" "}
          présentes,{" "}
          {results.filter((result) => result.status === "changed").length} avec
          métadonnées modifiées,{" "}
          {results.filter((result) => result.status === "unavailable").length}{" "}
          non vérifiables.
          {checkedAt && (
            <> Dernier contrôle : {checkedAt.toLocaleTimeString("fr-FR")}.</>
          )}
        </p>
      )}
      {results.some((result) => result.status !== "present") && (
        <ul className="collection-review" aria-label="Références à vérifier">
          {results
            .filter((result) => result.status !== "present")
            .map((result) => (
              <li key={result.entry.path}>
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <strong>{result.entry.name}</strong>
                  <span>{result.entry.path}</span>
                  {result.current ? (
                    <>
                      <small>Métadonnées modifiées depuis la collecte.</small>
                      {result.entry.type !== result.current.type && (
                        <small>
                          Type : {kinds[result.entry.type]} →{" "}
                          {kinds[result.current.type]}.
                        </small>
                      )}
                      {result.current.type !== "directory" && (
                        <small>
                          Taille : {size(result.entry.size)} →{" "}
                          {size(result.current.size)}. Date :{" "}
                          {new Date(result.entry.mtime * 1000).toLocaleString(
                            "fr-FR",
                          )}{" "}
                          →{" "}
                          {new Date(result.current.mtime * 1000).toLocaleString(
                            "fr-FR",
                          )}
                          .
                        </small>
                      )}
                    </>
                  ) : (
                    <>
                      <small>
                        Non vérifiable : absence ou accès impossible.
                      </small>
                      <small>
                        Vérifiez le chemin ou la connexion au compagnon, puis
                        relancez le contrôle.
                      </small>
                    </>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
