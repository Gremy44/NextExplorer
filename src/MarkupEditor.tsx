import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Undo2,
  Pencil,
  Type,
  Square,
  Highlighter,
  Trash2,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { DocumentOverlay } from "./document-operations";

type Point = { x: number; y: number };
type Mark = {
  tool: "pen" | "highlight" | "rectangle" | "text";
  points: Point[];
  color: string;
  width: number;
  text?: string;
};
type PagePlacement = Omit<DocumentOverlay, "page" | "data">;
export type MarkupResult = { image?: Uint8Array; overlays: DocumentOverlay[] };
function paint(canvas: HTMLCanvasElement, marks: Mark[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const mark of marks) {
    if (!mark.points.length) continue;
    ctx.save();
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.lineWidth = (mark.width * canvas.width) / 1000;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = mark.tool === "highlight" ? 0.3 : 1;
    const points = mark.points.map((p) => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height,
      })),
      first = points[0];
    if (mark.tool === "text") {
      ctx.font = `${(Math.max(12, mark.width * 4) * canvas.width) / 1000}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(mark.text || "", first.x, first.y);
    } else if (mark.tool === "rectangle") {
      const end = points.at(-1)!;
      ctx.strokeRect(first.x, first.y, end.x - first.x, end.y - first.y);
    } else {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      if (points.length === 1) ctx.lineTo(first.x + 0.1, first.y + 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
async function png(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Annotation non exportable"))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
export function MarkupEditor({
  data,
  kind,
  onReady,
  onError,
}: {
  data: Uint8Array;
  kind: "pdf" | "image";
  onReady: (exporter: (() => Promise<MarkupResult>) | null) => void;
  onError: (message: string) => void;
}) {
  const base = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    pdf = useRef<PDFDocumentProxy | null>(null),
    image = useRef<ImageBitmap | null>(null);
  const marks = useRef<Record<number, Mark[]>>({}),
    placements = useRef<Record<number, PagePlacement>>({});
  const [page, setPage] = useState(0),
    [pages, setPages] = useState(1),
    [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Mark["tool"]>("pen"),
    [color, setColor] = useState("#d32f2f"),
    [width, setWidth] = useState(4),
    [text, setText] = useState("");
  const active = useRef<Mark | null>(null),
    render = useRef<RenderTask | null>(null),
    loaded = useRef(false);
  const keyboardPoint = useRef<Point>({ x: 0.5, y: 0.5 });
  useEffect(() => {
    let live = true,
      task: { destroy: () => Promise<void> } | undefined;
    setReady(false);
    loaded.current = false;
    onReady(null);
    void (async () => {
      if (kind === "pdf") {
        const { openPDF } = await import("./pdf-renderer");
        if (!live) return;
        const loading = openPDF(data);
        task = loading;
        const document = await loading.promise;
        if (!live) {
          await loading.destroy();
          return;
        }
        if (document.numPages > 100)
          throw new Error("Annotation limitée à 100 pages");
        pdf.current = document;
        setPages(document.numPages);
      } else {
        const bitmap = await createImageBitmap(new Blob([data as BlobPart]));
        if (!live) {
          bitmap.close();
          return;
        }
        image.current = bitmap;
      }
      loaded.current = true;
      setRevision((n) => n + 1);
    })().catch((error) => {
      if (live) onError((error as Error).message);
    });
    return () => {
      live = false;
      loaded.current = false;
      render.current?.cancel();
      void task?.destroy().catch(() => {});
      pdf.current = null;
      image.current?.close();
      image.current = null;
      onReady(null);
    };
  }, [data, kind]);
  useEffect(() => {
    if (!loaded.current) return;
    let live = true;
    setReady(false);
    onReady(null);
    const previous = render.current;
    previous?.cancel();
    void (async () => {
      await previous?.promise.catch(() => {});
      if (!live) return;
      const canvas = base.current!,
        drawing = overlay.current!;
      if (pdf.current) {
        const item = await pdf.current.getPage(page + 1);
        if (!live) return;
        const original = item.getViewport({ scale: 1 });
        if (
          original.width <= 0 ||
          original.height <= 0 ||
          !Number.isFinite(original.width * original.height)
        )
          throw new Error("Dimensions de page invalides");
        const viewport = item.getViewport({
          scale: Math.min(1600 / original.width, 2000 / original.height, 2),
        });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        drawing.width = canvas.width;
        drawing.height = canvas.height;
        const [x, y] = viewport.convertToPdfPoint(0, viewport.height),
          [rx, ry] = viewport.convertToPdfPoint(
            viewport.width,
            viewport.height,
          ),
          [tx, ty] = viewport.convertToPdfPoint(0, 0);
        placements.current[page] = {
          x,
          y,
          width: Math.hypot(rx - x, ry - y),
          height: Math.hypot(tx - x, ty - y),
          angle: (Math.atan2(ry - y, rx - x) * 180) / Math.PI,
        };
        render.current = item.render({ canvas, viewport });
        await render.current.promise;
      } else if (image.current) {
        const bitmap = image.current;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        drawing.width = canvas.width;
        drawing.height = canvas.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      }
      if (!live) return;
      paint(drawing, marks.current[page] || []);
      setReady(true);
      onReady(async () => {
        const overlays: DocumentOverlay[] = [];
        for (const [key, items] of Object.entries(marks.current)) {
          if (!items.length) continue;
          const index = Number(key),
            placement = placements.current[index];
          const canvas = document.createElement("canvas");
          if (kind === "pdf") {
            const ratio = placement.height / placement.width;
            canvas.width = 1600;
            canvas.height = Math.max(1, Math.round(1600 * ratio));
            if (canvas.height > 5000) {
              canvas.width = Math.round(5000 / ratio);
              canvas.height = 5000;
            }
          } else {
            canvas.width = image.current!.width;
            canvas.height = image.current!.height;
          }
          paint(canvas, items);
          if (kind === "image") {
            const combined = document.createElement("canvas");
            combined.width = canvas.width;
            combined.height = canvas.height;
            const ctx = combined.getContext("2d")!;
            ctx.drawImage(image.current!, 0, 0);
            ctx.drawImage(canvas, 0, 0);
            return { image: await png(combined), overlays: [] };
          }
          overlays.push({ ...placement, page: index, data: await png(canvas) });
        }
        if (kind === "image") {
          const canvas = document.createElement("canvas");
          canvas.width = image.current!.width;
          canvas.height = image.current!.height;
          canvas.getContext("2d")!.drawImage(image.current!, 0, 0);
          return { image: await png(canvas), overlays: [] };
        }
        return { overlays };
      });
    })().catch((error) => {
      if (live && error.name !== "RenderingCancelledException")
        onError(error.message);
    });
    return () => {
      live = false;
      render.current?.cancel();
    };
  }, [page, revision]);
  function position(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function commit(mark: Mark) {
    const previous = marks.current[page] || [];
    if (previous.length >= 200) {
      onError("200 annotations maximum par page");
      return;
    }
    marks.current[page] = [...previous, mark];
    paint(overlay.current!, marks.current[page]);
  }
  return (
    <section className="markup-editor" aria-label="Éditeur d’annotations">
      <div
        className="markup-toolbar"
        role="toolbar"
        aria-label="Outils d’annotation"
      >
        {(
          [
            ["pen", "Dessiner", Pencil],
            ["highlight", "Surligner", Highlighter],
            ["rectangle", "Rectangle", Square],
            ["text", "Texte", Type],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <label>
          Encre
          <input
            type="color"
            aria-label="Couleur de l’encre"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          Épaisseur
          <select
            aria-label="Épaisseur du trait"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[2, 4, 8, 16].map((n) => (
              <option value={n} key={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Annuler la dernière annotation"
          onClick={() => {
            marks.current[page] = (marks.current[page] || []).slice(0, -1);
            paint(overlay.current!, marks.current[page]);
          }}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Effacer les annotations de cette page"
          onClick={() => {
            marks.current[page] = [];
            paint(overlay.current!, []);
          }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      {tool === "text" && (
        <label className="field">
          Texte à placer
          <input
            aria-label="Texte de l’annotation"
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <small>Cliquez sur la page pour placer le texte.</small>
        </label>
      )}
      {kind === "pdf" && (
        <div className="markup-pagination">
          <button
            type="button"
            aria-label="Page précédente"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            Page {page + 1} sur {pages}
          </span>
          <button
            type="button"
            aria-label="Page suivante"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {!ready && <p role="status">Préparation de la page…</p>}
      <div className="markup-paper">
        <canvas ref={base} aria-label="Page du document" />
        <canvas
          ref={overlay}
          aria-label="Zone d’annotation"
          aria-description="Flèches pour déplacer le curseur ; Entrée pour commencer ou terminer une annotation ; Échap pour annuler le trait."
          tabIndex={0}
          style={{ touchAction: "none" }}
          onKeyDown={(event) => {
            if (!ready) return;
            const point = keyboardPoint.current;
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              const step = event.shiftKey ? 0.05 : 0.01;
              if (event.key === "ArrowLeft")
                point.x = Math.max(0, point.x - step);
              if (event.key === "ArrowRight")
                point.x = Math.min(1, point.x + step);
              if (event.key === "ArrowUp")
                point.y = Math.max(0, point.y - step);
              if (event.key === "ArrowDown")
                point.y = Math.min(1, point.y + step);
              if (active.current) {
                if (active.current.tool === "rectangle")
                  active.current.points = [
                    active.current.points[0],
                    { ...point },
                  ];
                else if (active.current.points.length < 4000)
                  active.current.points.push({ ...point });
              }
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (active.current) {
                commit(active.current);
                active.current = null;
              } else {
                const mark: Mark = {
                  tool,
                  color,
                  width: tool === "highlight" ? width * 5 : width,
                  points: [{ ...point }],
                  ...(tool === "text" ? { text } : {}),
                };
                if (tool === "text") {
                  if (text.trim()) commit(mark);
                } else active.current = mark;
              }
            } else if (event.key === "Escape" && active.current) {
              event.preventDefault();
              event.stopPropagation();
              active.current = null;
            } else return;
            paint(event.currentTarget, [
              ...(marks.current[page] || []),
              ...(active.current ? [active.current] : []),
            ]);
            const ctx = event.currentTarget.getContext("2d")!,
              x = point.x * event.currentTarget.width,
              y = point.y * event.currentTarget.height;
            ctx.save();
            ctx.strokeStyle = "black";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x - 8, y);
            ctx.lineTo(x + 8, y);
            ctx.moveTo(x, y - 8);
            ctx.lineTo(x, y + 8);
            ctx.stroke();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }}
          onBlur={() => {
            active.current = null;
            if (overlay.current)
              paint(overlay.current, marks.current[page] || []);
          }}
          onPointerDown={(event) => {
            if (!ready || event.button !== 0) return;
            const point = position(event),
              mark: Mark = {
                tool,
                color,
                width: tool === "highlight" ? width * 5 : width,
                points: [point],
                ...(tool === "text" ? { text } : {}),
              };
            if (tool === "text") {
              if (text.trim()) commit(mark);
              return;
            }
            active.current = mark;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const mark = active.current;
            if (
              !mark ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            const point = position(event);
            if (mark.tool === "rectangle")
              mark.points = [mark.points[0], point];
            else if (mark.points.length < 4000) mark.points.push(point);
            paint(event.currentTarget, [...(marks.current[page] || []), mark]);
          }}
          onPointerUp={(event) => {
            if (active.current) {
              commit(active.current);
              active.current = null;
            }
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            active.current = null;
            paint(overlay.current!, marks.current[page] || []);
          }}
        />
      </div>
      <p className="muted">
        Au clavier : flèches pour viser, Entrée pour commencer/terminer le
        trait, Échap pour l’annuler. Le dessin d’une signature n’est pas une
        signature électronique certifiée.
      </p>
    </section>
  );
}
