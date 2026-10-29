import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Folder, File, Download } from "lucide-react";
import { bridge } from "./bridge";
import { size, type Entry } from "./types";
import { mimes } from "./file-mime";
type Member = { name: string; size: number; directory: boolean };
export function archiveChildren(entries: Member[], folder: string) {
  const rows = new Map<string, Member>();
  for (const entry of entries) {
    if (!entry.name.startsWith(folder)) continue;
    const relative = entry.name.slice(folder.length);
    if (!relative) continue;
    const slash = relative.indexOf("/");
    const name =
      folder + (slash >= 0 ? relative.slice(0, slash + 1) : relative);
    if (!rows.has(name))
      rows.set(name, slash >= 0 ? { name, directory: true, size: 0 } : entry);
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(b.directory) - Number(a.directory) ||
      a.name.localeCompare(b.name, "fr"),
  );
}
export function ArchiveBrowser({
  entry,
  onExtract,
}: {
  entry: Entry;
  onExtract?: (members: string[], expected: Entry) => void;
}) {
  const generation = useRef(0);
  const [stopped, setStopped] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [entries, setEntries] = useState<Member[]>([]),
    [expected, setExpected] = useState<Entry | null>(null),
    [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<{
      name: string;
      text?: string;
      image?: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    generation.current++;
    let live = true;
    setBusy(true);
    setError("");
    setEntries([]);
    setFolder("");
    setSelected([]);
    setPreview(null);
    if (stopped) {
      setBusy(false);
      return;
    }
    void (async () => {
      if (entry.size > 128 * 1024 * 1024)
        throw new Error(
          "Aperçu d’archive limité à 128 Mio. Utilisez l’outil d’extraction pour les archives plus grandes.",
        );
      const expected = await bridge.request<Entry>("FS_STAT", {
        path: entry.path,
      });
      const result = await bridge.request<{ entries: Member[] }>(
        "ARCHIVE_BROWSE",
        { path: entry.path, expected },
        20000,
      );
      if (live) {
        setExpected(expected);
        setEntries(result.entries);
      }
    })()
      .catch((e) => {
        if (live)
          setError(
            e.message.includes("inconnue")
              ? "Mettez à jour le compagnon pour parcourir les archives."
              : e.message,
          );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, [entry.path, entry.stamp, stopped, attempt]);
  async function open(member: Member) {
    const current = generation.current;
    if (member.directory) {
      setFolder(member.name);
      setSelected([]);
      setPreview(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ext = "." + member.name.split(".").at(-1)?.toLowerCase();
      if (
        !/\.(txt|md|markdown|csv|json|xml|log|html?|css|[cm]?js|tsx?|py|go|rs|ya?ml|ini|ps1|sh|png|jpe?g|gif|webp|bmp|avif)$/.test(
          ext,
        )
      )
        throw new Error(
          "Aperçu indisponible pour ce format. Extrayez le fichier pour l’ouvrir.",
        );
      const result = await bridge.request<{ data: string }>(
        "ARCHIVE_READ_MEMBER",
        { path: entry.path, name: member.name, expected },
        20000,
      );
      if (current !== generation.current) return;
      const image = /\.(png|jpe?g|gif|webp|bmp|avif)$/.test(ext);
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      if (!image && bytes.includes(0))
        throw new Error("Entrée binaire : extrayez-la pour l’ouvrir.");
      setPreview(
        image
          ? {
              name: member.name,
              image: `data:${mimes[ext]};base64,${result.data}`,
            }
          : {
              name: member.name,
              text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            },
      );
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const rows = archiveChildren(entries, folder);
  return (
    <section className="archive-browser" aria-label="Contenu de l’archive">
      <nav aria-label="Chemin dans l’archive">
        <button
          disabled={busy || (!folder && !preview)}
          title="Retour dans l’archive"
          onClick={() => {
            if (preview) setPreview(null);
            else {
              setFolder(folder.replace(/[^/]+\/$/, ""));
              setSelected([]);
            }
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setFolder("");
            setSelected([]);
            setPreview(null);
          }}
        >
          {entry.name}
        </button>
        <span>{preview?.name || folder}</span>
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <div className="preview-loading">
          <p role="status">Lecture de l’archive…</p>
          <button
            onClick={() => {
              generation.current++;
              setStopped(true);
              setBusy(false);
            }}
          >
            Arrêter l’aperçu
          </button>
        </div>
      )}
      {stopped && <p role="status">Aperçu arrêté.</p>}
      {(stopped || error) && (
        <button
          onClick={() => {
            setStopped(false);
            setAttempt((value) => value + 1);
          }}
        >
          Réessayer l’aperçu
        </button>
      )}
      {preview ? (
        <article className="archive-member-preview">
          {preview.image ? (
            <img src={preview.image} alt={preview.name} />
          ) : (
            <pre>{preview.text}</pre>
          )}
          <button
            disabled={busy || !expected || !onExtract}
            onClick={() => onExtract?.([preview.name], expected!)}
          >
            <Download size={16} />
            Extraire ce fichier…
          </button>
        </article>
      ) : (
        <>
          <div className="archive-actions">
            <label>
              <input
                type="checkbox"
                checked={
                  !!rows.length &&
                  rows.every((row) => selected.includes(row.name))
                }
                onChange={(event) =>
                  setSelected(
                    event.target.checked ? rows.map((row) => row.name) : [],
                  )
                }
              />
              Tout sélectionner dans ce dossier
            </label>
            <button
              disabled={busy || !selected.length || !onExtract || !expected}
              onClick={() => onExtract?.(selected, expected!)}
            >
              <Download size={16} />
              Extraire la sélection ({selected.length})…
            </button>
          </div>
          <div className="archive-members">
            {rows.map((member) => (
              <div key={member.name} className="archive-row">
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${member.name}`}
                  checked={selected.includes(member.name)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, member.name]
                        : old.filter((name) => name !== member.name),
                    )
                  }
                />
                <button disabled={busy} onClick={() => void open(member)}>
                  {member.directory ? <Folder size={18} /> : <File size={18} />}
                  <span>
                    {member.name.slice(folder.length).replace(/\/$/, "")}
                  </span>
                </button>
                <small>
                  {member.directory ? "Dossier" : size(member.size)}
                </small>
              </div>
            ))}
          </div>
          {!busy && !rows.length && !error && !stopped && (
            <p>Dossier vide dans l’archive.</p>
          )}
        </>
      )}
      <small>
        Lecture seule · ZIP, 7z/RAR selon moteur · 3 000 entrées, archive de 128
        Mio maximum ; aperçu par fichier limité à 512 Kio.
      </small>
    </section>
  );
}
