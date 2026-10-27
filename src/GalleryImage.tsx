import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

export function GalleryImage({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  useEffect(() => {
    const el = stage.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((old) =>
        Math.max(1, Math.min(8, old * (event.deltaY < 0 ? 1.15 : 1 / 1.15))),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);
  return (
    <div className="gallery-image">
      <div className="gallery-zoom">
        <button
          title="Réduire le zoom"
          disabled={zoom === 1}
          onClick={() => setZoom((x) => Math.max(1, x / 1.25))}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)} %</span>
        <button
          title="Agrandir le zoom"
          disabled={zoom === 8}
          onClick={() => setZoom((x) => Math.min(8, x * 1.25))}
        >
          <Plus size={16} />
        </button>
        <button
          title="Ajuster l’image"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div
        ref={stage}
        className="gallery-stage"
        style={{ cursor: zoom > 1 ? "grab" : "zoom-in" }}
        onDoubleClick={() => setZoom((x) => (x === 1 ? 2 : 1))}
        onPointerDown={(event) => {
          if (zoom === 1) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: pan.x,
            top: pan.y,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setPan({
              x: drag.current.left + event.clientX - drag.current.x,
              y: drag.current.top + event.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img
          hidden={failed}
          onError={() => setFailed(true)}
          draggable={false}
          src={url}
          alt={name}
          style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          }}
        />
        {failed && (
          <p role="status">
            Cette image ne peut pas être affichée. Ouvrez-la dans son
            application.
          </p>
        )}
      </div>
    </div>
  );
}
