import { useEffect, useState } from "react";
import { bridge } from "./bridge";
import type { Entry } from "./types";

export const isFont = (entry: Entry) =>
  entry.type === "file" && /\.(ttf|otf|woff2?)$/i.test(entry.ext);
const FONT_LIMIT = 16 * 1024 * 1024;

export function FontPreview({ entry }: { entry: Entry }) {
  const [family, setFamily] = useState("");
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [text, setText] = useState(
    "Portez ce vieux whisky au juge blond.\nÀÉÈÊÇŒ — 0123456789",
  );
  const [fontSize, setFontSize] = useState(36);
  useEffect(() => {
    let live = true;
    let face: FontFace | undefined;
    const controller = new AbortController();
    setFamily("");
    setError("");
    if (stopped) return;
    const timer = setTimeout(() => {
      live = false;
      controller.abort();
      setError(
        "Cette police ne peut pas être chargée. Essayez une autre police.",
      );
    }, 10000);
    void (async () => {
      if (entry.size > FONT_LIMIT)
        throw new Error("Aperçu des polices limité à 16 Mio.");
      const bytes = await bridge.bytes(
        entry.path,
        FONT_LIMIT,
        controller.signal,
      );
      if (!live) return;
      const name = `nxe-font-${crypto.randomUUID()}`;
      face = new FontFace(name, bytes.buffer as ArrayBuffer);
      await face.load();
      if (live) {
        document.fonts.add(face);
        setFamily(name);
      }
    })()
      .catch(() => {
        if (live)
          setError(
            entry.size > FONT_LIMIT
              ? "Aperçu des polices limité à 16 Mio."
              : "Police illisible ou format non pris en charge par le navigateur.",
          );
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
      if (face) document.fonts.delete(face);
    };
  }, [entry.path, entry.mtime, entry.stamp, stopped, attempt]);
  return (
    <section className="font-preview" aria-label="Aperçu de la police">
      {stopped ? (
        <p role="status">Aperçu arrêté.</p>
      ) : error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !family ? (
        <div className="preview-loading">
          <p role="status">Chargement de la police…</p>
          <button onClick={() => setStopped(true)}>Arrêter l’aperçu</button>
        </div>
      ) : (
        <>
          <div className="font-controls">
            <label>
              Taille
              <input
                type="range"
                aria-label="Taille des caractères"
                min="12"
                max="96"
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </label>
            <output>{fontSize} px</output>
          </div>
          <textarea
            aria-label="Texte d’essai"
            value={text}
            maxLength={2000}
            rows={2}
            onChange={(event) => setText(event.target.value)}
          />
          <div
            className="font-specimen"
            style={{ fontFamily: `"${family}"`, fontSize }}
            aria-label="Texte dans la police sélectionnée"
          >
            {text}
          </div>
          <p className="muted">Aperçu local · police non installée</p>
        </>
      )}
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
    </section>
  );
}
