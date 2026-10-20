import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  FolderOpen,
  RotateCcw,
  RotateCw,
  Play,
} from "lucide-react";
import { bridge } from "./bridge";
import { FolderPicker } from "./FolderPicker";
import {
  documentWorker,
  imageDocument,
  readDocument,
  saveDocument,
} from "./document-files";
import { MarkupEditor, type MarkupResult } from "./MarkupEditor";
import {
  documentFile,
  quickActions,
  validTrim,
  type QuickAction,
} from "./quick-actions";
import { type DocumentSource } from "./document-operations";
import { type Entry, type Hello } from "./types";
import { sameFamilyFile } from "./file-families";

export function QuickActionDialog({
  action,
  entries,
  destination: initialDestination,
  hello,
  favorites,
  onClose,
  onComplete,
  onJob,
  onBusy,
}: {
  action: QuickAction;
  entries: Entry[];
  destination: string;
  hello: Hello | null;
  favorites: { name: string; path: string }[];
  onClose: () => void;
  onComplete: () => void;
  onJob: (jobId: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const source = entries[0],
    pdf = !!source && /\.pdf$/i.test(source.name);
  const [files, setFiles] = useState(entries),
    [destination, setDestination] = useState(initialDestination),
    [picker, setPicker] = useState(false);
  const [name, setName] = useState(
    action === "pdf-create"
      ? "Selection.pdf"
      : `${source?.name.replace(/\.[^.]+$/, "") || "Document"}-annote.${pdf ? "pdf" : "png"}`,
  );
  const [data, setData] = useState<Uint8Array | null>(null),
    [loading, setLoading] = useState(
      action === "annotate" || action === "trim",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [angle, setAngle] = useState(-90),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [duration, setDuration] = useState(0),
    [mediaURL, setMediaURL] = useState("");
  const [exporter, setExporter] = useState<
      (() => Promise<MarkupResult>) | null
    >(null),
    [progress, setProgress] = useState("");
  const [writing, setWriting] = useState(false);
  const controller = useRef(new AbortController()),
    video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null),
    rangePlaying = useRef(false);
  const allowed = quickActions(files, hello).find((item) => item.id === action);
  useEffect(() => {
    const task = new AbortController();
    controller.current = task;
    let token = "",
      live = true;
    void (async () => {
      try {
        if (!source) throw new Error("Sélectionnez un fichier compatible");
        if (action === "annotate") {
          const loaded = pdf
            ? await readDocument(source, task.signal)
            : await imageDocument(source, task.signal);
          if (live) setData(loaded.data);
        }
        if (action === "trim") {
          const info = await bridge.request<{
            duration: number;
            kind: string;
            expected: Entry;
          }>("QUICK_MEDIA_INFO", { path: source.path }, 20000);
          if (!sameFamilyFile(source, info.expected))
            throw new Error("Le média a changé : actualisez le dossier");
          task.signal.throwIfAborted();
          const media = await bridge.request<{ url: string; token: string }>(
            "MEDIA_OPEN",
            { path: source.path, expected: info.expected },
          );
          token = media.token;
          if (!live) {
            void bridge.request("MEDIA_CLOSE", { name: token }).catch(() => {});
            return;
          }
          setMediaURL(media.url);
          setDuration(info.duration);
          setEnd(info.duration);
        }
      } catch (error) {
        if (live) setError((error as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
      task.abort();
      if (token)
        void bridge.request("MEDIA_CLOSE", { name: token }).catch(() => {});
    };
  }, []);
  function reorder(index: number, offset: number) {
    setFiles((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  async function save() {
    setBusy(true);
    onBusy(true);
    setError("");
    setProgress("");
    try {
      if (!allowed || allowed.disabled)
        throw new Error(
          allowed?.reason || "Sélection incompatible avec cette action",
        );
      const directory = await bridge.request<Entry>(
        "FS_STAT",
        { path: destination },
        5000,
      );
      if (directory.type !== "directory")
        throw new Error("Choisissez un dossier de destination");
      for (const entry of files) {
        const actual = await bridge.request<Entry>(
          "FS_STAT",
          { path: entry.path },
          5000,
        );
        if (
          !sameFamilyFile(entry, actual) ||
          actual.type !== "file" ||
          (entry.stamp && actual.stamp !== entry.stamp)
        )
          throw new Error("La sélection a changé : actualisez les fichiers");
      }
      if (action === "rotate" || action === "trim") {
        if (action === "trim" && !validTrim(start, end, duration))
          throw new Error(
            "Choisissez un intervalle dans le média, de 1 heure maximum",
          );
        const result = await bridge.request<{ jobId: string }>("QUICK_ACTION", {
          mode: action,
          paths: files.map((e) => e.path),
          destination,
          angle,
          startSeconds: start,
          endSeconds: end,
        });
        onJob(result.jobId);
        onClose();
        return;
      }
      if (
        !name.trim() ||
        /[\\/:\x00-\x1f]/.test(name) ||
        name !== name.trim() ||
        !name
          .toLowerCase()
          .endsWith(action === "annotate" && !pdf ? ".png" : ".pdf")
      )
        throw new Error("Choisissez un nom de copie avec l’extension indiquée");
      let output: Uint8Array;
      if (action === "pdf-create") {
        if (
          !files.length ||
          files.length > 20 ||
          files.some((e) => !documentFile(e)) ||
          files.reduce((n, e) => n + e.size, 0) > 64 * 1024 * 1024
        )
          throw new Error("20 fichiers et 64 Mio maximum par sélection");
        const sources: DocumentSource[] = [];
        let total = 0;
        for (const [index, entry] of files.entries()) {
          setProgress(`Préparation ${index + 1}/${files.length}…`);
          const isPDF = /\.pdf$/i.test(entry.name),
            loaded = isPDF
              ? await readDocument(entry, controller.current.signal)
              : await imageDocument(entry, controller.current.signal);
          total += loaded.data.length;
          if (total > 64 * 1024 * 1024)
            throw new Error(
              "Images préparées et PDF limités à 64 Mio au total",
            );
          sources.push({
            name: entry.name,
            kind: isPDF ? "pdf" : "image",
            data: loaded.data,
          });
        }
        setProgress("Assemblage du PDF…");
        output = await documentWorker(
          "combine",
          sources,
          [],
          controller.current.signal,
        );
      } else {
        if (!exporter || !data)
          throw new Error("Attendez la préparation de la page");
        const marked = await exporter();
        output =
          marked.image ||
          (await documentWorker(
            "annotate",
            [{ name: source.name, kind: "pdf", data }],
            marked.overlays,
            controller.current.signal,
          ));
      }
      controller.current.signal.throwIfAborted();
      for (const entry of files) {
        const current = await bridge.request<Entry>(
          "FS_STAT",
          { path: entry.path },
          5000,
        );
        if (
          !sameFamilyFile(current, entry) ||
          (entry.stamp && current.stamp !== entry.stamp)
        )
          throw new Error("Un original a changé : copie non enregistrée");
      }
      setProgress("Enregistrement de la copie…");
      setWriting(true);
      await saveDocument(destination, name, output);
      onComplete();
      onClose();
    } catch (error) {
      if (!controller.current.signal.aborted)
        setError((error as Error).message);
    } finally {
      setBusy(false);
      setWriting(false);
      onBusy(false);
      setProgress("");
    }
  }
  const media = () => video.current || audio.current;
  const audioOnly =
    source && /\.(mp3|flac|wav|ogg|opus|m4a|aac)$/i.test(source.name);
  return (
    <section
      className="organization-dialog quick-action-dialog"
      aria-busy={busy}
    >
      <p>
        {files.length} fichier(s) · Une nouvelle copie est créée. Les originaux
        sont conservés.
      </p>
      {!allowed && (
        <p role="alert">
          Cette action n’est pas disponible pour cette sélection.
        </p>
      )}
      {action === "rotate" && (
        <>
          <div
            className="organization-actions"
            role="group"
            aria-label="Sens de rotation"
          >
            <button
              type="button"
              aria-pressed={angle === -90}
              onClick={() => setAngle(-90)}
            >
              <RotateCcw size={20} />À gauche
            </button>
            <button
              type="button"
              aria-pressed={angle === 90}
              onClick={() => setAngle(90)}
            >
              <RotateCw size={20} />À droite
            </button>
          </div>
          <p className="muted">
            Images : copie PNG, première image des GIF/TIFF multipages. Vidéos :
            copie MP4 H.264/AAC. Le traitement apparaît dans l’activité.
          </p>
        </>
      )}
      {loading && <p role="status">Préparation de l’outil…</p>}
      {action === "annotate" && data && (
        <MarkupEditor
          data={data}
          kind={pdf ? "pdf" : "image"}
          onReady={(fn) => setExporter(() => fn)}
          onError={setError}
        />
      )}
      {action === "pdf-create" && (
        <>
          <p className="muted">
            Images PNG/JPEG/WebP/GIF/BMP et PDF : 20 fichiers, 32 Mio par
            fichier, 64 Mio au total et 100 pages maximum. Images fixes ; PDF
            protégés ou avec champ de signature refusés.
          </p>
          <ol className="pdf-source-list">
            {files.map((entry, index) => (
              <li key={entry.path}>
                <span>{entry.name}</span>
                <button
                  type="button"
                  aria-label={`Monter ${entry.name}`}
                  disabled={busy || index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${entry.name}`}
                  disabled={busy || index === files.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      {action === "trim" && mediaURL && (
        <>
          <div className="trim-player">
            {audioOnly ? (
              <audio
                ref={audio}
                src={mediaURL}
                controls
                onTimeUpdate={() => {
                  if (rangePlaying.current && media()!.currentTime >= end) {
                    media()!.pause();
                    rangePlaying.current = false;
                  }
                }}
              />
            ) : (
              <video
                ref={video}
                src={mediaURL}
                controls
                onTimeUpdate={() => {
                  if (rangePlaying.current && media()!.currentTime >= end) {
                    media()!.pause();
                    rangePlaying.current = false;
                  }
                }}
              />
            )}
          </div>
          <div className="organization-filters">
            <label>
              Début (secondes)
              <input
                type="number"
                aria-label="Début de l’extrait"
                min={0}
                max={duration}
                step={0.1}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
              <input
                type="range"
                aria-label="Poignée de début"
                min={0}
                max={duration}
                step={0.1}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <label>
              Fin (secondes)
              <input
                type="number"
                aria-label="Fin de l’extrait"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
              <input
                type="range"
                aria-label="Poignée de fin"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
          </div>
          <p>
            {Math.max(0, end - start).toLocaleString("fr-FR", {
              maximumFractionDigits: 2,
            })}{" "}
            s retenues sur{" "}
            {duration.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s
          </p>
          <div className="organization-actions">
            <button
              type="button"
              disabled={!validTrim(start, end, duration)}
              onClick={() => {
                const player = media();
                if (player) {
                  player.currentTime = start;
                  rangePlaying.current = true;
                  void player
                    .play()
                    .catch(() =>
                      setError("Lecture impossible avec les codecs de Chrome"),
                    );
                }
              }}
            >
              <Play size={16} />
              Lire l’extrait
            </button>
            <button
              type="button"
              onClick={() => {
                setStart(0);
                setEnd(duration);
              }}
            >
              Rétablir la durée
            </button>
          </div>
          <p className="muted">
            Copie MP4 H.264/AAC pour la vidéo, M4A/AAC pour l’audio. Extrait
            limité à une heure ; les pistes secondaires, sous-titres et
            métadonnées sont exclus.
          </p>
        </>
      )}
      {action !== "rotate" && action !== "trim" && (
        <label className="field">
          Nom de la copie
          <input
            aria-label="Nom de la copie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={180}
          />
        </label>
      )}
      <label className="field">
        Dossier de destination
        <input
          aria-label="Destination de l’action rapide"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </label>
      <button type="button" onClick={() => setPicker((p) => !p)}>
        <FolderOpen size={16} />
        Choisir un dossier
      </button>
      {picker && hello && (
        <FolderPicker
          hello={hello}
          favorites={favorites}
          path={destination}
          showHidden={false}
          onClose={() => setPicker(false)}
          onChoose={(path) => {
            setDestination(path);
            setPicker(false);
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      <div className="organization-actions quick-action-footer">
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            loading ||
            !allowed ||
            allowed.disabled ||
            (action === "annotate" && !exporter) ||
            (action === "trim" && !validTrim(start, end, duration))
          }
          onClick={() => void save()}
        >
          {action === "pdf-create" ? "Créer le PDF" : "Créer la copie"}
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        {busy &&
          !writing &&
          (action === "pdf-create" || action === "annotate") && (
            <button
              type="button"
              onClick={() => {
                controller.current.abort();
                onBusy(false);
                onClose();
              }}
            >
              Arrêter le traitement
            </button>
          )}
      </div>
    </section>
  );
}
