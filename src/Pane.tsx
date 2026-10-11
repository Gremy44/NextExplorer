import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
} from "lucide-react";
import { bridge } from "./bridge";
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
    ],
  },
  {
    label: "Transformer",
    actions: [
      ["convert", "Convertir…", "", FileCog],
      ["zip", "Créer une archive ZIP", "", Archive],
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
};
export function Pane({
  pane,
  active,
  onActive,
  onChange,
  onNavigate,
  onOpenTab,
  onPreview,
  onAction,
  onDrop,
  links,
  onPin,
  showHidden,
  refresh,
}: {
  pane: PaneState;
  active: boolean;
  onActive: () => void;
  onChange: (p: Partial<PaneState>) => void;
  onNavigate: (path: string) => void;
  onOpenTab: (path: string) => void;
  onPreview: (entry: Entry) => void;
  onAction: (action: string) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  links: Quicklink[];
  onPin: (link?: Quicklink) => void;
  showHidden: boolean;
  refresh: () => void;
}) {
  const [address, setAddress] = useState(pane.path);
  const [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<Entry[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    entry: Entry;
  } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const contextMenu = useRef<HTMLDivElement>(null);
  const anchor = useRef(0);
  const rows = pane.listing?.entries || [];
  const [width, setWidth] = useState(0);
  const view = fileView(pane.viewMode);
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
  }, [menu]);
  function navigate(path: string) {
    if (path === pane.path) return;
    onChange({ history: [...pane.history, pane.path].slice(-50) });
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
          onClick={() => {
            const p = pane.history.at(-1);
            onChange({ history: pane.history.slice(0, -1) });
            if (p) onNavigate(p);
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          title="Dossier parent"
          disabled={!pane.listing?.parentPath}
          onClick={() => navigate(pane.listing!.parentPath!)}
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
      <div className="file-toolbar">
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
      {pane.viewMode === "details" && (
        <div className="table-head">
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
          <button
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
          <button
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
        </div>
      )}
      <div
        ref={scroll}
        className="file-scroll"
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
                        onClick={(e) => select(entry, v.index * columns + k, e)}
                        onAuxClick={(e) => {
                          if (e.button === 1 && entry.type === "directory") {
                            e.preventDefault();
                            onOpenTab(entry.path);
                          }
                        }}
                        onDoubleClick={() =>
                          entry.type === "directory"
                            ? navigate(entry.path)
                            : onPreview(entry)
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
                        <FileEntryContent entry={entry} mode={pane.viewMode} />
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
                "button",
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
          {contextActionGroups.map((group, index) => (
            <div key={group.label}>
              {index > 0 && (
                <div className="context-separator" role="separator" />
              )}
              <div role="group" aria-label={group.label}>
                <div className="context-group-label" aria-hidden="true">
                  {group.label}
                </div>
                {index === 0 && menu.entry.type === "directory" && (
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
                {group.actions.map(([action, label, shortcut, Icon]) => (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={action === "trash" ? "context-trash" : undefined}
                    aria-label={label}
                    onClick={() => {
                      setMenu(null);
                      scroll.current?.focus();
                      onAction(action);
                    }}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {shortcut && <kbd aria-hidden="true">{shortcut}</kbd>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
