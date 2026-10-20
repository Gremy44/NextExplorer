import { FolderOpen, RefreshCw, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { basename, size } from "./types";
import type { SpaceAnalysis as Analysis } from "./disk-space";
import { spaceColors, spacePercent, spaceTiles } from "./disk-space";

export function SpaceAnalysis({
  analysis,
  onAnalyze,
  onNavigate,
  onClose,
}: {
  analysis: Analysis;
  onAnalyze: (path: string) => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
}) {
  const result = analysis.result,
    total = result?.total || 0;
  const [limit, setLimit] = useState(80);
  const [inspection, setInspection] = useState<{
    path: string;
    size: number;
    x: number;
    y: number;
  } | null>(null);
  const tooltipId = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLimit(80);
    setInspection(null);
  }, [analysis.path, result]);
  useLayoutEffect(() => {
    if (!inspection || !tooltip.current) return;
    const element = tooltip.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(inspection.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(inspection.y, window.innerHeight - bounds.height - 8))}px`;
  }, [inspection]);
  useEffect(() => {
    if (!inspection) return;
    const close = () => setInspection(null);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [inspection]);
  function inspect(item: { path: string; size: number }) {
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== "touch")
          setInspection({
            ...item,
            x: event.clientX + 12,
            y: event.clientY + 12,
          });
      },
      onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (document.activeElement !== event.currentTarget) setInspection(null);
      },
      onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setInspection({ ...item, x: bounds.left + 12, y: bounds.bottom + 8 });
      },
      onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
        if (!event.currentTarget.matches(":hover")) setInspection(null);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setInspection(null);
        }
      },
      "aria-describedby":
        inspection?.path === item.path ? tooltipId : undefined,
    };
  }
  return (
    <section className="space-analysis" aria-label="Analyse de l’espace disque">
      <header>
        <strong>Espace disque</strong>
        <button onClick={onClose} aria-label="Fermer l’analyse">
          <X size={16} />
        </button>
      </header>
      <p className="space-path" title={analysis.path}>
        {analysis.path}
      </p>
      <div className="organization-actions">
        <button
          disabled={analysis.loading}
          onClick={() => onAnalyze(analysis.path)}
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
        <button onClick={() => onNavigate(analysis.path)}>
          <FolderOpen size={16} />
          Ouvrir
        </button>
      </div>
      {analysis.loading && (
        <p role="status">Analyse en cours… La navigation reste disponible.</p>
      )}
      {analysis.error && (
        <p role="alert" className="error">
          {analysis.error}
        </p>
      )}
      {result && (
        <>
          <p>
            <strong>{size(total)}</strong> analysés
          </p>
          <div
            className="space-map"
            aria-label="Répartition des fichiers et dossiers"
          >
            {spaceTiles(result.items, total).map((item, index) => (
              <button
                key={item.path}
                type="button"
                aria-disabled={!item.path}
                {...inspect(item)}
                style={
                  {
                    "--space-color": spaceColors[index % spaceColors.length],
                    left: `${item.x}%`,
                    top: `${(item.y / 60) * 100}%`,
                    width: `${item.w}%`,
                    height: `${(item.h / 60) * 100}%`,
                  } as CSSProperties
                }
                onClick={() => item.path && onNavigate(item.path)}
                aria-label={`${item.path ? "Ouvrir " : ""}${basename(item.path) || "Autres éléments"} : ${size(item.size)}, ${spacePercent(item.size, total)}`}
              >
                {item.w > 18 && item.h > 10 && (
                  <span>
                    {basename(item.path) || "Autres"}
                    <small>{size(item.size)}</small>
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="muted">
            Survolez un bloc ou utilisez Tab pour voir son nom, son chemin et sa
            taille. La surface indique l’espace occupé ; les couleurs
            distinguent les éléments. Un clic ouvre le dossier sans fermer cette
            analyse. Carte : les 40 plus gros éléments et le reste.
          </p>
          <div className="space-items">
            {result.items.slice(0, limit).map((item) => (
              <button
                key={item.path}
                type="button"
                {...inspect(item)}
                onClick={() => onNavigate(item.path)}
              >
                <span>{basename(item.path)}</span>
                <small>
                  {size(item.size)} · {spacePercent(item.size, total)}
                </small>
                <progress
                  value={item.size}
                  max={Math.max(1, total)}
                  aria-label={`Part de ${basename(item.path)}`}
                />
              </button>
            ))}
          </div>
          {result.items.length > limit && (
            <button onClick={() => setLimit((n) => n + 80)}>
              Voir 80 éléments de plus
            </button>
          )}
          {!result.items.length && <p>Aucun fichier mesuré dans ce dossier.</p>}
          {(result.skipped > 0 || result.truncated) && (
            <p className="muted" role="status">
              Résultat partiel : {result.skipped} emplacement(s) non lisible(s)
              {result.truncated
                ? " ; limite de parcours ou de résultats atteinte"
                : ""}
              .
            </p>
          )}
        </>
      )}
      {inspection &&
        createPortal(
          <div
            ref={tooltip}
            id={tooltipId}
            role="tooltip"
            className="space-tooltip"
            style={{ left: inspection.x, top: inspection.y }}
          >
            <strong>{basename(inspection.path) || "Autres éléments"}</strong>
            {inspection.path && <span>{inspection.path}</span>}
            <small>
              {size(inspection.size)} · {spacePercent(inspection.size, total)}{" "}
              de l’espace analysé
            </small>
          </div>,
          document.body,
        )}
    </section>
  );
}
