import "./collect-background.js";
import { startDownloadFiling } from "./download-background.js";
import {
  recordRelocations,
  synchronizeRelocations,
} from "./organization-background.js";
const clients = new Set();
let native = null;
const routes = new Map();
const watches = new Map();
const terminalOwners = new Map();
let organizationReady = Promise.resolve();
let organizationSerial = Promise.resolve();
function organizationError(error) {
  if (!native) return; // A disconnected companion already reports DISCONNECTED.
  for (const client of clients) {
    try {
      client.postMessage({
        event: "ORGANIZATION_ERROR",
        data: `Tags non actualisés : ${error.message}`,
      });
    } catch {}
  }
}
function syncOrganization() {
  organizationSerial = organizationSerial
    .then(() => synchronizeRelocations(nativeRequest))
    .catch(organizationError);
  return organizationSerial;
}
const fileDownload = startDownloadFiling(nativeRequest);
function nativeRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      routes.delete(id);
      reject(new Error("Le compagnon ne répond pas."));
    }, 60000);
    routes.set(id, {
      id,
      client: {
        postMessage(message) {
          clearTimeout(timer);
          message.status === "SUCCESS"
            ? resolve(message.data)
            : reject(new Error(message.error || "Erreur native"));
        },
      },
    });
    try {
      const port = connect();
      (action === "RELOCATIONS" ? Promise.resolve() : organizationReady)
        .then(() => port.postMessage({ id, action, payload }))
        .catch(reject);
    } catch (error) {
      clearTimeout(timer);
      routes.delete(id);
      reject(error);
    }
  });
}
function connect() {
  if (native) return native;
  native = chrome.runtime.connectNative("com.local.file_explorer");
  native.onMessage.addListener((message) => {
    if (message.event) {
      if (["PATH_RELOCATED", "PATHS_RELOCATED"].includes(message.event)) {
        if (Number.isSafeInteger(message.cursor)) void syncOrganization();
        else
          recordRelocations(
            message.event === "PATH_RELOCATED" ? [message.data] : message.data,
          ).catch((error) => {
            for (const client of clients) {
              try {
                client.postMessage({
                  event: "ORGANIZATION_ERROR",
                  data: `Fichier modifié, mais tags non actualisés : ${error.message}`,
                });
              } catch {}
            }
          });
      }
      for (const client of clients) {
        try {
          client.postMessage(message);
        } catch {}
      }
      return;
    }
    const route = routes.get(message.id);
    if (route) {
      routes.delete(message.id);
      if (route.terminalOwner && !clients.has(route.client)) {
        native?.postMessage({
          id: crypto.randomUUID(),
          action: "TERMINAL_CLOSE_OWNER",
          payload: { owner: route.terminalOwner },
        });
        return;
      }
      try {
        route.client.postMessage({ ...message, id: route.id });
      } catch {}
    }
  });
  native.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "Compagnon déconnecté";
    native = null;
    for (const route of routes.values()) {
      try {
        route.client.postMessage({ id: route.id, status: "ERROR", error });
      } catch {}
    }
    routes.clear();
    for (const c of clients) {
      try {
        c.postMessage({ event: "DISCONNECTED", data: error });
      } catch {}
    }
  });
  organizationReady = syncOrganization();
  return native;
}
chrome.runtime.onConnect.addListener((client) => {
  if (client.name !== "explorer" || client.sender?.id !== chrome.runtime.id)
    return;
  clients.add(client);
  client.onMessage.addListener((message) => {
    if (!message.id || typeof message.action !== "string") return;
    if (message.action.startsWith("TERMINAL_")) {
      let allowed = false;
      try {
        const url = new URL(client.sender?.url || "");
        allowed =
          url.protocol === "chrome-extension:" &&
          url.hostname === chrome.runtime.id &&
          url.pathname === "/index.html";
      } catch {}
      if (!allowed) {
        client.postMessage({
          id: message.id,
          status: "ERROR",
          error: "La console est réservée à l’interface de NextExplorer.",
        });
        return;
      }
      if (!terminalOwners.has(client))
        terminalOwners.set(client, crypto.randomUUID());
      message.payload = {
        ...message.payload,
        owner: terminalOwners.get(client),
      };
    }
    if (message.action === "DOWNLOAD_FILE") {
      if (!client.sender?.url?.startsWith(chrome.runtime.getURL("index.html")))
        return;
      fileDownload(message.payload).then(
        (data) => {
          try {
            client.postMessage({ id: message.id, status: "SUCCESS", data });
          } catch {}
        },
        (error) => {
          try {
            client.postMessage({
              id: message.id,
              status: "ERROR",
              error: error.message,
            });
          } catch {}
        },
      );
      return;
    }
    const id = crypto.randomUUID();
    routes.set(id, {
      client,
      id: message.id,
      terminalOwner:
        message.action === "TERMINAL_OPEN"
          ? terminalOwners.get(client)
          : undefined,
    });
    if (message.action === "FS_WATCH") {
      watches.set(client, message.payload.paths || []);
      message.payload = {
        paths: [...new Set([...watches.values()].flat())].slice(0, 8),
      };
    }
    try {
      const port = connect();
      organizationReady
        .then(() => {
          if (clients.has(client)) port.postMessage({ ...message, id });
          else routes.delete(id);
        })
        .catch((error) => {
          routes.delete(id);
          client.postMessage({
            id: message.id,
            status: "ERROR",
            error: error.message,
          });
        });
    } catch (e) {
      routes.delete(id);
      client.postMessage({ id: message.id, status: "ERROR", error: String(e) });
    }
  });
  client.onDisconnect.addListener(() => {
    clients.delete(client);
    watches.delete(client);
    const owner = terminalOwners.get(client);
    terminalOwners.delete(client);
    if (native && owner)
      native.postMessage({
        id: crypto.randomUUID(),
        action: "TERMINAL_CLOSE_OWNER",
        payload: { owner },
      });
    for (const [id, r] of routes)
      if (r.client === client && !r.terminalOwner) routes.delete(id);
    if (native)
      native.postMessage({
        id: crypto.randomUUID(),
        action: "FS_WATCH",
        payload: {
          paths: [...new Set([...watches.values()].flat())].slice(0, 8),
        },
      });
  });
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-explorer" && tab?.windowId)
    chrome.sidePanel.open({ windowId: tab.windowId });
  if (command === "open-dashboard")
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
