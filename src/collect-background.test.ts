import { expect, it, vi } from "vitest";

it("les menus ajoutent au panier sous verrou et signalent les erreurs", async () => {
  let clicked: (info: unknown, tab?: unknown) => Promise<void>;
  let installed: () => void;
  let stored: Record<string, unknown> = {};
  const create = vi.fn();
  const set = vi.fn(async (values) => {
    stored = { ...stored, ...values };
  });
  const badge = vi.fn();
  const title = vi.fn();
  const open = vi.fn(async () => {});
  const locks = vi.fn(async (_name, run) => run());
  vi.stubGlobal("navigator", { locks: { request: locks } });
  vi.stubGlobal("chrome", {
    runtime: {
      onInstalled: {
        addListener: (fn: typeof installed) => {
          installed = fn;
        },
      },
    },
    contextMenus: {
      removeAll: (fn: () => void) => fn(),
      create,
      onClicked: {
        addListener: (fn: typeof clicked) => {
          clicked = fn;
        },
      },
    },
    storage: {
      local: { get: async (key: string) => ({ [key]: stored[key] }), set },
    },
    action: {
      setBadgeText: badge,
      setBadgeBackgroundColor: vi.fn(),
      setTitle: title,
    },
    sidePanel: { open },
  });
  try {
    await import("./collect-background");
    installed!();
    expect(create.mock.calls.map(([menu]) => menu.id)).toEqual([
      "collect-page",
      "collect-link",
      "collect-selection",
      "collect-image",
    ]);
    const info = {
      menuItemId: "collect-page",
      pageUrl: "https://example.com/",
    };
    await clicked!(info, { url: info.pageUrl, title: "Example" });
    await clicked!(info, { url: info.pageUrl, title: "Example" });
    expect(stored.stash).toHaveLength(1);
    expect(locks).toHaveBeenCalledWith(
      "nextexplorer:stash",
      expect.any(Function),
    );
    expect(title).toHaveBeenLastCalledWith({
      title: "Déjà présent dans le panier NextExplorer",
    });
    const before = JSON.stringify(stored);
    set.mockRejectedValueOnce(new Error("quota"));
    await clicked!({
      menuItemId: "collect-link",
      linkUrl: "https://example.com/new",
      pageUrl: info.pageUrl,
    });
    expect(JSON.stringify(stored)).toBe(before);
    expect(badge).toHaveBeenLastCalledWith({ text: "!" });
    expect(title).toHaveBeenLastCalledWith({
      title: "Collecte impossible : quota",
    });
    const selection = {
      menuItemId: "collect-selection",
      pageUrl: "https://example.com/page?secret=x",
      selectionText: "Un extrait",
    };
    await clicked!(selection, {
      windowId: 2,
      url: selection.pageUrl,
      title: "Page",
    });
    expect(open).toHaveBeenCalledWith({ windowId: 2 });
    expect(stored.pendingCapture).toMatchObject({
      text: "Un extrait",
      title: "Page",
      sourceUrl: "https://example.com/page",
    });
    await clicked!(selection, { windowId: 2, url: selection.pageUrl });
    expect(stored.pendingCapture).toMatchObject({ title: "Page" });
    expect(title).toHaveBeenLastCalledWith({
      title: expect.stringContaining("attend déjà confirmation"),
    });
    stored.pendingCapture = null;
    await clicked!(
      {
        menuItemId: "collect-image",
        srcUrl: "https://example.com/photo.png?key=x",
        pageUrl: selection.pageUrl,
      },
      { windowId: 2, url: selection.pageUrl, title: "Image" },
    );
    expect(stored.pendingCapture).toMatchObject({
      kind: "image",
      imageUrl: "https://example.com/photo.png?key=x",
      sourceUrl: "https://example.com/page",
      title: "Image",
    });
    await clicked!(selection, { windowId: 2 });
    expect(stored.pendingCapture).toMatchObject({ kind: "image" });
  } finally {
    vi.unstubAllGlobals();
  }
});
