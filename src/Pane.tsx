import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useId,
  Fragment,
  type CSSProperties,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { conversionKind } from "./media-conversion";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  RefreshCw,
  Search,
  FolderPlus,
  Star,
  Link as LinkIcon,
  Plus,
  ArrowDown,
  Eye,
  ExternalLink,
  Copy,
  Scissors,
  Pencil,
  ListOrdered,
  FileCog,
  Archive,
  ArchiveRestore,
  Fingerprint,
  Trash2,
  Tags,
  Palette,
  WandSparkles,
  SlidersHorizontal,
} from "lucide-react";
import { DRIVES_PATH } from "./disk-space";
import { DrivesView } from "./DrivesView";
import { bridge } from "./bridge";
import { useOrganization } from "./OrganizationContext";
import { orderFiles } from "./file-order";
import { fileKey } from "./file-families";
import { TagColors } from "./TagPicker";
import { saveSelectionTags } from "./tag-selection";
import { toggleColorTag, type FinderColor } from "./tags";
import { DirectoryColumns } from "./DirectoryColumns";
import { FileIcon } from "./Preview";
import {
  FileEntryContent,
  FileViewMenu,
  FileSortMenu,
  fileView,
  type ViewMode,
} from "./FileView";
import {
  basename,
  size,
  type Entry,
  type Listing,
  type Quicklink,
  safeURL,
} from "./types";

const contextActionGroups = [
  {
    label: "Ouvrir",
    actions: [
      ["preview", "Aperçu", "Espace", Eye],
      ["open", "Ouvrir dans l’application", "", ExternalLink],
    ],
  },
  {
    label: "Organiser",
    actions: [
      ["stash", "Ajouter à la collecte", "", Plus],
      ["copy", "Copier", "Ctrl+C", Copy],
      ["cut", "Couper", "Ctrl+X", Scissors],
      ["rename", "Renommer", "F2", Pencil],
      ["batch", "Renommer par lot", "", ListOrdered],
      ["tags", "Tags…", "", Tags],
      ["appearance", "Personnaliser les dossiers…", "", Palette],
    ],
  },
  {
    label: "Transformer",
    actions: [
      ["convert", "Convertir…", "", FileCog],
      ["quick", "Actions rapides…", "", WandSparkles],
      ["zip", "Créer une archive", "", Archive],
      ["extract", "Extraire une archive…", "", ArchiveRestore],
    ],
  },
  {
    label: "Vérifier",
    actions: [["hash", "Calculer une empreinte", "", Fingerprint]],
  },
  {
    label: "Supprimer",
    actions: [["trash", "Mettre à la corbeille", "Suppr", Trash2]],
  },
] as const;

export type PaneState = {
  path: string;
  history: string[];
  listing: Listing | null;
  selected: Entry[];
  filter: string;
  sortBy: string;
  sortOrder: string;
  viewMode: ViewMode;
  loading: boolean;
  scrollTop?: number;
  selectionPaths?: string[];
};
export function Pane({
  pane,
  active,
  onActive,
  onChange,
  onNavigate,
  onBack,
  onOpenTab,
  onPreview,
  onAction,
  onDrop,
  links,
  onPin,
  showHidden,
  refresh,
  onRefreshVolumes,
}: {
  pane: PaneState;
  active: boolean;
  onActive: () => void;
  onChange: (p: Partial<PaneState>) => void;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onOpenTab: (path: string) => void;
  onPreview: (entry: Entry) => void;
  onAction: (action: string) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  links: Quicklink[];
  onPin: (link?: Quicklink) => void;
  showHidden: boolean;
  refresh: () => void;
  onRefreshVolumes: () => void;
}) {
  const [address, setAddress] = useState(pane.path);
  const [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<Entry[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    entry: Entry;
  } | null>(null);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const contextMenu = useRef<HTMLDivElement>(null);
  const anchor = useRef(0);
  const { preferences, tags, sizes } = useOrganization();
  const [tagFilter, setTagFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [minimum, setMinimum] = useState("");
  const [after, setAfter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const filtersButton = useRef<HTMLButtonElement>(null);
  const filterCount = [tagFilter, kindFilter, minimum, after].filter(
    Boolean,
  ).length;
  async function applyColorTag(color: FinderColor) {
    if (tagBusy) return;
    const selection = [...pane.selected];
    setTagBusy(true);
    setTagError("");
    try {
      await saveSelectionTags(selection, (value) =>
        toggleColorTag(
          value,
          selection.map((entry) => entry.path),
          color,
        ),
      );
      setMenu(null);
      scroll.current?.focus();
    } catch (error) {
      setTagError((error as Error).message);
    } finally {
      setTagBusy(false);
    }
  }
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rows = useMemo(
    () =>
      orderFiles(
        (pane.listing?.entries || []).filter(
          (entry) =>
            (!tagFilter ||
              tags.files[fileKey(entry.path)]?.includes(tagFilter)) &&
            (!kindFilter ||
              (kindFilter === "directory"
                ? entry.type === "directory"
                : entry.type === "file")) &&
            (!minimum ||
              (entry.type === "file" &&
                entry.size >= Number(minimum) * 1024 * 1024)) &&
            (!after || entry.mtime >= Date.parse(after) / 1000),
        ),
        pane.sortBy,
        pane.sortOrder,
        preferences.foldersFirst,
        sizes,
        tags,
      ),
    [
      pane.listing,
      pane.sortBy,
      pane.sortOrder,
      preferences.foldersFirst,
      sizes,
      tags,
      tagFilter,
      kindFilter,
      minimum,
      after,
    ],
  );
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    if (!pane.loading && scroll.current)
      scroll.current.scrollTop = pane.scrollTop || 0;
  }, [pane.path, pane.loading]);
  const [width, setWidth] = useState(0);
  const view = fileView(pane.viewMode);
  const visibleColumns = preferences.columns
    .filter((key) => width >= 700 || key !== "tags")
    .filter((key) => width >= 540 || key !== "type")
    .filter((key) => width >= 460 || key !== "mtime");
  const columns = view.width
    ? Math.max(1, Math.floor((width || 500) / view.width))
    : 1;
  const virtual = useVirtualizer({
    count: Math.ceil(rows.length / columns),
    getScrollElement: () => scroll.current,
    estimateSize: () => view.height,
    overscan: 8,
  });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(scroll.current!);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    virtual.measure();
    const index = rows.findIndex(
      (entry) => entry.path === pane.selected.at(-1)?.path,
    );
    virtual.scrollToIndex(index < 0 ? 0 : Math.floor(index / columns));
  }, [pane.viewMode, columns]);
  useEffect(() => {
    setAddress(pane.path);
  }, [pane.path]);
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      const i = Math.max(address.lastIndexOf("/"), address.lastIndexOf("\\"));
      if (i < 0) return;
      const dir = address.slice(0, i + 1);
      bridge
        .request<Listing>("FS_LIST_DIR", {
          path: dir,
          filter: address.slice(i + 1),
          showHidden,
          limit: 50,
        })
        .then((r) =>
          setSuggestions(
            r.entries.filter((e) => e.type === "directory").slice(0, 8),
          ),
        )
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [address, editing, showHidden]);
  useEffect(() => {
    const close = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !contextMenu.current?.contains(event.target)
      )
        setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
    };
  }, []);
  useLayoutEffect(() => {
    if (!menu || !contextMenu.current) return;
    const element = contextMenu.current;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu, tagError]);
  useEffect(() => {
    setTagError("");
  }, [menu]);
  function navigate(path: string) {
    if (path === pane.path) return;
    onNavigate(path);
  }
  function select(e: Entry, index: number, event: React.MouseEvent) {
    if (event.shiftKey) {
      onChange({
        selected: rows.slice(
          Math.min(index, anchor.current),
          Math.max(index, anchor.current) + 1,
        ),
      });
    } else if (event.ctrlKey || event.metaKey) {
      onChange({
        selected: pane.selected.some((s) => s.path === e.path)
          ? pane.selected.filter((s) => s.path !== e.path)
          : [...pane.selected, e],
      });
      anchor.current = index;
    } else {
      onChange({ selected: [e] });
      anchor.current = index;
    }
  }
  const parts = pane.path.split(/[\\/]/).filter(Boolean);
  const separator = pane.path.includes("\\") ? "\\" : "/";
  if (pane.path === DRIVES_PATH)
    return (
      <section
        className={"pane " + (active ? "active" : "")}
        onPointerDown={onActive}
        aria-label="Ce PC"
      >
        <div className="pathbar">
          <button
            title="Précédent"
            disabled={!pane.history.length}
            onClick={onBack}
          >
            <ArrowLeft size={17} />
          </button>
          <strong>Ce PC</strong>
        </div>
        <DrivesView onNavigate={onNavigate} onRefresh={onRefreshVolumes} />
      </section>
    );
  return (
    <section
      className={"pane " + (active ? "active" : "")}
      data-view={pane.viewMode}
      onPointerDown={onActive}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
      }}
      onDrop={(e) => onDrop(e, pane.path)}
      aria-label={active ? "Dossier actif" : "Second dossier"}
    >
      <div className="pathbar">
        <button
          title="Précédent"
          disabled={!pane.history.length}
          onClick={onBack}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          title="Dossier parent"
          disabled={!pane.listing}
          onClick={() =>
            pane.listing && navigate(pane.listing.parentPath || DRIVES_PATH)
          }
        >
          <ArrowUp size={17} />
        </button>
        <div className="address">
          {editing ? (
            <>
              <input
                autoFocus
                aria-label="Chemin du dossier"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    navigate(address);
                    setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <div className="suggestions">
                {suggestions.map((e) => (
                  <button
                    key={e.path}
                    onClick={() => {
                      navigate(e.path);
                      setEditing(false);
                    }}
                  >
                    <FileIcon entry={e} />
                    {e.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="breadcrumbs" onDoubleClick={() => setEditing(true)}>
              <button
                onClick={() =>
                  navigate(separator === "/" ? "/" : parts[0] + "\\")
                }
              >
                {separator === "/" ? "/" : parts[0]}
              </button>
              {parts.slice(separator === "/" ? 0 : 1).map((part, i) => (
                <span key={i}>
                  <ChevronRight size={12} />
                  <button
                    onClick={() =>
                      navigate(
                        (separator === "/" ? "/" : "") +
                          parts
                            .slice(0, i + (separator === "/" ? 1 : 2))
                            .join(separator),
                      )
                    }
                  >
                    {part}
                  </button>
                </span>
              ))}
              <button
                className="edit-path"
                title="Saisir un chemin"
                onClick={() => setEditing(true)}
              >
                …
              </button>
            </div>
          )}
        </div>
        <button title="Actualiser" onClick={refresh}>
          <RefreshCw size={15} className={pane.loading ? "spin" : ""} />
        </button>
      </div>
      <div className="folder-heading">
        <div>
          <span className="muted">Dossier local</span>
          <h1>{basename(pane.path) || "Explorateur"}</h1>
        </div>
        <button
          title="Ajouter aux favoris"
          onClick={() => onAction("favorite")}
        >
          <Star size={17} />
        </button>
      </div>
      <div className="quicklinks">
        <LinkIcon size={12} />
        {links.length ? (
          links.map((l) => (
            <a
              key={l.url}
              href={safeURL(l.url) || "#"}
              target="_blank"
              rel="noreferrer"
              onContextMenu={(e) => {
                e.preventDefault();
                onPin(l);
              }}
            >
              {l.title}
            </a>
          ))
        ) : (
          <span>Les liens de votre projet, à portée de main</span>
        )}
        <button title="Épingler un lien" onClick={() => onPin()}>
          <Plus size={13} />
        </button>
      </div>
      {pane.listing?.truncated && (
        <p role="status" className="listing-limit">
          Liste partielle : limite de 10 000 résultats, 8 Mio de métadonnées ou
          200 000 noms parcourus. Affinez le filtre par nom.
        </p>
      )}
      <div className="file-toolbar">
        <button
          ref={filtersButton}
          type="button"
          className={
            "organization-filter-toggle" +
            (filtersOpen || filterCount ? " toggled" : "")
          }
          aria-label="Filtres et organisation"
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          aria-describedby={filterCount ? `${filtersId}-count` : undefined}
          title="Filtres et organisation"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={17} />
          {filterCount > 0 && (
            <span
              id={`${filtersId}-count`}
              className="organization-filter-count"
              aria-label={`${filterCount} filtres actifs`}
            >
              {filterCount}
            </span>
          )}
        </button>
        <label className="filter">
          <Search size={15} />
          <input
            aria-label="Filtrer ce dossier"
            placeholder="Filtrer ce dossier…"
            value={pane.filter}
            onChange={(e) => onChange({ filter: e.target.value })}
          />
          <kbd>/</kbd>
        </label>
        <button title="Nouveau dossier" onClick={() => onAction("mkdir")}>
          <FolderPlus size={17} />
        </button>
        <FileViewMenu
          value={pane.viewMode}
          onChange={(viewMode) => onChange({ viewMode })}
        />
        <FileSortMenu
          sortBy={pane.sortBy}
          sortOrder={pane.sortOrder}
          onChange={onChange}
        />
      </div>
      <section
        id={filtersId}
        className="organization-pane-filters"
        aria-label="Filtres et organisation"
        hidden={!filtersOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setFiltersOpen(false);
            filtersButton.current?.focus();
          }
        }}
      >
        <div className="organization-filters">
          <label>
            Type
            <select
              aria-label="Type d’élément"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <option value="">Tout</option>
              <option value="directory">Dossiers</option>
              <option value="file">Fichiers</option>
            </select>
          </label>
          <label>
            Tag
            <select
              aria-label="Tag du dossier"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">Tous</option>
              {tags.labels.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Taille minimale (Mio)
            <input
              type="number"
              min={0}
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </label>
          <label>
            Modifié depuis
            <input
              type="date"
              value={after}
              onChange={(event) => setAfter(event.target.value)}
            />
          </label>
        </div>
        <div className="organization-actions">
          <button
            type="button"
            onClick={() => {
              setTagFilter("");
              setKindFilter("");
              setMinimum("");
              setAfter("");
            }}
          >
            Effacer les filtres
          </button>
          <button type="button" onClick={() => onAction("tag-picker")}>
            Tags de la sélection
          </button>
          <button type="button" onClick={() => onAction("scan")}>
            Calculer les tailles des dossiers
          </button>
          <button type="button" onClick={() => onAction("search")}>
            Recherche indexée…
          </button>
        </div>
      </section>
      {pane.viewMode === "columns" && (
        <DirectoryColumns
          path={pane.path}
          onNavigate={navigate}
          hidden={showHidden}
        />
      )}
      {pane.viewMode === "details" && (
        <div
          className="table-head custom-columns"
          style={{
            gridTemplateColumns: `minmax(0,1fr) ${visibleColumns.map((key) => (key === "mtime" ? preferences.dateWidth + "px" : key === "size" ? preferences.sizeWidth + "px" : key === "type" ? "90px" : "160px")).join(" ")}`,
          }}
        >
          <button
            onClick={() =>
              onChange({
                sortBy: "name",
                sortOrder:
                  pane.sortBy === "name" && pane.sortOrder === "asc"
                    ? "desc"
                    : "asc",
              })
            }
          >
            Nom{" "}
            {pane.sortBy === "name" &&
              (pane.sortOrder === "asc" ? (
                <ArrowUp size={12} />
              ) : (
                <ArrowDown size={12} />
              ))}
          </button>
          {visibleColumns.includes("mtime") && (
            <button
              className="detail-date"
              onClick={() =>
                onChange({
                  sortBy: "mtime",
                  sortOrder:
                    pane.sortBy === "mtime" && pane.sortOrder === "asc"
                      ? "desc"
                      : "asc",
                })
              }
            >
              Modifié{" "}
              {pane.sortBy === "mtime" &&
                (pane.sortOrder === "asc" ? (
                  <ArrowUp size={12} />
                ) : (
                  <ArrowDown size={12} />
                ))}
            </button>
          )}
          {visibleColumns.includes("size") && (
            <button
              className="detail-size"
              onClick={() =>
                onChange({
                  sortBy: "size",
                  sortOrder:
                    pane.sortBy === "size" && pane.sortOrder === "asc"
                      ? "desc"
                      : "asc",
                })
              }
            >
              Taille{" "}
              {pane.sortBy === "size" &&
                (pane.sortOrder === "asc" ? (
                  <ArrowUp size={12} />
                ) : (
                  <ArrowDown size={12} />
                ))}
            </button>
          )}
          {visibleColumns.includes("type") && (
            <button
              onClick={() => onChange({ sortBy: "type", sortOrder: "asc" })}
            >
              Type
            </button>
          )}
          {visibleColumns.includes("tags") && (
            <button
              onClick={() => onChange({ sortBy: "tags", sortOrder: "asc" })}
            >
              Tags
            </button>
          )}
        </div>
      )}
      <div
        ref={scroll}
        className="file-scroll"
        onScroll={(event) =>
          onChange({ scrollTop: event.currentTarget.scrollTop })
        }
        tabIndex={0}
        onKeyDown={(e) => {
          if (!rows.length || e.altKey || e.ctrlKey || e.metaKey) return;
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            const entry = pane.selected.at(-1);
            if (!entry) return;
            e.preventDefault();
            e.stopPropagation();
            const target = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                '[role="option"]',
              ),
            ].find((element) => element.title === entry.path);
            const box = (target || e.currentTarget).getBoundingClientRect();
            setMenu({ x: box.left + 8, y: box.bottom, entry });
            return;
          }
          const index = Math.max(
            0,
            rows.findIndex((r) => r.path === pane.selected.at(-1)?.path),
          );
          if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) ||
            (columns > 1 && ["ArrowLeft", "ArrowRight"].includes(e.key))
          ) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? rows.length - 1
                  : Math.min(
                      rows.length - 1,
                      Math.max(
                        0,
                        index +
                          (e.key === "ArrowDown"
                            ? columns
                            : e.key === "ArrowUp"
                              ? -columns
                              : e.key === "ArrowRight"
                                ? 1
                                : -1),
                      ),
                    );
            onChange({
              selected: e.shiftKey
                ? rows.slice(
                    Math.min(anchor.current, next),
                    Math.max(anchor.current, next) + 1,
                  )
                : [rows[next]],
            });
            if (!e.shiftKey) anchor.current = next;
            virtual.scrollToIndex(Math.floor(next / columns));
          }
          if (e.key === "Enter" && pane.selected.length === 1) {
            const entry = pane.selected[0];
            entry.type === "directory"
              ? navigate(entry.path)
              : onPreview(entry);
          }
        }}
      >
        {!rows.length ? (
          <div className="empty">
            <FolderPlus size={36} />
            <h3>
              {pane.loading
                ? "Lecture du dossier…"
                : pane.filter
                  ? "Aucun résultat"
                  : "Ce dossier est vide"}
            </h3>
            <p>
              {pane.filter
                ? "Essayez un autre nom."
                : "Déposez des fichiers, du texte ou un lien ici."}
            </p>
            {!pane.filter && !pane.loading && (
              <button onClick={() => onAction("mkdir")}>
                Créer un dossier
              </button>
            )}
          </div>
        ) : (
          <div
            style={{ height: virtual.getTotalSize(), position: "relative" }}
            role="listbox"
            aria-label="Fichiers"
            aria-multiselectable="true"
          >
            {virtual.getVirtualItems().map((v) => (
              <div
                key={v.key}
                className="file-view-row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                  gridTemplateColumns: `repeat(${columns},1fr)`,
                }}
              >
                {rows
                  .slice(v.index * columns, (v.index + 1) * columns)
                  .map((entry, k) => {
                    const selected = pane.selected.some(
                      (s) => s.path === entry.path,
                    );
                    return (
                      <div
                        key={entry.path}
                        role="option"
                        aria-label={entry.name}
                        aria-description={
                          entry.type === "directory"
                            ? "Dossier"
                            : size(entry.size)
                        }
                        aria-selected={selected}
                        className={
                          `file-item file-layout-${view.layout}` +
                          (view.layout === "details" ? " file-row" : "") +
                          (selected ? " selected" : "")
                        }
                        style={
                          {
                            "--file-icon-size": `${view.iconSize}px`,
                            ...(pane.viewMode === "details"
                              ? {
                                  gridTemplateColumns: `minmax(0,1fr) ${visibleColumns.map((key) => (key === "mtime" ? preferences.dateWidth + "px" : key === "size" ? preferences.sizeWidth + "px" : key === "type" ? "90px" : "160px")).join(" ")}`,
                                }
                              : {}),
                          } as CSSProperties
                        }
                        draggable
                        onDragStart={(e) => {
                          const paths = selected
                            ? pane.selected.map((s) => s.path)
                            : [entry.path];
                          e.dataTransfer.setData(
                            "application/x-nextexplorer",
                            JSON.stringify(paths),
                          );
                          e.dataTransfer.setData(
                            "text/plain",
                            paths.join("\n"),
                          );
                          e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onDragOver={(e) => {
                          if (entry.type === "directory") {
                            e.preventDefault();
                            e.currentTarget.classList.add("drop-target");
                          }
                        }}
                        onDragLeave={(e) =>
                          e.currentTarget.classList.remove("drop-target")
                        }
                        onDrop={(e) => {
                          e.currentTarget.classList.remove("drop-target");
                          if (entry.type === "directory") {
                            e.stopPropagation();
                            onDrop(e, entry.path);
                          }
                        }}
                        onPointerEnter={() => {
                          if (preferences.hoverSelect)
                            hoverTimer.current = setTimeout(
                              () => onChange({ selected: [entry] }),
                              600,
                            );
                        }}
                        onPointerLeave={() => {
                          if (hoverTimer.current)
                            clearTimeout(hoverTimer.current);
                        }}
                        onClick={(e) => {
                          select(entry, v.index * columns + k, e);
                          if (
                            preferences.singleClick &&
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.shiftKey
                          )
                            entry.type === "directory"
                              ? navigate(entry.path)
                              : onPreview(entry);
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1 && entry.type === "directory") {
                            e.preventDefault();
                            onOpenTab(entry.path);
                          }
                        }}
                        onDoubleClick={() =>
                          !preferences.singleClick &&
                          (entry.type === "directory"
                            ? navigate(entry.path)
                            : onPreview(entry))
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!selected) onChange({ selected: [entry] });
                          setMenu({
                            x: e.clientX,
                            y: e.clientY,
                            entry,
                          });
                        }}
                        title={entry.path}
                      >
                        {preferences.checkboxes && (
                          <input
                            className="file-checkbox"
                            aria-label={`Sélectionner ${entry.name}`}
                            type="checkbox"
                            checked={selected}
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange({
                                selected: selected
                                  ? pane.selected.filter(
                                      (item) => item.path !== entry.path,
                                    )
                                  : [...pane.selected, entry],
                              });
                            }}
                            readOnly
                          />
                        )}
                        <FileEntryContent
                          entry={entry}
                          mode={pane.viewMode}
                          customDetails
                          detailColumns={visibleColumns}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="pane-footer">
        <span>
          {pane.listing?.total || 0} éléments
          {pane.selected.length > 0 &&
            ` · ${pane.selected.length} sélectionné(s)`}
        </span>
        <span>
          {size(
            rows
              .filter((e) => e.type === "file")
              .reduce((n, e) => n + e.size, 0),
          )}
        </span>
      </footer>
      {menu && (
        <div
          ref={contextMenu}
          className="context-menu"
          role="menu"
          aria-label="Actions sur les fichiers"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (
              ((event.ctrlKey || event.metaKey || event.altKey) &&
                !["Control", "Meta", "Alt"].includes(event.key)) ||
              ["F2", "F5", "Delete"].includes(event.key)
            ) {
              setMenu(null);
              scroll.current?.focus();
              return;
            }
            event.stopPropagation();
            if (event.key === "Escape" || event.key === "Tab") {
              if (event.key === "Escape") event.preventDefault();
              setMenu(null);
              scroll.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          {contextActionGroups
            .filter((group) =>
              group.actions.some(
                ([action]) => !preferences.hiddenActions.includes(action),
              ),
            )
            .map((group, index) => (
              <div key={group.label}>
                {index > 0 && (
                  <div className="context-separator" role="separator" />
                )}
                <div role="group" aria-label={group.label}>
                  <div className="context-group-label" aria-hidden="true">
                    {group.label}
                  </div>
                  {group.label === "Ouvrir" &&
                    menu.entry.type === "directory" && (
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                          setMenu(null);
                          onOpenTab(menu.entry.path);
                        }}
                      >
                        <FolderPlus size={18} aria-hidden="true" />
                        <span>Ouvrir dans un nouvel onglet</span>
                      </button>
                    )}
                  {group.actions
                    .filter(
                      ([action]) => !preferences.hiddenActions.includes(action),
                    )
                    .map(([action, label, shortcut, Icon]) => (
                      <Fragment key={action}>
                        {action === "tags" && (
                          <>
                            <TagColors
                              selection={pane.selected}
                              menu
                              busy={tagBusy}
                              onColor={(color) => void applyColorTag(color)}
                            />
                            {tagError && (
                              <p
                                className="context-tag-error error"
                                role="alert"
                              >
                                {tagError}
                              </p>
                            )}
                          </>
                        )}
                        <button
                          disabled={
                            (action === "convert" &&
                              !pane.selected.some((entry) =>
                                conversionKind(entry),
                              )) ||
                            (action === "appearance" &&
                              (!pane.selected.length ||
                                pane.selected.some(
                                  (entry) => entry.type !== "directory",
                                )))
                          }
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          className={
                            action === "trash" ? "context-trash" : undefined
                          }
                          aria-label={label}
                          onClick={() => {
                            setMenu(null);
                            scroll.current?.focus();
                            onAction(action === "tags" ? "tag-picker" : action);
                          }}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>{label}</span>
                          {preferences.shortcuts[action] && (
                            <kbd aria-hidden="true">
                              {preferences.shortcuts[action]}
                            </kbd>
                          )}
                        </button>
                      </Fragment>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
