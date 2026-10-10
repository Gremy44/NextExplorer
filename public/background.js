import "./collect-background.js";
import { startDownloadFiling } from "./download-background.js";
const clients = new Set();
let native = null;
const routes = new Map();
const watches = new Map();
const fileDownload = startDownloadFiling((action, payload = {}) => new Promise((resolve, reject) => {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { routes.delete(id); reject(new Error("Le compagnon ne répond pas.")); }, 60000);
  routes.set(id, { id, client: { postMessage(message) {
    clearTimeout(timer);
    message.status === "SUCCESS" ? resolve(message.data) : reject(new Error(message.error || "Erreur native"));
  } } });
  try { connect().postMessage({ id, action, payload }); }
  catch (error) { clearTimeout(timer); routes.delete(id); reject(error); }
}));
function connect() {
  if (native) return native;
  native = chrome.runtime.connectNative("com.local.file_explorer");
  native.onMessage.addListener((message) => {
    if (message.event) {
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
  return native;
}
chrome.runtime.onConnect.addListener((client) => {
  if (client.name !== "explorer" || client.sender?.id !== chrome.runtime.id)
    return;
  clients.add(client);
  client.onMessage.addListener((message) => {
    if (!message.id || typeof message.action !== "string") return;
    if (message.action === "DOWNLOAD_FILE") {
      if (!client.sender?.url?.startsWith(chrome.runtime.getURL("index.html"))) return;
      fileDownload(message.payload).then(
        data => { try { client.postMessage({ id: message.id, status: "SUCCESS", data }); } catch {} },
        error => { try { client.postMessage({ id: message.id, status: "ERROR", error: error.message }); } catch {} },
      );
      return;
    }
    const id = crypto.randomUUID();
    routes.set(id, { client, id: message.id });
    if (message.action === "FS_WATCH") {
      watches.set(client, message.payload.paths || []);
      message.payload = {
        paths: [...new Set([...watches.values()].flat())].slice(0, 8),
      };
    }
    try {
      connect().postMessage({ ...message, id });
    } catch (e) {
      routes.delete(id);
      client.postMessage({ id: message.id, status: "ERROR", error: String(e) });
    }
  });
  client.onDisconnect.addListener(() => {
    clients.delete(client);
    watches.delete(client);
    for (const [id, r] of routes) if (r.client === client) routes.delete(id);
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
