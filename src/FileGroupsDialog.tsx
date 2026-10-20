import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Layers, Plus, Settings2, Trash2 } from "lucide-react";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { FileIcon } from "./Preview";
import { COLLECTION_CHECK_LIMIT } from "./collection";
import {
  changeFileFamily,
  fileKey,
  fileFamiliesKey,
  groupFileRelations,
  restoreFileFamilies,
  verifyFamilyMembers,
  type FileFamily,
} from "./file-families";
import {
  imagePreparationsKey,
  restoreImagePreparations,
  type ImagePreparation,
} from "./image-preparations";
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
  groupRuleDraft,
  type GroupRuleDraft,
} from "./file-destinations";
import {
  changeGroupCategories,
  defaultGroupCategories,
  fileExtension,
  groupCategoriesKey,
  GROUP_ENTRY_LIMIT,
  groupFiles,
  groupFileSizes,
  groupModifiedDates,
  groupRelatedNames,
  listGroupFolder,
  restoreGroupCategories,
  type GroupCategories,
} from "./file-groups";
import { size, type CollectionEntry, type Entry } from "./types";
import {
  groupIdenticalFiles,
  type CopyHashCache,
  type CopyProgress,
} from "./file-copies";
import { groupSimilarImages } from "./image-similarity";

export function FileGroupsDialog({
  selection,
  path,
  connected,
  checkedHash,
  imageSamples,
  showHidden,
  space,
  onLocate,
  onTransfer,
  onRules,
}: {
  selection: CollectionEntry[];
  path: string;
  connected: boolean;
  checkedHash: boolean;
  imageSamples: boolean;
  showHidden: boolean;
  space: { name: string; entries: CollectionEntry[] } | null;
  onLocate: (path: string) => void;
  onTransfer: (
    entries: Entry[],
    destination: string,
    origins?: Map<string, Provenance>,
  ) => void;
  onRules: (draft?: GroupRuleDraft) => void;
}) {
  const [scope, setScope] = useState<"selection" | "folder" | "space">(
    selection.length ? "selection" : "folder",
  );
  const [config, setConfig] = useState<GroupCategories | null>(null);
  const [mode, setMode] = useState<
    | "format"
    | "name"
    | "date"
    | "size"
    | "origin"
    | "destination"
    | "relations"
    | "copies"
    | "similar"
  >("format");
  const [useOrigins, setUseOrigins] = useState(false);
  const checksOrigins =
    mode === "origin" || (mode === "destination" && useOrigins);
  const [filing, setFiling] = useState<DownloadFiling | null>(null);
  const [families, setFamilies] = useState<FileFamily[] | null>(null);
  const [preparations, setPreparations] = useState<ImagePreparation[] | null>(
    null,
  );
  const [familyDraft, setFamilyDraft] = useState<{
    name: string;
    entries: Entry[];
  } | null>(null);
  const familyForm = useRef<HTMLFormElement>(null);
  const modeSelect = useRef<HTMLSelectElement>(null);
  const familyWasOpen = useRef(false);
  const stored = useRef<unknown>(null);
  const editBase = useRef<unknown>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ name: string; extensions: string }[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (familyDraft && !saving)
      familyForm.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (!familyDraft && familyWasOpen.current) modeSelect.current?.focus();
    familyWasOpen.current = !!familyDraft;
  }, [familyDraft?.entries, saving]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sampled, setSampled] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const copyCache = useRef<CopyHashCache>(new Map());
  const comparedEntries = useRef<CollectionEntry[]>([]);
  const [copyProgress, setCopyProgress] = useState<CopyProgress>({
    checked: 0,
    hashed: 0,
    cached: 0,
  });
  const [result, setResult] = useState<{
    entries: CollectionEntry[];
    total: number;
    source: string;
    at: Date;
    originGroups?: Awaited<ReturnType<typeof groupFileOrigins>>;
    relationGroups?: Awaited<ReturnType<typeof groupFileRelations>>;
    copyGroups?: Awaited<ReturnType<typeof groupIdenticalFiles>>;
    similarGroups?: Awaited<ReturnType<typeof groupSimilarImages>>;
  } | null>(null);
  const selectedFiles = selection.filter(
    (entry): entry is Entry =>
      entry.type === "file" && !/\.source\.json$/i.test(entry.name),
  );
  useEffect(() => {
    let live = true,
      revision = 0;
    async function read() {
      const id = ++revision;
      try {
        const [rawFamilies, rawPreparations] = await Promise.all([
          storageGet(fileFamiliesKey, []),
          storageGet(imagePreparationsKey, []),
        ]);
        const records = restoreFileFamilies(rawFamilies),
          prepared = restoreImagePreparations(rawPreparations);
        if (live && id === revision) {
          setFamilies(records);
          setPreparations(prepared);
        }
      } catch {
        if (live && id === revision) {
          setFamilies(null);
          setPreparations(null);
          setError(
            "Familles ou suivi des préparations illisibles. Aucune donnée remplacée ; les autres regroupements restent disponibles.",
          );
        }
      }
    }
    void read();
    const unsubscribe = storageSubscribe(
      [fileFamiliesKey, imagePreparationsKey],
      read,
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (mode !== "relations") return;
    controller.current?.abort();
    setBusy(false);
    setResult(null);
  }, [
    mode === "relations" ? families : null,
    mode === "relations" ? preparations : null,
  ]);
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
    checkedHash,
    imageSamples,
  ]);
  useEffect(
    () =>
      bridge.subscribe((event) => {
        if (event.event === "DISCONNECTED") copyCache.current.clear();
        if (
          event.event !== "FS_CHANGED" ||
          typeof event.data?.path !== "string"
        )
          return;
        const root = fileKey(event.data.path).replace(/\/$/, "");
        const affected =
          comparedEntries.current.some((entry) =>
            fileKey(entry.path).startsWith(root + "/"),
          ) ||
          (scope === "folder" && fileKey(path).replace(/\/$/, "") === root);
        if (!affected) return;
        copyCache.current.clear();
        if (mode === "copies" || mode === "similar") {
          controller.current?.abort();
          setBusy(false);
          setResult(null);
          setMessage(
            "Les fichiers ont changé. Relancez le regroupement pour comparer leur contenu actuel.",
          );
        }
      }),
    [mode, scope, path],
  );
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
        ? mode === "similar"
          ? result.similarGroups || null
          : mode === "copies"
            ? result.copyGroups || null
            : mode === "origin"
              ? result.originGroups || null
              : mode === "destination"
                ? destinationGroups
                : mode === "relations"
                  ? result.relationGroups || null
                  : mode === "name"
                    ? nameGroups
                    : mode === "date"
                      ? groupModifiedDates(result.entries)
                      : mode === "size"
                        ? groupFileSizes(result.entries)
                        : config
                          ? groupFiles(result.entries, config)
                          : null
        : null,
    [result, config, mode, nameGroups, destinationGroups],
  );
  const fileCount =
    (mode === "copies"
      ? result?.copyGroups?.examined
      : mode === "relations"
        ? result?.relationGroups?.examined
        : checksOrigins
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
    setCopyProgress({ checked: 0, hashed: 0, cached: 0 });
    setResult(null);
    setSampled(0);
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
      const relationGroups =
        mode === "relations" && families && preparations
          ? await groupFileRelations(
              data.entries,
              families,
              preparations,
              (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
              current.signal,
            )
          : undefined;
      if (mode === "copies" || mode === "similar")
        comparedEntries.current = data.entries;
      const similarGroups =
        mode === "similar"
          ? await groupSimilarImages(
              data.entries,
              {
                stat: (path) =>
                  bridge.request<Entry>("FS_STAT", { path }, 5000),
                sample: (entry) =>
                  bridge.request(
                    "IMAGE_SAMPLE",
                    { path: entry.path, expected: entry },
                    11000,
                  ),
              },
              current.signal,
              setSampled,
            )
          : undefined;
      const copyGroups =
        mode === "copies"
          ? await groupIdenticalFiles(
              data.entries,
              {
                stat: (path) =>
                  bridge.request<Entry>("FS_STAT", { path }, 5000),
                hash: (entry) =>
                  bridge.request(
                    "HASH",
                    { path: entry.path, algorithm: "blake3", expected: entry },
                    10000,
                  ),
              },
              current.signal,
              copyCache.current,
              setCopyProgress,
            )
          : undefined;
      if (!current.signal.aborted)
        setResult({
          ...data,
          originGroups,
          relationGroups,
          copyGroups,
          similarGroups,
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
  async function saveFamily(event: React.FormEvent) {
    event.preventDefault();
    if (!familyDraft) return;
    const current = new AbortController();
    controller.current = current;
    setSaving(true);
    modeSelect.current?.focus();
    setError("");
    setMessage("");
    try {
      const members = await verifyFamilyMembers(
        familyDraft.entries,
        (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
        current.signal,
      );
      const [record] = restoreFileFamilies([
        {
          version: 1,
          id: crypto.randomUUID(),
          name: familyDraft.name,
          date: new Date().toISOString(),
          members,
        },
      ]);
      const next = await storageUpdate<FileFamily[]>(
        fileFamiliesKey,
        [],
        (value) => {
          current.signal.throwIfAborted();
          return changeFileFamily(value, null, record);
        },
      );
      setFamilies(next);
      setFamilyDraft(null);
      setMessage(
        "Famille enregistrée. Aucun fichier déplacé ; retrouvez-la dans Relations enregistrées.",
      );
    } catch (error) {
      if (!current.signal.aborted) setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function removeFamily(record: FileFamily) {
    setSaving(true);
    modeSelect.current?.focus();
    setError("");
    setMessage("");
    try {
      const next = await storageUpdate<FileFamily[]>(
        fileFamiliesKey,
        [],
        (value) => changeFileFamily(value, record, null),
      );
      setFamilies(next);
      setMessage("Famille retirée du profil. Aucun fichier supprimé.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="file-groups" aria-label="Groupes virtuels de fichiers">
      <p>
        {mode === "copies"
          ? "Retrouvez les copies identiques par taille et empreinte complète BLAKE3. Le contenu est lu par le compagnon, sans ouvrir ni décoder les images dans le navigateur."
          : mode === "similar"
            ? "Rapprochez les images par composition et couleurs. Le compagnon décode un échantillon réduit de chaque image admissible, avec des limites de taille et de durée. Les ressemblances restent indicatives."
            : mode === "relations"
              ? "Retrouvez vos liens manuels et les sources/copies des nouvelles préparations. Métadonnées vérifiées sur demande, sans lire de contenu ni déduire un lien du nom."
              : mode === "origin"
                ? "Retrouvez vos fichiers par site d’origine déclaré. Seuls les fichiers de provenance .source.json sont lus ; le contenu des fichiers regroupés n’est pas ouvert."
                : mode === "destination"
                  ? useOrigins
                    ? "Examinez les destinations proposées par vos règles d’extension et de site. Seuls les .source.json associés sont lus, sans ouvrir le contenu des fichiers."
                    : "Examinez les destinations proposées par vos règles de rangement par extension. Aucun contenu de fichier n’est ouvert."
                  : "Retrouvez vos fichiers par format, nom, taille ou date de modification, dans des groupes virtuels. Aucun fichier n’est ouvert."}{" "}
        {mode === "destination"
          ? "Regrouper ne déplace rien ; un transfert exige votre confirmation."
          : "Aucun fichier n’est déplacé."}
      </p>
      <label className="group-scope">
        Regrouper par
        <select
          aria-label="Regrouper par"
          ref={modeSelect}
          disabled={busy}
          value={mode}
          onChange={(event) => {
            const next = event.target.value as typeof mode;
            if (
              checksOrigins ||
              mode === "relations" ||
              mode === "copies" ||
              mode === "similar" ||
              next === "similar" ||
              next === "copies" ||
              next === "relations" ||
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
          <option value="size">Taille</option>
          <option value="relations" disabled={!connected}>
            Relations enregistrées
          </option>
          <option value="destination">Destination proposée</option>
          <option value="origin" disabled={!connected}>
            Origine web (.source.json)
          </option>
          <option value="copies" disabled={!connected || !checkedHash}>
            Copies identiques
            {connected && !checkedHash ? " · compagnon à mettre à jour" : ""}
          </option>
          <option value="similar" disabled={!connected || !imageSamples}>
            Images similaires
            {connected && !imageSamples ? " · ImageMagick requis" : ""}
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
        {mode === "similar"
          ? "60 images · 256 Mio par image · 100 mégapixels · budget de 512 Mio"
          : mode === "copies"
            ? "200 références contrôlées · 100 empreintes · 64 Mio par fichier · budget de lecture 256 Mio"
            : mode === "format"
              ? "Par extension"
              : mode === "name"
                ? "Par nom normalisé"
                : mode === "date"
                  ? "Par mois de modification · plus récents en premier"
                  : mode === "size"
                    ? "Par tranche de taille en octets"
                    : mode === "relations"
                      ? `${COLLECTION_CHECK_LIMIT} fichiers contrôlés maximum · références liées hors dossier possibles`
                      : mode === "destination" && !useOrigins
                        ? "Par règle active d’extension · sans critère de site"
                        : `${ORIGIN_FILE_LIMIT} fichiers contrôlés maximum · ${PROVENANCE_LIMIT / 1024} Kio par provenance`}{" "}
        · Sans sous-dossiers · {GROUP_ENTRY_LIMIT} entrées maximum
      </p>
      <details className="group-help">
        <summary>Périmètre et limites</summary>
        <p className="muted">
          Dossiers et liens exclus.
          {(mode === "origin" ||
            mode === "destination" ||
            mode === "copies" ||
            mode === "relations") &&
            " Fichiers .source.json exclus des groupes."}{" "}
          {scope === "folder"
            ? `Le filtre de recherche est ignoré ; fichiers cachés ${showHidden ? "inclus" : "exclus"}.`
            : checksOrigins ||
                mode === "relations" ||
                mode === "copies" ||
                mode === "similar"
              ? "Présence, nom, taille et date revérifiés ; les références enregistrées restent inchangées."
              : "Références enregistrées, sans vérifier leur présence actuelle."}{" "}
          {mode === "similar"
            ? "Comparaison visuelle indicative, sans IA, sans suppression ni transfert. Première image des TIFF/GIF uniquement ; aplats, recadrages et rotations peuvent ne pas être rapprochés. Décodage natif limité à 8 s et 100 mégapixels, 90 s pour le lot (hors contrôles). Arrêter bloque les requêtes suivantes et ignore les réponses tardives ; le décodage en cours peut durer encore 8 s. Aucun cache d’image sur disque."
            : mode === "copies"
              ? "Seuls les fichiers de même taille sont lus, par blocs natifs. Délai de lecture de 8 s par fichier ; arrêter ou fermer bloque les lectures suivantes et ignore les réponses tardives. La lecture native en cours peut encore se terminer. Cache de 100 empreintes en mémoire jusqu’à la fermeture du dialogue, réutilisé uniquement après contrôle des métadonnées précises ; aucun cache sur disque. Pas de rapprochement visuel, ni de suppression."
              : mode === "relations"
                ? "Familles enregistrées et nouvelles préparations avec sources et copies connues uniquement. Les anciennes préparations sans sources ne créent aucun lien. Jusqu’à 200 fichiers liés sont vérifiés, y compris hors du dossier choisi, et 1 000 références candidates conservées. Nom, taille et date doivent concorder ; les liens ne prouvent pas le contenu et ne suivent pas les déplacements/renommages. Réduisez le périmètre si la vue est partielle."
                : mode === "size"
                  ? "Tranches de taille de l’instantané ; tailles invalides séparées. Une taille commune ne prouve ni un doublon ni une relation."
                  : mode === "origin"
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
            (mode === "relations" &&
              (!families || !preparations || !connected)) ||
            (checksOrigins && !connected) ||
            (mode === "copies" && (!connected || !checkedHash)) ||
            (mode === "similar" && (!connected || !imageSamples)) ||
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
      {busy && mode === "copies" && (
        <p role="status">
          {copyProgress.checked} références contrôlées · {copyProgress.hashed}{" "}
          empreintes calculées · {copyProgress.cached} réutilisées
        </p>
      )}
      {busy && mode === "similar" && (
        <p role="status">
          {sampled} images analysées · Arrêter reste disponible.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === "destination" && (
        <button type="button" disabled={busy} onClick={() => onRules()}>
          <Settings2 size={18} aria-hidden="true" /> Gérer les règles
        </button>
      )}
      {message && <p role="status">{message}</p>}
      <details className="group-help">
        <summary>Familles enregistrées ({families?.length || 0})</summary>
        <p>
          Reliez de 2 à 20 fichiers choisis ou un groupe entier. Le nom, la
          taille et la date sont vérifiés avant l’enregistrement. 50 familles
          dans ce profil ; retirer un lien ne touche aucun fichier.
        </p>
        <button
          type="button"
          disabled={
            busy ||
            saving ||
            !connected ||
            !families ||
            selectedFiles.length < 2 ||
            selectedFiles.length > 20
          }
          onClick={() => setFamilyDraft({ name: "", entries: selectedFiles })}
        >
          Relier la sélection
        </button>
        {families?.map((record) => (
          <article className="family-record" key={record.id}>
            <div>
              <strong>{record.name}</strong>
              <small>{record.members.length} fichiers</small>
            </div>
            <button
              type="button"
              title={`Retirer la famille ${record.name}`}
              disabled={busy || saving}
              onClick={() => void removeFamily(record)}
            >
              <Trash2 size={18} aria-hidden="true" /> Retirer
            </button>
          </article>
        ))}
      </details>
      {familyDraft && (
        <form
          ref={familyForm}
          className="group-editor"
          aria-label="Enregistrer une famille"
          onSubmit={(event) => void saveFamily(event)}
        >
          <fieldset disabled={saving}>
            <legend>Relier ces fichiers sans les déplacer</legend>
            <label>
              Nom de la famille
              <input
                required
                maxLength={80}
                value={familyDraft.name}
                onChange={(event) =>
                  setFamilyDraft({ ...familyDraft, name: event.target.value })
                }
              />
            </label>
            <ul className="path-list">
              {familyDraft.entries.map((entry) => (
                <li key={entry.path}>{entry.path}</li>
              ))}
            </ul>
            <div className="group-actions">
              <button
                type="submit"
                className="primary"
                disabled={!connected || busy}
              >
                Enregistrer la famille
              </button>
              <button type="button" onClick={() => setFamilyDraft(null)}>
                Annuler la famille
              </button>
            </div>
          </fieldset>
        </form>
      )}
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
            (mode === "format" ||
              mode === "date" ||
              mode === "size" ||
              mode === "destination")
              ? "regroupé"
              : "examiné"}
            {fileCount > 1 ? "s" : ""} ·{" "}
            {nameGroups &&
              `${nameGroups.families} famille${nameGroups.families > 1 ? "s" : ""} proposée${nameGroups.families > 1 ? "s" : ""} · ${nameGroups.unmatched} fichier${nameGroups.unmatched > 1 ? "s" : ""} sans rapprochement · `}
            {checksOrigins &&
              result.originGroups &&
              `${result.originGroups.withoutOrigin} sans origine vérifiable · ${result.originGroups.unexamined} non analysé${result.originGroups.unexamined > 1 ? "s" : ""} · `}
            {mode === "relations" &&
              result.relationGroups &&
              `${result.relationGroups.unexamined} non vérifiés · `}
            {mode === "copies" &&
              result.copyGroups &&
              `${result.copyGroups.copies} fichiers en copies identiques · ${result.copyGroups.hashed} empreintes calculées · ${result.copyGroups.cached} réutilisées · ${result.copyGroups.unexamined} non comparés · `}
            {mode === "similar" &&
              result.similarGroups &&
              `${result.similarGroups.similar} images rapprochées · ${result.similarGroups.unexamined} non comparées · `}
            {grouped.excluded} élément
            {grouped.excluded > 1 ? "s" : ""} exclu
            {grouped.excluded > 1 ? "s" : ""}{" "}
            {mode === "origin" ||
            mode === "destination" ||
            mode === "relations" ||
            mode === "copies"
              ? "(dossiers, liens ou .source.json)"
              : mode === "similar"
                ? "(hors images admissibles)"
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
          {mode === "relations" && !!result.relationGroups?.omitted && (
            <p role="status">
              Relations partielles : {result.relationGroups.omitted} références
              omises. Réduisez le périmètre.
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
                <details
                  className="file-group"
                  key={
                    "id" in group && typeof group.id === "string"
                      ? group.id
                      : group.name
                  }
                >
                  <summary>
                    <Layers size={18} aria-hidden="true" />
                    <strong>{group.name}</strong>
                    <span>{group.entries.length}</span>
                  </summary>
                  <p className="group-reason muted">{group.reason}</p>
                  <div className="group-actions group-transfer">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        saving ||
                        !connected ||
                        !families ||
                        group.entries.length < 2 ||
                        group.entries.length > 20
                      }
                      onClick={() =>
                        setFamilyDraft({
                          name: group.name.slice(0, 80),
                          entries: group.entries,
                        })
                      }
                    >
                      <Plus size={18} aria-hidden="true" /> Enregistrer une
                      famille
                    </button>
                    {mode !== "destination" &&
                      groupRuleDraft(
                        group.entries,
                        path,
                        result.originGroups?.origins,
                      ) && (
                        <button
                          type="button"
                          disabled={busy || saving}
                          onClick={() =>
                            onRules(
                              groupRuleDraft(
                                group.entries,
                                path,
                                result.originGroups?.origins,
                              )!,
                            )
                          }
                        >
                          <Settings2 size={18} aria-hidden="true" /> Créer une
                          règle
                        </button>
                      )}
                  </div>
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
                          {mode === "relations" &&
                            result.relationGroups?.notes.has(entry.path) && (
                              <small className="group-source">
                                {result.relationGroups.notes.get(entry.path)}
                              </small>
                            )}
                          {mode === "copies" &&
                            result.copyGroups?.notes.has(entry.path) && (
                              <small className="group-source">
                                {result.copyGroups.notes.get(entry.path)}
                              </small>
                            )}
                          {mode === "similar" &&
                            result.similarGroups?.notes.has(entry.path) && (
                              <small className="group-source">
                                {result.similarGroups.notes.get(entry.path)}
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
