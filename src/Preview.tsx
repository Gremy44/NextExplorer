import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  File,
  Folder,
  Image,
  Film,
  Music,
  FileCode,
  Link,
  Archive,
  FileText,
  Play,
  Pause,
  X,
  ExternalLink,
  ZoomIn,
} from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { bridge } from "./bridge";
import { mediaType, safeURL, size, type Entry } from "./types";
import { previewText, TEXT_PREVIEW_BYTES } from "./preview-text";
import { readProvenance, type Provenance } from "./provenance";
import { mimes } from "./file-mime";
import { nativeThumbnail } from "./native-thumbnail";
import { useOrganization } from "./OrganizationContext";
import { fileKey } from "./file-families";
export function FileIcon({
  entry,
  size: dim = 18,
}: {
  entry: Entry;
  size?: number;
}) {
  const { appearances } = useOrganization();
  const appearance =
    entry.type === "directory" ? appearances[fileKey(entry.path)] : undefined;
  const kind = mediaType(entry);
  const Icon = {
    folder: Folder,
    image: Image,
    video: Film,
    audio: Music,
    archive: Archive,
    link: Link,
    pdf: FileText,
    text: entry.ext ? FileCode : File,
    binary: File,
  }[kind];
  if (appearance)
    return (
      <span
        className="custom-folder-icon"
        style={{
          width: dim,
          height: dim,
          color:
            appearance.color === "default"
              ? "var(--folder-color)"
              : `var(--label-${appearance.color})`,
        }}
      >
        <Folder size={dim} className="file-icon" style={{ color: "inherit" }} />
        <span style={{ fontSize: Math.max(10, dim * 0.42) }}>
          {appearance.symbol}
        </span>
      </span>
    );
  return <Icon size={dim} className={"file-icon " + kind} />;
}
export function FolderIcon({
  path,
  name = "",
  size = 18,
}: {
  path: string;
  name?: string;
  size?: number;
}) {
  return (
    <FileIcon
      entry={{ path, name, type: "directory", size: 0, mtime: 0, ext: "" }}
      size={size}
    />
  );
}
export function CardPreview({
  entry,
  iconSize = 38,
  interactive = true,
}: {
  entry: Entry;
  iconSize?: number;
  interactive?: boolean;
}) {
  const [text, setText] = useState("");
  const [url, setURL] = useState("");
  const [hover, setHover] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const kind = mediaType(entry);
  const hoveredMedia =
    (kind === "video" || kind === "audio") && hover && interactive;
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([item]) => setVisible(item.isIntersecting),
      { rootMargin: "64px" },
    );
    observer.observe(preview.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setText("");
    setURL("");
    if (!visible) return;
    let live = true;
    let mediaToken = "";
    const controller = new AbortController();
    if (kind === "link" && entry.size < 200000)
      bridge
        .text(entry.path, controller.signal)
        .then((value) => {
          if (live) setText(value);
        })
        .catch(() => {});
    if (kind === "text" && entry.size < 200000)
      bridge
        .textPrefix(entry.path, 2048, controller.signal)
        .then(({ bytes, size }) => {
          const value = previewText(bytes, size);
          if (live) setText(value.binary ? "" : value.text);
        })
        .catch(() => {});
    if (kind === "image" || hoveredMedia) {
      void (async () => {
        if (kind === "image") {
          const url = await nativeThumbnail(entry, controller.signal);
          if (live) setURL(url);
        } else {
          const expected = await bridge.request<Entry>("FS_STAT", {
            path: entry.path,
          });
          if (!live) return;
          const value = await bridge.request<{ url: string; token: string }>(
            "MEDIA_OPEN",
            { path: entry.path, expected },
          );
          mediaToken = value.token;
          if (live) setURL(value.url);
          else
            void bridge
              .request("MEDIA_CLOSE", { name: mediaToken })
              .catch(() => {});
        }
      })().catch(() => {});
    }
    return () => {
      live = false;
      controller.abort();
      if (mediaToken)
        void bridge
          .request("MEDIA_CLOSE", { name: mediaToken })
          .catch(() => {});
    };
  }, [entry.path, entry.mtime, entry.stamp, hoveredMedia, visible]);
  let content = <FileIcon entry={entry} size={iconSize} />;
  if (kind === "text" && text) {
    const snippet = text.slice(0, 512).split("\n").slice(0, 5).join("\n");
    content =
      entry.ext === ".md" ? (
        <div
          className="card-markdown"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              marked.parse(snippet, { async: false }),
              {
                FORBID_TAGS: [
                  "img",
                  "style",
                  "iframe",
                  "svg",
                  "video",
                  "audio",
                ],
              },
            ),
          }}
        />
      ) : (
        <pre className="card-code">{snippet}</pre>
      );
  }
  if (kind === "link" && text)
    try {
      const l = JSON.parse(text);
      content = (
        <div className="card-link">
          {l.image?.startsWith("data:image/") ? (
            <img src={l.image} alt="" />
          ) : (
            <Link size={24} />
          )}
          <span>{l.title}</span>
        </div>
      );
    } catch {}
  if (kind === "image" && url)
    content = <img className="thumbnail" src={url} alt="" />;
  if (kind === "video" && url)
    content = (
      <video
        preload="metadata"
        className="thumbnail"
        src={url}
        muted
        ref={video}
        onPointerMove={(e) => {
          if (video.current?.duration) {
            const r = e.currentTarget.getBoundingClientRect();
            video.current.currentTime =
              Math.max(0, Math.min(0.99, (e.clientX - r.left) / r.width)) *
              video.current.duration;
          }
        }}
      />
    );
  if (kind === "audio" && url)
    content = (
      <div className="card-audio">
        <Music size={25} />
        <audio ref={audio} src={url} />
        <button
          title="Écouter l’extrait"
          onClick={(e) => {
            e.stopPropagation();
            if (audio.current?.paused) audio.current.play();
            else audio.current?.pause();
          }}
        >
          <Play size={14} />
        </button>
      </div>
    );
  return (
    <div
      ref={preview}
      className="card-preview"
      onPointerEnter={interactive ? () => setHover(true) : undefined}
      onPointerLeave={() => {
        setHover(false);
        audio.current?.pause();
        video.current?.pause();
      }}
    >
      {content}
    </div>
  );
}
export function Preview({
  entry,
  onClose,
  onError,
  onConvert,
  embedded = false,
  actions,
}: {
  entry: Entry;
  onClose: () => void;
  onError: (s: string) => void;
  onConvert?: () => void;
  embedded?: boolean;
  actions?: ReactNode;
}) {
  const [url, setURL] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [source, setSource] = useState<Provenance | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [html, setHTML] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const kind = mediaType(entry);
  const tiff = /\.tiff?$/i.test(entry.ext);
  const unsupported =
    kind === "binary" ||
    (embedded && (kind === "folder" || kind === "archive"));
  useEffect(() => {
    setSourceOpen(false);
    setSource(null);
    setSourceError("");
  }, [entry.path, entry.mtime, entry.stamp]);
  useEffect(() => {
    if (!sourceOpen) return;
    const controller = new AbortController();
    setSource(null);
    setSourceError("");
    readProvenance(entry, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSource(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSourceError(error.message);
      });
    return () => controller.abort();
  }, [sourceOpen, entry.path, entry.mtime, entry.stamp]);
  useEffect(() => {
    let object = "";
    let mediaToken = "";
    let live = true;
    const controller = new AbortController();
    setURL("");
    setText("");
    setError("");
    setTruncated(false);
    if (unsupported) return () => controller.abort();
    (async () => {
      try {
        if (kind === "archive") {
          const d = await bridge.request("ARCHIVE_LIST", { path: entry.path });
          if (live)
            setText(
              d.text ||
                d.entries
                  .map((e: any) => `${size(e.size).padStart(12)}  ${e.name}`)
                  .join("\n") +
                  (d.truncated ? "\n… liste limitée à 3 000 entrées" : ""),
            );
          return;
        }
        if (kind === "text") {
          const prefix = await bridge.textPrefix(
            entry.path,
            TEXT_PREVIEW_BYTES,
            controller.signal,
          );
          const result = previewText(prefix.bytes, prefix.size);
          if (live) {
            if (result.binary)
              setError(
                "Ce fichier contient des données binaires. Ouvrez-le dans son application.",
              );
            else {
              setText(result.text);
              setTruncated(result.truncated);
            }
          }
          return;
        }
        if (kind === "link") {
          const t = await bridge.text(entry.path, controller.signal);
          if (live) setText(t);
          return;
        }
        if (kind === "image") {
          const expected = await bridge.request<Entry>("FS_STAT", {
            path: entry.path,
          });
          const value = await bridge.request<{ data: string }>(
            "IMAGE_PREVIEW",
            { path: entry.path, expected, width: embedded ? 640 : 1600 },
            12000,
          );
          if (live) setURL(`data:image/jpeg;base64,${value.data}`);
          return;
        }
        if (kind === "video" || kind === "audio") {
          const expected = await bridge.request<Entry>("FS_STAT", {
            path: entry.path,
          });
          const value = await bridge.request<{ url: string; token: string }>(
            "MEDIA_OPEN",
            { path: entry.path, expected },
          );
          mediaToken = value.token;
          if (live) setURL(value.url);
          else
            void bridge
              .request("MEDIA_CLOSE", { name: mediaToken })
              .catch(() => {});
          if (kind === "audio" && live)
            void bridge
              .request<{ peaks: number[] }>(
                "MEDIA_WAVEFORM",
                { path: entry.path, expected },
                12000,
              )
              .then(({ peaks }) => {
                if (!live) return;
                const c = canvas.current,
                  g = c?.getContext("2d");
                if (!c || !g) return;
                g.clearRect(0, 0, c.width, c.height);
                g.fillStyle = getComputedStyle(c).color;
                peaks.forEach((peak, i) => {
                  const height = Math.max(2, (peak / 32768) * c.height);
                  g.fillRect(i * 3, (c.height - height) / 2, 2, height);
                });
              })
              .catch(() => {});
          return;
        }
        const data = await bridge.bytes(
          entry.path,
          (embedded ? 16 : 128) * 1024 * 1024,
          controller.signal,
        );
        object = URL.createObjectURL(
          new Blob([data], {
            type: mimes[entry.ext] || "application/octet-stream",
          }),
        );
        if (live) setURL(object);
      } catch (e) {
        if (live && !controller.signal.aborted) setError(String(e));
      }
    })();
    return () => {
      live = false;
      controller.abort();
      if (object) URL.revokeObjectURL(object);
      if (mediaToken)
        void bridge
          .request("MEDIA_CLOSE", { name: mediaToken })
          .catch(() => {});
    };
  }, [entry.path, entry.mtime, entry.stamp]);
  useEffect(() => {
    setHTML("");
    if (kind !== "text" || !text) return;
    const worker = new Worker(new URL("./preview-worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => worker.terminate(), 3000);
    worker.onmessage = (event: MessageEvent<string | null>) => {
      clearTimeout(timer);
      if (event.data)
        setHTML(
          DOMPurify.sanitize(event.data.slice(0, 512 * 1024), {
            FORBID_TAGS: [
              "img",
              "iframe",
              "style",
              "form",
              "input",
              "video",
              "audio",
              "svg",
              "math",
            ],
          }),
        );
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.postMessage({ text, markdown: entry.ext.toLowerCase() === ".md" });
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [text, kind, entry.ext]);
  let link: any;
  try {
    if (kind === "link" && text) link = JSON.parse(text);
  } catch {}
  return (
    <div
      className={embedded ? "embedded-preview" : "overlay"}
      onMouseDown={(e) => {
        if (!embedded && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={embedded ? "preview inline-preview" : "preview modal"}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={"Aperçu de " + entry.name}
      >
        <header>
          <FileIcon entry={entry} />
          <strong>{entry.name}</strong>
          <span>{size(entry.size)}</span>
          <button
            title="Ouvrir dans l’application"
            onClick={() =>
              bridge
                .request("OS_OPEN", { path: entry.path, mode: "default" })
                .catch((e) => onError(e.message))
            }
          >
            <ExternalLink size={16} />
          </button>
          {!embedded && (
            <button autoFocus onClick={onClose} aria-label="Fermer l’aperçu">
              <X size={19} />
            </button>
          )}
        </header>
        <div className={"preview-body " + (zoom ? "zoom" : "")}>
          {truncated && (
            <p className="muted" role="status">
              Aperçu partiel : 64 Ko ou 1 000 lignes maximum. Le fichier
              original est conservé en entier.
            </p>
          )}
          {unsupported ? (
            <p className="muted">
              Ce format ne dispose pas d’un aperçu intégré. Ouvrez ce fichier
              dans son application
              {onConvert ? " ou créez une copie PNG pour le consulter." : "."}
            </p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : kind === "text" && entry.size === 0 ? (
            <p className="muted">Fichier vide.</p>
          ) : kind === "image" && url ? (
            <>
              <button
                className="zoom-button"
                title="Zoom"
                onClick={() => setZoom(!zoom)}
              >
                <ZoomIn size={18} />
              </button>
              <img
                src={url}
                alt={entry.name}
                onError={() =>
                  setError(
                    "Cette image ne peut pas être décodée. Ouvrez-la dans son application.",
                  )
                }
              />
            </>
          ) : kind === "video" && url ? (
            <video
              preload="metadata"
              ref={video}
              src={url}
              controls
              onPointerMove={(e) => {
                if (e.shiftKey && video.current?.duration) {
                  const r = e.currentTarget.getBoundingClientRect();
                  video.current.currentTime =
                    ((e.clientX - r.left) / r.width) * video.current.duration;
                }
              }}
            />
          ) : kind === "audio" ? (
            <div className="audio-preview">
              <Music size={64} />
              <h2>{entry.name}</h2>
              <canvas
                ref={canvas}
                width={600}
                height={100}
                aria-label="Forme d’onde du début du fichier, 30 secondes maximum"
              />
              {url && (
                <>
                  <audio
                    preload="metadata"
                    ref={audio}
                    src={url}
                    controls
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                  <button
                    onClick={() =>
                      playing ? audio.current?.pause() : audio.current?.play()
                    }
                  >
                    {playing ? <Pause size={18} /> : <Play size={18} />}{" "}
                    {playing ? "Pause" : "Écouter"}
                  </button>
                </>
              )}
            </div>
          ) : kind === "pdf" && url ? (
            <iframe src={url} title={entry.name} />
          ) : kind === "link" && link ? (
            <article className="web-card">
              {link.image?.startsWith("data:image/") && (
                <img src={link.image} alt="" />
              )}
              <h2>{link.title}</h2>
              <p>{link.description}</p>
              {safeURL(link.url) && (
                <a href={safeURL(link.url)!} target="_blank" rel="noreferrer">
                  {link.url}
                </a>
              )}
            </article>
          ) : kind === "text" && text && entry.ext !== ".md" ? (
            <article className="code numbered-code">
              <div className="line-numbers" aria-hidden="true">
                {text.split("\n").map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              {html ? (
                <pre dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <pre>{text}</pre>
              )}
            </article>
          ) : kind === "text" && text && html ? (
            <article
              className={entry.ext === ".md" ? "markdown" : "code"}
              dangerouslySetInnerHTML={{
                __html: entry.ext === ".md" ? html : `<pre>${html}</pre>`,
              }}
            />
          ) : kind === "text" && text ? (
            <pre>{text}</pre>
          ) : kind === "archive" ? (
            <pre>{text || "Lecture de l’archive…"}</pre>
          ) : (
            <p className="muted">Chargement de l’aperçu…</p>
          )}
        </div>
        {sourceOpen && (
          <section
            className="capture-provenance"
            aria-label="Provenance de la capture"
          >
            <strong>Provenance de la capture</strong>
            {source ? (
              <>
                <dl>
                  <dt>Titre</dt>
                  <dd>{source.title || "Page web"}</dd>
                  <dt>Capturé le</dt>
                  <dd>
                    <time dateTime={source.collectedAt}>
                      {new Date(source.collectedAt).toLocaleString("fr-FR")}
                    </time>
                  </dd>
                  <dt>Page source</dt>
                  <dd>{source.sourceUrl}</dd>
                  {source.imageUrl && (
                    <>
                      <dt>Image source</dt>
                      <dd>{source.imageUrl}</dd>
                    </>
                  )}
                </dl>
                {source.size !== entry.size && (
                  <p role="status">
                    La taille du fichier a changé depuis la capture.
                  </p>
                )}
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir la page source <ExternalLink size={16} />
                </a>
              </>
            ) : (
              <p role="status">{sourceError || "Lecture de la provenance…"}</p>
            )}
          </section>
        )}
        {actions}
        <footer>
          {!embedded && (
            <span>
              {kind === "video"
                ? "Maj + survol : parcourir la vidéo"
                : "Échap pour fermer"}
            </span>
          )}
          {tiff && onConvert && (
            <button onClick={onConvert}>Créer une copie PNG…</button>
          )}
          {entry.type === "file" && (
            <button
              aria-expanded={sourceOpen}
              onClick={() => setSourceOpen(!sourceOpen)}
            >
              {sourceOpen ? "Masquer la provenance" : "Voir la provenance"}
            </button>
          )}
          {!embedded && (
            <button
              onClick={() =>
                bridge
                  .request("METADATA", { path: entry.path })
                  .then((v) => setMetadata(JSON.stringify(v, null, 2)))
                  .catch((e) => setMetadata(e.message))
              }
            >
              Métadonnées
            </button>
          )}
        </footer>
        {metadata && <pre className="metadata">{metadata}</pre>}
      </section>
    </div>
  );
}
