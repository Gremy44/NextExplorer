import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Folder,
  HardDrive,
  Home,
  Search,
  Star,
  X,
} from "lucide-react";
import { bridge } from "./bridge";
import { FileIcon } from "./Preview";
import { pathBreadcrumbs, type Hello, type Listing } from "./types";

export function FolderPath({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const scroll = useRef<HTMLElement>(null);
  const trail = pathBreadcrumbs(path);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const revealCurrent = () => {
      element.scrollTop = element.scrollHeight;
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [path]);
  return (
    <nav
      className="companion-folder-path"
      aria-label="Chemin du dossier"
      title={path}
      ref={scroll}
    >
      {trail.map((part, index) => (
        <span key={part.path}>
          {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {index === trail.length - 1 ? (
            <span
              className="companion-path-current"
              aria-current="location"
              title={part.path}
            >
              {part.name}
            </span>
          ) : (
            <button title={part.path} onClick={() => onNavigate(part.path)}>
              <span>{part.name}</span>
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

export function FolderPicker({
  hello,
  path,
  favorites,
  showHidden = false,
  onChoose,
  onClose,
}: {
  hello: Hello;
  path: string;
  favorites: { name: string; path: string }[];
  showHidden?: boolean;
  onChoose: (path: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useState(path || hello.home);
  const [address, setAddress] = useState(location);
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<{
    path: string;
    filter: string;
    listing: Listing | null;
    error: string;
  } | null>(null);
  const current = result?.path === location && result.filter === filter;
  const listing = current ? result.listing : null;
  const error = current ? result.error : "";
  const folders =
    listing?.entries.filter((entry) => entry.type === "directory") || [];

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [location]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void bridge
        .request<Listing>(
          "FS_LIST_DIR",
          {
            path: location,
            filter,
            sortBy: "name",
            sortOrder: "asc",
            showHidden,
            limit: 500,
          },
          30000,
        )
        .then(
          (listing) => {
            if (live) setResult({ path: location, filter, listing, error: "" });
          },
          (error: Error) => {
            if (live)
              setResult({
                path: location,
                filter,
                listing: null,
                error: error.message,
              });
          },
        );
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [location, filter, showHidden]);

  function browse(path: string) {
    if (path !== location) setHistory((old) => [...old, location].slice(-50));
    setLocation(path);
    setAddress(path);
    setFilter("");
  }
  function back() {
    const path = history.at(-1);
    if (!path) return;
    setHistory((old) => old.slice(0, -1));
    setLocation(path);
    setAddress(path);
    setFilter("");
  }
  function close() {
    dialog.current?.close();
    onClose();
  }

  const shortcuts = [
    { name: "Mes fichiers", path: hello.home, icon: Home },
    { name: "Documents", path: hello.aliases["~docs"], icon: Folder },
    { name: "Bureau", path: hello.aliases["~desk"], icon: Folder },
    { name: "Téléchargements", path: hello.aliases["~dl"], icon: Folder },
  ].filter((shortcut) => shortcut.path);

  return (
    <dialog
      ref={dialog}
      className="companion-folder-picker"
      aria-labelledby="folder-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.altKey && event.key === "ArrowLeft") {
          event.preventDefault();
          back();
        }
        if (event.altKey && event.key === "ArrowUp" && listing?.parentPath) {
          event.preventDefault();
          browse(listing.parentPath);
        }
      }}
    >
      <header>
        <h2 id="folder-picker-title">Choisir un dossier</h2>
        <button aria-label="Fermer le choix du dossier" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="companion-picker-body" ref={body}>
        <nav
          className="companion-picker-shortcuts"
          aria-label="Emplacements courants"
        >
          {shortcuts.map(({ name, path, icon: Icon }) => (
            <button key={name} title={path} onClick={() => browse(path)}>
              <Icon size={18} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        {(favorites.length > 0 || hello.roots.length > 0) && (
          <details className="companion-disclosure">
            <summary>Favoris et disques</summary>
            <nav
              className="companion-picker-shortcuts"
              aria-label="Favoris et disques"
            >
              {[
                ...favorites.map((folder) => ({ ...folder, icon: Star })),
                ...hello.roots.map((folder) => ({
                  ...folder,
                  icon: HardDrive,
                })),
              ].map(({ name, path, icon: Icon }, index) => (
                <button
                  key={`${path}-${index}`}
                  title={path}
                  onClick={() => browse(path)}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                </button>
              ))}
            </nav>
          </details>
        )}
        <div className="companion-picker-location">
          <button
            aria-label="Dossier précédent"
            title="Dossier précédent · Alt + ←"
            disabled={!history.length}
            onClick={back}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label="Dossier parent"
            title="Remonter d’un dossier"
            disabled={!listing?.parentPath}
            onClick={() => {
              if (listing?.parentPath) browse(listing.parentPath);
            }}
          >
            <ArrowUp size={18} />
          </button>
          <FolderPath
            path={listing?.currentPath || location}
            onNavigate={browse}
          />
        </div>
        <label className="companion-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Rechercher un sous-dossier"
            placeholder="Rechercher un sous-dossier…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <div
          className="companion-picker-folders"
          aria-label="Sous-dossiers disponibles"
          aria-busy={!current}
        >
          {!current ? (
            <p role="status">Chargement des dossiers…</p>
          ) : error ? (
            <div className="companion-picker-error" role="alert">
              <p>
                Ce dossier n’est pas accessible. Choisissez un autre
                emplacement.
              </p>
              <details className="companion-disclosure">
                <summary>Détails de l’erreur</summary>
                <div className="companion-disclosure-content">
                  <p className="error">{error}</p>
                </div>
              </details>
            </div>
          ) : !folders.length ? (
            <p>
              {filter
                ? "Aucun dossier correspondant."
                : "Aucun sous-dossier. Vous pouvez choisir ce dossier."}
            </p>
          ) : (
            folders.slice(0, 200).map((folder) => (
              <button
                key={folder.path}
                aria-label={`Ouvrir le dossier ${folder.name}`}
                title={folder.path}
                onClick={() => browse(folder.path)}
              >
                <FileIcon entry={folder} size={20} />
                <span>{folder.name}</span>
                <ChevronRight size={16} />
              </button>
            ))
          )}
          {folders.length > 200 && (
            <p>200 dossiers affichés. Affinez la recherche.</p>
          )}
        </div>
        <details className="companion-disclosure">
          <summary>Saisir un chemin</summary>
          <form
            className="companion-disclosure-content"
            onSubmit={(event) => {
              event.preventDefault();
              browse(address.trim());
            }}
          >
            <label>
              Chemin du dossier
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
              />
            </label>
            <button className="companion-action" disabled={!address.trim()}>
              Ouvrir ce dossier
            </button>
          </form>
        </details>
      </div>
      <footer>
        <button onClick={close}>Annuler</button>
        <button
          className="primary"
          disabled={!listing || !!error}
          onClick={() => {
            if (listing) {
              dialog.current?.close();
              onChoose(listing.currentPath);
            }
          }}
        >
          Choisir ce dossier
        </button>
      </footer>
    </dialog>
  );
}
