import { useEffect, useRef, useState } from "react";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { DownloadDestination } from "./DownloadList";
import {
  imageConstraints,
  imageFormatsForField,
  preparableImage,
} from "./prepare-images";
import {
  imagePreparationsKey,
  insertImagePreparation,
  readImagePreparation,
  restoreImagePreparations,
  startImagePreparation,
  type ImagePreparation,
  type PreparedCopy,
} from "./image-preparations";
import { basename, size, type Entry, type Hello, type Job } from "./types";
import type { BrowserPage, UploadTarget } from "./web";
import { uploadIssue, UPLOAD_TOTAL_BYTES } from "./uploads";
import { ConversionPresets } from "./ConversionPresets";

const formatName = { jpg: "JPEG", png: "PNG", webp: "WebP" };

export function PrepareImagesDialog({
  entries,
  hello,
  path,
  favorites,
  page,
  target,
  onCollect,
}: {
  entries: Entry[];
  hello: Hello | null;
  path: string;
  favorites: { name: string; path: string }[];
  page?: BrowserPage;
  target?: UploadTarget;
  onCollect: (entries: Entry[]) => Promise<boolean>;
}) {
  const images = entries.filter(preparableImage).slice(0, 20);
  const [selected, setSelected] = useState(
    (target && !target.field.multiple ? images.slice(0, 1) : images).map(
      (entry) => entry.path,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<PreparedCopy[]>([]);
  const [resultId, setResultId] = useState("");
  const [history, setHistory] = useState<ImagePreparation[]>([]);
  const [ready, setReady] = useState(false);
  const live = useRef(true);
  const checking = useRef(new AbortController());
  useEffect(() => {
    live.current = true;
    checking.current = new AbortController();
    let revision = 0,
      active = true;
    const read = async () => {
      const id = ++revision;
      try {
        const records = restoreImagePreparations(
          await storageGet(imagePreparationsKey, []),
        );
        if (active && id === revision) {
          setHistory(records);
          setReady(true);
        }
      } catch {
        if (active && id === revision) {
          setReady(false);
          setError(
            "Suivi des préparations illisible. Aucune nouvelle conversion ne sera lancée ; conservez les données et vérifiez le stockage.",
          );
        }
      }
    };
    void read();
    const unsubscribe = storageSubscribe([imagePreparationsKey], read);
    return () => {
      live.current = false;
      active = false;
      checking.current.abort();
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (
      resultId &&
      !history.some((preparation) => preparation.id === resultId)
    ) {
      setResults([]);
      setResultId("");
      setMessage("");
    }
  }, [history, resultId]);
  const available = !!hello?.tools.magick && !!hello.tools.exiftool;
  const resultPreparation = history.find(
    (preparation) => preparation.id === resultId,
  );
  const formats = target
    ? imageFormatsForField(target.field)
    : (["jpg", "png", "webp"] as const);
  const insertionIssue = target
    ? results.some((copy) => !copy.check.compatible)
      ? "Toutes les copies doivent respecter les contraintes de cette préparation."
      : uploadIssue(
          results.map((copy) => copy.entry),
          target.field,
        )
    : null;
  return (
    <section className="spaces-dialog" aria-label="Préparation des images">
      {page && (
        <p>
          Pour {page.title || new URL(page.url).hostname} ·{" "}
          {new URL(page.url).hostname}
        </p>
      )}
      {target && (
        <p>
          Champ choisi : <strong>{target.field.label}</strong> ·{" "}
          {target.field.multiple ? "plusieurs fichiers" : "un seul fichier"}.
          <br />
          Formats déclarés : {target.field.accept || "non précisés"}. Les
          formats de copies proposés suivent cette déclaration ; saisissez les
          dimensions et le poids demandés par le site. L’insertion restera à
          confirmer, avec contrôle de la page et du champ.
        </p>
      )}
      <p>
        Indiquez les contraintes du site. Des copies seront créées ; les
        originaux seront conservés. Fermer ce dialogue laisse la préparation
        continuer ; retrouvez-la dans Préparations récentes. Créer des copies
        n’envoie aucun fichier au site.
      </p>
      {!!history.length && (
        <details>
          <summary>Préparations récentes ({history.length})</summary>
          <p>
            Retrouvez les copies sans les recréer. Leur format, leurs dimensions
            et leur poids sont revérifiés avant de proposer leur collecte.
            Retirer une entrée ne supprime aucun fichier et n’arrête pas sa
            tâche. 20 préparations maximum.
          </p>
          {history.map((preparation) => (
            <article key={preparation.id}>
              <strong>
                {preparation.count} copie(s) ·{" "}
                {formatName[preparation.constraints.format]}
              </strong>
              <p>
                {new Date(preparation.date).toLocaleString()} ·{" "}
                {preparation.paths
                  ? "Copies retrouvées"
                  : preparation.jobId
                    ? "Résultat à vérifier"
                    : "Lancement non confirmé"}
              </p>
              <p>{preparation.destination}</p>
              <small>
                Largeur maximale {preparation.constraints.width} px · Poids
                maximal {size(preparation.constraints.maxBytes)} · Qualité{" "}
                {preparation.constraints.quality}
                <br />
                Métadonnées :{" "}
                {preparation.constraints.strip
                  ? "retrait demandé"
                  : "conservation demandée"}
              </small>
              <button
                disabled={busy || !ready || !hello?.tools.exiftool}
                onClick={() => {
                  setBusy(true);
                  setResults([]);
                  setResultId("");
                  setError("");
                  setMessage("");
                  void (async () => {
                    try {
                      const checked = await readImagePreparation(
                        preparation,
                        checking.current.signal,
                      );
                      if (!live.current) return;
                      if (!checked) {
                        setMessage(
                          "La préparation est encore en cours. Consultez l’activité ou revérifiez plus tard ; aucune conversion relancée.",
                        );
                      } else {
                        setResults(checked);
                        setResultId(preparation.id);
                        setMessage(
                          "Copies revérifiées. Seules celles qui respectent les contraintes enregistrées peuvent être collectées.",
                        );
                      }
                    } catch (error) {
                      if (live.current) setError((error as Error).message);
                    } finally {
                      if (live.current) setBusy(false);
                    }
                  })();
                }}
              >
                Vérifier les copies
              </button>
              <button
                disabled={busy || !ready}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void storageUpdate<unknown>(
                    imagePreparationsKey,
                    [],
                    (value) =>
                      restoreImagePreparations(value).filter(
                        (record) => record.id !== preparation.id,
                      ),
                  )
                    .catch((error) => {
                      if (live.current) setError(error.message);
                    })
                    .finally(() => {
                      if (live.current) setBusy(false);
                    });
                }}
              >
                Retirer du suivi
              </button>
            </article>
          ))}
        </details>
      )}
      {!available && (
        <p role="status">
          ImageMagick et ExifTool doivent être installés pour créer puis
          vérifier les copies.
        </p>
      )}
      {!images.length && (
        <p>
          Ajoutez des images à la collecte, ou sélectionnez des images dans
          l’explorateur.
        </p>
      )}
      {entries.filter(preparableImage).length > 20 && (
        <p>Seules les 20 premières images sont proposées dans ce lot.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void (async () => {
            setBusy(true);
            setError("");
            setMessage("");
            setResults([]);
            setResultId("");
            try {
              const constraints = imageConstraints({
                format: String(data.get("format")) as "jpg",
                width: Number(data.get("width")),
                quality: Number(data.get("quality")),
                maxBytes: Math.round(Number(data.get("maxMB")) * 1024 * 1024),
                strip: data.has("strip"),
              });
              if (
                !formats.includes(constraints.format) ||
                (target && !target.field.multiple && selected.length !== 1)
              )
                throw new Error(
                  "Choisissez un format accepté et le nombre d’images autorisé par ce champ.",
                );
              if (!available || !selected.length || !ready)
                throw new Error(
                  "Sélectionnez des images et vérifiez les moteurs installés.",
                );
              const destination = String(data.get("destination"));
              const folder = await bridge.request<Entry>("FS_STAT", {
                path: destination,
              });
              if (folder.type !== "directory")
                throw new Error(
                  "Choisissez un dossier de destination accessible.",
                );
              const sources: Entry[] = [];
              for (const path of selected) {
                const entry = await bridge.request<Entry>("FS_STAT", { path });
                if (!preparableImage(entry))
                  throw new Error(
                    `Image devenue indisponible : ${basename(path)}`,
                  );
                sources.push(entry);
              }
              const started = await startImagePreparation(
                selected,
                folder.path,
                constraints,
                sources,
              );
              if (live.current) {
                setJobId(started.jobId!);
                setMessage(
                  "Création des copies en cours. Vous pourrez retrouver le résultat dans Préparations récentes après fermeture du dialogue.",
                );
              }
              const deadline = Date.now() + 15 * 60 * 1000;
              let job: Job | undefined;
              while (live.current && Date.now() < deadline) {
                job = (await bridge.request<Job[]>("JOBS")).find(
                  (job) => job.id === started.jobId,
                );
                if (
                  !job ||
                  ["completed", "error", "cancelled"].includes(job.state)
                )
                  break;
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
              if (!live.current) return;
              if (job?.state !== "completed")
                throw new Error(
                  job?.error ||
                    "Préparation non terminée. Consultez l’activité : des copies peuvent avoir été créées.",
                );
              const checked = await readImagePreparation(
                started,
                checking.current.signal,
              );
              if (!checked)
                throw new Error(
                  "Préparation encore en cours. Revérifiez depuis Préparations récentes.",
                );
              if (live.current) {
                setResults(checked);
                setResultId(started.id);
                setMessage(
                  "Copies vérifiées. Seules celles qui respectent les contraintes peuvent être ajoutées à la collecte.",
                );
              }
            } catch (error) {
              if (live.current) setError((error as Error).message);
            } finally {
              if (live.current) {
                setBusy(false);
                setJobId("");
              }
            }
          })();
        }}
      >
        <fieldset disabled={busy || !available || !ready || !formats.length}>
          <legend>Images à préparer</legend>
          <ConversionPresets context="prepare" />
          {images.map((entry) => (
            <label className="checkbox" key={entry.path}>
              <input
                type={target && !target.field.multiple ? "radio" : "checkbox"}
                name="preparation-image"
                checked={selected.includes(entry.path)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? target && !target.field.multiple
                        ? [entry.path]
                        : [...current, entry.path]
                      : current.filter((path) => path !== entry.path),
                  )
                }
              />{" "}
              {entry.name} · {size(entry.size)}
            </label>
          ))}
          <div className="form-grid">
            <label className="field">
              <span>Format des copies</span>
              <select
                name="format"
                aria-label="Format des copies"
                defaultValue={formats[0]}
              >
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {formatName[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Largeur maximale en pixels</span>
              <input
                name="width"
                type="number"
                min={16}
                max={8000}
                required
                defaultValue={1600}
              />
            </label>
            <label className="field">
              <span>Poids maximal en Mo par copie</span>
              <input
                name="maxMB"
                type="number"
                min={0.001}
                max={target ? 20 : 100}
                step={0.001}
                required
                defaultValue={
                  target
                    ? Math.min(
                        2,
                        Math.floor(
                          (20 /
                            Math.max(
                              1,
                              target.field.multiple ? images.length : 1,
                            )) *
                            1000,
                        ) / 1000,
                      )
                    : 2
                }
              />
            </label>
            <label className="field">
              <span>Qualité des copies (1–100)</span>
              <input
                name="quality"
                type="number"
                min={1}
                max={100}
                required
                defaultValue={85}
              />
            </label>
          </div>
          <DownloadDestination
            initialPath={path}
            recent={[]}
            hello={hello}
            favorites={favorites}
          />
          <label className="checkbox">
            <input type="checkbox" name="strip" defaultChecked /> Retirer les
            métadonnées des copies
          </label>
          <button className="primary" type="submit" disabled={!selected.length}>
            Créer et vérifier les copies
          </button>
        </fieldset>
      </form>
      {busy && jobId && (
        <button
          onClick={() =>
            void bridge
              .request("JOB_CONTROL", { jobId, command: "cancel" })
              .catch((error) => setError(error.message))
          }
        >
          Arrêter la préparation
        </button>
      )}
      {!!results.length && resultPreparation && (
        <p>
          Contraintes de ce résultat :{" "}
          {formatName[resultPreparation.constraints.format]} · largeur maximale{" "}
          {resultPreparation.constraints.width} px · poids maximal{" "}
          {size(resultPreparation.constraints.maxBytes)}.
        </p>
      )}
      {results.map(({ entry, check }) => (
        <article key={entry.path}>
          <strong>{entry.name}</strong>
          <small>
            {check.width} × {check.height} px · {size(entry.size)}
          </small>
          <p>
            {check.compatible
              ? "Respecte les contraintes saisies"
              : check.reasons.join(" · ")}
          </p>
          <p>{entry.path}</p>
          <button
            disabled={!check.compatible || busy || !hello || !ready}
            onClick={() => {
              setBusy(true);
              void (async () => {
                try {
                  const current = await bridge.request<Entry>("FS_STAT", {
                    path: entry.path,
                  });
                  if (
                    current.size !== entry.size ||
                    current.mtime !== entry.mtime ||
                    current.type !== "file"
                  )
                    throw new Error(
                      "La copie a changé. Vérifiez-la à nouveau avant de la collecter.",
                    );
                  if (!(await onCollect([current])))
                    throw new Error("Copie non ajoutée à la collecte.");
                  if (live.current)
                    setMessage(
                      "Copie ajoutée à la collecte, prête à être glissée vers le site.",
                    );
                } catch (error) {
                  if (live.current) setError((error as Error).message);
                } finally {
                  if (live.current) setBusy(false);
                }
              })();
            }}
          >
            Ajouter cette copie à la collecte
          </button>
        </article>
      ))}
      {target && !!results.length && resultPreparation && (
        <article aria-label="Insertion des copies préparées">
          <strong>
            Destination : {target.field.label} ·{" "}
            {new URL(target.page.url).hostname}
          </strong>
          <p>
            Insérer ces {results.length} copie(s) remplace les fichiers déjà
            présents dans ce champ. Les copies seront revérifiées avant lecture.
            Limite : 20 fichiers et {size(UPLOAD_TOTAL_BYTES)} au total. Le site
            peut commencer un envoi dès l’insertion ; vérifiez sa réception et
            validez vous-même le formulaire.
          </p>
          {insertionIssue && <p aria-live="polite">{insertionIssue}</p>}
          <button
            className="primary"
            disabled={
              busy || !hello?.tools.exiftool || !ready || !!insertionIssue
            }
            onClick={() => {
              setBusy(true);
              setError("");
              setMessage("");
              void insertImagePreparation(
                resultPreparation,
                target,
                checking.current.signal,
              )
                .then(() => {
                  if (live.current)
                    setMessage(
                      "Copies insérées dans le champ choisi. Vérifiez leur réception avant de valider le formulaire.",
                    );
                })
                .catch((error) => {
                  if (live.current) {
                    setError(error.message);
                    setResults([]);
                    setResultId("");
                  }
                })
                .finally(() => {
                  if (live.current) setBusy(false);
                });
            }}
          >
            Insérer les copies dans ce champ
          </button>
        </article>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
