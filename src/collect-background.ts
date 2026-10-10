import {
  contextualLink,
  imageCapture,
  mergeCollection,
  selectionCapture,
  type PendingCapture,
} from "./collection";
import { storageUpdate } from "./bridge";
import type { CollectionEntry } from "./types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "collect-page",
      title: "Collecter cette page dans NextExplorer",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
    chrome.contextMenus.create({
      id: "collect-link",
      title: "Collecter ce lien dans NextExplorer",
      contexts: ["link"],
      targetUrlPatterns: ["http://*/*", "https://*/*"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
    chrome.contextMenus.create({
      id: "collect-selection",
      title: "Capturer la sélection dans NextExplorer",
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
    chrome.contextMenus.create({
      id: "collect-image",
      title: "Capturer cette image dans NextExplorer",
      contexts: ["image"],
      targetUrlPatterns: ["http://*/*", "https://*/*"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (
    ![
      "collect-page",
      "collect-link",
      "collect-selection",
      "collect-image",
    ].includes(String(info.menuItemId))
  )
    return;
  try {
    if (
      info.menuItemId === "collect-selection" ||
      info.menuItemId === "collect-image"
    ) {
      const capture =
        info.menuItemId === "collect-image"
          ? imageCapture(info, tab)
          : selectionCapture(info, tab);
      // Opening the panel must start directly from Chrome's context-menu gesture.
      if (tab?.windowId !== undefined)
        void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      await storageUpdate<PendingCapture | null>(
        "pendingCapture",
        null,
        (current) => {
          if (current)
            throw new Error(
              "Une capture attend déjà confirmation dans NextExplorer",
            );
          return capture;
        },
      );
      await chrome.action.setBadgeBackgroundColor({ color: "#415f91" });
      await chrome.action.setBadgeText({ text: "✓" });
      await chrome.action.setTitle({
        title:
          capture.kind === "image"
            ? "Image à enregistrer dans NextExplorer"
            : "Sélection à enregistrer dans NextExplorer",
      });
      return;
    }
    const entry = contextualLink(info, tab);
    let added = false;
    await storageUpdate<CollectionEntry[]>("stash", [], (current) => {
      added = !current.some((item) => item.path === entry.path);
      return mergeCollection(current, [entry]);
    });
    await chrome.action.setBadgeBackgroundColor({ color: "#415f91" });
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setTitle({
      title: added
        ? "Ajouté au panier NextExplorer"
        : "Déjà présent dans le panier NextExplorer",
    });
  } catch (error) {
    await chrome.action.setBadgeBackgroundColor({ color: "#ba1a1a" });
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({
      title: `Collecte impossible : ${(error as Error).message}`,
    });
  }
});
