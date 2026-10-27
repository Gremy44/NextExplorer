import { Help } from "./Help";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileImage,
  Film,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { bridge } from "./bridge";
import { ConversionPresets } from "./ConversionPresets";
import { DownloadDestination } from "./DownloadList";
import { basename, size, type Entry, type Hello } from "./types";
import {
  CONVERSION_LIMIT,
  codecLabels,
  conversionKind,
  conversionOptions,
  conversionPayload,
  formatLabels,
  imageFormats,
  videoCodecs,
  videoFormats,
  type MediaKind,
} from "./media-conversion";
import "./conversion.css";

export function ConversionDialog({
  paths,
  destination,
  initialFormat,
  hello,
  favorites,
  onClose,
  onStart,
  onBusy,
  onEntriesReady,
}: {
  paths: string[];
  destination: string;
  initialFormat?: string;
  hello: Hello | null;
  favorites: { name: string; path: string }[];
  onClose: () => void;
  onStart: (payload: Record<string, unknown>) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  onEntriesReady?: (entries: Entry[]) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [unavailable, setUnavailable] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [encoders, setEncoders] = useState<string[]>([]),
    [encoderError, setEncoderError] = useState(""),
    [kind, setKind] = useState<MediaKind>("image"),
    [options, setOptions] = useState(() =>
      conversionOptions("image", { format: initialFormat }),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    setReady(false);
    setEncoderError("");
    let stopped = false;
    void (async () => {
      const files: Entry[] = [],
        missing: string[] = [];
      for (const path of [...new Set(paths)].slice(0, CONVERSION_LIMIT)) {
        if (stopped) return;
        try {
          files.push(await bridge.request<Entry>("FS_STAT", { path }));
        } catch {
          missing.push(path);
        }
      }
      if (stopped) return;
      const nextKind = files.some((entry) => conversionKind(entry) === "image")
        ? "image"
        : "video";
      let supported: string[] = [];
      if (
        files.some((entry) => conversionKind(entry) === "video") &&
        hello?.tools.ffmpeg
      ) {
        try {
          const capabilities = await bridge.request<{ encoders: string[] }>(
            "CONVERSION_CAPABILITIES",
            {},
            8000,
          );
          if (!Array.isArray(capabilities?.encoders))
            throw new Error("Liste des encodeurs illisible.");
          supported = capabilities.encoders.filter(
            (codec) =>
              typeof codec === "string" && videoCodecs.mkv.includes(codec),
          );
        } catch (e) {
          if (!stopped) setEncoderError((e as Error).message);
        }
      }
      if (stopped) return;
      setEncoders(supported);
      setEntries(files);
      onEntriesReady?.(files);
      setUnavailable(missing);
      setKind(nextKind);
      setOptions(
        conversionOptions(nextKind, { format: initialFormat }, supported),
      );
      setReady(true);
    })();
    return () => {
      stopped = true;
      live.current = false;
    };
  }, [paths, initialFormat, hello]);
  const images = entries.filter((entry) => conversionKind(entry) === "image"),
    videos = entries.filter((entry) => conversionKind(entry) === "video"),
    selected = kind === "image" ? images : videos,
    excluded = entries.filter((entry) => !conversionKind(entry)),
    tooMany = new Set(paths).size > CONVERSION_LIMIT,
    available =
      !!hello?.features?.contextualConversion &&
      !hello.workerError &&
      (kind === "image"
        ? !!hello.tools.magick
        : !!hello?.tools.ffmpeg &&
          !!hello?.tools.ffprobe &&
          (options.mode === "remux" || encoders.includes(options.codec))),
    remux = kind === "video" && options.mode === "remux",
    lossy = ["jpg", "webp", "avif"].includes(options.format);
  const update = <K extends keyof typeof options>(
    key: K,
    value: (typeof options)[K],
  ) => {
    setError("");
    setOptions((old) => ({ ...old, [key]: value }));
  };
  const changeKind = (next: MediaKind) => {
    setKind(next);
    setOptions(conversionOptions(next, {}, encoders));
    setError("");
  };
  return (
    <form
      className="conversion-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget,
          data = new FormData(form);
        setBusy(true);
        onBusy?.(true);
        setError("");
        void (async () => {
          try {
            if (!ready || !available || !selected.length || tooMany)
              throw new Error(
                "Choisissez un lot admissible et vérifiez les moteurs.",
              );
            const folder = await bridge.request<Entry>("FS_STAT", {
              path: String(data.get("destination")),
            });
            if (folder.type !== "directory")
              throw new Error(
                "Choisissez un dossier de destination accessible.",
              );
            for (const entry of selected) {
              if (!live.current) return;
              const current = await bridge.request<Entry>("FS_STAT", {
                path: entry.path,
              });
              if (
                conversionKind(current) !== kind ||
                current.size !== entry.size ||
                current.mtime !== entry.mtime ||
                current.stamp !== entry.stamp
              )
                throw new Error(
                  `Fichier modifié : ${entry.name}. Fermez puis rouvrez le convertisseur.`,
                );
            }
            if (!live.current) return;
            await onStart({
              ...conversionPayload(kind, options),
              paths: selected.map((e) => e.path),
              destination: folder.path,
              name: options.archive ? String(data.get("recipeName")) : "",
              paused: data.get("paused") === "on",
            });
          } catch (e) {
            if (live.current) setError((e as Error).message);
          } finally {
            if (live.current) setBusy(false);
            onBusy?.(false);
          }
        })();
      }}
    >
      <div className="modal-content conversion-content">
        {!ready ? (
          <p role="status">
            <LoaderCircle size={18} className="spin" /> Vérification de la
            sélection…
          </p>
        ) : (
          <>
            <fieldset disabled={busy} className="conversion-fields">
              <legend className="sr-only">Options de conversion</legend>
              {images.length > 0 && videos.length > 0 && (
                <div
                  className="conversion-kinds"
                  role="group"
                  aria-label="Type de fichiers à convertir"
                >
                  <button
                    type="button"
                    aria-pressed={kind === "image"}
                    onClick={() => changeKind("image")}
                  >
                    <FileImage size={18} /> Images ({images.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === "video"}
                    onClick={() => changeKind("video")}
                  >
                    <Film size={18} /> Vidéos ({videos.length})
                  </button>
                </div>
              )}
              <div className="conversion-source">
                <div className="conversion-symbol">
                  {kind === "image" ? (
                    <FileImage size={28} />
                  ) : (
                    <Film size={28} />
                  )}
                </div>
                <div>
                  <h2>
                    {selected.length
                      ? `${selected.length} ${kind === "image" ? "image" : "vidéo"}${selected.length > 1 ? "s" : ""} à convertir`
                      : "Aucun fichier compatible"}
                  </h2>
                  <p>
                    {selected.length
                      ? `${size(selected.reduce((sum, e) => sum + e.size, 0))} au total · copies dans un dossier de votre choix`
                      : "Sélectionnez des images ou des vidéos dans l’explorateur."}
                  </p>
                </div>
              </div>
              {(excluded.length > 0 ||
                unavailable.length > 0 ||
                (images.length > 0 && videos.length > 0)) && (
                <div className="conversion-notice" role="status">
                  Seul le lot {kind === "image" ? "d’images" : "de vidéos"}{" "}
                  affiché sera traité. Les autres fichiers restent exclus.
                  <details>
                    <summary>Voir la sélection et les exclusions</summary>
                    <ul className="conversion-files">
                      {entries.map((e) => (
                        <li key={e.path}>
                          <span title={e.path}>{e.name}</span>
                          <span>
                            {conversionKind(e) === kind
                              ? "Inclus"
                              : "Non traité"}
                          </span>
                        </li>
                      ))}
                      {unavailable.map((path) => (
                        <li key={path}>
                          <span>{basename(path)}</span>
                          <span>Inaccessible</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              {tooMany && (
                <p className="error" role="alert">
                  Sélectionnez au maximum {CONVERSION_LIMIT} fichiers. Aucun lot
                  ne sera lancé.
                </p>
              )}
              {!images.length && !videos.length && (
                <p className="conversion-notice">
                  Le convertisseur accepte les images matricielles et les
                  vidéos. Les documents, fichiers audio seuls, dossiers et liens
                  ne sont pas pris en charge.
                </p>
              )}
              {selected.length > 0 && (
                <>
                  {!available && (
                    <p className="error" role="alert">
                      {!hello?.features?.contextualConversion ||
                      hello.workerError
                        ? "Mettez à jour le compagnon et vérifiez sa connexion pour convertir."
                        : kind === "image"
                          ? "Installez le moteur ImageMagick depuis Réglages et moteurs."
                          : !hello.tools.ffmpeg || !hello.tools.ffprobe
                            ? "Installez FFmpeg et FFprobe depuis Réglages et moteurs."
                            : encoderError ||
                              "Aucun encodeur installé ne convient à ce format. Choisissez un autre format ou changez de conteneur sans réencoder."}
                    </p>
                  )}
                  <div className="conversion-grid">
                    <section className="conversion-section">
                      <h3>
                        <span>1</span> Format de sortie
                      </h3>
                      <ConversionPresets
                        key={kind}
                        context="convert"
                        mediaKind={kind}
                        encoders={encoders}
                        onApply={(values) =>
                          setOptions(conversionOptions(kind, values, encoders))
                        }
                      />
                      <label className="field">
                        <span>Format des copies</span>
                        <select
                          name="format"
                          value={options.format}
                          onChange={(e) =>
                            setOptions(
                              conversionOptions(
                                kind,
                                {
                                  ...options,
                                  format: e.target.value,
                                },
                                encoders,
                              ),
                            )
                          }
                        >
                          {(kind === "image" ? imageFormats : videoFormats).map(
                            (format) => (
                              <option key={format} value={format}>
                                {formatLabels[format]}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <div className="conversion-output">
                        <span>
                          {selected.length === 1
                            ? selected[0].name
                            : `${selected.length} fichiers`}
                        </span>
                        <ArrowRight size={16} />
                        <strong>.{options.format}</strong>
                      </div>
                      <Help>
                        Les noms sont conservés. Si une copie existe déjà, un
                        numéro est ajouté.
                      </Help>
                    </section>
                    <section className="conversion-section">
                      <h3>
                        <span>2</span>{" "}
                        {kind === "image"
                          ? "Image et dimensions"
                          : "Qualité et dimensions"}
                      </h3>
                      <input type="hidden" name="mode" value={options.mode} />
                      {!remux && (
                        <>
                          {kind === "image" ? (
                            <>
                              {lossy ? (
                                <label className="field">
                                  <span>
                                    Qualité de l’image · {options.quality} %
                                  </span>
                                  <input
                                    name="quality"
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={options.quality}
                                    onChange={(e) =>
                                      update("quality", e.target.value)
                                    }
                                  />
                                  <small>
                                    Une valeur plus élevée conserve davantage de
                                    détails.
                                  </small>
                                </label>
                              ) : (
                                <p className="muted">
                                  {options.format === "gif"
                                    ? "Palette limitée à 256 couleurs."
                                    : "Aucun réglage de qualité nécessaire pour ce format."}
                                </p>
                              )}
                            </>
                          ) : (
                            <label className="field">
                              <span>Qualité vidéo</span>
                              <select
                                name="videoQuality"
                                value={options.videoQuality}
                                onChange={(e) =>
                                  update("videoQuality", e.target.value)
                                }
                              >
                                <option value="balanced">
                                  Équilibrée · usage courant
                                </option>
                                <option value="high">
                                  Élevée · plus de détails
                                </option>
                                <option value="small">
                                  Compacte · fichier plus léger
                                </option>
                              </select>
                            </label>
                          )}
                          <label className="field">
                            <span>Largeur maximale en pixels</span>
                            <input
                              name="width"
                              type="number"
                              min="0"
                              max={kind === "image" ? 20000 : 7680}
                              required
                              value={options.width}
                              onChange={(e) => update("width", e.target.value)}
                            />
                            <small>
                              0 conserve la taille. Proportions conservées,
                              aucun agrandissement.
                            </small>
                          </label>
                          {kind === "image" && (
                            <p className="muted">
                              {options.format === "jpg"
                                ? "JPEG ne conserve pas la transparence : les zones transparentes deviennent blanches. "
                                : ""}
                              Sources : 256 Mio et 100 mégapixels maximum. GIF
                              animés et TIFF multipages : première image
                              uniquement.
                            </p>
                          )}
                        </>
                      )}
                      <details className="conversion-advanced">
                        <summary>Réglages avancés</summary>
                        {kind === "video" && (
                          <>
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={remux}
                                onChange={(e) =>
                                  update(
                                    "mode",
                                    e.target.checked ? "remux" : "convert",
                                  )
                                }
                              />{" "}
                              Changer de conteneur sans réencoder
                            </label>
                            {remux ? (
                              <p className="muted">
                                Qualité d’origine conservée. Le conteneur choisi
                                doit accepter les pistes d’origine ; un format
                                incompatible sera refusé.
                              </p>
                            ) : (
                              <>
                                <label className="field">
                                  <span>Encodage vidéo</span>
                                  <select
                                    name="codec"
                                    value={options.codec}
                                    onChange={(e) =>
                                      update("codec", e.target.value)
                                    }
                                  >
                                    {videoCodecs[options.format]
                                      .filter((codec) =>
                                        encoders.includes(codec),
                                      )
                                      .map((codec) => (
                                        <option value={codec} key={codec}>
                                          {codecLabels[codec]}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>
                                    Taille cible par vidéo en Mio (facultatif)
                                  </span>
                                  <input
                                    name="targetMB"
                                    type="number"
                                    min="0"
                                    max="100000"
                                    value={options.targetMB}
                                    onChange={(e) =>
                                      update("targetMB", e.target.value)
                                    }
                                  />
                                  <small>
                                    0 utilise la qualité choisie. Une cible est
                                    une estimation, sans taille garantie.
                                  </small>
                                </label>
                                <label className="field">
                                  <span>Débit des pistes audio en kbit/s</span>
                                  <input
                                    name="bitrate"
                                    type="number"
                                    min="32"
                                    max="512"
                                    required
                                    value={options.bitrate}
                                    onChange={(e) =>
                                      update("bitrate", e.target.value)
                                    }
                                  />
                                </label>
                                <label className="checkbox">
                                  <input
                                    name="normalize"
                                    type="checkbox"
                                    checked={options.normalize}
                                    onChange={(e) =>
                                      update("normalize", e.target.checked)
                                    }
                                  />{" "}
                                  Normaliser le volume
                                </label>
                              </>
                            )}
                            <p className="muted">
                              Première piste vidéo et pistes audio. Sous-titres
                              et pièces jointes non copiés. Encodage logiciel ;
                              seuls les encodeurs détectés sont proposés.
                            </p>
                          </>
                        )}
                        <label className="checkbox">
                          <input
                            name="strip"
                            type="checkbox"
                            checked={options.strip}
                            onChange={(e) => update("strip", e.target.checked)}
                          />{" "}
                          Retirer les métadonnées des copies
                        </label>
                      </details>
                    </section>
                  </div>
                  <section className="conversion-section conversion-destination">
                    <h3>
                      <span>3</span> Enregistrer les copies
                    </h3>
                    <DownloadDestination
                      initialPath={destination}
                      recent={[]}
                      hello={hello}
                      favorites={favorites}
                    />
                    <label className="checkbox">
                      <input
                        name="archive"
                        type="checkbox"
                        checked={options.archive}
                        disabled={!hello?.features?.durableJobs}
                        onChange={(e) => update("archive", e.target.checked)}
                      />{" "}
                      Puis créer une archive ZIP des copies
                    </label>
                    {options.archive && (
                      <label className="field">
                        <span>Nom de l’archive de la recette</span>
                        <input
                          name="recipeName"
                          defaultValue="Copies.zip"
                          required
                          maxLength={120}
                          pattern=".*\.[zZ][iI][pP]"
                        />
                      </label>
                    )}
                    {hello?.features?.durableJobs && (
                      <label className="checkbox">
                        <input name="paused" type="checkbox" /> Démarrer en
                        pause dans l’activité
                      </label>
                    )}
                    <p className="conversion-preserve">
                      <ShieldCheck size={18} /> Vos originaux sont conservés.
                      L’activité permet de suivre et d’arrêter le traitement.
                    </p>
                  </section>
                </>
              )}
            </fieldset>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          className="primary"
          type="submit"
          disabled={busy || !ready || !selected.length || !available || tooMany}
        >
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" /> Vérification…
            </>
          ) : (
            `Créer ${selected.length} copie${selected.length > 1 ? "s" : ""}`
          )}
        </button>
      </footer>
    </form>
  );
}
