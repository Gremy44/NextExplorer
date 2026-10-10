import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { X } from "lucide-react";
import { bridge } from "./bridge";
import { FileIcon, Preview } from "./Preview";
import { size, type Entry } from "./types";

const fields: Record<string, string> = {
  FileType: "Format",
  MIMEType: "Type MIME",
  ImageWidth: "Largeur",
  ImageHeight: "Hauteur",
  Make: "Fabricant",
  Model: "Appareil",
  DateTimeOriginal: "Date de prise de vue",
  Artist: "Artiste",
  Author: "Auteur",
  Title: "Titre",
  PageCount: "Pages",
  Duration: "Durée",
};

export function DetailsPane({
  entries,
  exiftool,
  onClose,
  onError,
  onConvert,
}: {
  entries: Entry[];
  exiftool: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onConvert?: (entry: Entry) => void;
}) {
  const entry = entries.length === 1 ? entries[0] : undefined;
  const divider = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("nextexplorer:details-width"));
      return Number.isFinite(saved) && saved >= 260 && saved <= 640
        ? saved
        : 330;
    } catch {
      return 330;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("nextexplorer:details-width", String(width));
    } catch {}
  }, [width]);
  function resize(next: number) {
    const available =
      divider.current?.parentElement?.getBoundingClientRect().width || 880;
    setWidth(Math.max(260, Math.min(640, available - 240, next)));
  }
  function drag(clientX: number) {
    const bounds = divider.current?.parentElement?.getBoundingClientRect();
    if (bounds) resize(bounds.right - clientX - 8);
  }
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setMetadata({});
    setError("");
    setLoading(false);
    if (!entry || entry.type !== "file" || !exiftool) return;
    setLoading(true);
    const timer = setTimeout(() => {
      bridge
        .request("METADATA", { path: entry.path }, 35000)
        .then((value) => {
          if (live)
            setMetadata(Array.isArray(value) ? value[0] || {} : value || {});
        })
        .catch(() => {
          if (live)
            setError(
              "Les métadonnées supplémentaires ne sont pas disponibles.",
            );
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [entry?.path, entry?.mtime, entry?.size, exiftool]);

  return (
    <>
      <div
        ref={divider}
        className="details-divider"
        role="separator"
        tabIndex={0}
        aria-label="Ajuster la largeur de l’aperçu"
        aria-orientation="vertical"
        aria-valuemin={260}
        aria-valuemax={640}
        aria-valuenow={width}
        aria-valuetext={`${width} pixels`}
        title="Glisser pour ajuster · double-clic pour réinitialiser"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          drag(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.preventDefault();
            drag(event.clientX);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onDoubleClick={() => resize(330)}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowLeft"
              ? width + 20
              : event.key === "ArrowRight"
                ? width - 20
                : event.key === "Home"
                  ? 260
                  : event.key === "End"
                    ? 640
                    : null;
          if (next !== null) {
            event.preventDefault();
            resize(next);
          }
        }}
      />
      <aside
        className="details-pane"
        aria-label="Volet d’aperçu"
        style={{ "--details-width": `${width}px` } as CSSProperties}
      >
        <header>
          <strong>Aperçu et détails</strong>
          <button onClick={onClose} aria-label="Fermer le volet d’aperçu">
            <X size={18} />
          </button>
        </header>
        <div className="details-content">
          {entry ? (
            <>
              {entry.type === "file" ? (
                <Preview
                  key={`${entry.path}:${entry.mtime}:${entry.size}`}
                  entry={entry}
                  embedded
                  onClose={onClose}
                  onError={onError}
                  onConvert={onConvert ? () => onConvert(entry) : undefined}
                />
              ) : (
                <div className="details-placeholder">
                  <FileIcon entry={entry} />
                </div>
              )}
              <section
                className="file-details"
                aria-label="Informations du fichier"
              >
                <h2>{entry.name}</h2>
                <dl>
                  <dt>Type</dt>
                  <dd>
                    {entry.type === "directory"
                      ? "Dossier"
                      : entry.type === "symlink"
                        ? "Lien symbolique"
                        : entry.ext || "Fichier"}
                  </dd>
                  {entry.type !== "directory" && (
                    <>
                      <dt>Taille</dt>
                      <dd>{size(entry.size)}</dd>
                    </>
                  )}
                  <dt>Modifié le</dt>
                  <dd>
                    {new Date(entry.mtime * 1000).toLocaleString("fr-FR")}
                  </dd>
                  <dt>Emplacement</dt>
                  <dd>{entry.path}</dd>
                  {Object.entries(fields).map(([key, label]) => {
                    const value = metadata[key];
                    return typeof value === "string" ||
                      typeof value === "number" ? (
                      <Fragment key={key}>
                        <dt>{label}</dt>
                        <dd>{String(value).slice(0, 512)}</dd>
                      </Fragment>
                    ) : null;
                  })}
                </dl>
                {loading && (
                  <p className="muted" role="status">
                    Lecture des métadonnées…
                  </p>
                )}
                {error && (
                  <p className="muted" role="status">
                    {error}
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="details-placeholder">
              {entries.length ? (
                <>
                  <strong>{entries.length} éléments sélectionnés</strong>
                  <p>
                    {size(
                      entries
                        .filter((e) => e.type === "file")
                        .reduce((total, e) => total + e.size, 0),
                    )}{" "}
                    de fichiers
                  </p>
                  <p>Sélectionnez un seul fichier pour voir son aperçu.</p>
                </>
              ) : (
                <p>
                  Sélectionnez un fichier pour voir son aperçu et ses
                  informations.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
