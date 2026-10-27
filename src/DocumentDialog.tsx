import { useEffect, useRef, useState } from "react";
import { Save, X, History, Pencil, Search } from "lucide-react";
import DOMPurify from "dompurify";
import { bridge } from "./bridge";
import { mediaType, size, type Entry } from "./types";

type Revision = { id: string; date: string; size: number };
type Document = { text: string; hash: string; entry: Entry };
export function DocumentDialog({
  entry,
  initial,
  onClose,
  onSaved,
}: {
  entry: Entry;
  initial: "edit" | "versions";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState(initial),
    [document, setDocument] = useState<Document | null>(null),
    [draft, setDraft] = useState("");
  const [versions, setVersions] = useState<Revision[]>([]),
    [selected, setSelected] = useState(""),
    [versionText, setVersionText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [html, setHTML] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null),
    paint = useRef<HTMLPreElement>(null),
    lines = useRef<HTMLDivElement>(null),
    box = useRef<HTMLElement>(null);
  const dirty = !!document && draft !== document.text;
  const close = () => {
    if (
      !busy &&
      (!dirty || confirm("Abandonner les modifications non enregistrées ?"))
    )
      onClose();
  };
  async function load() {
    const value = await bridge.request<Document>("EDITOR_READ", {
      path: entry.path,
    });
    setDocument(value);
    setDraft(value.text);
  }
  async function refresh() {
    setVersions(
      await bridge.request<Revision[]>("FILE_VERSIONS", { path: entry.path }),
    );
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!document) return;
    await perform(async () => {
      await bridge.request("EDITOR_SAVE", {
        path: entry.path,
        expected: document.entry,
        snapshot: document.hash,
        text: draft,
      });
      await load();
      onSaved();
      setMessage("Enregistré. La version précédente est conservée.");
    });
  }
  useEffect(() => {
    void perform(async () => {
      await refresh();
      if (initial === "edit") await load();
    });
  }, [entry.path]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement;
    box.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const worker = new Worker(new URL("./preview-worker.ts", import.meta.url), {
      type: "module",
    });
    setHTML("");
    const timer = setTimeout(() => worker.terminate(), 3000);
    worker.onmessage = (event: MessageEvent<string | null>) => {
      clearTimeout(timer);
      if (event.data)
        setHTML(
          DOMPurify.sanitize(event.data, {
            ALLOWED_TAGS: ["span"],
            ALLOWED_ATTR: ["class"],
          }),
        );
      worker.terminate();
    };
    const debounce = setTimeout(
      () => worker.postMessage({ text: draft, markdown: false }),
      150,
    );
    return () => {
      clearTimeout(debounce);
      clearTimeout(timer);
      worker.terminate();
    };
  }, [draft]);
  return (
    <div className="overlay">
      <section
        className="modal wide document-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Document : ${entry.name}`}
        ref={box}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();
            if (!busy && dirty) void save();
          }
          if (event.key === "Tab") {
            const items = Array.from(
              box.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input,textarea,select,[tabindex="0"]',
              ),
            ).filter((x) => x.offsetParent !== null);
            const first = items[0],
              last = items.at(-1);
            if (event.shiftKey && window.document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (
              !event.shiftKey &&
              window.document.activeElement === last
            ) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <strong>
            {entry.name}
            {dirty ? " •" : ""}
          </strong>
          <button
            aria-label="Fermer le document"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <div className="document-tabs" role="group" aria-label="Outil document">
          {mediaType(entry) === "text" && (
            <button
              aria-pressed={tab === "edit"}
              disabled={busy}
              onClick={() => {
                setTab("edit");
                if (!document) void perform(load);
              }}
            >
              <Pencil size={16} />
              Modifier
            </button>
          )}
          <button
            aria-pressed={tab === "versions"}
            disabled={busy}
            onClick={() => {
              setTab("versions");
              void perform(refresh);
            }}
          >
            <History size={16} />
            Versions
          </button>
        </div>
        <div className="modal-content">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {tab === "edit" ? (
            <>
              <p className="muted">
                Texte UTF-8 · 128 Kio maximum · une version est conservée avant
                chaque modification.
              </p>
              <div className="document-search">
                <Search size={16} />
                <input
                  aria-label="Rechercher dans le texte"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  disabled={!query || !document}
                  onClick={() => {
                    const area = textarea.current;
                    if (!area) return;
                    const start = draft
                      .toLocaleLowerCase()
                      .indexOf(query.toLocaleLowerCase(), area.selectionEnd);
                    const index =
                      start >= 0
                        ? start
                        : draft
                            .toLocaleLowerCase()
                            .indexOf(query.toLocaleLowerCase());
                    if (index < 0) {
                      setMessage("Aucune occurrence");
                      return;
                    }
                    area.focus();
                    area.setSelectionRange(index, index + query.length);
                    area.scrollTop =
                      draft.slice(0, index).split("\n").length * 21 - 80;
                  }}
                >
                  Suivant
                </button>
              </div>
              <div className="text-editor">
                <div className="editor-lines" ref={lines} aria-hidden="true">
                  {draft.split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div className="editor-code">
                  <pre ref={paint} aria-hidden="true">
                    {html ? (
                      <code dangerouslySetInnerHTML={{ __html: html + "\n" }} />
                    ) : (
                      draft + "\n"
                    )}
                  </pre>
                  <textarea
                    ref={textarea}
                    aria-label="Contenu du fichier"
                    value={draft}
                    disabled={busy || !document}
                    spellCheck={false}
                    wrap="off"
                    onChange={(e) => setDraft(e.target.value)}
                    onScroll={(e) => {
                      if (paint.current) {
                        paint.current.scrollTop = e.currentTarget.scrollTop;
                        paint.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                      if (lines.current)
                        lines.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                  />
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty ||
                    confirm(
                      "Abandonner les modifications et relire le fichier ?",
                    )
                  )
                    void perform(load);
                }}
              >
                Recharger depuis le disque
              </button>
            </>
          ) : (
            <>
              <p>
                Versions locales de ce chemin : 20 maximum, 16 Mio par fichier,
                256 Mio au total. Les changements externes ne créent pas de
                version. Restaurer crée une copie à côté du fichier.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const expected = await bridge.request<Entry>("FS_STAT", {
                      path: entry.path,
                    });
                    await bridge.request("FILE_VERSION_CREATE", {
                      path: entry.path,
                      expected,
                    });
                    await refresh();
                    setMessage("Version conservée");
                  })
                }
              >
                Conserver la version actuelle
              </button>
              {!versions.length && <p>Aucune version enregistrée.</p>}
              {versions.map((v) => (
                <article className="version-row" key={v.id}>
                  <span>
                    {new Date(v.date).toLocaleString("fr-FR")} · {size(v.size)}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const result = await bridge.request<{ text: string }>(
                          "FILE_VERSION_READ",
                          { path: entry.path, name: v.id },
                        );
                        setVersionText(result.text);
                        setSelected(v.id);
                      })
                    }
                  >
                    Voir
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const result = await bridge.request<{ path: string }>(
                          "FILE_VERSION_RESTORE",
                          { path: entry.path, name: v.id },
                        );
                        setMessage(`Copie restaurée : ${result.path}`);
                        onSaved();
                      })
                    }
                  >
                    Restaurer une copie
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Supprimer définitivement cette version sauvegardée ? Le fichier actuel reste intact.",
                        )
                      )
                        void perform(async () => {
                          await bridge.request("FILE_VERSION_DELETE", {
                            path: entry.path,
                            name: v.id,
                          });
                          if (selected === v.id) setVersionText(null);
                          await refresh();
                        });
                    }}
                  >
                    Supprimer
                  </button>
                </article>
              ))}
              {versionText !== null && (
                <pre
                  className="version-content"
                  aria-label="Contenu de la version"
                >
                  {versionText}
                </pre>
              )}
            </>
          )}
        </div>
        <footer>
          <button disabled={busy} onClick={close}>
            {dirty ? "Annuler / fermer" : "Fermer"}
          </button>
          {tab === "edit" && (
            <button
              className="primary"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              <Save size={16} />
              {busy ? "En cours…" : "Enregistrer"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
