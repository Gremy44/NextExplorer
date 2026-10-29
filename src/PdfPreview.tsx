import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { bridge } from "./bridge";
import { sameFamilyFile } from "./file-families";
import { size, type Entry } from "./types";
import { PDF_PREVIEW_BYTES, pdfPreviewScale } from "./pdf-preview";

export function PdfPreview({
  entry,
  embedded,
}: {
  entry: Entry;
  embedded: boolean;
}) {
  const [pdf, setPDF] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true),
    [ready, setReady] = useState(false),
    [stopped, setStopped] = useState(false);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("Lecture du PDF…"),
    [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null),
    render = useRef<RenderTask | null>(null);
  const stop = () => {
    setStopped(true);
    setReady(false);
    setBusy(false);
  };
  const navigate = (next: number) => {
    setReady(false);
    setPage(next);
  };
  useEffect(() => {
    const controller = new AbortController();
    let loading: PDFDocumentLoadingTask | undefined,
      live = true;
    setPDF(null);
    setPage(1);
    setReady(false);
    setError("");
    setText("");
    if (stopped) return;
    setBusy(true);
    setStatus("Lecture du PDF…");
    const timer = setTimeout(() => {
      if (!live) return;
      live = false;
      controller.abort();
      void loading?.destroy().catch(() => {});
      setError(
        "Ce PDF dépasse le délai d’aperçu de 15 secondes. Ouvrez-le dans son application.",
      );
      setBusy(false);
    }, 15000);
    void (async () => {
      const max = embedded ? 16 * 1024 * 1024 : PDF_PREVIEW_BYTES;
      if (entry.size > max)
        throw new Error(
          `Aperçu PDF limité à ${max / 1048576} Mio. Ouvrez le fichier dans son application.`,
        );
      const expected = await bridge.request<Entry>(
        "FS_STAT",
        { path: entry.path },
        5000,
      );
      controller.signal.throwIfAborted();
      if (expected.type !== "file")
        throw new Error("Un fichier PDF ordinaire est requis.");
      const bytes = await bridge.bytes(
        entry.path,
        max,
        controller.signal,
        (done, total) => {
          if (live)
            setStatus(`Lecture du PDF : ${size(done)} / ${size(total)}`);
        },
      );
      const after = await bridge.request<Entry>(
        "FS_STAT",
        { path: entry.path },
        5000,
      );
      controller.signal.throwIfAborted();
      if (
        !sameFamilyFile(expected, after) ||
        (expected.stamp && expected.stamp !== after.stamp)
      )
        throw new Error(
          "PDF modifié pendant la lecture. Actualisez le dossier puis réessayez.",
        );
      if (live) setStatus("Ouverture du PDF…");
      const { openPDF } = await import("./pdf-renderer");
      controller.signal.throwIfAborted();
      loading = openPDF(bytes, true);
      const document = await loading.promise;
      controller.signal.throwIfAborted();
      if (live) setPDF(document);
    })()
      .catch((error) => {
        if (live && !controller.signal.aborted) {
          setError(
            (error as Error).name === "PasswordException"
              ? "Ce PDF est protégé par un mot de passe. Ouvrez-le dans son application."
              : (error as Error).message,
          );
          setBusy(false);
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
      render.current?.cancel();
      void loading?.destroy().catch(() => {});
    };
  }, [entry.path, entry.mtime, entry.stamp, embedded, attempt, stopped]);
  useEffect(() => {
    if (!pdf || stopped) return;
    let live = true;
    const previous = render.current;
    previous?.cancel();
    setReady(false);
    setBusy(true);
    setError("");
    setText("");
    setStatus(`Préparation de la page ${page}…`);
    const timer = setTimeout(() => {
      if (!live) return;
      render.current?.cancel();
      void pdf.loadingTask.destroy().catch(() => {});
      setPDF(null);
      setError(
        "Cette page est trop complexe ou dépasse le délai de 10 secondes. Ouvrez le PDF dans son application.",
      );
      setBusy(false);
      live = false;
    }, 10000);
    void (async () => {
      await previous?.promise.catch(() => {});
      if (!live) return;
      const item = await pdf.getPage(page);
      if (!live) return;
      const original = item.getViewport({ scale: 1 });
      const viewport = item.getViewport({
        scale: pdfPreviewScale(original.width, original.height),
      });
      const element = canvas.current!;
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      const task = item.render({ canvas: element, viewport });
      render.current = task;
      await task.promise;
      if (!live) return;
      const content = await item.getTextContent();
      if (!live) return;
      setText(
        content.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" ")
          .slice(0, 32000),
      );
      setReady(true);
      setBusy(false);
      item.cleanup();
    })()
      .catch((error) => {
        if (live) {
          setError((error as Error).message);
          setBusy(false);
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      render.current?.cancel();
    };
  }, [pdf, page, stopped]);
  return (
    <section className="pdf-preview" aria-label="Lecture du PDF">
      {pdf && !stopped && (
        <nav className="pdf-preview-toolbar" aria-label="Pages du PDF">
          <button disabled={page === 1} onClick={() => navigate(page - 1)}>
            Précédent
          </button>
          <span>
            Page {page} / {pdf.numPages}
          </span>
          <button
            disabled={page === pdf.numPages}
            onClick={() => navigate(page + 1)}
          >
            Suivant
          </button>
        </nav>
      )}
      {busy && (
        <div className="preview-loading">
          <p role="status">{status}</p>
          <button onClick={stop}>Arrêter l’aperçu</button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {stopped && <p role="status">Aperçu arrêté.</p>}
      {(error || stopped) && (
        <button
          onClick={() => {
            setStopped(false);
            setAttempt((value) => value + 1);
          }}
        >
          Réessayer l’aperçu
        </button>
      )}
      <canvas
        ref={canvas}
        hidden={!ready}
        role="img"
        aria-label={`Page ${page} du PDF ${entry.name}`}
      />
      {ready && (
        <small className="muted">
          Rendu d’aperçu : les images dépassant 16 mégapixels peuvent être
          omises.
        </small>
      )}
      <details hidden={!ready}>
        <summary>Texte de la page</summary>
        <pre>{text || "Cette page ne contient pas de texte extractible."}</pre>
      </details>
    </section>
  );
}
