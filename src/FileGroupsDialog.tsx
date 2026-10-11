import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Layers, Plus, Settings2, Trash2 } from "lucide-react";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { FileIcon } from "./Preview";
import { groupFileOrigins, ORIGIN_FILE_LIMIT } from "./file-origins";
import {
  PROVENANCE_LIMIT,
  readProvenance,
  type Provenance,
} from "./provenance";
import {
  downloadFilingKey,
  restoreDownloadFiling,
  type DownloadFiling,
} from "./downloads";
import {
  GROUP_TRANSFER_LIMIT,
  groupFileDestinations,
} from "./file-destinations";
import {
  changeGroupCategories,
  defaultGroupCategories,
  fileExtension,
  groupCategoriesKey,
  GROUP_ENTRY_LIMIT,
  groupFiles,
  groupModifiedDates,
  groupRelatedNames,
  listGroupFolder,
  restoreGroupCategories,
  type GroupCategories,
} from "./file-groups";
import { size, type CollectionEntry, type Entry } from "./types";

export function FileGroupsDialog({
  selection,
  path,
  connected,
  showHidden,
  space,
  onLocate,
  onTransfer,
  onRules,
}: {
  selection: CollectionEntry[];
  path: string;
  connected: boolean;
  showHidden: boolean;
  space: { name: string; entries: CollectionEntry[] } | null;
  onLocate: (path: string) => void;
  onTransfer: (
    entries: Entry[],
    destination: string,
    origins?: Map<string, Provenance>,
  ) => void;
  onRules: () => void;
}) {
  const [scope, setScope] = useState<"selection" | "folder" | "space">(
    selection.length ? "selection" : "folder",
  );
  const [config, setConfig] = useState<GroupCategories | null>(null);
  const [mode, setMode] = useState<
    "format" | "name" | "date" | "origin" | "destination"
  >("format");
  const [useOrigins, setUseOrigins] = useState(false);
  const checksOrigins =
    mode === "origin" || (mode === "destination" && useOrigins);
  const [filing, setFiling] = useState<DownloadFiling | null>(null);
  const stored = useRef<unknown>(null);
  const editBase = useRef<unknown>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ name: string; extensions: string }[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    entries: CollectionEntry[];
    total: number;
    source: string;
    at: Date;
    originGroups?: Awaited<ReturnType<typeof groupFileOrigins>>;
  } | null>(null);
  useEffect(() => {
    let live = true,
      revision = 0;
    async function read() {
      const id = ++revision;
      try {
        const value = await storageGet<unknown>(downloadFilingKey, null);
        if (live && id === revision) setFiling(restoreDownloadFiling(value));
      } catch (error) {
        if (live && id === revision) {
          setFiling(null);
          setError((error as Error).message);
        }
      }
    }
    void read();
    const unsubscribe = storageSubscribe([downloadFilingKey], read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true,
      revision = 0;
    async function read() {
      const id = ++revision;
      try {
        const value = await storageGet<unknown>(groupCategoriesKey, null);
        if (!live || id !== revision) return;
        stored.current = value;
        setReady(true);
        setConfig(restoreGroupCategories(value));
      } catch (error) {
        if (live && id === revision) {
          setConfig(null);
          setError((error as Error).message);
        }
      }
    }
    void read();
    const unsubscribe = storageSubscribe([groupCategoriesKey], read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    return () => controller.current?.abort();
  }, [
    scope,
    scope === "selection" ? selection : null,
    path,
    connected,
    showHidden,
    scope === "space" ? space : null,
  ]);
  const nameGroups = useMemo(
    () =>
      result && mode === "name" ? groupRelatedNames(result.entries) : null,
    [result, mode],
  );
  const destinationGroups = useMemo(
    () =>
      result && mode === "destination" && filing
        ? groupFileDestinations(
            result.entries,
            filing.rules,
            useOrigins ? result.originGroups : undefined,
          )
        : null,
    [result, mode, filing, useOrigins],
  );
  const grouped = useMemo(
    () =>
      result
        ? mode === "origin"
          ? result.originGroups || null
          : mode === "destination"
            ? destinationGroups
            : mode === "name"
              ? nameGroups
              : mode === "date"
                ? groupModifiedDates(result.entries)
                : config
                  ? groupFiles(result.entries, config)
                  : null
        : null,
    [result, config, mode, nameGroups, destinationGroups],
  );
  const fileCount =
    (checksOrigins
      ? result?.originGroups?.examined
      : grouped?.groups.reduce(
          (count, group) => count + group.entries.length,
          0,
        )) || 0;
  async function analyze() {
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setMessage("");
    setResult(null);
    try {
      const data =
        scope === "folder"
          ? await listGroupFolder(
              path,
              showHidden,
              (payload) => bridge.request("FS_LIST_DIR", payload, 15000),
              current.signal,
            )
          : {
              entries: (scope === "selection"
                ? selection
                : space?.entries || []
              ).slice(0, GROUP_ENTRY_LIMIT),
              total:
                scope === "selection"
                  ? selection.length
                  : space?.entries.length || 0,
            };
      const originGroups = checksOrigins
        ? await groupFileOrigins(
            data.entries,
            (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
            readProvenance,
            current.signal,
          )
        : undefined;
      if (!current.signal.aborted)
        setResult({
          ...data,
          originGroups,
          source:
            scope === "folder"
              ? path
              : scope === "selection"
                ? "Sélection"
                : `Espace : ${space?.name}`,
          at: new Date(),
        });
    } catch (error) {
      if (!current.signal.aborted) setError((error as Error).message);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  async function save(next: unknown, expected: unknown) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await storageUpdate<unknown>(
        groupCategoriesKey,
        null,
        (current) => changeGroupCategories(current, expected, next),
      );
      setConfig(saved);
      stored.current = saved;
      setEditing(false);
      setMessage("Catégories enregistrées dans ce profil.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="file-groups" aria-label="Groupes virtuels de fichiers">
      <p>
        {mode === "origin"
          ? "Retrouvez vos fichiers par site d’origine déclaré. Seuls les fichiers de provenance .source.json sont lus ; le contenu des fichiers regroupés n’est pas ouvert."
          : mode === "destination"
            ? useOrigins
              ? "Examinez les destinations proposées par vos règles d’extension et de site. Seuls les .source.json associés sont lus, sans ouvrir le contenu des fichiers."
              : "Examinez les destinations proposées par vos règles de rangement par extension. Aucun contenu de fichier n’est ouvert."
            : "Retrouvez vos fichiers par format, nom ou date de modification, dans des groupes virtuels. Aucun fichier n’est ouvert."}{" "}
        {mode === "destination"
          ? "Regrouper ne déplace rien ; un transfert exige votre confirmation."
          : "Aucun fichier n’est déplacé."}
      </p>
      <label className="group-scope">
        Regrouper par
        <select
          aria-label="Regrouper par"
          disabled={busy}
          value={mode}
          onChange={(event) => {
            const next = event.target.value as typeof mode;
            if (
              checksOrigins ||
              next === "origin" ||
              (next === "destination" && useOrigins)
            )
              setResult(null);
            setMode(next);
            setMessage("");
          }}
        >
          <option value="format">Format (extension)</option>
          <option value="name">Nom apparenté</option>
          <option value="date">Date de modification</option>
          <option value="destination">Destination proposée</option>
          <option value="origin" disabled={!connected}>
            Origine web (.source.json)
          </option>
        </select>
      </label>
      {mode === "destination" && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={useOrigins}
            disabled={busy || !connected}
            onChange={(event) => {
              setUseOrigins(event.target.checked);
              setResult(null);
              setMessage("");
            }}
          />
          Tenir compte des origines web (.source.json)
        </label>
      )}
      <label className="group-scope">
        Regrouper depuis
        <select
          aria-label="Regrouper depuis"
          disabled={busy}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as typeof scope);
            setResult(null);
            setMessage("");
          }}
        >
          <option value="selection" disabled={!selection.length}>
            La sélection ({selection.length})
          </option>
          <option value="folder" disabled={!path || !connected}>
            Le dossier courant
          </option>
          <option value="space" disabled={!space}>
            Les références de l’espace suivi
          </option>
        </select>
      </label>
      <p className="muted group-source">
        {scope === "folder"
          ? path || "Choisissez un dossier."
          : scope === "space"
            ? space?.name || "Suivez un espace depuis Espaces hybrides."
            : `${selection.length} éléments sélectionnés.`}
      </p>
      <p className="muted">
        {mode === "format"
          ? "Par extension"
          : mode === "name"
            ? "Par nom normalisé"
            : mode === "date"
              ? "Par mois de modification · plus récents en premier"
              : mode === "destination" && !useOrigins
                ? "Par règle active d’extension · sans critère de site"
                : `${ORIGIN_FILE_LIMIT} fichiers contrôlés maximum · ${PROVENANCE_LIMIT / 1024} Kio par provenance`}{" "}
        · Sans sous-dossiers · {GROUP_ENTRY_LIMIT} entrées maximum
      </p>
      <details className="group-help">
        <summary>Périmètre et limites</summary>
        <p className="muted">
          Dossiers et liens exclus.
          {(mode === "origin" || mode === "destination") &&
            " Fichiers .source.json exclus des groupes."}{" "}
          {scope === "folder"
            ? `Le filtre de recherche est ignoré ; fichiers cachés ${showHidden ? "inclus" : "exclus"}.`
            : checksOrigins
              ? "Présence, nom, taille et date revérifiés ; les références enregistrées restent inchangées."
              : "Références enregistrées, sans vérifier leur présence actuelle."}{" "}
          {mode === "origin"
            ? "Lecture locale des .source.json uniquement, sans visite des sites. Regroupement par site (protocole, domaine et port), chemins de page affichés sans paramètres ni fragment. Ces métadonnées déclarent une origine ; elles ne prouvent pas le contenu. Les fichiers non analysés et les cas invalides restent séparés."
            : mode === "format"
              ? "Le suffixe ne prouve pas le format réel."
              : mode === "destination"
                ? `Règles existantes uniquement, sans création ni activation automatique. ${useOrigins ? "Origine déclarée contrôlée pour 20 fichiers maximum et revérifiée avant transfert, sans visite des sites ni preuve d’authenticité. Domaine exact, sans distinction de protocole ni de port, comme les règles de téléchargements. Origines absentes, invalides ou non analysées sans destination proposée." : "Les règles liées à un site sont exclues."} Conflits et fichiers déjà à destination séparés. Examinez un groupe de ${GROUP_TRANSFER_LIMIT} fichiers maximum ; la confirmation permet de choisir copie ou déplacement, destination et conflits. Présence, nom, taille et date revérifiés avant le lancement. Les fichiers .source.json voisins restent à leur place, leur association après transfert n’est pas maintenue.`
                : mode === "date"
                  ? "Mois de modification dans le fuseau horaire de ce navigateur, à partir de l’instantané. Aucune date de création, de prise de vue ou de contenu déduite ; dates invalides séparées. Un mois commun ne prouve pas une relation entre fichiers."
                  : "Deux mots minimum, dont un distinctif. Même ordre des mots ; dates et numéros conservés. Seuls les suffixes v2, version 2, rev2, revision 2, copie ou (1) à (999) sont retirés. Ce rapprochement ne prouve ni un doublon, ni une relation d’export."}{" "}
          Relancez le regroupement pour voir les changements de fichiers.
        </p>
      </details>
      <div className="group-actions">
        <button
          type="button"
          className="primary"
          disabled={
            (mode === "format" && !config) ||
            (mode === "destination" && !filing) ||
            (checksOrigins && !connected) ||
            busy ||
            saving ||
            (scope === "folder"
              ? !connected || !path
              : scope === "selection"
                ? !selection.length
                : !space?.entries.length)
          }
          onClick={() => void analyze()}
        >
          <Layers size={18} aria-hidden="true" />
          {busy ? "Regroupement…" : "Regrouper"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
              setMessage("Regroupement arrêté. Aucun fichier modifié.");
            }}
          >
            Arrêter
          </button>
        )}
        {mode === "format" && (
          <button
            type="button"
            disabled={!config || busy || saving}
            aria-expanded={editing}
            onClick={() => {
              setError("");
              setMessage("");
              if (!editing && config) {
                editBase.current = stored.current;
                setDraft(
                  config.categories.map((category) => ({
                    name: category.name,
                    extensions: category.extensions.join(", "),
                  })),
                );
              }
              setEditing(!editing);
            }}
          >
            <Settings2 size={18} aria-hidden="true" />
            Personnaliser
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === "destination" && (
        <button type="button" disabled={busy} onClick={onRules}>
          <Settings2 size={18} aria-hidden="true" /> Gérer les règles
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {mode === "format" && !config && ready && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(defaultGroupCategories, stored.current)}
        >
          Rétablir les catégories par défaut
        </button>
      )}
      {mode === "format" && editing && (
        <div className="group-editor">
          <p>
            Une extension appartient à une seule catégorie. Les formats non
            affectés et les fichiers sans extension vont dans Autres.
          </p>
          {draft.map((category, index) => (
            <fieldset key={index} disabled={saving}>
              <legend>Catégorie {index + 1}</legend>
              <label>
                Nom
                <input
                  value={category.name}
                  maxLength={60}
                  onChange={(event) =>
                    setDraft(
                      draft.map((value, i) =>
                        i === index
                          ? { ...value, name: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Extensions
                <textarea
                  aria-label="Extensions"
                  rows={2}
                  value={category.extensions}
                  maxLength={800}
                  onChange={(event) =>
                    setDraft(
                      draft.map((value, i) =>
                        i === index
                          ? { ...value, extensions: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={draft.length <= 1}
                onClick={() => setDraft(draft.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} aria-hidden="true" />
                Retirer cette catégorie
              </button>
            </fieldset>
          ))}
          <div className="group-actions">
            <button
              type="button"
              disabled={saving || draft.length >= 12}
              onClick={() => setDraft([...draft, { name: "", extensions: "" }])}
            >
              <Plus size={18} aria-hidden="true" />
              Ajouter une catégorie
            </button>
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() =>
                void save(
                  {
                    version: 1,
                    categories: draft.map((category) => ({
                      name: category.name,
                      extensions: category.extensions
                        .split(/[\s,;]+/)
                        .filter(Boolean),
                    })),
                  },
                  editBase.current,
                )
              }
            >
              Enregistrer les catégories
            </button>
          </div>
          <p className="muted">
            12 catégories au maximum, 40 extensions par catégorie. Fermer la
            personnalisation écarte les changements non enregistrés.
          </p>
        </div>
      )}
      {result && grouped && (
        <div className="group-results">
          <p role="status">
            {fileCount} fichier{fileCount > 1 ? "s" : ""}{" "}
            {!checksOrigins &&
            (mode === "format" || mode === "date" || mode === "destination")
              ? "regroupé"
              : "examiné"}
            {fileCount > 1 ? "s" : ""} ·{" "}
            {nameGroups &&
              `${nameGroups.families} famille${nameGroups.families > 1 ? "s" : ""} proposée${nameGroups.families > 1 ? "s" : ""} · ${nameGroups.unmatched} fichier${nameGroups.unmatched > 1 ? "s" : ""} sans rapprochement · `}
            {checksOrigins &&
              result.originGroups &&
              `${result.originGroups.withoutOrigin} sans origine vérifiable · ${result.originGroups.unexamined} non analysé${result.originGroups.unexamined > 1 ? "s" : ""} · `}
            {grouped.excluded} élément
            {grouped.excluded > 1 ? "s" : ""} exclu
            {grouped.excluded > 1 ? "s" : ""}{" "}
            {mode === "origin" || mode === "destination"
              ? "(dossiers, liens ou .source.json)"
              : "(dossiers ou liens)"}
          </p>
          <p className="muted group-source">
            {result.source} · instantané du {result.at.toLocaleString("fr")}.
          </p>
          {result.total > result.entries.length && (
            <p role="status">
              Vue partielle : {result.entries.length} premières entrées sur{" "}
              {result.total}. Les autres ne sont pas regroupées.
            </p>
          )}
          {grouped.groups
            .filter((group) => group.entries.length)
            .map((group) => {
              const destination =
                "destination" in group && typeof group.destination === "string"
                  ? group.destination
                  : "";
              return (
                <details className="file-group" key={group.name}>
                  <summary>
                    <Layers size={18} aria-hidden="true" />
                    <strong>{group.name}</strong>
                    <span>{group.entries.length}</span>
                  </summary>
                  <p className="group-reason muted">{group.reason}</p>
                  {mode === "destination" && !!destination && (
                    <div className="group-actions group-transfer">
                      <button
                        type="button"
                        disabled={
                          !connected ||
                          group.entries.length > GROUP_TRANSFER_LIMIT
                        }
                        onClick={() =>
                          onTransfer(
                            group.entries,
                            destination,
                            useOrigins
                              ? result.originGroups?.origins
                              : undefined,
                          )
                        }
                      >
                        <FolderOpen size={18} aria-hidden="true" /> Examiner le
                        transfert
                      </button>
                      <p className="muted">
                        {group.entries.length > GROUP_TRANSFER_LIMIT
                          ? `Plus de ${GROUP_TRANSFER_LIMIT} fichiers : regroupez une sélection plus petite pour transférer.`
                          : "Copie par défaut, chemins et options à confirmer. Métadonnées voisines non incluses."}
                      </p>
                    </div>
                  )}
                  <ul>
                    {group.entries.map((entry) => (
                      <li key={entry.path}>
                        <FileIcon entry={entry} />
                        <div>
                          <strong>{entry.name}</strong>
                          <small>
                            {fileExtension(entry)
                              ? `Extension .${fileExtension(entry)}`
                              : "Sans extension"}{" "}
                            · {size(entry.size)}
                          </small>
                          <small className="group-source">{entry.path}</small>
                          {mode === "destination" && (
                            <small className="group-source">
                              {destinationGroups?.notes.get(entry.path)}
                            </small>
                          )}
                          {mode === "date" &&
                            Number.isFinite(
                              new Date(entry.mtime * 1000).getTime(),
                            ) && (
                              <small>
                                Modifié le{" "}
                                {new Date(entry.mtime * 1000).toLocaleString(
                                  "fr",
                                )}
                              </small>
                            )}
                          {mode === "origin" &&
                            result.originGroups?.origins.has(entry.path) && (
                              <small className="group-source">
                                Source enregistrée :{" "}
                                {
                                  result.originGroups.origins.get(entry.path)!
                                    .sourceUrl
                                }{" "}
                                ·{" "}
                                {new Date(
                                  result.originGroups.origins.get(
                                    entry.path,
                                  )!.collectedAt,
                                ).toLocaleString("fr")}
                              </small>
                            )}
                          {mode === "origin" &&
                            result.originGroups?.notes.has(entry.path) && (
                              <small>
                                {result.originGroups.notes.get(entry.path)}
                              </small>
                            )}
                        </div>
                        <button
                          type="button"
                          title={`Afficher ${entry.name} dans son dossier`}
                          aria-label={`Afficher ${entry.name} dans son dossier`}
                          disabled={!connected}
                          onClick={() => onLocate(entry.path)}
                        >
                          <FolderOpen size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
        </div>
      )}
    </section>
  );
}
