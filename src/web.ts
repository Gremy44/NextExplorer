import { Readability } from "@mozilla/readability";
import { bridge, storageUpdate } from "./bridge";
import { safeURL, type Entry } from "./types";
import { selectionCapture, type PendingCapture } from "./collection";
import { fileMime } from "./file-mime";
import { uploadIssue, UPLOAD_FILE_LIMIT, UPLOAD_TOTAL_BYTES } from "./uploads";
import {
  finishInsertion,
  reserveInsertion,
  type Insertion,
} from "./insertions";

export type BrowserPage = {
  id: number;
  windowId: number;
  url: string;
  title: string;
};
export type UploadField = {
  index: number;
  label: string;
  accept: string;
  multiple: boolean;
  disabled: boolean;
  signature: string;
};
export type UploadTarget = {
  page: BrowserPage;
  documentId: string;
  fields: UploadField[];
  field: UploadField;
};

export async function currentBrowserPage(): Promise<BrowserPage | null> {
  if (!globalThis.chrome?.tabs?.query) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id !== undefined && safeURL(tab.url || "")
    ? {
        id: tab.id,
        windowId: tab.windowId,
        url: tab.url!,
        title: tab.title || new URL(tab.url!).hostname,
      }
    : null;
}

export async function verifyPage(page: BrowserPage) {
  const [active] = await chrome.tabs.query({
    active: true,
    windowId: page.windowId,
  });
  if (active?.id !== page.id || active.url !== page.url)
    throw new Error(
      "La page a changé. Vérifiez la destination et recommencez.",
    );
}

export async function captureSelection(page: BrowserPage) {
  await grant(page.url);
  await verifyPage(page);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: page.id },
    func: () => ({
      text: window.getSelection()?.toString() || "",
      title: document.title,
    }),
  });
  await verifyPage(page);
  const capture = selectionCapture(
    { selectionText: result?.result?.text, pageUrl: page.url },
    { title: result?.result?.title, url: page.url },
  );
  await storageUpdate<PendingCapture | null>(
    "pendingCapture",
    null,
    (current) => {
      if (current)
        throw new Error(
          "Un extrait attend déjà confirmation. Enregistrez-le ou écartez-le d’abord.",
        );
      return capture;
    },
  );
}

// Self-contained: this function is serialized into the page by Chrome.
function uploadForm(
  files: { name: string; data: string; type: string }[] | null,
  chosen?: UploadField,
) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("input[type=file]"),
  );
  const fields = inputs.map((input, index) => {
    const label =
      Array.from(input.labels || [])
        .map((label) => label.textContent?.trim())
        .join(" ") ||
      input.getAttribute("aria-label") ||
      input.name ||
      `Champ de fichiers ${index + 1}`;
    return {
      index,
      label: label.slice(0, 160),
      accept: input.accept,
      multiple: input.multiple,
      disabled: input.matches(":disabled"),
      signature: JSON.stringify([
        input.id,
        input.name,
        label,
        input.accept,
        input.multiple,
        input.matches(":disabled"),
      ]),
    };
  });
  const focused = inputs.indexOf(document.activeElement as HTMLInputElement);
  if (!files) return { fields, focused, inserted: false };
  const index = chosen?.index ?? (focused >= 0 ? focused : 0);
  const input = inputs[index];
  if (!input)
    return {
      fields,
      inserted: false,
      error: "Aucun champ de fichier trouvé sur la page",
    };
  if (chosen && fields[index].signature !== chosen.signature)
    return {
      fields,
      inserted: false,
      error: "Le formulaire a changé. Analysez à nouveau ses champs.",
    };
  if (input.matches(":disabled"))
    return {
      fields,
      inserted: false,
      error: "Ce champ de fichiers est désactivé",
    };
  if (!input.multiple && files.length > 1)
    return {
      fields,
      inserted: false,
      error: "Ce formulaire accepte un seul fichier",
    };
  const dt = new DataTransfer();
  for (const file of files) {
    const raw = atob(file.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    dt.items.add(new File([bytes], file.name, { type: file.type }));
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return { fields, inserted: true };
}

export async function inspectUploads(page: BrowserPage) {
  await grant(page.url);
  await verifyPage(page);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: page.id },
    func: uploadForm,
    args: [null],
  });
  await verifyPage(page);
  if (!result?.documentId)
    throw new Error("Impossible d’identifier ce formulaire");
  return {
    page,
    documentId: result.documentId,
    fields: result.result?.fields || [],
  };
}

export async function openFullExplorer(path: string) {
  const browserWindow = await chrome.windows.getCurrent();
  await chrome.tabs.create({
    windowId: browserWindow.id,
    url: chrome.runtime.getURL(
      `index.html${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    ),
  });
  const sidePanel = chrome.sidePanel as typeof chrome.sidePanel & {
    close?: (options: { windowId: number }) => Promise<void>;
  };
  if (sidePanel?.close && browserWindow.id !== undefined)
    await sidePanel.close({ windowId: browserWindow.id });
  else globalThis.close();
}
export async function grant(url: string) {
  const u = safeURL(url);
  if (!u) throw new Error("URL HTTP(S) requise");
  if (!globalThis.chrome?.permissions)
    throw new Error("Disponible dans l’extension");
  if (
    !(await chrome.permissions.request({ origins: [new URL(u).origin + "/*"] }))
  )
    throw new Error("Accès à cette page refusé");
  return u;
}
export async function webCapture(path: string, url: string, mode: string) {
  const clean = await grant(url);
  const response = await fetch(clean, {
    signal: AbortSignal.timeout(20000),
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 8 * 1024 * 1024) throw new Error("Page trop volumineuse");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    doc.title ||
    new URL(clean).hostname;
  const safeName =
    title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 100) || "Page web";
  const stamp = Date.now();
  if (mode === "markdown") {
    const article = new Readability(doc).parse();
    const body = new DOMParser().parseFromString(
      article?.content || "",
      "text/html",
    );
    const lines = [
      ...body.querySelectorAll("h1,h2,h3,p,li,pre,blockquote"),
    ].map((el) => {
      const t = el.textContent?.trim() || "";
      return /^H[1-3]$/.test(el.tagName)
        ? "#".repeat(Number(el.tagName[1])) + " " + t
        : el.tagName === "LI"
          ? "- " + t
          : el.tagName === "PRE"
            ? "```\n" + t + "\n```"
            : t;
    });
    return bridge.request("FS_WRITE", {
      path,
      name: `${safeName}-${stamp}.md`,
      text: `# ${title}\n\nSource : ${clean}\n\n${lines.join("\n\n")}`,
    });
  }
  const get = (key: string) =>
    doc.querySelector(`meta[property="${key}"]`)?.getAttribute("content") || "";
  let image = "";
  const candidate = get("og:image");
  if (candidate) {
    try {
      const resolved = new URL(candidate, clean);
      if (resolved.origin === new URL(clean).origin) {
        const r = await fetch(resolved.href, {
          signal: AbortSignal.timeout(10000),
        });
        const blob = await r.blob();
        if (
          blob.size < 1024 * 1024 &&
          /^image\/(png|jpeg|webp|gif)$/.test(blob.type)
        ) {
          image = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch {}
  }
  return bridge.request("FS_WRITE", {
    path,
    name: `${safeName}-${stamp}.weblink`,
    text: JSON.stringify(
      {
        title,
        url: clean,
        description: get("og:description"),
        image,
        favicon: new URL("/favicon.ico", clean).href,
      },
      null,
      2,
    ),
  });
}
export async function pageTab() {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const tab = tabs
    .filter((t) => t.id && safeURL(t.url || ""))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  if (!tab?.id) throw new Error("Ouvrez une page web dans cette fenêtre");
  return tab;
}
export async function writeChunks(
  path: string,
  name: string,
  chunks: Uint8Array[],
) {
  let result: any;
  for (let i = 0; i < chunks.length; i++) {
    const data = btoa(
      Array.from(chunks[i], (c) => String.fromCharCode(c)).join(""),
    );
    result = await bridge.request("FS_UPLOAD", {
      path,
      name,
      data,
      offset: chunks.slice(0, i).reduce((n, c) => n + c.length, 0),
      final: i === chunks.length - 1,
    });
  }
  return result;
}
export async function saveSession(path: string) {
  return bridge.request("FS_WRITE", {
    path,
    name: `Session-${Date.now()}.session.json`,
    text: JSON.stringify(
      { version: 1, ...(await captureBrowserSession()) },
      null,
      2,
    ),
  });
}
export async function captureBrowserSession() {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const groups = await chrome.tabGroups.query({
    windowId: chrome.windows.WINDOW_ID_CURRENT,
  });
  return {
    tabs: tabs
      .filter((t) => safeURL(t.url || ""))
      .map((t) => ({ url: t.url, title: t.title, groupId: t.groupId })),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
    })),
  };
}
export async function restoreSession(path: string) {
  const session = JSON.parse(await bridge.text(path));
  await restoreBrowserSession(session);
}
export async function restoreBrowserSession(session: {
  tabs: { url: string; groupId: number }[];
  groups?: { id: number; title: string; color: chrome.tabGroups.ColorEnum }[];
}) {
  if (!Array.isArray(session.tabs) || session.tabs.length > 100)
    throw new Error("Session invalide (100 onglets maximum)");
  const ids = new Map<number, number[]>();
  for (const t of session.tabs) {
    const url = safeURL(t.url);
    if (!url) continue;
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id && t.groupId >= 0)
      ids.set(t.groupId, [...(ids.get(t.groupId) || []), tab.id]);
  }
  for (const [old, tabIds] of ids) {
    const id = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
    });
    const g = session.groups?.find((g: any) => g.id === old);
    if (g)
      await chrome.tabGroups.update(id, {
        title: String(g.title || ""),
        color: g.color,
      });
  }
}
export async function sendFiles(
  paths: string[],
  target?: UploadTarget,
  options: {
    expected?: Pick<Entry, "path" | "size" | "mtime">[];
    signal?: AbortSignal;
  } = {},
) {
  const checkAbort = () => {
    if (options.signal?.aborted) throw new DOMException("Annulé", "AbortError");
  };
  checkAbort();
  if (!paths.length)
    throw new Error("Ajoutez au moins un fichier à la collecte");
  if (paths.length > UPLOAD_FILE_LIMIT)
    throw new Error(
      "Sélectionnez au maximum 20 fichiers pour cette insertion.",
    );
  const tab = target ? target.page : await pageTab();
  await grant(tab.url!);
  const verify = async () => {
    checkAbort();
    if (target) return verifyPage(target.page);
    const current = await chrome.tabs.get(tab.id!);
    if (current.url !== tab.url)
      throw new Error(
        "La page a changé. Vérifiez la destination et recommencez.",
      );
  };
  await verify();
  const [inspection] = await chrome.scripting.executeScript({
    target: {
      tabId: tab.id!,
      ...(target ? { documentIds: [target.documentId] } : {}),
    },
    func: uploadForm,
    args: [null],
  });
  const fields = inspection?.result?.fields || [];
  const field =
    fields[
      target?.field.index ?? Math.max(0, inspection?.result?.focused ?? 0)
    ];
  if (!inspection?.documentId || !field)
    throw new Error("Aucun champ de fichier trouvé sur la page");
  if (target && inspection.documentId !== target.documentId)
    throw new Error("La page a changé. Analysez à nouveau ses champs.");
  if (target && field.signature !== target.field.signature)
    throw new Error("Le formulaire a changé. Analysez à nouveau ses champs.");
  const fieldIssue = uploadIssue(
    paths.map((path) => ({
      name: path.split(/[\\/]/).pop()!,
      type: "file",
      size: 0,
    })),
    field,
  );
  if (fieldIssue) throw new Error(fieldIssue);
  await verify();
  const stat = async (path: string) => {
    checkAbort();
    let entry: Entry;
    try {
      entry = await bridge.request<Entry>("FS_STAT", { path }, 5000);
    } catch {
      throw new Error(
        `${path.split(/[\\/]/).pop()} : fichier inaccessible. Vérifiez le chemin et le compagnon.`,
      );
    }
    checkAbort();
    if (!entry || entry.type !== "file" || !Number.isFinite(entry.mtime))
      throw new Error(
        `${path.split(/[\\/]/).pop()} : fichier ordinaire requis ou informations locales invalides.`,
      );
    // Use the selected path's name even if the companion returns different metadata.
    return { ...entry, path, name: path.split(/[\\/]/).pop()! };
  };
  const entries: Entry[] = [];
  for (const path of paths) entries.push(await stat(path));
  const issue = uploadIssue(entries, field);
  if (issue) throw new Error(issue);
  if (
    options.expected &&
    (options.expected.length !== entries.length ||
      entries.some((entry, index) => {
        const expected = options.expected![index];
        return (
          expected.path !== entry.path ||
          expected.size !== entry.size ||
          expected.mtime !== entry.mtime
        );
      }))
  )
    throw new Error(
      "Les copies ont changé depuis leur vérification. Revérifiez-les avant insertion.",
    );
  const files = [];
  let total = 0;
  for (const entry of entries) {
    checkAbort();
    let bytes: Uint8Array;
    try {
      bytes = await bridge.bytes(entry.path, UPLOAD_TOTAL_BYTES - total);
    } catch {
      throw new Error(
        `${entry.name} : lecture impossible. Vérifiez le fichier, son poids et la connexion au compagnon.`,
      );
    }
    checkAbort();
    total += bytes.length;
    if (bytes.length !== entry.size || total > UPLOAD_TOTAL_BYTES)
      throw new Error(
        `${entry.name} : le fichier a changé pendant sa préparation. Recommencez.`,
      );
    const encoded: string[] = [];
    // Multiples of three keep the concatenated base64 valid; yield during large encodings.
    for (let offset = 0; offset < bytes.length; offset += 24 * 1024) {
      encoded.push(
        btoa(
          String.fromCharCode(...bytes.subarray(offset, offset + 24 * 1024)),
        ),
      );
      if (encoded.length % 32 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
      checkAbort();
    }
    files.push({
      name: entry.name,
      type: fileMime(entry.name),
      data: encoded.join(""),
    });
  }
  for (const entry of entries) {
    const current = await stat(entry.path);
    if (current.size !== entry.size || current.mtime !== entry.mtime)
      throw new Error(
        `${entry.name} : le fichier a changé pendant sa préparation. Recommencez.`,
      );
  }
  await verify();
  checkAbort();
  let record: Insertion;
  try {
    record = await reserveInsertion(tab.url!, field.label, entries);
  } catch {
    throw new Error(
      "Insertion non lancée : suivi local indisponible. Consultez ou effacez Insertions récentes dans la collecte, puis réessayez.",
    );
  }
  try {
    await verify();
    checkAbort();
  } catch (error) {
    await finishInsertion(record.id, "not-inserted").catch(() => {});
    throw error;
  }
  // Persist uncertainty before the page can consume files; never replay this request.
  const results = await chrome.scripting
    .executeScript({
      target: {
        tabId: tab.id!,
        documentIds: [inspection.documentId],
      },
      func: uploadForm,
      args: [files, field],
    })
    .catch(() => {
      throw new Error(
        "Résultat d’insertion non confirmé. Vérifiez le champ sur le site avant toute nouvelle tentative ; aucune relance automatique.",
      );
    });
  if (results[0]?.result?.error) {
    await finishInsertion(record.id, "not-inserted").catch(() => {});
    throw new Error(results[0].result.error);
  }
  if (!results[0]?.result?.inserted)
    throw new Error(
      "Résultat d’insertion non confirmé. Vérifiez le champ sur le site avant toute nouvelle tentative ; aucune relance automatique.",
    );
  try {
    await finishInsertion(record.id, "inserted");
  } catch {
    throw new Error(
      "Fichiers insérés dans le champ, mais suivi non confirmé. Vérifiez leur réception sur le site avant toute nouvelle tentative.",
    );
  }
}
