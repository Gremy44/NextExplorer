import { Help } from "./Help";
import { FolderOpen, RefreshCw, Square, X } from "lucide-react";
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
import { useOrganization } from "./OrganizationContext";

export function SpaceAnalysis({
  analysis,
  onAnalyze,
  onNavigate,
  onClose,
  onCancel,
  legacy = false,
}: {
  analysis: Analysis;
  onAnalyze: (path: string) => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
  onCancel?: () => void;
  legacy?: boolean;
}) {
  const { preferences } = useOrganization();
  const result = analysis.result,
    total = result?.total || 0;
  const [page, setPage] = useState(0);
  const [inspection, setInspection] = useState<{
    path: string;
    size: number;
    x: number;
    y: number;
  } | null>(null);
  const tooltipId = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPage(0);
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
        if (preferences.tooltips && event.pointerType !== "touch")
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
        if (!preferences.tooltips) return;
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
        preferences.tooltips && inspection?.path === item.path
          ? tooltipId
          : undefined,
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
        {analysis.loading && analysis.jobId && onCancel && (
          <button onClick={onCancel}>
            <Square size={16} /> Arrêter
          </button>
        )}
      </div>
      {analysis.loading && (
        <p role="status">
          Analyse en cours…{" "}
          {analysis.scanned
            ? `${analysis.scanned.toLocaleString("fr-FR")} fichier(s) mesuré(s).`
            : "La navigation reste disponible."}
        </p>
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
          <Help>
            Survolez un bloc ou utilisez Tab pour voir son nom, son chemin et sa
            taille. La surface indique l’espace occupé ; les couleurs
            distinguent les éléments. Un clic ouvre le dossier sans fermer cette
            analyse. Carte : les 40 plus gros éléments et le reste. Analyse : le
            parcours ne s’arrête pas après un nombre fixe de fichiers. Les
            dossiers vides et la corbeille sont comptés. Les tailles sont
            logiques ; les éléments inaccessibles et les liens non suivis sont
            signalés. Les résultats sont conservés localement et transmis par
            pages.
          </Help>
          <div className="space-items">
            {result.items.slice(page * 80, (page + 1) * 80).map((item) => (
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
          {result.items.length > 80 && (
            <nav
              className="organization-actions"
              aria-label="Pages de l’analyse"
            >
              <button
                disabled={page === 0}
                onClick={() => setPage((n) => n - 1)}
              >
                Précédent
              </button>
              <span aria-live="polite">
                {page * 80 + 1}–{Math.min((page + 1) * 80, result.items.length)}{" "}
                sur {result.items.length}
              </span>
              <button
                disabled={(page + 1) * 80 >= result.items.length}
                onClick={() => setPage((n) => n + 1)}
              >
                Suivant
              </button>
            </nav>
          )}
          {!result.items.length && <p>Aucun fichier mesuré dans ce dossier.</p>}
          {(result.skipped > 0 || result.truncated) && (
            <p className="muted" role="status">
              Résultat partiel : {result.skipped} emplacement(s) non lisible(s)
              ou lien(s) non suivi(s)
              {result.truncated
                ? legacy
                  ? " ; mettez à jour le compagnon pour analyser les gros volumes"
                  : result.omitted
                    ? ` ; ${result.omitted} ligne(s) non conservée(s) dans la limite de mémoire, mais incluses dans la taille totale`
                    : " ; profondeur maximale de dossier atteinte"
                : ""}
              .
            </p>
          )}
        </>
      )}
      {preferences.tooltips &&
        inspection &&
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
