import { useEffect, useRef, useState, type RefObject } from "react";
import { bridge } from "./bridge";
import type { Entry } from "./types";
import { subtitleToVTT, codecWarning } from "./subtitles";
type Subtitle = { name: string; mode: string; index?: number };
export function MediaOptions({
  entry,
  media,
  onConvert,
}: {
  entry: Entry;
  media: RefObject<HTMLMediaElement | null>;
  onConvert?: () => void;
}) {
  const [info, setInfo] = useState<{
      streams: { codec_name: string; codec_type: string }[];
      subtitles: Subtitle[];
      note: string;
    } | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  const expected = useRef<Entry | null>(null),
    generation = useRef(0),
    track = useRef<HTMLTrackElement | null>(null),
    object = useRef("");
  const remove = () => {
    track.current?.remove();
    track.current = null;
    if (object.current) URL.revokeObjectURL(object.current);
    object.current = "";
  };
  useEffect(() => {
    let live = true;
    setInfo(null);
    setError("");
    setSelected("");
    setBusy(false);
    expected.current = null;
    generation.current++;
    void (async () => {
      const actual = await bridge.request<Entry>("FS_STAT", {
        path: entry.path,
      });
      const result = await bridge.request<NonNullable<typeof info>>(
        "MEDIA_DETAILS",
        { path: entry.path, expected: actual },
        20000,
      );
      if (live) {
        expected.current = actual;
        setInfo(result);
      }
    })().catch((e) => {
      if (live)
        setError(
          e.message.includes("inconnue")
            ? "Mettez à jour le compagnon pour les sous-titres et le diagnostic."
            : e.message,
        );
    });
    return () => {
      live = false;
      generation.current++;
      remove();
    };
  }, [entry.path, entry.stamp]);
  async function choose(value: string) {
    setSelected(value);
    remove();
    const current = ++generation.current;
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const subtitle = info!.subtitles[Number(value) - 1];
      const result = await bridge.request<{ text: string }>(
        "MEDIA_SUBTITLE",
        {
          path: entry.path,
          expected: expected.current,
          name: subtitle.name,
          mode: subtitle.mode,
          offset: subtitle.index,
        },
        20000,
      );
      if (current !== generation.current) return;
      if (!media.current)
        throw new Error(
          "La vidéo doit pouvoir être lue pour afficher les sous-titres. Créez une copie compatible si nécessaire.",
        );
      object.current = URL.createObjectURL(
        new Blob([subtitleToVTT(result.text)], { type: "text/vtt" }),
      );
      const item = document.createElement("track");
      item.kind = "subtitles";
      item.label = subtitle.name;
      item.srclang = "und";
      item.default = true;
      item.src = object.current;
      track.current = item;
      media.current?.append(item);
      item.track.mode = "showing";
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const warnings = [
    ...new Set(
      info?.streams
        .map((stream) => codecWarning(stream.codec_name))
        .filter(Boolean) || [],
    ),
  ];
  return (
    <div className="media-options">
      {info?.subtitles.length ? (
        <label>
          Sous-titres{" "}
          <select
            aria-label="Sous-titres"
            disabled={busy}
            value={selected}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">Désactivés</option>
            {info.subtitles.map((item, i) => (
              <option key={i} value={String(i + 1)}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {warnings.map((w) => (
        <p role="status" key={w}>
          {w}
        </p>
      ))}
      {error && <p role="status">{error}</p>}
      <details>
        <summary>Codecs et pistes</summary>
        <p>
          {info?.streams
            .map((stream) => `${stream.codec_type} : ${stream.codec_name}`)
            .join(" · ") || "Diagnostic en cours ou indisponible"}
        </p>
        {info?.note && <p>{info.note}</p>}
        <small>
          SRT/VTT UTF-8 voisins ; pistes textuelles intégrées avec FFmpeg. 128
          Kio par piste.
        </small>
      </details>
      {onConvert && (
        <button onClick={onConvert}>Créer une copie compatible…</button>
      )}
    </div>
  );
}
