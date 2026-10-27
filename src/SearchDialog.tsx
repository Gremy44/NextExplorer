import { Help } from "./Help";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  Trash2,
  Folder,
  FileText,
  Globe,
} from "lucide-react";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import {
  buildIndex,
  relatedTexts,
  searchIndex,
  words,
  indexIsCurrent,
  restoreTextRules,
  textRulesKey,
  INDEX_TEXT_BYTES,
  type LocalIndex,
  type TextRule,
} from "./local-index";
import { groupFileOrigins } from "./file-origins";
import { readProvenance } from "./provenance";
import { indexStore } from "./index-store";
import { fileKey, sameFamilyFile } from "./file-families";
import { useOrganization } from "./OrganizationContext";
import { type Entry, type CollectionEntry, type Hello, safeURL } from "./types";
import type { HybridSpace } from "./spaces";

export function SearchDialog({
  path,
  hello,
  spaces,
  collection,
  onOpen,
  onSpace,
  initialTag = "",
}: {
  path: string;
  hello: Hello | null;
  spaces: HybridSpace[];
  collection: CollectionEntry[];
  onOpen: (entry: Entry) => void;
  onSpace: (id: string) => void;
  initialTag?: string;
}) {
  const { tags } = useOrganization();
  const [index, setIndex] = useState<LocalIndex | null>(null),
    [root, setRoot] = useState(path),
    [query, setQuery] = useState("");
  const [extension, setExtension] = useState(""),
    [tag, setTag] = useState(initialTag),
    [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false),
    [stale, setStale] = useState(true),
    [count, setCount] = useState(0),
    [error, setError] = useState("");
  const [similar, setSimilar] = useState<ReturnType<typeof relatedTexts>>([]);
  const [rules, setRules] = useState<TextRule[]>([]),
    [ruleName, setRuleName] = useState("");
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    generation = useRef(0);
  const automatic = useRef(false),
    busyRef = useRef(false),
    indexRef = useRef(index),
    scanRef = useRef<() => Promise<void>>(async () => {});
  busyRef.current = busy;
  indexRef.current = index;
  const rootRef = useRef(root);
  rootRef.current = root;
  async function scan() {
    automatic.current = true;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const epoch = ++generation.current;
    setBusy(true);
    setStale(true);
    setCount(0);
    setError("");
    setSimilar([]);
    try {
      const { revision } = await indexStore();
      current.signal.throwIfAborted();
      const directory = await bridge.request<Entry>(
        "FS_STAT",
        { path: root },
        5000,
      );
      if (directory.type !== "directory")
        throw new Error("Choisissez un dossier accessible");
      const next = await buildIndex(
        directory.path,
        false,
        {
          list: (path, offset, snapshot, showHidden) =>
            bridge.request("FS_LIST_DIR", {
              path,
              offset,
              snapshot,
              showHidden,
              limit: 200,
            }),
          stat: (path) => bridge.request("FS_STAT", { path }, 5000),
          read: (path) =>
            bridge.textPrefix(path, INDEX_TEXT_BYTES, current.signal),
          ...(hello?.features?.documentTools
            ? {
                office: (path: string) =>
                  bridge.request<{ text: string; note: string }>(
                    "OFFICE_TEXT",
                    { path },
                    10000,
                  ),
              }
            : {}),
          ...(hello?.tools.pdftotext
            ? {
                pdf: (path: string) =>
                  bridge.request<{ text: string; note: string }>(
                    "FS_TEXT",
                    { path },
                    10000,
                  ),
              }
            : {}),
        },
        current.signal,
        (count) => {
          if (mounted.current && epoch === generation.current) setCount(count);
        },
      );
      current.signal.throwIfAborted();
      const origins = await groupFileOrigins(
        next.files.map((file) => file.entry),
        (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
        readProvenance,
        current.signal,
      );
      for (const file of next.files) {
        const source = origins.origins.get(file.entry.path);
        if (source) file.source = `${source.title} ${source.sourceUrl}`;
      }
      if (
        !(await indexIsCurrent(
          next,
          (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
          current.signal,
        ))
      )
        throw new Error(
          "Dossier modifié pendant l’indexation : relancez l’analyse",
        );
      // Serialize commits with deletion/other views; cancellation cannot resurrect a deleted index.
      await navigator.locks.request("nextexplorer:search-index", async () => {
        current.signal.throwIfAborted();
        await indexStore(next, revision);
      });
      if (
        mounted.current &&
        epoch === generation.current &&
        !current.signal.aborted
      ) {
        setIndex(next);
        setStale(false);
      }
    } catch (error) {
      if (
        mounted.current &&
        epoch === generation.current &&
        !current.signal.aborted
      )
        setError((error as Error).message);
    } finally {
      if (mounted.current && epoch === generation.current) setBusy(false);
    }
  }
  scanRef.current = scan;
  useEffect(() => {
    mounted.current = true;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const freshness = new AbortController();
    indexStore()
      .then(({ index: value }) => {
        if (mounted.current && !controller.current) setIndex(value);
      })
      .catch((error) => {
        if (mounted.current) setError(error.message);
      });
    const channel = new BroadcastChannel("nextexplorer-search");
    channel.onmessage = () => {
      automatic.current = false;
      controller.current?.abort();
      ++generation.current;
      setIndex(null);
      setBusy(false);
      setStale(true);
    };
    const unsubscribe = bridge.subscribe((event) => {
      if (event.event === "FS_CHANGED") {
        const changed = fileKey(event.data?.path || "").replace(/\/$/, ""),
          chosen = fileKey(rootRef.current).replace(/\/$/, "");
        if (changed !== chosen && !changed.startsWith(chosen + "/")) return;
      }
      if (["FS_CHANGED", "DISCONNECTED"].includes(event.event)) {
        controller.current?.abort();
        ++generation.current;
        setBusy(false);
        setStale(true);
        setSimilar([]);
        clearTimeout(refreshTimer);
        if (event.event === "DISCONNECTED") automatic.current = false;
        else if (automatic.current) {
          const epoch = generation.current;
          refreshTimer = setTimeout(() => {
            if (automatic.current && epoch === generation.current)
              void scanRef.current();
          }, 650);
        }
      }
    });
    let checking = false;
    const timer = setInterval(async () => {
      if (
        !automatic.current ||
        busyRef.current ||
        checking ||
        !indexRef.current
      )
        return;
      checking = true;
      const epoch = generation.current;
      try {
        if (
          !(await indexIsCurrent(
            indexRef.current,
            (path) => bridge.request<Entry>("FS_STAT", { path }, 5000),
            freshness.signal,
          ))
        ) {
          if (!automatic.current || epoch !== generation.current) return;
          setStale(true);
          await scanRef.current();
        }
      } catch (error) {
        if (!freshness.signal.aborted) {
          setStale(true);
          setError((error as Error).message);
        }
      } finally {
        checking = false;
      }
    }, 15000);
    const readRules = () =>
      storageGet<unknown>(textRulesKey, [])
        .then((value) => {
          if (mounted.current) setRules(restoreTextRules(value));
        })
        .catch((error) => {
          if (mounted.current) setError(error.message);
        });
    const unsubscribeRules = storageSubscribe(
      [textRulesKey],
      () => void readRules(),
    );
    void readRules();
    return () => {
      mounted.current = false;
      automatic.current = false;
      controller.current?.abort();
      freshness.abort();
      channel.close();
      unsubscribe();
      unsubscribeRules();
      clearInterval(timer);
      clearTimeout(refreshTimer);
    };
  }, []);
  useEffect(() => {
    automatic.current = false;
    controller.current?.abort();
    ++generation.current;
    setBusy(false);
    setStale(true);
    setSimilar([]);
  }, [root]);
  const terms = words(query);
  const match = (text: string) =>
    terms.every((term) => words(text).includes(term));
  const results =
    !stale && index
      ? searchIndex(index, query, extension).filter(
          (file) =>
            (!tag || tags.files[fileKey(file.entry.path)]?.includes(tag)) &&
            (!keyword ||
              words(keyword).every((word) => words(file.text).includes(word))),
        )
      : [];
  const links = [
    ...new Map(
      [
        ...collection,
        ...spaces.flatMap((space) => space.entries),
        ...spaces.flatMap((space) =>
          [...Object.values(space.links).flat(), ...space.browser.tabs].map(
            (link) => ({
              type: "web" as const,
              path: link.url,
              name: link.title,
            }),
          ),
        ),
      ]
        .filter((entry) => entry.type === "web" && safeURL(entry.path))
        .map((entry) => [entry.path, entry]),
    ).values(),
  ].filter((entry) => match(`${entry.name} ${entry.path}`));
  async function open(entry: Entry) {
    try {
      const current = await bridge.request<Entry>(
        "FS_STAT",
        { path: entry.path },
        5000,
      );
      if (!sameFamilyFile(entry, current)) {
        setStale(true);
        throw new Error("Fichier modifié : actualisez l’index");
      }
      onOpen(current);
    } catch (error) {
      setStale(true);
      setError((error as Error).message);
    }
  }
  return (
    <section className="organization-dialog" aria-label="Recherche locale">
      <Help>
        Recherchez dans un dossier choisi, vos liens collectés et vos espaces
        enregistrés. Aucun historique du navigateur n’est parcouru.
      </Help>
      <label className="field">
        Dossier à indexer
        <input
          aria-label="Dossier à indexer"
          value={root}
          onChange={(event) => {
            automatic.current = false;
            setRoot(event.target.value);
          }}
        />
      </label>
      <div className="organization-actions">
        <button
          type="button"
          className="primary"
          disabled={!hello || busy || !root.trim()}
          onClick={() => void scan()}
        >
          <RefreshCw size={16} />
          {index ? "Actualiser l’index" : "Indexer ce dossier"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              automatic.current = false;
              controller.current?.abort();
              ++generation.current;
              setBusy(false);
              setStale(true);
            }}
          >
            Arrêter l’indexation
          </button>
        )}
        {(index || error) && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              automatic.current = false;
              controller.current?.abort();
              ++generation.current;
              try {
                await navigator.locks.request("nextexplorer:search-index", () =>
                  indexStore(null),
                );
                setIndex(null);
                setStale(true);
                const channel = new BroadcastChannel("nextexplorer-search");
                channel.postMessage("deleted");
                channel.close();
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <Trash2 size={16} />
            Effacer l’index
          </button>
        )}
      </div>
      <p role="status">
        {busy
          ? `${count} fichier(s) analysé(s)…`
          : stale
            ? "Index à actualiser : les résultats locaux sont masqués."
            : `${index?.files.length} fichier(s) · ${index?.directories} dossier(s) · ${index?.milliseconds} ms`}
      </p>
      <small>
        Limites : 1 000 entrées, 100 dossiers, profondeur 8, 2 millions de
        caractères. TXT/Markdown et formats texte : 16 Kio par lecture. PDF :
        moteur pdftotext optionnel, 8 Mio / 10 pages / 8 s. DOCX/XLSX/PPTX :
        extraction locale sans moteur, fichier de 32 Mio maximum, texte partiel
        de 16 Kio. Aucun OCR. Origines déclarées contrôlées pour les 20 premiers
        fichiers. Pendant l’ouverture : actualisation après notification et
        contrôle des métadonnées toutes les 15 s. Index à revalider à la
        réouverture.
      </small>
      {index && (
        <p className="muted">
          Dernière analyse : {index.root} ·{" "}
          {new Date(index.date).toLocaleString("fr-FR")} · {index.omitted}{" "}
          entrée(s) ou sous-dossier(s) omis · {index.errors} erreur(s).
        </p>
      )}
      <label className="filter">
        <Search size={16} />
        <input
          aria-label="Recherche commune"
          placeholder="Mots du nom ou du contenu…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSimilar([]);
          }}
        />
      </label>
      <div className="organization-filters">
        <label>
          Format
          <select
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
          >
            <option value="">Tous</option>
            {[
              ...new Set(
                index?.files.map((file) => file.entry.ext).filter(Boolean),
              ),
            ]
              .sort()
              .map((ext) => (
                <option key={ext}>{ext}</option>
              ))}
          </select>
        </label>
        <label>
          Tag
          <select
            aria-label="Filtrer par tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            <option value="">Tous</option>
            {tags.labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mots-clés du contenu
          <input
            aria-label="Mots-clés du contenu"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tous les mots requis"
          />
        </label>
      </div>
      <details>
        <summary>Règles de mots-clés enregistrées</summary>
        <p>
          Tous les mots sont requis dans le texte extrait. Une règle filtre les
          résultats ; elle ne déplace aucun fichier.
        </p>
        <label className="field">
          Nom de la règle
          <input
            value={ruleName}
            maxLength={80}
            onChange={(event) => setRuleName(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!ruleName.trim() || !words(keyword).length}
          onClick={async () => {
            try {
              await storageUpdate(textRulesKey, [] as TextRule[], (value) =>
                restoreTextRules([
                  ...restoreTextRules(value),
                  {
                    id: crypto.randomUUID(),
                    name: ruleName,
                    keywords: keyword,
                  },
                ]),
              );
              setRuleName("");
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          Enregistrer ces mots-clés
        </button>
        {rules.map((rule) => (
          <div className="organization-actions" key={rule.id}>
            <button type="button" onClick={() => setKeyword(rule.keywords)}>
              {rule.name} · {rule.keywords}
            </button>
            <button
              type="button"
              aria-label={`Supprimer la règle ${rule.name}`}
              onClick={async () => {
                try {
                  await storageUpdate(textRulesKey, [] as TextRule[], (value) =>
                    restoreTextRules(value).filter(
                      (item) => item.id !== rule.id,
                    ),
                  );
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>Fichiers locaux ({results.length})</h3>
      {results.slice(0, 100).map((file) => (
        <article className="organization-record" key={file.entry.path}>
          <button type="button" onClick={() => void open(file.entry)}>
            <FileText size={18} />
            <span>
              <strong>{file.entry.name}</strong>
              <small>{file.entry.path}</small>
            </span>
          </button>
          <small>{file.note}</small>
          {file.source && <small>Origine déclarée : {file.source}</small>}
          <p>
            {(() => {
              const text = file.text;
              const i = text
                .toLocaleLowerCase("fr")
                .indexOf(query.trim().toLocaleLowerCase("fr"));
              return i < 0
                ? text.slice(0, 220)
                : `${i > 80 ? "…" : ""}${text.slice(Math.max(0, i - 80), i + 140)}${i + 140 < text.length ? "…" : ""}`;
            })()}
          </p>
          {file.text && (
            <button
              type="button"
              onClick={() =>
                setSimilar(relatedTexts(index!.files, file.entry.path))
              }
            >
              Vocabulaire proche
            </button>
          )}
        </article>
      ))}
      {results.length > 100 && (
        <p>100 résultats affichés : précisez les filtres.</p>
      )}
      {similar.length > 0 && (
        <section aria-label="Textes au vocabulaire proche">
          <h3>Vocabulaire proche · TF-IDF / cosinus</h3>
          <p>
            Ressemblance de mots, sans compréhension du sens ni preuve que les
            documents traitent du même sujet.
          </p>
          {similar.map(({ file, score }) => (
            <button
              type="button"
              key={file.entry.path}
              disabled={stale}
              onClick={() => void open(file.entry)}
            >
              {file.entry.name} · {(score * 100).toFixed(0)} %
            </button>
          ))}
        </section>
      )}
      <h3>Liens et captures web ({links.length})</h3>
      {links.slice(0, 100).map((link) => (
        <a
          className="organization-link"
          key={link.path}
          href={safeURL(link.path)!}
          target="_blank"
          rel="noreferrer"
        >
          <Globe size={16} />
          <span>
            {link.name}
            <small>{link.path}</small>
          </span>
        </a>
      ))}
      <h3>Espaces</h3>
      {spaces
        .filter((space) =>
          match(
            `${space.name} ${space.tasks.map((task) => task.label).join(" ")}`,
          ),
        )
        .map((space) => (
          <button
            type="button"
            key={space.id}
            onClick={() => onSpace(space.id)}
          >
            <Folder size={16} />
            {space.name}
          </button>
        ))}
    </section>
  );
}
