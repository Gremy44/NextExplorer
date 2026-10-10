import { useEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  Plus,
  X,
} from "lucide-react";
import { bridge, storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { captureBrowserSession, restoreBrowserSession } from "./web";
import {
  addSpace,
  editSpaceTasks,
  normalizeBrowserSession,
  normalizeSpace,
  parseSpaceFile,
  restoreSpaces,
  serializeSpaceFile,
  SPACE_FILE_LIMIT,
  SPACE_TASK_LIMIT,
  spacesKey,
  updateSpace,
  type HybridSpace,
  type SpaceTaskChange,
} from "./spaces";
import type { Entry } from "./types";

export function SpacesDialog({
  snapshot,
  connected,
  onRestore,
  followedId,
  focusId,
  onFollow,
}: {
  snapshot: Omit<
    HybridSpace,
    "version" | "id" | "name" | "date" | "browser" | "tasks"
  >;
  connected: boolean;
  onRestore: (space: HybridSpace) => Promise<void>;
  followedId: string | null;
  focusId?: string;
  onFollow: (id: string | null) => Promise<void>;
}) {
  const [spaces, setSpaces] = useState<HybridSpace[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLElement>(null);
  const focused = useRef(false);
  const [imported, setImported] = useState<HybridSpace | null>(null);
  const [importName, setImportName] = useState("");
  const [update, setUpdate] = useState<{
    previous: HybridSpace;
    space: HybridSpace;
    includeWeb: boolean;
  } | null>(null);
  const [review, setReview] = useState<{
    space: HybridSpace;
    missing: string[];
  } | null>(null);
  useEffect(() => {
    let live = true,
      revision = 0;
    async function read() {
      const id = ++revision;
      try {
        const value = restoreSpaces(await storageGet(spacesKey, []));
        if (live && id === revision) {
          setSpaces(value);
          setReady(true);
        }
      } catch (error) {
        if (live) setError((error as Error).message);
      }
    }
    void read();
    const unsubscribe = storageSubscribe([spacesKey], read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!ready || !focusId || focused.current) return;
    const article = Array.from(
      content.current?.querySelectorAll<HTMLElement>(
        "article[data-space-id]",
      ) || [],
    ).find((element) => element.dataset.spaceId === focusId);
    const tasks = article?.querySelector<HTMLDetailsElement>(".space-tasks");
    if (tasks) {
      tasks.open = true;
      tasks.querySelector("summary")?.focus();
      tasks.scrollIntoView({ block: "nearest" });
      focused.current = true;
    }
  }, [ready, focusId, spaces]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeTasks(spaceId: string, change: SpaceTaskChange) {
    setSpaces(
      restoreSpaces(
        await storageUpdate<unknown>(spacesKey, [], (value) =>
          editSpaceTasks(value, spaceId, change),
        ),
      ),
    );
  }
  return (
    <section
      ref={content}
      className="spaces-dialog"
      aria-label="Espaces enregistrés"
    >
      <p>
        Gardez ensemble vos dossiers ouverts, votre collecte et les liens
        épinglés. Les fichiers restent à leur emplacement.
      </p>
      <p className="muted">
        L’espace suivi donne accès à ses tâches dans cette vue. Les dossiers, la
        collecte et les pages restent indépendants ; utilisez Actualiser pour
        enregistrer leurs changements.
      </p>
      {followedId && (
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() =>
            void act(async () => {
              await onFollow(null);
              setMessage(
                "Suivi arrêté dans cette vue ; espace et fichiers conservés.",
              );
            })
          }
        >
          <X size={18} aria-hidden="true" /> Arrêter le suivi dans cette vue
        </button>
      )}
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => importInput.current?.click()}
      >
        <Upload size={18} aria-hidden="true" /> Importer un espace…
      </button>
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        aria-label="Fichier d’espace à importer"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void act(async () => {
            setImported(null);
            setUpdate(null);
            if (file.size > SPACE_FILE_LIMIT)
              throw new Error(
                "Le fichier d’espace dépasse la limite de 2 Mio.",
              );
            const space = parseSpaceFile(await file.text());
            setImported(space);
            setImportName(space.name);
          });
        }}
      />
      <p className="muted">
        Les exports contiennent les chemins locaux et les adresses web incluses,
        les libellés des tâches et leurs cases cochées, sans le contenu de vos
        fichiers. Gardez-les dans un endroit choisi.
      </p>
      {imported && (
        <form
          aria-label="Importer un espace"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const space = normalizeSpace({
                ...imported,
                id: crypto.randomUUID(),
                name: importName,
              });
              setSpaces(
                restoreSpaces(
                  await storageUpdate<unknown>(spacesKey, [], (value) =>
                    addSpace(restoreSpaces(value), space),
                  ),
                ),
              );
              setImported(null);
              setMessage(
                `Espace « ${space.name} » importé. Choisissez Rouvrir pour le reprendre.`,
              );
            });
          }}
        >
          <fieldset disabled={busy || !ready}>
            <legend>Vérifier l’espace à importer</legend>
            <label className="field">
              <span>Nom de l’espace importé</span>
              <input
                required
                maxLength={80}
                value={importName}
                onChange={(event) => setImportName(event.target.value)}
              />
            </label>
            <p>
              {imported.tabs.length} onglet(s) local(aux) ·{" "}
              {imported.entries.length} élément(s) collecté(s) ·{" "}
              {imported.browser.tabs.length} page(s) web
            </p>
            {!!imported.tasks.length && (
              <details>
                <summary>
                  Tâches à importer (
                  {imported.tasks.filter((task) => task.done).length}/
                  {imported.tasks.length} cochées)
                </summary>
                <ul>
                  {imported.tasks.map((task) => (
                    <li key={task.id}>
                      {task.done ? "Cochée" : "À faire"} · {task.label}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <ul>
              {[...new Set(imported.tabs.flatMap((tab) => tab.paths))].map(
                (folder) => (
                  <li key={folder}>{folder}</li>
                ),
              )}
            </ul>
            <p className="muted">
              L’import ajoute un espace sans remplacer les espaces existants.
              Les dossiers et pages s’ouvrent seulement lors de la reprise
              choisie. Aucun document n’est créé, copié ou déplacé.
            </p>
            <div className="download-rule-actions">
              <button type="button" onClick={() => setImported(null)}>
                Annuler l’import
              </button>
              <button className="primary" type="submit">
                Enregistrer l’espace importé
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {update && (
        <form
          aria-label="Actualiser un espace"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const space = normalizeSpace({
                ...update.space,
                date: new Date().toISOString(),
              });
              setSpaces(
                restoreSpaces(
                  await storageUpdate<unknown>(spacesKey, [], (value) =>
                    updateSpace(restoreSpaces(value), update.previous, space),
                  ),
                ),
              );
              setUpdate(null);
              setMessage(
                `Espace « ${space.name} » actualisé. Fichiers et pages ouvertes conservés.`,
              );
            });
          }}
        >
          <fieldset disabled={busy || !connected || !ready}>
            <legend>Actualiser {update.previous.name}</legend>
            <label className="field">
              <span>Nom de l’espace actualisé</span>
              <input
                required
                maxLength={80}
                value={update.space.name}
                onChange={(event) =>
                  setUpdate({
                    ...update,
                    space: { ...update.space, name: event.target.value },
                  })
                }
              />
            </label>
            <p>
              Onglets locaux : {update.previous.tabs.length} →{" "}
              {update.space.tabs.length}. Collecte :{" "}
              {update.previous.entries.length} → {update.space.entries.length}.
              Pages web : {update.previous.browser.tabs.length} →{" "}
              {update.space.browser.tabs.length}.
            </p>
            <p>Dossiers de l’instantané proposé :</p>
            <ul>
              {[...new Set(update.space.tabs.flatMap((tab) => tab.paths))].map(
                (folder) => (
                  <li key={folder}>{folder}</li>
                ),
              )}
            </ul>
            <p className="muted">
              Les tâches et leur avancement sont conservés. Une modification de
              l’espace dans une autre vue empêchera cette actualisation.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={update.includeWeb}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setUpdate({ ...update, includeWeb: checked });
                  void act(async () => {
                    try {
                      const browser = checked
                        ? normalizeBrowserSession(await captureBrowserSession())
                        : update.previous.browser;
                      setUpdate({
                        ...update,
                        includeWeb: checked,
                        space: { ...update.space, browser },
                      });
                    } catch (error) {
                      setUpdate(update);
                      throw error;
                    }
                  });
                }}
              />
              Remplacer aussi les pages web par celles de cette fenêtre
            </label>
            <p className="muted">
              Les pages et groupes enregistrés sont conservés par défaut. Si
              vous cochez cette option, leurs remplaçants et leurs adresses
              complètes sont préparés pour cet instantané.
            </p>
            <p className="muted">
              La confirmation remplace les dossiers, affichages, collecte et
              liens de cet espace par cet instantané de la vue actuelle. Elle ne
              modifie aucun document et n’ouvre ni ne ferme aucune page.
              Exportez l’espace avant si vous souhaitez garder sa version
              précédente.
            </p>
            <div className="download-rule-actions">
              <button type="button" onClick={() => setUpdate(null)}>
                Annuler l’actualisation
              </button>
              <button className="primary" type="submit">
                Confirmer l’actualisation
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <form
        hidden={!!update}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void act(async () => {
            const browser = data.has("includeWeb")
              ? await captureBrowserSession()
              : { tabs: [], groups: [] };
            const space = normalizeSpace({
              ...snapshot,
              version: 1,
              id: crypto.randomUUID(),
              name: data.get("name"),
              date: new Date().toISOString(),
              browser,
            });
            setSpaces(
              restoreSpaces(
                await storageUpdate<unknown>(spacesKey, [], (value) =>
                  addSpace(restoreSpaces(value), space),
                ),
              ),
            );
            await onFollow(space.id);
            setMessage(`Espace « ${space.name} » enregistré.`);
          });
        }}
      >
        <fieldset disabled={busy || !connected || !ready}>
          <label className="field">
            <span>Nom de l’espace</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Voyage, candidature, projet…"
            />
          </label>
          <label className="checkbox">
            <input type="checkbox" name="includeWeb" /> Inclure les onglets web
            et leurs groupes dans cette fenêtre
          </label>
          <p className="muted">
            Les adresses web complètes seront conservées localement dans ce
            profil. Aucun contenu de page n’est copié.
          </p>
          <button className="primary" type="submit">
            <Save size={18} aria-hidden="true" /> Enregistrer cet espace
          </button>
        </fieldset>
      </form>
      {!spaces.length && ready && <p>Aucun espace enregistré.</p>}
      {spaces.map((space) => (
        <article key={space.id} data-space-id={space.id}>
          <strong>{space.name}</strong>
          {space.id === followedId && (
            <span className="space-follow-badge">
              Espace suivi dans cette vue
            </span>
          )}
          <small>
            {space.tabs.length} onglet(s) local(aux) · {space.entries.length}{" "}
            élément(s) collecté(s) · {space.browser.tabs.length} page(s) web
          </small>
          <div className="download-rule-actions">
            <button
              type="button"
              disabled={busy || !ready || space.id === followedId}
              aria-label={`Suivre l’espace ${space.name}`}
              onClick={() =>
                void act(async () => {
                  await onFollow(space.id);
                  setMessage(
                    `Suivi de « ${space.name} » choisi dans cette vue.`,
                  );
                })
              }
            >
              <FolderOpen size={18} aria-hidden="true" /> Suivre cet espace
            </button>
            <button
              type="button"
              disabled={busy || !connected || !ready}
              aria-label={`Actualiser l’espace ${space.name}`}
              onClick={() =>
                void act(async () => {
                  setImported(null);
                  setReview(null);
                  setUpdate({
                    previous: space,
                    space: normalizeSpace({
                      ...snapshot,
                      version: 1,
                      id: space.id,
                      name: space.name,
                      date: space.date,
                      browser: space.browser,
                    }),
                    includeWeb: false,
                  });
                })
              }
            >
              <RefreshCw size={18} aria-hidden="true" /> Actualiser…
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Exporter l’espace ${space.name}`}
              onClick={() =>
                void act(async () => {
                  const text = serializeSpaceFile(space);
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `NextExplorer-${space.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")}.space.json`;
                  document.body.append(link);
                  try {
                    link.click();
                    setMessage(
                      `Export de « ${space.name} » demandé. Vérifiez le téléchargement dans le navigateur.`,
                    );
                  } finally {
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }
                })
              }
            >
              <Download size={18} aria-hidden="true" /> Exporter
            </button>
            <button
              disabled={busy || !connected}
              aria-label={`Examiner l’espace ${space.name}`}
              onClick={() =>
                void act(async () => {
                  setUpdate(null);
                  const paths = [
                    ...new Set([
                      ...space.tabs.flatMap((tab) =>
                        tab.dual ? tab.paths : [tab.paths[tab.active]],
                      ),
                      ...space.entries
                        .filter((entry) => entry.type !== "web")
                        .map((entry) => entry.path),
                    ]),
                  ];
                  const missing: string[] = [];
                  for (const path of paths) {
                    try {
                      const entry = await bridge.request<Entry>(
                        "FS_STAT",
                        { path },
                        5000,
                      );
                      if (
                        space.tabs.some((tab) => tab.paths.includes(path)) &&
                        entry.type !== "directory"
                      )
                        missing.push(path);
                    } catch {
                      missing.push(path);
                    }
                  }
                  setReview({ space, missing });
                })
              }
            >
              <FolderOpen size={18} aria-hidden="true" /> Rouvrir…
            </button>
            <button
              disabled={busy}
              aria-label={`Supprimer l’espace ${space.name}`}
              onClick={() =>
                void act(async () => {
                  setSpaces(
                    restoreSpaces(
                      await storageUpdate<unknown>(spacesKey, [], (value) =>
                        restoreSpaces(value).filter(
                          (item) => item.id !== space.id,
                        ),
                      ),
                    ),
                  );
                  if (review?.space.id === space.id) setReview(null);
                  setMessage("Espace retiré ; fichiers conservés.");
                })
              }
            >
              <Trash2 size={18} aria-hidden="true" /> Supprimer
            </button>
          </div>
          <details
            className="space-tasks"
            aria-label={`Tâches de ${space.name}`}
          >
            <summary>
              Tâches ({space.tasks.filter((task) => task.done).length}/
              {space.tasks.length})
            </summary>
            <p className="muted">
              Votre suivi personnel. Cocher une tâche ne confirme aucun envoi ni
              réception par un site. 20 tâches maximum.
            </p>
            {space.tasks.map((task) => (
              <div className="space-task" key={task.id}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={busy || !ready}
                    onChange={(event) => {
                      const done = event.currentTarget.checked;
                      void act(() =>
                        changeTasks(space.id, {
                          kind: "set",
                          id: task.id,
                          done,
                        }),
                      );
                    }}
                  />
                  <span>{task.label}</span>
                </label>
                <button
                  type="button"
                  disabled={busy || !ready}
                  aria-label={`Retirer la tâche ${task.label}`}
                  onClick={() =>
                    void act(() =>
                      changeTasks(space.id, { kind: "remove", id: task.id }),
                    )
                  }
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ))}
            <form
              aria-label={`Ajouter une tâche à ${space.name}`}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const label = String(new FormData(form).get("task") || "");
                void act(async () => {
                  await changeTasks(space.id, {
                    kind: "add",
                    id: crypto.randomUUID(),
                    label,
                  });
                  form.reset();
                  setMessage("Tâche ajoutée à cet espace.");
                });
              }}
            >
              <fieldset
                disabled={
                  busy || !ready || space.tasks.length >= SPACE_TASK_LIMIT
                }
              >
                <label className="field">
                  <span>Nouvelle tâche</span>
                  <input
                    name="task"
                    required
                    maxLength={160}
                    aria-label={`Nouvelle tâche pour ${space.name}`}
                    placeholder="Préparer le CV, vérifier les pièces…"
                  />
                </label>
                <button type="submit">
                  <Plus size={18} aria-hidden="true" /> Ajouter la tâche
                </button>
              </fieldset>
            </form>
          </details>
        </article>
      ))}
      {review && (
        <form
          aria-label="Reprendre un espace"
          onSubmit={(event) => {
            event.preventDefault();
            const openWeb = new FormData(event.currentTarget).has("openWeb");
            void act(async () => {
              const space = normalizeSpace(review.space);
              await onRestore(space);
              await onFollow(space.id);
              setReview(null);
              setMessage(
                `Espace « ${space.name} » rouvert. La collecte est fusionnée avec la collecte actuelle.`,
              );
              if (openWeb) await restoreBrowserSession(space.browser);
            });
          }}
        >
          <fieldset disabled={busy || !connected}>
            <legend>Reprendre {review.space.name}</legend>
            <p>
              Les dossiers s’ajoutent aux onglets locaux. La collecte et les
              liens sont fusionnés avec ceux déjà présents.
            </p>
            {review.missing.length > 0 && (
              <div role="status">
                <p>
                  Ressources absentes ou inaccessibles, conservées comme
                  références :
                </p>
                <ul>
                  {review.missing.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </div>
            )}
            {review.space.browser.tabs.length > 0 && (
              <label className="checkbox">
                <input type="checkbox" name="openWeb" /> Rouvrir aussi les{" "}
                {review.space.browser.tabs.length} page(s) web et leurs groupes
              </label>
            )}
            <div className="download-rule-actions">
              <button type="button" onClick={() => setReview(null)}>
                Annuler la reprise
              </button>
              <button className="primary" type="submit">
                Reprendre cet espace
              </button>
            </div>
          </fieldset>
        </form>
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
