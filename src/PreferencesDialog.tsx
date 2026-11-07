import { Help } from "./Help";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Save,
  Palette,
  Home,
  Columns3,
  Keyboard,
  List,
  HardDrive,
  Archive,
  Server,
} from "lucide-react";
import { bridge, storageSet, storageGet } from "./bridge";
import { useOrganization } from "./OrganizationContext";
import {
  defaultPreferences,
  preferencesKey,
  restorePreferences,
  shortcutNames,
  shortcutDefaults,
  shortcutKey,
  commandList,
  menuActionNames,
  matchesSetting,
  type Preferences,
} from "./preferences";
import { restoreTags, tagsKey, type TagStore } from "./tags";
import { fileViews } from "./FileView";
import type { Entry } from "./types";

import {
  parseOrganizationExport,
  type OrganizationExport,
} from "./organization-export";
import { textRulesKey } from "./local-index";
import { conversionPresetsKey } from "./conversion-presets";
import { folderAppearanceKey } from "./folder-appearance";

const sections = [
  ["appearance", "Apparence", Palette],
  ["startup", "Démarrage", Home],
  ["columns", "Colonnes", Columns3],
  ["shortcuts", "Raccourcis", Keyboard],
  ["menus", "Menus", List],
  ["engines", "Moteurs", HardDrive],
  ["connections", "Connexions", Server],
  ["backup", "Sauvegarde", Archive],
] as const;

export function PreferencesDialog({
  engines,
  onConnections,
}: {
  engines?: ReactNode;
  onConnections?: () => void;
}) {
  const current = useOrganization();
  const [draft, setDraft] = useState<Preferences>(current.preferences),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("");
  const [imported, setImported] = useState<OrganizationExport | null>(null),
    input = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState("appearance");
  const [noMatches, setNoMatches] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const showSection = (id: string) => !!filter.trim() || section === id;
  useLayoutEffect(() => {
    const query = filter.trim().toLocaleLowerCase("fr");
    content.current
      ?.querySelectorAll<HTMLElement>(".field, .organization-check")
      .forEach((field) => {
        const category =
          field.closest("fieldset")?.querySelector("legend")?.textContent || "";
        field.hidden =
          !!query && !matchesSetting(query, `${category} ${field.textContent}`);
      });
    const groups = [
      ...(content.current?.querySelectorAll<HTMLFieldSetElement>(
        ":scope > fieldset",
      ) || []),
    ];
    groups.forEach((group, index) => {
      group.hidden = query
        ? !matchesSetting(query, group.textContent || "")
        : sections[index][0] !== section;
    });
    setNoMatches(!!query && groups.every((group) => group.hidden));
    content.current?.scrollTo(0, 0);
  }, [filter, section]);
  const update = (value: Partial<Preferences>) =>
    setDraft((old) => ({ ...old, ...value }));
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const preferences = restorePreferences(draft);
      for (const path of preferences.startupPaths)
        if (
          (await bridge.request<Entry>("FS_STAT", { path }, 5000)).type !==
          "directory"
        )
          throw new Error("Dossier de démarrage indisponible");
      await storageSet(preferencesKey, preferences);
      setMessage("Préférences enregistrées");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const check = (key: keyof Preferences, label: string) => (
    <label className="organization-check" key={key}>
      <input
        type="checkbox"
        checked={draft[key] === true}
        onChange={(event) => update({ [key]: event.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <section className="organization-dialog preferences-dialog">
      <div className="preferences-scroll">
        <label className="field">
          Rechercher un réglage
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <div className="preferences-layout">
          <nav className="preferences-nav" aria-label="Sections des réglages">
            {sections.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-current={!filter && section === id ? "page" : undefined}
                onClick={() => {
                  setFilter("");
                  setSection(id);
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          <div className="preferences-content" ref={content}>
            {noMatches && <p role="status">Aucun réglage trouvé.</p>}
            <fieldset
              className="preferences-appearance"
              hidden={!showSection("appearance")}
            >
              <legend>Apparence et navigation</legend>
              <label className="field">
                Taille de l’interface
                <select
                  aria-label="Taille de l’interface"
                  value={draft.density}
                  onChange={(event) =>
                    update({
                      density: event.target.value as Preferences["density"],
                    })
                  }
                >
                  <option value="compact">Compacte</option>
                  <option value="standard">Standard</option>
                  <option value="comfortable">Confortable</option>
                </select>
              </label>
              <label className="field">
                Taille du texte : {draft.textSize} %
                <input
                  aria-label="Taille du texte"
                  type="range"
                  min={85}
                  max={150}
                  step={5}
                  value={draft.textSize}
                  onChange={(event) =>
                    update({ textSize: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                Taille du menu contextuel
                <select
                  aria-label="Taille du menu contextuel"
                  value={draft.menuSize}
                  onChange={(event) =>
                    update({
                      menuSize: event.target.value as Preferences["menuSize"],
                    })
                  }
                >
                  <option value="compact">Compacte</option>
                  <option value="standard">Standard</option>
                  <option value="comfortable">Confortable</option>
                </select>
              </label>
              {check("tooltips", "Afficher les infobulles d’aide")}
              <label className="field">
                Thème
                <select
                  aria-label="Thème"
                  value={draft.theme}
                  onChange={(event) =>
                    update({
                      theme: event.target.value as Preferences["theme"],
                    })
                  }
                >
                  <option value="system">Système</option>
                  <option value="light">Clair</option>
                  <option value="dark">Sombre</option>
                </select>
              </label>
              <label className="field">
                Couleur principale
                <select
                  value={draft.accent}
                  onChange={(event) =>
                    update({
                      accent: event.target.value as Preferences["accent"],
                    })
                  }
                >
                  <option value="blue">Bleu</option>
                  <option value="green">Vert</option>
                  <option value="purple">Violet</option>
                </select>
              </label>
              {check(
                "hidden",
                "Afficher les éléments cachés (y compris système)",
              )}
              {check("extensions", "Afficher les extensions")}
              {check("thumbnails", "Afficher les miniatures")}
              {check("singleClick", "Ouvrir avec un clic simple")}
              {check("checkboxes", "Cases de sélection")}
              {check("hoverSelect", "Sélectionner au survol (600 ms)")}
              {check("foldersFirst", "Dossiers en premier")}
              {check(
                "rememberFolders",
                "Mémoriser l’affichage et le tri par dossier",
              )}
              {check("newTabFocus", "Activer les nouveaux onglets")}
              <label className="field">
                Affichage par défaut
                <select
                  value={draft.defaultView}
                  onChange={(event) =>
                    update({
                      defaultView: event.target
                        .value as Preferences["defaultView"],
                    })
                  }
                >
                  {fileViews.map((view) => (
                    <option key={view.value} value={view.value}>
                      {view.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Unités de taille
                <select
                  value={draft.units}
                  onChange={(event) =>
                    update({
                      units: event.target.value as Preferences["units"],
                    })
                  }
                >
                  <option value="binary">Binaires (Kio, Mio)</option>
                  <option value="decimal">Décimales (Ko, Mo)</option>
                </select>
              </label>
            </fieldset>
            <fieldset hidden={!showSection("startup")}>
              <legend>Démarrage et accueil</legend>
              <label className="field">
                Au démarrage
                <select
                  value={draft.startup}
                  onChange={(event) =>
                    update({
                      startup: event.target.value as Preferences["startup"],
                    })
                  }
                >
                  <option value="restore">Reprendre les onglets</option>
                  <option value="home">Ouvrir l’accueil</option>
                  <option value="folders">Ouvrir des dossiers choisis</option>
                </select>
              </label>
              {draft.startup === "folders" && (
                <label className="field">
                  Un chemin absolu par ligne (10 maximum)
                  <textarea
                    aria-label="Dossiers au démarrage"
                    value={draft.startupPaths.join("\n")}
                    onChange={(event) =>
                      update({ startupPaths: event.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              {[
                ["favorites", "Favoris"],
                ["drives", "Lecteurs"],
                ["recent", "Dossiers récents"],
                ["tags", "Tags"],
              ].map(([id, label]) => (
                <label className="organization-check" key={id}>
                  <input
                    type="checkbox"
                    checked={draft.homeSections.includes(id)}
                    onChange={(event) =>
                      update({
                        homeSections: event.target.checked
                          ? [...draft.homeSections, id]
                          : draft.homeSections.filter((value) => value !== id),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset hidden={!showSection("columns")}>
              <legend>Colonnes du mode Détails</legend>
              {[
                ["mtime", "Date"],
                ["size", "Taille"],
                ["type", "Type"],
                ["tags", "Tags"],
              ].map(([id, label]) => (
                <label className="organization-check" key={id}>
                  <input
                    type="checkbox"
                    checked={draft.columns.includes(id)}
                    onChange={(event) =>
                      update({
                        columns: event.target.checked
                          ? [...draft.columns, id]
                          : draft.columns.filter((value) => value !== id),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              <label className="field">
                Largeur Date : {draft.dateWidth} px
                <input
                  type="range"
                  min={90}
                  max={240}
                  value={draft.dateWidth}
                  onChange={(event) =>
                    update({ dateWidth: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                Largeur Taille : {draft.sizeWidth} px
                <input
                  type="range"
                  min={70}
                  max={200}
                  value={draft.sizeWidth}
                  onChange={(event) =>
                    update({ sizeWidth: Number(event.target.value) })
                  }
                />
              </label>
            </fieldset>
            <fieldset hidden={!showSection("shortcuts")}>
              <legend>Raccourcis clavier</legend>
              <Help>
                Cliquez dans un champ puis pressez le raccourci. Retour arrière
                l’efface. Les collisions et raccourcis réservés sont refusés à
                l’enregistrement.
              </Help>
              {Object.entries(shortcutNames).map(([id, label]) => (
                <label className="field" key={id}>
                  {label}
                  <input
                    aria-label={`Raccourci ${label}`}
                    readOnly
                    value={draft.shortcuts[id] || ""}
                    placeholder="Non attribué"
                    onKeyDown={(event) => {
                      if (
                        [
                          "Tab",
                          "Escape",
                          "Control",
                          "Shift",
                          "Alt",
                          "Meta",
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      update({
                        shortcuts: {
                          ...draft.shortcuts,
                          [id]:
                            event.key === "Backspace" ? "" : shortcutKey(event),
                        },
                      });
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => update({ shortcuts: { ...shortcutDefaults } })}
              >
                <RotateCcw size={16} />
                Rétablir les raccourcis
              </button>
            </fieldset>
            <fieldset hidden={!showSection("menus")}>
              <legend>Actions visibles dans les menus</legend>
              <Help>
                Les actions masquées restent accessibles par la palette et leurs
                raccourcis.
              </Help>
              {Object.entries(menuActionNames)
                .filter(([id]) => id !== "settings")
                .map(([id, label]) => (
                  <label className="organization-check" key={id}>
                    <input
                      type="checkbox"
                      checked={!draft.hiddenActions.includes(id)}
                      onChange={(event) =>
                        update({
                          hiddenActions: event.target.checked
                            ? draft.hiddenActions.filter(
                                (value) => value !== id,
                              )
                            : [...draft.hiddenActions, id],
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
            </fieldset>
            <fieldset hidden={!showSection("engines")}>
              <legend>Moteurs facultatifs</legend>
              {engines}
            </fieldset>
            <fieldset hidden={!showSection("connections")}>
              <legend>Dossiers distants</legend>
              {check("remoteEnabled", "Activer les connexions aux serveurs")}
              <p className="muted">
                SFTP / SSH, FTP et FTPS. Les serveurs apparaissent dans la
                navigation après enregistrement des réglages.
              </p>
              <button
                type="button"
                disabled={!current.preferences.remoteEnabled}
                onClick={onConnections}
              >
                <Server size={16} /> Gérer les connexions
              </button>
            </fieldset>
            <fieldset hidden={!showSection("backup")}>
              <legend>Exporter / importer les préférences et tags</legend>

              <p>
                L’export contient les chemins associés aux tags et les dossiers
                de démarrage, ainsi que les préréglages de conversion. Il ne
                contient ni index de contenu, ni fichiers, ni autorisation
                d’automatisation.
              </p>
              <div className="organization-actions">
                <button
                  type="button"
                  onClick={async () => {
                    setError("");
                    try {
                      const folders = await storageGet("folderPreferences", {}),
                        rules = await storageGet(textRulesKey, []),
                        presets = await storageGet(conversionPresetsKey, []);
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            parseOrganizationExport(
                              JSON.stringify({
                                version: 1,
                                preferences: current.preferences,
                                tags: current.tags,
                                appearances: current.appearances,
                                folders,
                                rules,
                                presets,
                              }),
                            ),
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob),
                        link = document.createElement("a");
                      link.href = url;
                      link.download = "NextExplorer-preferences-tags.json";
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                >
                  <Download size={16} />
                  Exporter
                </button>
                <button type="button" onClick={() => input.current?.click()}>
                  <Upload size={16} />
                  Choisir un export
                </button>
              </div>
              <input
                hidden
                ref={input}
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setError("");
                  setImported(null);
                  try {
                    if (file.size > 1024 * 1024)
                      throw new Error("Import limité à 1 Mio");
                    setImported(parseOrganizationExport(await file.text()));
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              />
              {imported && (
                <div className="organization-record">
                  <p>
                    Remplacer les préférences et tags actuels par{" "}
                    {imported.tags.labels.length} tag(s) et{" "}
                    {Object.keys(imported.tags.files).length} association(s) et{" "}
                    {imported.presets.length} préréglage(s) de conversion ?
                    Aucun fichier ne sera déplacé.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await navigator.locks.request(
                          `nextexplorer:${tagsKey}`,
                          () =>
                            navigator.locks.request(
                              `nextexplorer:${preferencesKey}`,
                              async () => {
                                await navigator.locks.request(
                                  `nextexplorer:${conversionPresetsKey}`,
                                  () =>
                                    navigator.locks.request(
                                      `nextexplorer:${folderAppearanceKey}`,
                                      async () => {
                                        if (globalThis.chrome?.storage)
                                          await chrome.storage.local.set({
                                            [tagsKey]: imported.tags,
                                            [folderAppearanceKey]:
                                              imported.appearances,
                                            [preferencesKey]:
                                              imported.preferences,
                                            folderPreferences: imported.folders,
                                            [textRulesKey]: imported.rules,
                                            [conversionPresetsKey]:
                                              imported.presets,
                                          });
                                        else {
                                          await storageSet(
                                            tagsKey,
                                            imported.tags,
                                          );
                                          await storageSet(
                                            folderAppearanceKey,
                                            imported.appearances,
                                          );
                                          await storageSet(
                                            preferencesKey,
                                            imported.preferences,
                                          );
                                          await storageSet(
                                            "folderPreferences",
                                            imported.folders,
                                          );
                                          await storageSet(
                                            textRulesKey,
                                            imported.rules,
                                          );
                                          await storageSet(
                                            conversionPresetsKey,
                                            imported.presets,
                                          );
                                        }
                                      },
                                    ),
                                );
                              },
                            ),
                        );
                        setDraft(imported.preferences);
                        setImported(null);
                        setMessage("Import appliqué");
                      } catch (error) {
                        setError((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remplacer avec cet export
                  </button>
                  <button type="button" onClick={() => setImported(null)}>
                    Annuler l’import
                  </button>
                </div>
              )}
            </fieldset>
          </div>
        </div>
      </div>
      <div className="organization-actions preferences-save">
        <button
          type="button"
          className="primary"
          aria-label="Enregistrer les préférences"
          disabled={busy}
          onClick={() => void save()}
        >
          <Save size={16} />
          Enregistrer
        </button>
        <button
          type="button"
          aria-label="Valeurs par défaut"
          disabled={busy}
          onClick={() =>
            setDraft({
              ...defaultPreferences,
              shortcuts: { ...shortcutDefaults },
            })
          }
        >
          Réinitialiser
        </button>
      </div>

      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
