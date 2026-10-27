import { Help } from "./Help";
import { InsertionHistory } from "./InsertionHistory";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Folder,
  Globe,
  Layers,
  Link,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  TextSelect,
  X,
} from "lucide-react";
import { FileIcon } from "./Preview";
import {
  FileEntryContent,
  FileViewMenu,
  FileSortMenu,
  fileView,
} from "./FileView";
import { FolderPicker, FolderPath } from "./FolderPicker";
import { bridge } from "./bridge";
import { uploadIssue } from "./uploads";
import { imageFormatsForField, preparableImage } from "./prepare-images";
import type { PaneState } from "./Pane";
import { useOrganization } from "./OrganizationContext";
import { fileMetrics } from "./interface-layout";
import { orderFiles } from "./file-order";
import { DirectoryColumns } from "./DirectoryColumns";
import { DRIVES_PATH } from "./disk-space";
import { DrivesView } from "./DrivesView";
import {
  basename,
  collectedLink,
  mediaType,
  size,
  type CollectionEntry,
  type Entry,
  type Hello,
} from "./types";
import {
  captureSelection,
  currentBrowserPage,
  inspectUploads,
  sendFiles,
  type BrowserPage,
  type UploadTarget,
} from "./web";

type Props = {
  hello: Hello | null;
  connectionSetup: ReactNode;
  pane: PaneState;
  favorites: { name: string; path: string }[];
  stash: CollectionEntry[];
  pendingCapture: "text" | "image" | null;
  onNavigate: (path: string) => void;
  onBack: () => void;
  showHidden: boolean;
  onHiddenChange: (value: boolean) => void;
  onChange: (value: Partial<PaneState>) => void;
  onCollect: (entries: CollectionEntry[]) => Promise<boolean>;
  onRemove: (path: string) => void;
  onPreview: (entry: CollectionEntry) => void;
  onReview: () => void;
  onPendingCapture: () => void;
  onCaptureLink: (url: string) => void;
  onCapturePage: (page: BrowserPage) => void;
  onDownloads: () => void;
  onPrepare: (
    page: BrowserPage,
    entries?: Entry[],
    target?: UploadTarget,
  ) => void;
  onNote: () => void;
  onDrop: (event: DragEvent, path: string) => void;
  onFolderAction: (action: "tags" | "appearance") => void;
  onRefreshVolumes: () => void;
  analysis?: ReactNode;
};

export function BrowserCompanion(props: Props) {
  const { hello, pane, stash } = props;
  const { preferences, tags, sizes } = useOrganization();
  const ordered = orderFiles(
    pane.listing?.entries || [],
    pane.sortBy,
    pane.sortOrder,
    preferences.foldersFirst,
    sizes,
    tags,
  );
  const container = useRef<HTMLDivElement>(null);
  const [folderPicker, setFolderPicker] = useState(false);
  const [foldersExpanded, setFoldersExpanded] = useState(false);
  const [fileType, setFileType] = useState("all");
  const [mode, setMode] = useState("files");
  const modes = ["files", "page", "collection"] as const;
  const [page, setPage] = useState<BrowserPage | null>(null);
  const pageRef = useRef<BrowserPage | null>(null);
  const [busy, setBusy] = useState(false);
  const dragging = useRef(false);
  const suppressDragClick = useRef(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [upload, setUpload] = useState<Awaited<
    ReturnType<typeof inspectUploads>
  > | null>(null);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);
  const files = stash.filter((entry): entry is Entry => entry.type === "file");
  const selected = files.filter((entry) => !excluded.includes(entry.path));
  const field = upload?.fields.find((field) => field.index === fieldIndex);
  const insertionIssue = uploadIssue(selected, field);
  const selectedImages = selected.filter(preparableImage);
  const canPrepareForField = !!field && imageFormatsForField(field).length > 0;
  const nativeDrag =
    !!hello?.features?.nativeDrag &&
    (hello.features.nativeDragVersion || 0) >= 2;
  const folders = ordered.filter((entry) => entry.type === "directory");
  const documents =
    ordered.filter((entry) => {
      if (entry.type === "directory") return false;
      const type = mediaType(entry);
      const document =
        ["text", "pdf", "link"].includes(type) ||
        /\.(docx?|xlsx?|pptx?|od[tsp]|rtf|epub)$/i.test(entry.ext);
      return (
        fileType === "all" ||
        (fileType === "documents"
          ? document
          : fileType === "binary"
            ? type === "binary" && !document
            : type === fileType)
      );
    }) || [];
  const filterCount =
    Number(!!pane.filter) +
    Number(fileType !== "all") +
    Number(props.showHidden);
  const baseView = fileView(pane.viewMode);
  const view = { ...baseView, ...fileMetrics(baseView, preferences) };
  const viewStyle = {
    "--file-cell-width": view.width ? `${view.width}px` : "100%",
    "--file-icon-size": `${view.iconSize}px`,
    "--file-row-height": `${view.height}px`,
  } as CSSProperties;

  useEffect(() => {
    setFoldersExpanded(false);
  }, [pane.path]);
  useLayoutEffect(() => {
    if (container.current) container.current.scrollTop = 0;
  }, [mode, pane.path]);
  useEffect(() => {
    let live = true,
      request = 0;
    const read = async () => {
      const revision = ++request;
      try {
        const current = await currentBrowserPage();
        if (!live || revision !== request) return;
        pageRef.current = current;
        setPage(current);
      } catch {
        if (live && revision === request) {
          pageRef.current = null;
          setPage(null);
        }
      }
    };
    const updated = (tabId: number, change: chrome.tabs.TabChangeInfo) => {
      if (pageRef.current?.id === tabId && change.status === "loading") {
        setUpload(null);
        setMessage(null);
      }
      void read();
    };
    void read();
    chrome.tabs?.onActivated?.addListener(read);
    chrome.tabs?.onUpdated?.addListener(updated);
    return () => {
      live = false;
      chrome.tabs?.onActivated?.removeListener(read);
      chrome.tabs?.onUpdated?.removeListener(updated);
    };
  }, []);
  useEffect(() => {
    setUpload(null);
    setMessage(null);
  }, [page?.id, page?.url]);

  function dragHandlers(entry: Entry) {
    const enabled =
      !!hello?.features?.nativeDrag &&
      (hello.features.nativeDragVersion || 0) >= 2 &&
      entry.type === "file";
    return {
      draggable: false,
      "data-file-drag": enabled,
      onDragStart: (event: DragEvent) => event.preventDefault(),
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        suppressDragClick.current = false;
        if (
          !enabled ||
          dragging.current ||
          event.button !== 0 ||
          event.pointerType !== "mouse" ||
          !event.isTrusted
        )
          return;
        event.preventDefault();
        gesture.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const start = gesture.current;
        if (
          !enabled ||
          !start ||
          dragging.current ||
          !event.isTrusted ||
          !(event.buttons & 1) ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
        )
          return;
        gesture.current = null;
        suppressDragClick.current = true;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        dragging.current = true;
        void bridge
          .request<{ state: string }>("OS_DRAG_FILES", { paths: [entry.path] })
          .then((result) =>
            setMessage({
              text:
                result.state === "dropped"
                  ? "Fichier déposé. Vérifiez sa réception sur le site."
                  : "Glissement annulé. Le fichier est conservé.",
              error: false,
            }),
          )
          .catch((error) => setMessage({ text: error.message, error: true }))
          .finally(() => {
            dragging.current = false;
          });
      },
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        if (enabled && suppressDragClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressDragClick.current = false;
        }
      },
      onPointerUp: () => {
        gesture.current = null;
      },
      onPointerCancel: () => {
        gesture.current = null;
      },
    };
  }

  const perform = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ text: success, error: false });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  if (hello && pane.path === DRIVES_PATH)
    return (
      <section className="browser-companion">
        <button onClick={props.onBack} disabled={!pane.history.length}>
          <ArrowLeft size={18} />
          Précédent
        </button>
        <DrivesView
          onNavigate={props.onNavigate}
          onRefresh={props.onRefreshVolumes}
        />
      </section>
    );
  return (
    <section className="browser-companion" aria-label="Compagnon du navigateur">
      <nav
        className="companion-modes"
        role="tablist"
        aria-label="Vues du panneau"
      >
        {(
          [
            ["files", "Fichiers", Folder],
            ["page", "Page", Globe],
            ["collection", "Collecte", Layers],
          ] as const
        ).map(([value, label, Icon], index) => (
          <button
            key={value}
            role="tab"
            id={`companion-tab-${value}`}
            aria-label={label}
            aria-controls={`companion-${value}`}
            aria-selected={mode === value}
            tabIndex={mode === value ? 0 : -1}
            onClick={() => setMode(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        modes.length) %
                      modes.length;
              setMode(modes[next]);
              document.getElementById(`companion-tab-${modes[next]}`)?.focus();
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
            {value === "collection" && stash.length > 0 && (
              <span className="companion-count" aria-hidden="true">
                {stash.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="companion-scroll" ref={container}>
        {hello && !props.connectionSetup && (
          <section className="companion-folder" aria-label="Dossier de travail">
            <button
              className="companion-folder-trigger"
              aria-label="Changer de dossier"
              aria-haspopup="dialog"
              title={pane.path}
              onClick={() => setFolderPicker(true)}
            >
              <Folder size={20} aria-hidden="true" />
              <span>
                <small>Dossier de travail</small>
                <strong>{basename(pane.path) || "Choisir un dossier"}</strong>
              </span>
              <span className="companion-folder-change">Changer</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <div className="companion-folder-navigation">
              <button
                aria-label="Dossier précédent"
                title="Dossier précédent · Alt + ←"
                disabled={!pane.history.length}
                onClick={props.onBack}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                aria-label="Dossier parent"
                title="Dossier parent"
                disabled={!pane.listing}
                onClick={() => {
                  if (pane.listing)
                    props.onNavigate(pane.listing.parentPath || DRIVES_PATH);
                }}
              >
                <ArrowUp size={18} />
              </button>
              <FolderPath path={pane.path} onNavigate={props.onNavigate} />
            </div>
          </section>
        )}

        {props.analysis}
        {props.connectionSetup}

        {props.pendingCapture && (
          <button
            className="companion-pending"
            onClick={props.onPendingCapture}
          >
            <Download size={18} />
            {props.pendingCapture === "image" ? "Image" : "Extrait"} à confirmer
          </button>
        )}

        <div
          role="tabpanel"
          id={`companion-${mode}`}
          aria-labelledby={`companion-tab-${mode}`}
        >
          {mode === "files" && hello && !props.connectionSetup && (
            <section
              className="companion-content"
              aria-label="Fichiers du dossier"
            >
              {pane.viewMode === "columns" && (
                <DirectoryColumns
                  path={pane.path}
                  onNavigate={props.onNavigate}
                  hidden={props.showHidden}
                />
              )}
              {pane.listing?.truncated && (
                <p role="status">
                  Liste partielle : affinez le filtre par nom (10 000 résultats
                  / 8 Mio de métadonnées / 200 000 noms maximum).
                </p>
              )}
              <div className="companion-search-toolbar">
                <label className="companion-search">
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Filtrer les fichiers"
                    value={pane.filter}
                    onChange={(event) =>
                      props.onChange({ filter: event.target.value })
                    }
                    placeholder="Rechercher un fichier…"
                  />
                </label>
                <FileViewMenu
                  value={pane.viewMode}
                  onChange={(viewMode) => props.onChange({ viewMode })}
                />
                <FileSortMenu
                  sortBy={pane.sortBy}
                  sortOrder={pane.sortOrder}
                  onChange={props.onChange}
                />
              </div>
              <details className="companion-filters companion-disclosure">
                <summary>
                  <SlidersHorizontal size={18} aria-hidden="true" />
                  Filtres
                  {filterCount > 0 && (
                    <span
                      className="companion-filter-count"
                      aria-label={`${filterCount} filtre(s) actif(s)`}
                    >
                      {filterCount}
                    </span>
                  )}
                </summary>
                <div className="companion-filter-options">
                  <label>
                    Type de fichier
                    <select
                      aria-label="Type de fichier"
                      value={fileType}
                      onChange={(event) => setFileType(event.target.value)}
                    >
                      <option value="all">Tous les types</option>
                      <option value="documents">Documents</option>
                      <option value="image">Images</option>
                      <option value="video">Vidéos</option>
                      <option value="audio">Audio</option>
                      <option value="archive">Archives</option>
                      <option value="binary">Autres</option>
                    </select>
                  </label>
                  <div className="companion-filter-hidden">
                    <input
                      id="companion-hidden-files"
                      type="checkbox"
                      checked={props.showHidden}
                      onChange={(event) =>
                        props.onHiddenChange(event.target.checked)
                      }
                    />
                    <label htmlFor="companion-hidden-files">
                      Afficher les fichiers cachés
                    </label>
                  </div>
                  <button
                    className="companion-filter-reset"
                    onClick={() => {
                      setFileType("all");
                      props.onChange({
                        filter: "",
                        sortBy: "name",
                        sortOrder: "asc",
                      });
                      props.onHiddenChange(false);
                    }}
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              </details>
              <Help>
                {nativeDrag
                  ? "Glissez sur le site, cliquez pour l’aperçu."
                  : "Cliquez sur un fichier pour l’examiner."}
              </Help>
              {hello.platform === "windows" && !nativeDrag && (
                <details className="companion-disclosure">
                  <summary>Activer le glisser-déposer</summary>
                  <div className="companion-disclosure-content">
                    <p>
                      Mettez à jour le compagnon Windows puis rechargez
                      l’extension.
                    </p>
                  </div>
                </details>
              )}
              <div
                className={`companion-files file-layout-${view.layout}`}
                data-view={pane.viewMode}
                style={viewStyle}
                aria-busy={pane.loading}
              >
                {pane.loading ? (
                  <p role="status">Chargement des fichiers…</p>
                ) : !pane.listing?.entries.length ? (
                  <p>
                    {pane.filter
                      ? "Aucun résultat. Essayez un autre nom."
                      : "Ce dossier est vide."}
                  </p>
                ) : (
                  <>
                    {folders.length > 0 && (
                      <section
                        className="companion-folder-group"
                        aria-label="Sous-dossiers"
                      >
                        <h2>
                          Dossiers <span>{folders.length}</span>
                        </h2>
                        <div
                          className="companion-folder-tiles"
                          id="companion-subfolders"
                        >
                          {folders
                            .slice(0, foldersExpanded || pane.filter ? 200 : 4)
                            .map((entry) => (
                              <button
                                key={entry.path}
                                className={`file-item file-layout-${view.layout}`}
                                aria-label={`Ouvrir le dossier ${entry.name}`}
                                title={entry.path}
                                onClick={() => props.onNavigate(entry.path)}
                              >
                                <FileEntryContent
                                  entry={entry}
                                  mode={pane.viewMode}
                                  interactive={false}
                                />
                              </button>
                            ))}
                        </div>
                        {folders.length > 4 && !pane.filter && (
                          <button
                            className="companion-folders-toggle"
                            aria-expanded={foldersExpanded}
                            aria-controls="companion-subfolders"
                            onClick={() => setFoldersExpanded(!foldersExpanded)}
                          >
                            {foldersExpanded
                              ? "Réduire les dossiers"
                              : `Voir les ${folders.length - 4} autres dossiers`}
                          </button>
                        )}
                        {(foldersExpanded || pane.filter) &&
                          folders.length > 200 && (
                            <p>200 dossiers affichés. Affinez la recherche.</p>
                          )}
                      </section>
                    )}
                    <section
                      className="companion-document-group"
                      aria-label="Fichiers disponibles"
                    >
                      <h2>
                        Fichiers <span>{documents.length}</span>
                      </h2>
                      {pane.viewMode === "details" && documents.length > 0 && (
                        <div className="companion-table-head">
                          <span>Nom</span>
                          <span>Modifié</span>
                          <span>Taille</span>
                          <span aria-hidden="true" />
                        </div>
                      )}
                      {!documents.length ? (
                        <p>
                          {fileType !== "all"
                            ? "Aucun fichier ne correspond aux filtres."
                            : "Aucun fichier dans ce dossier."}
                        </p>
                      ) : (
                        // ponytail: cap files at 200 and collapse folder tiles; the filter covers larger folders until virtualization is needed.
                        documents.slice(0, 200).map((entry) => (
                          <div className="companion-entry" key={entry.path}>
                            <button
                              className={`companion-entry-name file-item file-layout-${view.layout}`}
                              aria-label={entry.name}
                              title={entry.path}
                              {...dragHandlers(entry)}
                              onClick={() => props.onPreview(entry)}
                            >
                              <FileEntryContent
                                entry={entry}
                                mode={pane.viewMode}
                                interactive={false}
                              />
                            </button>
                            <button
                              aria-label={`Ajouter ${entry.name} à la collecte`}
                              title={
                                stash.some((item) => item.path === entry.path)
                                  ? "Déjà dans la collecte"
                                  : "Ajouter à la collecte"
                              }
                              disabled={stash.some(
                                (item) => item.path === entry.path,
                              )}
                              onClick={() => void props.onCollect([entry])}
                            >
                              {stash.some(
                                (item) => item.path === entry.path,
                              ) ? (
                                <Check size={18} />
                              ) : (
                                <Plus size={18} />
                              )}
                            </button>
                          </div>
                        ))
                      )}
                      {documents.length > 200 && (
                        <p>
                          200 fichiers affichés. Affinez la recherche pour
                          retrouver les suivants.
                        </p>
                      )}
                    </section>
                  </>
                )}
              </div>
              <details className="companion-disclosure">
                <summary>Organiser ce dossier</summary>
                <div className="companion-disclosure-content companion-tools">
                  <button onClick={() => props.onFolderAction("tags")}>
                    Tags du dossier…
                  </button>
                  <button onClick={() => props.onFolderAction("appearance")}>
                    Personnaliser le dossier…
                  </button>
                </div>
              </details>
            </section>
          )}

          {mode === "page" && (
            <section
              className="companion-content"
              aria-label="Capturer depuis la page"
            >
              <div className="companion-page">
                <h1 title={page?.title}>
                  {page?.title || "Aucune page web ouverte"}
                </h1>
                <p title={page?.url}>
                  {page
                    ? new URL(page.url).hostname
                    : "Ouvrez un site dans cette fenêtre pour garder une page ou un extrait."}
                </p>
              </div>
              <button
                className="primary companion-primary"
                disabled={!page || busy}
                onClick={() => {
                  if (page)
                    void perform(async () => {
                      if (
                        !(await props.onCollect([
                          collectedLink(page.url, page.title),
                        ]))
                      )
                        throw new Error(
                          "Le lien n’a pas pu être ajouté à la collecte.",
                        );
                    }, "Page ajoutée à la collecte");
                }}
              >
                <Plus size={18} /> Garder cette page
              </button>
              <button
                className="companion-action"
                disabled={!page || busy || !!props.pendingCapture}
                onClick={() => {
                  if (page) void perform(() => captureSelection(page));
                }}
              >
                <TextSelect size={18} /> Capturer la sélection
              </button>
              <div
                className={"companion-drop" + (!hello ? " disabled" : "")}
                onDragOver={(event) => {
                  if (hello) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (hello) props.onDrop(event, pane.path);
                  else event.preventDefault();
                }}
              >
                <Download size={20} aria-hidden="true" />
                <span>
                  <strong>Déposer depuis la page</strong>
                  <small>Image, lien ou texte</small>
                </span>
              </div>
              <details className="companion-disclosure">
                <summary>
                  <MoreHorizontal size={18} aria-hidden="true" /> Plus d’actions
                </summary>
                <div className="companion-disclosure-content companion-tools">
                  <button
                    disabled={!page || !hello || busy}
                    onClick={() => {
                      if (page) props.onCapturePage(page);
                    }}
                  >
                    <Download size={18} /> Enregistrer la page en PDF…
                  </button>
                  <button
                    disabled={!page || !hello || busy}
                    onClick={() => {
                      if (page) props.onCaptureLink(page.url);
                    }}
                  >
                    <Link size={18} /> Enregistrer le lien dans le dossier…
                  </button>
                  <button onClick={props.onDownloads}>
                    <Download size={18} /> Ranger les téléchargements…
                  </button>
                  <button
                    disabled={!page || !hello}
                    onClick={() => {
                      if (page) props.onPrepare(page);
                    }}
                  >
                    <SlidersHorizontal size={18} /> Préparer des images pour le
                    web…
                  </button>
                  <button disabled={!hello} onClick={props.onNote}>
                    <Plus size={18} /> Écrire une note…
                  </button>
                </div>
              </details>
            </section>
          )}

          {mode === "collection" && (
            <section
              className="companion-content companion-collection"
              aria-label="Collecte du projet"
            >
              <div className="companion-section-heading">
                <h2>
                  {stash.length
                    ? `${stash.length} élément${stash.length > 1 ? "s" : ""} gardé${stash.length > 1 ? "s" : ""}`
                    : "Votre collecte est vide"}
                </h2>
                <button title="Examiner la collecte" onClick={props.onReview}>
                  Gérer
                </button>
              </div>
              {stash.length ? (
                <>
                  <Help>
                    {nativeDrag
                      ? "Glissez vos fichiers sur le site. Les liens restent ici."
                      : "Vos fichiers et références restent ici entre les pages."}
                  </Help>
                  <div className="companion-collection-files">
                    {stash.map((entry) => (
                      <div className="companion-entry" key={entry.path}>
                        <button
                          className="companion-entry-name"
                          title={entry.path}
                          {...(entry.type === "file"
                            ? dragHandlers(entry)
                            : {})}
                          disabled={!hello && entry.type !== "web"}
                          onClick={() => props.onPreview(entry)}
                        >
                          {entry.type === "web" ? (
                            <Link size={20} />
                          ) : (
                            <FileIcon entry={entry} />
                          )}
                          <span>
                            <strong>{entry.name}</strong>
                            <small>
                              {entry.type === "web"
                                ? "Lien web"
                                : entry.type === "directory"
                                  ? "Dossier"
                                  : size(entry.size)}
                            </small>
                          </span>
                        </button>
                        <button
                          aria-label={`Retirer ${entry.name} de la collecte`}
                          title="Retirer de la collecte"
                          onClick={() => props.onRemove(entry.path)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="companion-empty">
                  <Layers size={28} aria-hidden="true" />
                  <p>
                    Gardez des fichiers avec le + ou des pages depuis la vue
                    Page. Retrouvez-les ici au fil de votre navigation.
                  </p>
                  <button
                    className="companion-action"
                    onClick={() => setMode("files")}
                  >
                    Choisir des fichiers
                  </button>
                </div>
              )}

              <details className="companion-disclosure companion-insert">
                <summary>
                  <Send size={18} aria-hidden="true" /> Insérer dans un
                  formulaire
                </summary>
                <div className="companion-disclosure-content">
                  <p>
                    Choisissez les fichiers et le champ de la page. Vous gardez
                    la validation finale du formulaire.
                  </p>
                  <p>
                    Page cible :{" "}
                    <strong>{page?.title || "Aucune page web ouverte"}</strong>
                    {page && (
                      <>
                        <br />
                        {new URL(page.url).hostname}
                      </>
                    )}
                  </p>
                  {!files.length && (
                    <p>Ajoutez d’abord un fichier à la collecte avec le +.</p>
                  )}
                  <div className="companion-send-files">
                    {files.map((entry) => (
                      <label key={entry.path}>
                        <input
                          type="checkbox"
                          checked={!excluded.includes(entry.path)}
                          onChange={(event) =>
                            setExcluded((old) =>
                              event.target.checked
                                ? old.filter((path) => path !== entry.path)
                                : [...old, entry.path],
                            )
                          }
                        />
                        <span>
                          <strong>{entry.name}</strong>
                          <small>{size(entry.size)}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <small>
                    20 fichiers et 20 Mo au total maximum. Dossiers, liens web
                    et liens symboliques restent dans la collecte.
                  </small>
                  <button
                    className="companion-action"
                    disabled={!page || busy}
                    onClick={() => {
                      if (page)
                        void perform(async () => {
                          const result = await inspectUploads(page);
                          if (
                            pageRef.current?.id !== page.id ||
                            pageRef.current?.url !== page.url
                          )
                            throw new Error(
                              "La page a changé. Recommencez l’analyse.",
                            );
                          setUpload(result);
                          setFieldIndex(
                            result.fields.find((field) => !field.disabled)
                              ?.index || 0,
                          );
                          if (!result.fields.length)
                            throw new Error(
                              "Aucun champ de fichier accessible sur cette page. Les formulaires intégrés peuvent nécessiter le sélecteur du site.",
                            );
                        });
                    }}
                  >
                    <RefreshCw size={18} /> Repérer les champs de la page
                  </button>
                  {upload && upload.fields.length > 0 && (
                    <>
                      <label>
                        Champ de destination
                        <select
                          aria-label="Champ de destination"
                          value={fieldIndex}
                          onChange={(event) =>
                            setFieldIndex(Number(event.target.value))
                          }
                        >
                          {upload.fields.map((field) => (
                            <option
                              key={field.index}
                              value={field.index}
                              disabled={field.disabled}
                            >
                              {field.label}
                              {field.disabled ? " (désactivé)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field && (
                        <p>
                          {field.multiple
                            ? "Plusieurs fichiers acceptés"
                            : "Un seul fichier accepté"}{" "}
                          · Formats :{" "}
                          {field.accept || "non précisés par la page"}
                        </p>
                      )}
                      {insertionIssue && (
                        <p aria-live="polite">{insertionIssue}</p>
                      )}
                      {!!selectedImages.length && field && (
                        <>
                          <button
                            className="companion-action"
                            disabled={!hello || busy || !canPrepareForField}
                            onClick={() =>
                              props.onPrepare(upload.page, selectedImages, {
                                ...upload,
                                field,
                              })
                            }
                          >
                            Préparer les images pour ce champ…
                          </button>
                          {!canPrepareForField && (
                            <small>
                              Aucun format de copie JPEG, PNG ou WebP accepté
                              par ce champ.
                            </small>
                          )}
                        </>
                      )}
                      <button
                        className="primary companion-primary"
                        disabled={!hello || busy || !field || !!insertionIssue}
                        onClick={() => {
                          if (field)
                            void perform(
                              () =>
                                sendFiles(
                                  selected.map((entry) => entry.path),
                                  { ...upload, field },
                                ),
                              "Fichiers insérés dans le champ choisi. Vérifiez le formulaire avant de le valider.",
                            );
                        }}
                      >
                        <Send size={18} /> Insérer {selected.length} fichier(s)
                      </button>
                    </>
                  )}
                </div>
              </details>
              <InsertionHistory />
            </section>
          )}
        </div>
      </div>

      {message && (
        <div
          className={"companion-message" + (message.error ? " error" : "")}
          role={message.error ? "alert" : "status"}
        >
          <span>{message.text}</span>
          <button
            aria-label="Fermer le message du panneau"
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {folderPicker && hello && (
        <FolderPicker
          hello={hello}
          path={pane.path}
          favorites={props.favorites}
          showHidden={props.showHidden}
          onChoose={(path) => {
            props.onNavigate(path);
            setFolderPicker(false);
          }}
          onClose={() => setFolderPicker(false)}
        />
      )}
    </section>
  );
}
