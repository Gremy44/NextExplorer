import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Plus, SlidersHorizontal } from "lucide-react";
import { basename, size, type Hello, type Job } from "./types";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { FolderPicker } from "./FolderPicker";
import {
  canFileDownload,
  downloadFilingKey,
  downloadRunsKey,
  type DownloadRun,
  downloadSite,
  downloadSuggestion,
  normalizeDownloadRule,
  restoreDownloadFiling,
  restoreDownloadRuns,
  type DownloadFiling,
  type DownloadRule,
} from "./downloads";

export function DownloadDestination({
  initialPath,
  recent,
  hello,
  favorites,
  onChange,
}: {
  initialPath: string;
  recent: string[];
  hello: Hello | null;
  favorites: { name: string; path: string }[];
  onChange?: (path: string) => void;
}) {
  const [path, setPath] = useState(initialPath);
  const [choosing, setChoosing] = useState(false);
  function choose(path: string) {
    setPath(path);
    onChange?.(path);
  }
  return (
    <div className="download-destination">
      <label className="field">
        <span>Dossier de destination</span>
        <input
          name="destination"
          required
          value={path}
          onChange={(event) => choose(event.target.value)}
        />
      </label>
      <button type="button" disabled={!hello} onClick={() => setChoosing(true)}>
        <FolderOpen size={18} aria-hidden="true" /> Parcourir les dossiers
      </button>
      {recent.length > 0 && (
        <label className="field">
          <span>Destinations mémorisées</span>
          <select
            aria-label="Destinations mémorisées"
            value={recent.includes(path) ? path : ""}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="" disabled>
              Choisir une destination…
            </option>
            {recent.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
        </label>
      )}
      {choosing &&
        hello &&
        createPortal(
          <FolderPicker
            hello={hello}
            path={path || hello.home}
            favorites={favorites}
            onChoose={(folder) => {
              choose(folder);
              setChoosing(false);
            }}
            onClose={() => setChoosing(false)}
          />,
          document.body,
        )}
    </div>
  );
}

export function DownloadList({
  connected,
  jobs,
  hello,
  path,
  favorites,
  onChoose,
}: {
  connected: boolean;
  jobs: Job[];
  hello: Hello | null;
  path: string;
  favorites: { name: string; path: string }[];
  onChoose: (
    item: chrome.downloads.DownloadItem,
    filing: DownloadFiling,
  ) => void;
}) {
  const [allowed, setAllowed] = useState(false);
  const [runs, setRuns] = useState<DownloadRun[]>([]);
  const [items, setItems] = useState<chrome.downloads.DownloadItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filing, setFiling] = useState<DownloadFiling>({
    rules: [],
    destinations: [],
  });
  const [filingReady, setFilingReady] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [saved, setSaved] = useState("");
  const [editing, setEditing] = useState<DownloadRule | null>(null);
  const [saving, setSaving] = useState(false);
  const rulesBox = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let live = true,
      revision = 0;
    const read = async () => {
      const request = ++revision;
      try {
        const [raw, history] = await Promise.all([
          storageGet(downloadFilingKey, null),
          storageGet<DownloadRun[]>(downloadRunsKey, []),
        ]);
        const value = restoreDownloadFiling(raw);
        if (live && request === revision) {
          setFiling(value);
          setFilingReady(true);
          setRuns(restoreDownloadRuns(history));
        }
      } catch (error) {
        if (live && request === revision) {
          setFilingReady(false);
          setRuleError(
            `Préférences indisponibles : ${(error as Error).message}`,
          );
        }
      }
    };
    void read();
    const unsubscribe = storageSubscribe(
      [downloadFilingKey, downloadRunsKey],
      read,
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [refresh]);

  function edit(rule?: DownloadRule, item?: chrome.downloads.DownloadItem) {
    setRuleError("");
    setSaved("");
    const extension = item
      ? basename(item.filename)
          .match(/\.[a-z0-9]{1,16}$/i)?.[0]
          .toLowerCase() || ""
      : "";
    const site = item ? downloadSite(item) : "";
    setEditing(
      rule
        ? { ...rule, automatic: false, automaticSince: undefined }
        : {
            id: crypto.randomUUID(),
            name: item
              ? `${extension.slice(1).toUpperCase() || "Fichiers"}${site ? ` de ${site}` : ""}`.slice(
                  0,
                  80,
                )
              : "",
            site,
            extension,
            destination: path,
            enabled: true,
          },
    );
    if (rulesBox.current) rulesBox.current.open = true;
  }
  async function updateRules(
    update: (rules: DownloadRule[]) => DownloadRule[],
    message: string,
  ) {
    const value = await storageUpdate<unknown>(
      downloadFilingKey,
      null,
      (raw) => {
        const current = restoreDownloadFiling(raw);
        return { ...current, rules: update(current.rules) };
      },
    );
    setFiling(restoreDownloadFiling(value));
    setSaved(message);
  }
  async function changeRules(
    update: (rules: DownloadRule[]) => DownloadRule[],
    message: string,
  ) {
    setSaving(true);
    setRuleError("");
    setSaved("");
    try {
      await updateRules(update, message);
    } catch (error) {
      setRuleError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    let live = true;
    chrome.permissions
      .contains({ permissions: ["downloads"] })
      .then((value) => {
        if (live) setAllowed(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!allowed) return;
    let live = true,
      revision = 0;
    const read = async () => {
      const request = ++revision;
      setLoading(true);
      try {
        const entries = await chrome.downloads.search({
          limit: 20,
          orderBy: ["-startTime"],
        });
        if (live && request === revision) {
          setItems(entries.filter((item) => !item.incognito));
          setError("");
        }
      } catch (e) {
        if (live && request === revision) setError((e as Error).message);
      } finally {
        if (live && request === revision) setLoading(false);
      }
    };
    void read();
    chrome.downloads.onCreated.addListener(read);
    chrome.downloads.onChanged.addListener(read);
    chrome.downloads.onErased.addListener(read);
    return () => {
      live = false;
      chrome.downloads.onCreated.removeListener(read);
      chrome.downloads.onChanged.removeListener(read);
      chrome.downloads.onErased.removeListener(read);
    };
  }, [allowed, refresh]);
  const moves = jobs.flatMap(
    (job) =>
      job.audit?.entries
        .filter((entry) => entry.status === "moved")
        .map((entry) => entry.source) || [],
  );
  return (
    <section className="downloads-list" aria-label="Téléchargements récents">
      <p>
        Les 20 derniers téléchargements de ce profil Chrome. Seuls les fichiers
        terminés et disponibles peuvent être rangés.
      </p>
      {!allowed ? (
        <button
          className="primary"
          onClick={async () => {
            try {
              if (
                !(await chrome.permissions.request({
                  permissions: ["downloads"],
                }))
              )
                throw new Error("Accès aux téléchargements refusé");
              setAllowed(true);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Autoriser l’accès aux téléchargements
        </button>
      ) : (
        <>
          <button
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Actualiser les téléchargements
          </button>
          <details
            ref={rulesBox}
            className="download-rules companion-disclosure"
          >
            <summary>
              <SlidersHorizontal size={18} aria-hidden="true" /> Règles de
              rangement <span className="muted">{filing.rules.length}</span>
            </summary>
            <p>
              Choisissez un site et/ou une extension pour proposer le dossier.
              Le rangement automatique s’active séparément dans chaque règle.
            </p>
            <button
              type="button"
              disabled={!connected || !filingReady || saving}
              onClick={() => edit()}
            >
              <Plus size={18} aria-hidden="true" /> Nouvelle règle
            </button>
            {filing.rules.map((rule) => (
              <article key={rule.id}>
                <strong>{rule.name}</strong>
                <small>
                  {rule.site || "Tous les sites"} ·{" "}
                  {rule.extension || "Tous les formats"}
                </small>
                <p>{rule.destination}</p>
                <small>
                  {rule.automatic
                    ? rule.enabled
                      ? "Rangement automatique activé"
                      : "Rangement automatique en pause"
                    : "Confirmation manuelle"}
                </small>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={saving}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      void changeRules(
                        (rules) =>
                          rules.map((current) =>
                            current.id === rule.id
                              ? {
                                  ...current,
                                  enabled,
                                  ...(current.automatic && enabled
                                    ? {
                                        automaticSince:
                                          new Date().toISOString(),
                                      }
                                    : {}),
                                }
                              : current,
                          ),
                        enabled ? "Règle activée." : "Règle désactivée.",
                      );
                    }}
                  />{" "}
                  Utiliser la règle {rule.name}
                </label>
                <div className="download-rule-actions">
                  <button
                    type="button"
                    disabled={!connected || saving}
                    aria-label={`Modifier la règle ${rule.name}`}
                    onClick={() => edit(rule)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    aria-label={`Supprimer la règle ${rule.name}`}
                    onClick={() =>
                      void changeRules(
                        (rules) =>
                          rules.filter((current) => current.id !== rule.id),
                        "Règle supprimée.",
                      )
                    }
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
            {editing && (
              <form
                className="download-rule-editor"
                aria-label="Éditer une règle de rangement"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSaving(true);
                  setRuleError("");
                  setSaved("");
                  try {
                    const rule = normalizeDownloadRule({
                      ...editing,
                      automaticSince: editing.automatic
                        ? new Date().toISOString()
                        : undefined,
                    });
                    const folder = await bridge.request<{
                      type: string;
                      path: string;
                    }>("FS_STAT", { path: rule.destination });
                    if (folder.type !== "directory")
                      throw new Error(
                        "La destination doit être un dossier accessible.",
                      );
                    rule.destination = folder.path;
                    if (
                      rule.automatic &&
                      !(await chrome.permissions.contains({
                        permissions: ["downloads"],
                      }))
                    )
                      throw new Error(
                        "Autorisez l’accès aux téléchargements avant d’activer le rangement automatique.",
                      );
                    await updateRules((rules) => {
                      if (
                        !rules.some((current) => current.id === rule.id) &&
                        rules.length >= 50
                      )
                        throw new Error(
                          "50 règles maximum. Supprimez une règle avant d’en ajouter une.",
                        );
                      if (rule.automatic)
                        rule.automaticSince = new Date().toISOString();
                      return [
                        ...rules.filter((current) => current.id !== rule.id),
                        rule,
                      ];
                    }, "Règle enregistrée.");
                    setEditing(null);
                  } catch (error) {
                    setRuleError((error as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <fieldset disabled={saving}>
                  <legend>
                    {filing.rules.some((rule) => rule.id === editing.id)
                      ? "Modifier la règle"
                      : "Nouvelle règle"}
                  </legend>
                  <label className="field">
                    <span>Nom de la règle</span>
                    <input
                      autoFocus
                      required
                      maxLength={80}
                      value={editing.name}
                      onChange={(event) =>
                        setEditing({ ...editing, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Site d’origine (facultatif)</span>
                    <input
                      placeholder="exemple.fr"
                      maxLength={2048}
                      value={editing.site}
                      onChange={(event) =>
                        setEditing({ ...editing, site: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Extension (facultative)</span>
                    <input
                      placeholder=".pdf"
                      maxLength={17}
                      value={editing.extension}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          extension: event.target.value,
                        })
                      }
                    />
                  </label>
                  <small>
                    Un site ou une extension suffit. Les deux critères se
                    combinent ; les sous-domaines sont distincts.
                  </small>
                  <DownloadDestination
                    key={editing.id}
                    initialPath={editing.destination}
                    recent={filing.destinations}
                    hello={hello}
                    favorites={favorites}
                    onChange={(destination) =>
                      setEditing((rule) =>
                        rule ? { ...rule, destination } : rule,
                      )
                    }
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!editing.automatic}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          automatic: event.target.checked,
                        })
                      }
                    />{" "}
                    Ranger automatiquement les nouveaux téléchargements
                  </label>
                  <small>
                    Après enregistrement, les nouveaux téléchargements terminés
                    seront déplacés dans ce dossier, même panneau fermé, tant
                    que Chrome et le compagnon sont disponibles. En cas de
                    conflit, les deux fichiers sont conservés.
                    {filing.rules.some(
                      (rule) => rule.id === editing.id && rule.automatic,
                    ) &&
                      " Confirmez à nouveau cette option après modification de la règle."}
                  </small>
                  <div className="download-rule-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setRuleError("");
                      }}
                    >
                      Annuler la règle
                    </button>
                    <button
                      className="primary"
                      type="submit"
                      disabled={!connected}
                    >
                      Enregistrer la règle
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
            {saved && <p role="status">{saved}</p>}
          </details>
          {runs.length > 0 && (
            <details className="download-rules companion-disclosure">
              <summary>Suivi des rangements</summary>
              <p>
                Après une interruption, aucune tentative n’est rejouée.
                Consultez l’activité native avant de déplacer à nouveau un
                fichier.
              </p>
              {runs.slice(0, 20).map((run) => (
                <article key={run.key}>
                  <strong>{run.name}</strong>
                  <small>
                    {run.automatic && "Automatique · "}
                    {
                      {
                        blocked:
                          "À ranger manuellement — aucun transfert lancé",
                        reserved: "Lancement réservé — vérifier l’activité",
                        running: "Transfert lancé — consulter l’activité",
                        completed: "Rangé",
                        error: "Rangement non terminé",
                        uncertain: "Résultat à vérifier",
                      }[run.state]
                    }
                  </small>
                  <p>{run.destination}</p>
                  {run.message && <p role="status">{run.message}</p>}
                </article>
              ))}
            </details>
          )}
          {loading && <p role="status">Actualisation…</p>}
          {!loading && !items.length && <p>Aucun téléchargement récent.</p>}
          {items.map((item) => {
            const suggestion = downloadSuggestion(item, filing.rules);
            const moved =
              item.state === "complete" &&
              !item.exists &&
              moves.includes(item.filename);
            // ponytail: one transfer at a time here; refine by source if concurrent filing becomes necessary.
            const working = jobs.some(
              (job) =>
                job.kind === "transfer" &&
                ["queued", "running", "paused"].includes(job.state),
            );
            const status = moved
              ? "Rangé"
              : item.state === "in_progress"
                ? "En cours"
                : item.state === "interrupted"
                  ? "Interrompu"
                  : !item.exists
                    ? "Fichier absent"
                    : !canFileDownload(item)
                      ? "Indisponible"
                      : "Terminé";
            return (
              <article key={item.id}>
                <strong>{basename(item.filename) || "Téléchargement"}</strong>
                <small>
                  {status}
                  {item.fileSize >= 0 ? ` · ${size(item.fileSize)}` : ""}
                </small>
                <p>{item.filename || "Emplacement pas encore connu"}</p>
                {downloadSite(item) && (
                  <small>Site d’origine : {downloadSite(item)}</small>
                )}
                {suggestion.destination && (
                  <p>
                    Destination proposée :{" "}
                    <strong>{suggestion.destination}</strong>
                    <br />
                    <small>
                      Règle :{" "}
                      {suggestion.rules.map((rule) => rule.name).join(", ")}
                    </small>
                  </p>
                )}
                {suggestion.ambiguous && (
                  <p>
                    Plusieurs règles proposent des dossiers différents.
                    Choisissez la destination dans le dialogue.
                  </p>
                )}
                <div className="download-rule-actions">
                  <button
                    disabled={
                      !connected ||
                      !filingReady ||
                      !canFileDownload(item) ||
                      moved ||
                      working
                    }
                    onClick={() => onChoose(item, filing)}
                    aria-label={`Ranger ${basename(item.filename) || "ce téléchargement"}`}
                  >
                    Ranger…
                  </button>
                  <button
                    type="button"
                    disabled={
                      !connected ||
                      !filingReady ||
                      !canFileDownload(item) ||
                      saving
                    }
                    aria-label={`Créer une règle pour ${basename(item.filename)}`}
                    onClick={() => edit(undefined, item)}
                  >
                    Créer une règle…
                  </button>
                </div>
              </article>
            );
          })}
        </>
      )}
      {ruleError && (
        <p className="error" role="alert">
          {ruleError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
