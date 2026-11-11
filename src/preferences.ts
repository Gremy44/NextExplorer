import { fileViews, type ViewMode } from "./FileView";
import { tagPath } from "./tags";
export const preferencesKey = "explorerPreferences";
export function matchesSetting(query: string, label: string) {
  const fold = (text: string) =>
    text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
  const text = fold(label);
  return fold(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export const commandList = [
  ["search", "Rechercher dans mes fichiers et espaces"],
  ["home", "Accueil"],
  ["tags", "Gérer les tags"],
  ["drives", "Ce PC · lecteurs et espace disponible"],
  ["appearance", "Personnaliser les dossiers"],
  ["quick", "Actions rapides"],
  ["mkdir", "Créer un dossier"],
  ["note", "Créer une note Markdown"],
  ["batch", "Renommer par lot"],
  ["convert", "Convertir les fichiers"],
  ["zip", "Créer une archive"],
  ["extract", "Extraire une archive…"],
  ["terminal", "Ouvrir le terminal · terminal here"],
  ["code", "Ouvrir dans VS Code"],
  ["git", "Afficher git status"],
  ["scan", "Analyser l’espace disque"],
  ["duplicates", "Rechercher les doublons"],
  ["groups", "Regrouper les fichiers"],
  ["web", "Capturer une page web"],
  ["saveSession", "Sauvegarder les onglets et groupes"],
  ["pdf", "Capturer la page en PDF"],
  ["downloads", "Ranger les téléchargements"],
  ["spaces", "Enregistrer ou reprendre un espace"],
  ["prepare", "Préparer des images pour le web"],
  ["metadata", "Modifier les métadonnées"],
  ["trashList", "Restaurer depuis la corbeille"],
  ["settings", "Réglages et moteurs"],
] as const;
export const shortcutDefaults: Record<string, string> = {
  palette: "Ctrl+K",
  refresh: "F5",
  preview: "Space",
  rename: "F2",
  trash: "Delete",
  copy: "Ctrl+C",
  cut: "Ctrl+X",
  paste: "Ctrl+V",
  selectAll: "Ctrl+A",
  search: "Ctrl+Shift+F",
  back: "Alt+ArrowLeft",
  parent: "Alt+ArrowUp",
  filter: "/",
};
export const menuActionNames: Record<string, string> = {
  ...Object.fromEntries(commandList),
  preview: "Aperçu",
  open: "Ouvrir dans l’application",
  stash: "Ajouter à la collecte",
  copy: "Copier",
  cut: "Couper",
  rename: "Renommer",
  hash: "Calculer une empreinte",
  trash: "Mettre à la corbeille",
};
export const shortcutNames: Record<string, string> = {
  ...Object.fromEntries(commandList),
  palette: "Palette de commandes",
  refresh: "Actualiser",
  preview: "Aperçu",
  rename: "Renommer",
  trash: "Corbeille",
  copy: "Copier",
  cut: "Couper",
  paste: "Coller",
  selectAll: "Tout sélectionner",
  back: "Dossier précédent",
  parent: "Dossier parent",
  filter: "Filtrer le dossier",
};
export type Preferences = {
  version: 1;
  theme: "system" | "light" | "dark";
  accent: "blue" | "green" | "purple";
  density: "compact" | "standard" | "comfortable";
  textSize: number;
  menuSize: "compact" | "standard" | "comfortable";
  tooltips: boolean;
  remoteEnabled: boolean;
  mcpEnabled: boolean;
  mcpWrite: boolean;
  hidden: boolean;
  extensions: boolean;
  thumbnails: boolean;
  singleClick: boolean;
  checkboxes: boolean;
  hoverSelect: boolean;
  foldersFirst: boolean;
  rememberFolders: boolean;
  defaultView: ViewMode;
  units: "binary" | "decimal";
  startup: "restore" | "home" | "folders";
  startupPaths: string[];
  newTabFocus: boolean;
  homeSections: string[];
  columns: string[];
  dateWidth: number;
  sizeWidth: number;
  shortcuts: Record<string, string>;
  hiddenActions: string[];
};
export const defaultPreferences: Preferences = {
  version: 1,
  theme: "dark",
  accent: "blue",
  density: "standard",
  textSize: 100,
  menuSize: "standard",
  tooltips: true,
  remoteEnabled: false,
  mcpEnabled: false,
  mcpWrite: false,
  hidden: false,
  extensions: true,
  thumbnails: true,
  singleClick: false,
  checkboxes: false,
  hoverSelect: false,
  foldersFirst: true,
  rememberFolders: true,
  defaultView: "details",
  units: "binary",
  startup: "restore",
  startupPaths: [],
  newTabFocus: true,
  homeSections: ["favorites", "drives", "recent", "tags"],
  columns: ["mtime", "size"],
  dateWidth: 115,
  sizeWidth: 85,
  shortcuts: { ...shortcutDefaults },
  hiddenActions: [],
};
export function shortcutKey(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
) {
  const key =
    event.key === " "
      ? "Space"
      : event.key.length === 1 && /[a-z]/i.test(event.key)
        ? event.key.toUpperCase()
        : event.key;
  return [
    event.ctrlKey || event.metaKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey && key !== "/" ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
export function restorePreferences(value: unknown): Preferences {
  const raw = value as Preferences;
  if (!raw || raw.version !== 1) throw new Error("Préférences incompatibles");
  const p = { ...defaultPreferences, ...raw };
  const choice = (key: keyof Preferences, allowed: readonly unknown[]) => {
    if (!allowed.includes(p[key]))
      throw new Error(`Préférence invalide : ${key}`);
  };
  choice("theme", ["system", "light", "dark"]);
  choice("accent", ["blue", "green", "purple"]);
  choice("density", ["compact", "standard", "comfortable"]);
  choice("menuSize", ["compact", "standard", "comfortable"]);
  choice("units", ["binary", "decimal"]);
  choice("startup", ["restore", "home", "folders"]);
  choice(
    "defaultView",
    fileViews.map((view) => view.value),
  );
  for (const key of [
    "hidden",
    "extensions",
    "thumbnails",
    "singleClick",
    "checkboxes",
    "hoverSelect",
    "foldersFirst",
    "rememberFolders",
    "newTabFocus",
    "tooltips",
    "remoteEnabled",
    "mcpEnabled",
    "mcpWrite",
  ] as const)
    if (typeof p[key] !== "boolean")
      throw new Error(`Préférence invalide : ${key}`);
  for (const [key, min, max] of [
    ["dateWidth", 90, 240],
    ["sizeWidth", 70, 200],
    ["textSize", 85, 150],
  ] as const)
    if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max)
      throw new Error(
        key === "textSize"
          ? "Taille du texte invalide"
          : "Largeur de colonne invalide",
      );
  for (const [key, allowed] of [
    ["columns", ["mtime", "size", "type", "tags"]],
    ["homeSections", ["favorites", "drives", "recent", "tags"]],
    [
      "hiddenActions",
      [
        ...commandList.map(([id]) => id),
        "preview",
        "open",
        "stash",
        "copy",
        "cut",
        "rename",
        "hash",
        "trash",
      ],
    ],
  ] as const) {
    const items = p[key];
    if (
      !Array.isArray(items) ||
      items.some((item) => !(allowed as readonly string[]).includes(item)) ||
      new Set(items).size !== items.length
    )
      throw new Error(`Préférence invalide : ${key}`);
  }
  if (!Array.isArray(p.startupPaths) || p.startupPaths.length > 10)
    throw new Error("10 dossiers de démarrage maximum");
  p.columns = ["mtime", "size", "type", "tags"].filter((key) =>
    p.columns.includes(key),
  );
  p.startupPaths = p.startupPaths.map((path) => {
    tagPath(path);
    return path;
  });
  if (p.startup === "folders" && !p.startupPaths.length)
    throw new Error("Choisissez au moins un dossier de démarrage");
  if (
    !p.shortcuts ||
    typeof p.shortcuts !== "object" ||
    Array.isArray(p.shortcuts)
  )
    throw new Error("Raccourcis invalides");
  const used = new Set<string>();
  for (const [id, key] of Object.entries(p.shortcuts)) {
    if (
      !(id in shortcutNames) ||
      typeof key !== "string" ||
      (key &&
        !/^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9/]|F(?:[1-9]|1[0-2])|Space|Delete|ArrowLeft|ArrowUp)$/.test(
          key,
        )) ||
      /^(Ctrl\+(?:Shift\+)?(?:[LWTN]|R)|Alt\+F4)$/.test(key) ||
      (key && used.has(key))
    )
      throw new Error(`Raccourci invalide, réservé ou déjà utilisé : ${key}`);
    if (key) used.add(key);
  }
  // Rebuild known fields so imported objects cannot carry unvalidated settings.
  return Object.fromEntries(
    Object.keys(defaultPreferences).map((key) => [
      key,
      p[key as keyof Preferences],
    ]),
  ) as Preferences;
}
export function displaySize(n: number, units: Preferences["units"]) {
  const base = units === "decimal" ? 1000 : 1024,
    names =
      units === "decimal"
        ? ["o", "Ko", "Mo", "Go", "To"]
        : ["o", "Kio", "Mio", "Gio", "Tio"];
  const power =
    n > 0 ? Math.min(4, Math.floor(Math.log(n) / Math.log(base))) : 0;
  return `${(n / base ** power).toLocaleString("fr-FR", { maximumFractionDigits: power ? 1 : 0 })} ${names[power]}`;
}
