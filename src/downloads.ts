import { bridge, storageUpdate } from "./bridge";
import type { Entry } from "./types";

export const downloadFilingKey = "downloadFiling";
export const downloadRunsKey = "downloadRuns";
export type DownloadRun = {
  key: string;
  name: string;
  source: string;
  destination: string;
  date: string;
  state:
    | "blocked"
    | "reserved"
    | "running"
    | "completed"
    | "error"
    | "uncertain";
  automatic?: boolean;
  jobId?: string;
  message?: string;
};
export type DownloadRule = {
  id: string;
  name: string;
  site: string;
  extension: string;
  destination: string;
  enabled: boolean;
  automatic?: boolean;
  automaticSince?: string;
};
export type DownloadFiling = { rules: DownloadRule[]; destinations: string[] };

function downloadFolder(value: unknown) {
  const path = typeof value === "string" ? value.trim() : "";
  if (
    !path ||
    path.length > 4096 ||
    path.includes("\0") ||
    !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)
  )
    throw new Error("Choisissez un dossier avec un chemin absolu.");
  return path;
}

export function restoreDownloadRuns(value: unknown): DownloadRun[] {
  if (!Array.isArray(value))
    throw new Error(
      "Suivi des téléchargements endommagé ; vérifiez l’activité native.",
    );
  return value.map((run) => {
    if (
      !run ||
      typeof run.key !== "string" ||
      !run.key ||
      run.key.length > 150 ||
      typeof run.name !== "string" ||
      run.name.length > 4096 ||
      typeof run.date !== "string" ||
      !Number.isFinite(Date.parse(run.date)) ||
      ![
        "blocked",
        "reserved",
        "running",
        "completed",
        "error",
        "uncertain",
      ].includes(run.state) ||
      (run.jobId !== undefined && typeof run.jobId !== "string") ||
      (run.message !== undefined && typeof run.message !== "string") ||
      (run.automatic !== undefined && typeof run.automatic !== "boolean")
    )
      throw new Error(
        "Suivi des téléchargements endommagé ; vérifiez l’activité native.",
      );
    return {
      ...run,
      source: downloadFolder(run.source),
      destination: downloadFolder(run.destination),
    };
  });
}

export function normalizeDownloadRule(value: unknown): DownloadRule {
  if (!value || typeof value !== "object") throw new Error("Règle invalide.");
  const rule = value as Partial<DownloadRule>;
  if (
    typeof rule.id !== "string" ||
    !rule.id ||
    rule.id.length > 80 ||
    typeof rule.name !== "string" ||
    !rule.name.trim() ||
    rule.name.trim().length > 80 ||
    typeof rule.site !== "string" ||
    typeof rule.extension !== "string" ||
    typeof rule.enabled !== "boolean"
  )
    throw new Error("Donnez un nom à la règle (80 caractères maximum).");
  let site = rule.site.trim().toLowerCase();
  if (site) {
    try {
      const url = new URL(site.includes("://") ? site : `https://${site}`);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        !url.hostname ||
        /[\s*]/.test(site) ||
        url.hostname.length > 253
      )
        throw new Error();
      site = url.hostname;
    } catch {
      throw new Error(
        "Indiquez un site exact, par exemple exemple.fr, sans identifiants ni joker.",
      );
    }
  }
  let extension = rule.extension.trim().toLowerCase();
  if (extension && !extension.startsWith(".")) extension = "." + extension;
  if (extension && !/^\.[a-z0-9]{1,16}$/.test(extension))
    throw new Error("Indiquez une extension, par exemple .pdf ou .jpg.");
  if (!site && !extension)
    throw new Error("Choisissez au moins un site ou une extension.");
  return {
    id: rule.id,
    name: rule.name.trim(),
    site,
    extension,
    destination: downloadFolder(rule.destination),
    enabled: rule.enabled,
    // An incomplete opt-in remains a manual rule, so it still blocks broader rules.
    ...(rule.automatic === true &&
    typeof rule.automaticSince === "string" &&
    Number.isFinite(Date.parse(rule.automaticSince))
      ? { automatic: true, automaticSince: rule.automaticSince }
      : {}),
  };
}

export function restoreDownloadFiling(value: unknown): DownloadFiling {
  const data =
    value && typeof value === "object"
      ? (value as Partial<DownloadFiling>)
      : {};
  const rules: DownloadRule[] = [];
  for (const raw of Array.isArray(data.rules) ? data.rules.slice(0, 50) : []) {
    try {
      const rule = normalizeDownloadRule(raw);
      if (!rules.some((existing) => existing.id === rule.id)) rules.push(rule);
    } catch {
      /* Ignore corrupt saved rules; they never authorize a transfer. */
    }
  }
  const destinations: string[] = [];
  for (const raw of Array.isArray(data.destinations)
    ? data.destinations.slice(0, 20)
    : []) {
    try {
      const path = downloadFolder(raw);
      if (!destinations.includes(path)) destinations.push(path);
      if (destinations.length === 20) break;
    } catch {
      /* Ignore invalid remembered paths. */
    }
  }
  return { rules, destinations };
}

export function downloadSite(item: chrome.downloads.DownloadItem) {
  for (const address of [item.referrer, item.finalUrl, item.url]) {
    try {
      const url = new URL(address);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        return url.hostname;
    } catch {
      /* A download may have no usable source site. */
    }
  }
  return "";
}

export function downloadSuggestion(
  item: chrome.downloads.DownloadItem,
  rules: DownloadRule[],
) {
  return fileRuleSuggestion(
    item.filename,
    downloadSite(item),
    canFileDownload(item) ? rules : [],
  );
}

export function fileRuleSuggestion(
  filename: string,
  site: string,
  rules: DownloadRule[],
) {
  const matches = rules.filter(
    (rule) =>
      rule.enabled &&
      (!rule.site || rule.site === site) &&
      (!rule.extension || filename.toLowerCase().endsWith(rule.extension)),
  );
  const specificity = (rule: DownloadRule) =>
    Number(!!rule.site) + Number(!!rule.extension);
  const priority = Math.max(0, ...matches.map(specificity));
  const best = matches.filter((rule) => specificity(rule) === priority);
  const destinations = [...new Set(best.map((rule) => rule.destination))];
  return {
    rules: best,
    destination: destinations.length === 1 ? destinations[0] : "",
    ambiguous: destinations.length > 1,
  };
}

export function automaticDownloadSuggestion(
  item: chrome.downloads.DownloadItem,
  rules: DownloadRule[],
) {
  const suggestion = downloadSuggestion(item, rules);
  return {
    ...suggestion,
    automatic:
      suggestion.rules.length > 0 &&
      suggestion.rules.every(
        (rule) =>
          rule.automatic === true &&
          !!rule.automaticSince &&
          Date.parse(item.startTime) >= Date.parse(rule.automaticSince),
      ),
  };
}

export async function rememberDownloadDestination(destination: string) {
  const folder = downloadFolder(destination);
  return storageUpdate<unknown>(downloadFilingKey, null, (raw) => {
    const filing = restoreDownloadFiling(raw);
    return {
      ...filing,
      destinations: [
        folder,
        ...filing.destinations.filter((path) => path !== folder),
      ].slice(0, 20),
    };
  });
}

export function canFileDownload(item: chrome.downloads.DownloadItem) {
  return (
    !item.incognito &&
    item.state === "complete" &&
    item.exists &&
    !!item.filename &&
    ["safe", "accepted"].includes(item.danger)
  );
}

export async function verifyDownload(
  chosen: chrome.downloads.DownloadItem,
  request: typeof bridge.request = bridge.request.bind(bridge),
) {
  const [current] = await chrome.downloads.search({ id: chosen.id });
  if (
    !current ||
    !canFileDownload(current) ||
    current.filename !== chosen.filename ||
    current.startTime !== chosen.startTime
  )
    throw new Error(
      "Ce téléchargement n’est plus disponible pour le rangement. Actualisez la liste.",
    );
  const entry = await request<Entry>("FS_STAT", {
    path: current.filename,
  }).catch(() => {
    throw new Error(
      "Impossible d’accéder au fichier téléchargé. Vérifiez son emplacement et la connexion au compagnon.",
    );
  });
  if (
    entry.type !== "file" ||
    (current.fileSize >= 0 && current.fileSize !== entry.size)
  )
    throw new Error(
      "Le fichier téléchargé a changé. Vérifiez-le avant de le ranger.",
    );
  return current;
}
