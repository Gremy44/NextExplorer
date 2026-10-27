import { Help } from "./Help";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  FolderOpen,
  RotateCcw,
  RotateCw,
  Play,
  Check,
  ChevronDown,
  FilePlus2,
  GripVertical,
  LoaderCircle,
  ShieldCheck,
  X,
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
  quickTime,
  reorderQuickFiles,
  type QuickTool,
} from "./quick-actions";
import { type DocumentSource } from "./document-operations";
import { type Entry, type Hello } from "./types";
import { sameFamilyFile } from "./file-families";
import { QuickActions } from "./QuickActions";
import { FileIcon } from "./Preview";
import { nativeThumbnail } from "./native-thumbnail";
import { conversionKind } from "./media-conversion";
import { basename, size } from "./types";
import { ConversionDialog } from "./ConversionDialog";
import { reveal } from "./motion";

export function QuickActionDialog({
  action: initialAction,
  entries: initialEntries,
  paths,
  initialFormat,
  destination: initialDestination,
  hello,
  favorites,
  onClose,
  onComplete,
  onJob,
  onBusy,
  onConvertStart,
}: {
  action: QuickTool;
  entries: Entry[];
  paths?: string[];
  initialFormat?: string;
  destination: string;
  hello: Hello | null;
  favorites: { name: string; path: string }[];
  onClose: () => void;
  onComplete: (path: string) => void;
  onJob: (jobId: string) => void;
  onBusy: (busy: boolean) => void;
  onConvertStart: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [action, setAction] = useState(initialAction);
  const [entries, setEntries] = useState(initialEntries);
  const [conversionPaths] = useState(
    () => paths || initialEntries.map((entry) => entry.path),
  );
  const [conversionOpened, setConversionOpened] = useState(
    initialAction === "convert",
  );
  const toolBody = useRef<HTMLDivElement>(null);
  useEffect(() => reveal(toolBody.current), [action]);
  const source = entries[0],
    pdf = !!source && /\.pdf$/i.test(source.name);
  const [orderedFiles, setFiles] = useState(entries),
    [destination, setDestination] = useState(initialDestination),
    [picker, setPicker] = useState(false);
  const files = action === "pdf-create" ? orderedFiles : entries;
  const [annotationName, setAnnotationName] = useState(
    `${source?.name.replace(/\.[^.]+$/, "") || "Document"}-annote.${pdf ? "pdf" : "png"}`,
  );
  const [pdfName, setPDFName] = useState(
    entries.length === 1
      ? `${source?.name.replace(/\.[^.]+$/, "") || "Document"}.pdf`
      : "Selection.pdf",
  );
  const name = action === "pdf-create" ? pdfName : annotationName;
  const setName = action === "pdf-create" ? setPDFName : setAnnotationName;
  const draggedFile = useRef<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [rotationURL, setRotationURL] = useState("");
  const [previewError, setPreviewError] = useState("");
  const previewEntry = files[Math.min(previewIndex, files.length - 1)];
  useEffect(() => {
    setRotationURL("");
    setPreviewError("");
    if (
      action !== "rotate" ||
      !previewEntry ||
      conversionKind(previewEntry) !== "image"
    )
      return;
    const task = new AbortController();
    nativeThumbnail(previewEntry, task.signal)
      .then((url) => {
        if (!task.signal.aborted) setRotationURL(url);
      })
      .catch((error) => {
        if (!task.signal.aborted) setPreviewError(error.message);
      });
    return () => task.abort();
  }, [action, previewEntry?.path, previewEntry?.stamp]);
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
    setLoading(action === "trim" || (action === "annotate" && !data));
    setMediaURL("");
    setError("");
    const mediaSource = action === "rotate" ? previewEntry : source;
    void (async () => {
      try {
        if (!source && action !== "convert")
          throw new Error("Sélectionnez un fichier compatible");
        if (action === "annotate" && !data) {
          const loaded = pdf
            ? await readDocument(source, task.signal)
            : await imageDocument(source, task.signal);
          if (live) setData(loaded.data);
        }
        if (
          action === "trim" ||
          (action === "rotate" && conversionKind(source) === "video")
        ) {
          const info =
            action === "trim"
              ? await bridge.request<{
                  duration: number;
                  kind: string;
                  expected: Entry;
                }>("QUICK_MEDIA_INFO", { path: mediaSource.path }, 20000)
              : { duration: 0, expected: mediaSource };
          if (!live) return;
          if (!sameFamilyFile(mediaSource, info.expected))
            throw new Error("Le média a changé : actualisez le dossier");
          task.signal.throwIfAborted();
          const media = await bridge.request<{ url: string; token: string }>(
            "MEDIA_OPEN",
            { path: mediaSource.path, expected: info.expected },
          );
          token = media.token;
          if (!live) {
            void bridge.request("MEDIA_CLOSE", { name: token }).catch(() => {});
            return;
          }
          setMediaURL(media.url);
          if (action === "trim") {
            setDuration(info.duration);
            setEnd((previous) =>
              previous > 0
                ? Math.min(previous, info.duration)
                : Math.min(info.duration, 3600),
            );
          }
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
  }, [action, action === "rotate" ? previewEntry?.path : undefined]);
  function reorder(index: number, offset: number) {
    setFiles((current) => reorderQuickFiles(current, index, index + offset));
  }
  async function save() {
    if (busy) return;
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
        { path: destination.trim() },
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
          destination: directory.path,
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
      const saved = await saveDocument(directory.path, name, output);
      if (saved?.complete !== true || typeof saved.path !== "string")
        throw new Error(
          "Enregistrement non confirmé : vérifiez le dossier de destination.",
        );
      onComplete(saved.path);
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
  const rotationVideo = !!source && conversionKind(source) === "video";
  const toolLabels = {
    rotate: "Faire pivoter",
    annotate: "Annoter",
    "pdf-create": "Créer un PDF",
    trim: "Raccourcir",
    convert: "Convertir",
  };
  const canSave =
    !busy &&
    !loading &&
    !!allowed &&
    !allowed.disabled &&
    (action !== "annotate" || !!exporter) &&
    (action !== "trim" || validTrim(start, end, duration));
  function changeAction(next: QuickTool) {
    media()?.pause();
    rangePlaying.current = false;
    setError("");
    setAction(next);
    if (next === "convert") setConversionOpened(true);
  }
  function playRange() {
    const player = media();
    if (!player) return;
    player.currentTime = start;
    rangePlaying.current = true;
    void player
      .play()
      .catch(() =>
        setPreviewError(
          "Lecture impossible avec les codecs de Chrome. L’extraction reste disponible.",
        ),
      );
  }
  function timeUpdate() {
    const player = media();
    if (rangePlaying.current && player && player.currentTime >= end) {
      player.pause();
      rangePlaying.current = false;
    }
  }
  return (
    <section className="quick-action-dialog" aria-busy={busy}>
      <QuickActions
        entries={entries}
        hello={hello}
        activeAction={action}
        busy={busy}
        onAction={changeAction}
        onConvert={() => changeAction("convert")}
      />
      <header className="quick-source">
        {source && <FileIcon entry={source} size={28} />}
        <div>
          <strong>
            {!files.length
              ? "Vérification de la sélection…"
              : files.length === 1
                ? files[0].name
                : `${files.length} fichiers sélectionnés`}
          </strong>
          <span>{toolLabels[action]}</span>
        </div>
        <span className="quick-safe">
          <ShieldCheck size={14} />
          Originaux conservés
        </span>
      </header>
      <div className="quick-tool-body" ref={toolBody} data-tool={action}>
        {conversionOpened && (
          <div className="quick-conversion" hidden={action !== "convert"}>
            <ConversionDialog
              paths={conversionPaths}
              destination={destination}
              initialFormat={initialFormat}
              hello={hello}
              favorites={favorites}
              onClose={onClose}
              onEntriesReady={
                initialEntries.length
                  ? undefined
                  : (resolved) => {
                      setEntries(resolved);
                      setFiles(resolved);
                      if (resolved[0]) {
                        const file = resolved[0],
                          isPDF = /\.pdf$/i.test(file.name);
                        setAnnotationName(
                          `${file.name.replace(/\.[^.]+$/, "")}-annote.${isPDF ? "pdf" : "png"}`,
                        );
                        setPDFName(
                          resolved.length === 1
                            ? `${file.name.replace(/\.[^.]+$/, "")}.pdf`
                            : "Selection.pdf",
                        );
                      }
                    }
              }
              onBusy={(value) => {
                setBusy(value);
                onBusy(value);
              }}
              onStart={onConvertStart}
            />
          </div>
        )}
        <div className="quick-workspace" hidden={action === "convert"}>
          <section className="quick-stage" aria-label="Espace de travail">
            {action === "rotate" && (
              <>
                <div
                  className="quick-rotation-stage"
                  aria-label="Aperçu de la rotation"
                >
                  {rotationVideo && mediaURL ? (
                    <video
                      ref={video}
                      src={mediaURL}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ transform: `rotate(${angle}deg)` }}
                      onError={() =>
                        setPreviewError(
                          "Ce codec ne permet pas l’aperçu dans Chrome.",
                        )
                      }
                    />
                  ) : rotationURL ? (
                    <img
                      src={rotationURL}
                      alt={`Aperçu de ${previewEntry.name}`}
                      style={{ transform: `rotate(${angle}deg)` }}
                    />
                  ) : (
                    <div className="quick-preview-placeholder">
                      {previewError ? (
                        <FileIcon entry={previewEntry || source} size={56} />
                      ) : (
                        <LoaderCircle className="spin" size={24} />
                      )}
                      <span>
                        {previewError
                          ? "Aperçu indisponible"
                          : "Préparation de l’aperçu…"}
                      </span>
                    </div>
                  )}
                  <span className="quick-angle">
                    {angle === 90 ? "90° à droite" : "90° à gauche"}
                  </span>
                </div>
                {files.length > 1 && (
                  <div
                    className="quick-file-strip"
                    aria-label="Fichiers de la sélection"
                  >
                    {files.map((file, index) => (
                      <button
                        key={file.path}
                        type="button"
                        disabled={busy}
                        aria-pressed={previewIndex === index}
                        onClick={() => setPreviewIndex(index)}
                      >
                        <FileIcon entry={file} size={16} />
                        <span>{file.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div hidden={action !== "annotate"} inert={busy}>
              {data && (
                <MarkupEditor
                  data={data}
                  kind={pdf ? "pdf" : "image"}
                  onReady={(fn) => setExporter(() => fn)}
                  onError={setError}
                />
              )}
            </div>
            {action === "pdf-create" && (
              <div className="quick-pdf-stack">
                <div className="quick-stage-heading">
                  <FilePlus2 size={18} />
                  <strong>Ordre du document</strong>
                  <Help>
                    Glissez les fichiers pour changer l’ordre, ou utilisez les
                    flèches. Les pages de chaque PDF sont conservées.
                  </Help>
                </div>
                <ol
                  className="pdf-source-list"
                  aria-label="Ordre des fichiers du PDF"
                >
                  {files.map((entry, index) => (
                    <li
                      key={entry.path}
                      draggable={!busy}
                      onDragStart={(event) => {
                        draggedFile.current = index;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-nextexplorer-pdf",
                          String(index),
                        );
                      }}
                      onDragOver={(event) => {
                        if (draggedFile.current !== null && !busy) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDrop={(event) => {
                        const from = draggedFile.current;
                        if (from === null || busy) return;
                        event.preventDefault();
                        setFiles((old) => reorderQuickFiles(old, from, index));
                        draggedFile.current = null;
                      }}
                      onDragEnd={() => {
                        draggedFile.current = null;
                      }}
                    >
                      <GripVertical size={15} className="quick-grip" />
                      <span className="quick-page-number">{index + 1}</span>
                      <FileIcon entry={entry} size={32} />
                      <span className="quick-document-name">
                        <strong>{entry.name}</strong>
                        <small>{size(entry.size)}</small>
                      </span>
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
                      <button
                        type="button"
                        aria-label={`Retirer ${entry.name} du PDF`}
                        disabled={busy || files.length === 1}
                        onClick={() =>
                          setFiles((old) =>
                            old.filter((file) => file.path !== entry.path),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {action === "trim" && mediaURL && (
              <div className="trim-player">
                {audioOnly ? (
                  <audio
                    ref={audio}
                    src={mediaURL}
                    controls
                    onTimeUpdate={timeUpdate}
                    onError={() =>
                      setPreviewError(
                        "Lecture impossible avec les codecs de Chrome. L’extraction reste disponible.",
                      )
                    }
                  />
                ) : (
                  <video
                    ref={video}
                    src={mediaURL}
                    controls
                    onTimeUpdate={timeUpdate}
                    onError={() =>
                      setPreviewError(
                        "Lecture impossible avec les codecs de Chrome. L’extraction reste disponible.",
                      )
                    }
                  />
                )}
              </div>
            )}
            {loading && (
              <p className="quick-loading" role="status">
                <LoaderCircle className="spin" size={18} />
                Préparation de l’outil…
              </p>
            )}
            {previewError && (
              <p className="quick-preview-note" role="status">
                {previewError}
              </p>
            )}
          </section>
          <fieldset
            className="quick-controls"
            disabled={busy}
            aria-label="Réglages de l’action"
          >
            {action === "rotate" && (
              <>
                <h3>Sens de rotation</h3>
                <div
                  className="quick-rotation-controls"
                  role="group"
                  aria-label="Sens de rotation"
                >
                  <button
                    type="button"
                    aria-pressed={angle === -90}
                    onClick={() => setAngle(-90)}
                  >
                    <RotateCcw size={24} />
                    <span>À gauche</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={angle === 90}
                    onClick={() => setAngle(90)}
                  >
                    <RotateCw size={24} />
                    <span>À droite</span>
                  </button>
                </div>
                <p className="quick-output-format">
                  {rotationVideo ? "Copie MP4 · H.264 / AAC" : "Copie PNG"}
                  {files.length > 1 ? ` · ${files.length} fichiers` : ""}
                </p>
                {!rotationVideo && (
                  <small>
                    GIF et TIFF multipages : première image uniquement.
                  </small>
                )}
              </>
            )}
            {action === "trim" && (
              <>
                <h3>Extrait à conserver</h3>
                <div className="quick-trim-duration">
                  <strong>{quickTime(Math.max(0, end - start))}</strong>
                  <span>sur {quickTime(duration)}</span>
                </div>
                <div className="quick-trim-fields">
                  <label className="field">
                    Début (s)
                    <input
                      type="number"
                      aria-label="Début de l’extrait"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={start}
                      onChange={(event) => {
                        rangePlaying.current = false;
                        setStart(Number(event.target.value));
                      }}
                    />
                  </label>
                  <label className="field">
                    Fin (s)
                    <input
                      type="number"
                      aria-label="Fin de l’extrait"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={end}
                      onChange={(event) => {
                        rangePlaying.current = false;
                        setEnd(Number(event.target.value));
                      }}
                    />
                  </label>
                </div>
                <label className="quick-range-label">
                  Début · {quickTime(start)}
                  <input
                    type="range"
                    aria-label="Poignée de début"
                    min={0}
                    max={duration || 1}
                    disabled={loading || !duration}
                    step={0.1}
                    value={start}
                    onChange={(event) =>
                      setStart(
                        Math.min(
                          Number(event.target.value),
                          Math.max(0, end - 0.1),
                        ),
                      )
                    }
                  />
                </label>
                <label className="quick-range-label">
                  Fin · {quickTime(end)}
                  <input
                    type="range"
                    aria-label="Poignée de fin"
                    min={0}
                    max={duration || 1}
                    disabled={loading || !duration}
                    step={0.1}
                    value={end}
                    onChange={(event) =>
                      setEnd(Math.max(Number(event.target.value), start + 0.1))
                    }
                  />
                </label>
                <div className="quick-markers">
                  <button
                    type="button"
                    disabled={loading || !mediaURL}
                    onClick={() =>
                      setStart(
                        Math.max(
                          0,
                          Math.min(media()?.currentTime || 0, end - 0.1),
                        ),
                      )
                    }
                  >
                    Début ici
                  </button>
                  <button
                    type="button"
                    disabled={loading || !mediaURL}
                    onClick={() =>
                      setEnd(
                        Math.min(
                          duration,
                          Math.max(media()?.currentTime || 0, start + 0.1),
                        ),
                      )
                    }
                  >
                    Fin ici
                  </button>
                </div>
                <div className="quick-transport">
                  <button
                    type="button"
                    disabled={!validTrim(start, end, duration)}
                    onClick={playRange}
                  >
                    <Play size={16} />
                    Lire l’extrait
                  </button>
                  <button
                    type="button"
                    aria-label="Rétablir la durée"
                    title="Rétablir la durée"
                    onClick={() => {
                      setStart(0);
                      setEnd(Math.min(duration, 3600));
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <small>
                  Copie {audioOnly ? "M4A / AAC" : "MP4 / H.264 / AAC"} · 1 h
                  maximum. Pistes secondaires, sous-titres et métadonnées
                  exclus.
                </small>
                {!loading && !!duration && !validTrim(start, end, duration) && (
                  <p role="status" className="error">
                    Choisissez un début avant la fin, dans une limite d’une
                    heure.
                  </p>
                )}
              </>
            )}
            {action === "pdf-create" && (
              <>
                <h3>Document PDF</h3>
                <p className="quick-output-format">
                  {files.length} fichier(s) dans l’ordre affiché
                </p>
                <Help>
                  20 fichiers, 32 Mio par fichier, 64 Mio au total et 100 pages
                  maximum. Images fixes ; PDF protégés ou avec champ de
                  signature refusés.
                </Help>
              </>
            )}
            {action === "annotate" && (
              <>
                <h3>Copie annotée</h3>
                <p className="quick-output-format">
                  {pdf ? "PDF · toutes les pages conservées" : "Image PNG"}
                </p>
              </>
            )}
            {action !== "rotate" && action !== "trim" && (
              <label className="field">
                Nom de la copie
                <input
                  aria-label="Nom de la copie"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={180}
                />
              </label>
            )}
            <details className="quick-output-settings">
              <summary>
                <FolderOpen size={17} />
                <span>
                  Enregistrer dans
                  <strong title={destination}>
                    {basename(destination) ||
                      destination ||
                      "Choisir un dossier"}
                  </strong>
                </span>
                <ChevronDown size={14} />
              </summary>
              <label className="field">
                Dossier de destination
                <input
                  aria-label="Destination de l’action rapide"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => setPicker(true)}>
                <FolderOpen size={16} />
                Choisir un dossier
              </button>
            </details>
            <span className="quick-copy-note">
              <Check size={14} />
              Une copie, sans remplacer l’original
            </span>
          </fieldset>
        </div>
      </div>
      {action !== "convert" && (!allowed || allowed.disabled) && (
        <p className="error" role="alert">
          {allowed?.reason ||
            "Cette action n’est pas disponible pour cette sélection."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <p className="quick-progress" role="status">
          <LoaderCircle className="spin" size={16} />
          {progress}
        </p>
      )}
      <footer className="quick-action-footer" hidden={action === "convert"}>
        <span>
          {action === "pdf-create"
            ? name
            : action === "annotate"
              ? name
              : `${files.length} copie(s)`}
        </span>
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
        <button
          type="button"
          className="primary"
          aria-label={
            action === "pdf-create" ? "Créer le PDF" : "Créer la copie"
          }
          disabled={!canSave}
          onClick={() => void save()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {busy
            ? "Traitement…"
            : action === "pdf-create"
              ? "Créer le PDF"
              : action === "trim"
                ? "Enregistrer l’extrait"
                : "Enregistrer une copie"}
        </button>
      </footer>
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
    </section>
  );
}
