import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  X,
  Tags,
  Palette,
  Maximize2,
  Minimize2,
  TerminalSquare,
} from "lucide-react";
import { bridge } from "./bridge";
import { FileIcon, Preview } from "./Preview";
import { size, type Entry } from "./types";
import { useOrganization } from "./OrganizationContext";
import { fileKey } from "./file-families";
import { isRemote, remotePath } from "./remote";

const ConsolePane = lazy(() =>
  import("./ConsolePane").then((module) => ({ default: module.ConsolePane })),
);

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
  visible,
  onDocument,
  onGallery,
  onExtract,
  path,
  consoleAvailable,
  remoteAvailable = false,
  remoteName,
  entries,
  exiftool,
  onClose,
  expanded,
  onExpandedChange,
  onError,
  onConvert,
  onTags,
  onCustomize,
  analysis,
  analysisKey,
  actions,
}: {
  visible: boolean;
  onDocument?: (entry: Entry, mode: "edit" | "versions") => void;
  onGallery?: (entry: Entry) => void;
  onExtract?: (entry: Entry, members: string[], expected: Entry) => void;
  path: string;
  consoleAvailable: boolean;
  remoteAvailable?: boolean;
  remoteName?: string;
  entries: Entry[];
  exiftool: boolean;
  onClose: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onError: (message: string) => void;
  onConvert?: (entry: Entry) => void;
  onTags?: () => void;
  onCustomize?: () => void;
  analysis?: ReactNode;
  analysisKey?: string;
  actions?: ReactNode;
}) {
  const { tags } = useOrganization();
  const [tab, setTab] = useState("file");
  const [consoleOpened, setConsoleOpened] = useState(false);
  const consoleAllowed = !isRemote(path) || remoteAvailable;
  useEffect(() => {
    if (!consoleAllowed) setTab("file");
  }, [consoleAllowed]);
  useEffect(() => {
    if (analysisKey) setTab("space");
  }, [analysisKey]);
  const entry = entries.length === 1 ? entries[0] : undefined;
  const divider = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(900);
  const maximumWidth = Math.max(260, availableWidth - 256);
  const compact = availableWidth <= 700;
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("nextexplorer:details-width"));
      return Number.isFinite(saved) && saved >= 260 ? saved : 330;
    } catch {
      return 330;
    }
  });
  const visibleWidth = Math.min(width, maximumWidth);
  useLayoutEffect(() => {
    const container = divider.current?.parentElement;
    if (!container) return;
    const measure = () => setAvailableWidth(container.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("nextexplorer:details-width", String(width));
    } catch {}
  }, [width]);
  function resize(next: number) {
    setWidth(Math.max(260, Math.min(maximumWidth, Math.round(next))));
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
    if (
      !visible ||
      tab !== "file" ||
      !entry ||
      entry.type !== "file" ||
      !exiftool ||
      isRemote(entry.path)
    )
      return;
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
  }, [entry?.path, entry?.mtime, entry?.size, exiftool, visible, tab]);

  const tools = (
    <>
      {!isRemote(path) && actions}
      {!isRemote(path) && entries.length > 0 && (
        <section
          className="details-actions"
          aria-label="Organisation de la sélection"
        >
          <div className="tag-chips">
            {tags.labels
              .filter((tag) =>
                entries.some((e) =>
                  tags.files[fileKey(e.path)]?.includes(tag.id),
                ),
              )
              .map((tag) => (
                <span className={`tag-chip tag-${tag.color}`} key={tag.id}>
                  {tag.name}
                </span>
              ))}
          </div>
          <div className="organization-actions">
            <button onClick={onTags}>
              <Tags size={16} />
              Tags…
            </button>
            {entries.every((e) => e.type === "directory") && (
              <button onClick={onCustomize}>
                <Palette size={16} />
                Personnaliser…
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
  return (
    <>
      <div
        ref={divider}
        className="details-divider"
        hidden={!visible || expanded || compact}
        role="separator"
        tabIndex={0}
        aria-label="Ajuster la largeur de l’aperçu"
        aria-orientation="vertical"
        aria-valuemin={260}
        aria-valuemax={maximumWidth}
        aria-valuenow={visibleWidth}
        aria-valuetext={`${visibleWidth} pixels`}
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
              ? visibleWidth + 20
              : event.key === "ArrowRight"
                ? visibleWidth - 20
                : event.key === "Home"
                  ? 260
                  : event.key === "End"
                    ? maximumWidth
                    : null;
          if (next !== null) {
            event.preventDefault();
            resize(next);
          }
        }}
      />
      <aside
        hidden={!visible}
        className={`details-pane${compact ? " compact" : ""}${expanded ? " expanded" : ""}`}
        aria-label="Volet d’aperçu"
        style={{ "--details-width": `${visibleWidth}px` } as CSSProperties}
      >
        <header>
          <strong>Aperçu et détails</strong>
          <button
            onClick={() => onExpandedChange(!expanded)}
            aria-label={
              expanded
                ? "Réduire le volet d’aperçu"
                : "Agrandir le volet d’aperçu"
            }
            title={
              expanded ? "Revenir aux fichiers" : "Afficher le volet en grand"
            }
            aria-pressed={expanded}
          >
            {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button onClick={onClose} aria-label="Fermer le volet d’aperçu">
            <X size={18} />
          </button>
        </header>
        {
          <div
            className="details-tabs"
            role="group"
            aria-label="Contenu de l’aperçu"
          >
            <button
              aria-pressed={tab === "file"}
              onClick={() => setTab("file")}
            >
              Sélection
            </button>
            {analysis && (
              <button
                aria-pressed={tab === "space"}
                onClick={() => setTab("space")}
              >
                Espace disque
              </button>
            )}
            <button
              hidden={!consoleAllowed}
              aria-pressed={tab === "console"}
              onClick={() => {
                setConsoleOpened(true);
                setTab("console");
              }}
            >
              <TerminalSquare size={16} /> Console
            </button>
          </div>
        }
        <div
          className={`details-content${tab === "console" ? " console-content" : ""}`}
        >
          {consoleAllowed && consoleOpened && (
            <div
              className="details-console"
              hidden={tab !== "console" || !visible}
            >
              <Suspense
                fallback={<p className="muted">Chargement de la console…</p>}
              >
                <ConsolePane
                  key={isRemote(path) ? remotePath(path).id : "local"}
                  path={path}
                  active={visible && tab === "console"}
                  available={
                    isRemote(path) ? remoteAvailable : consoleAvailable
                  }
                  remoteName={remoteName}
                />
              </Suspense>
            </div>
          )}
          {!visible || tab === "console" ? null : analysis &&
            tab === "space" ? (
            analysis
          ) : (
            <>
              {entry ? (
                <>
                  {entry.type === "file" ? (
                    <Preview
                      onExtract={
                        !isRemote(path) && onExtract
                          ? (members, expected) =>
                              onExtract(entry, members, expected)
                          : undefined
                      }
                      onGallery={
                        !isRemote(path) && onGallery
                          ? () => onGallery(entry)
                          : undefined
                      }
                      onDocument={
                        !isRemote(path) && onDocument
                          ? (mode) => onDocument(entry, mode)
                          : undefined
                      }
                      key={`${entry.path}:${entry.mtime}:${entry.size}`}
                      entry={entry}
                      embedded
                      onClose={onClose}
                      onError={onError}
                      onConvert={
                        !isRemote(path) && onConvert
                          ? () => onConvert(entry)
                          : undefined
                      }
                    />
                  ) : (
                    <div className="details-placeholder">
                      <FileIcon entry={entry} size={80} />
                    </div>
                  )}
                  {tools}
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
                <>
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
                        <p>
                          Sélectionnez un seul fichier pour voir son aperçu.
                        </p>
                      </>
                    ) : (
                      <p>
                        Sélectionnez un fichier pour voir son aperçu et ses
                        informations.
                      </p>
                    )}
                  </div>
                  {tools}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
