import { beforeEach, describe, expect, it, vi } from "vitest";
const data = vi.hoisted(() => new Map<string, any>());
vi.mock("./bridge", () => ({
  storageGet: async (key: string, fallback: any) =>
    structuredClone(data.get(key) ?? fallback),
  storageSet: async (key: string, value: any) => {
    data.set(key, structuredClone(value));
  },
  storageUpdate: async (key: string, fallback: any, update: Function) => {
    const value = update(structuredClone(data.get(key) ?? fallback));
    data.set(key, structuredClone(value));
    return value;
  },
  bridge: {},
}));
import {
  executeMCPBrowser,
  startMCPBridge,
  mcpPaths,
  type MCPMessage,
} from "./mcp-background";
import { defaultPreferences } from "./preferences";
const native = vi.fn(async (action: string, value: any) => {
  if (action === "MCP_SCOPE_CHECK")
    return Object.fromEntries(
      value.paths.map((p: string) => [
        p,
        p.toLowerCase().replaceAll("\\", "/").startsWith("d:/allowed/") ||
          p.toLowerCase() === "d:/allowed",
      ]),
    );
  return true;
});
const ui = vi.fn(async () => []);
const message = (action: string, arguments_: any): MCPMessage => ({
  ticket: "test",
  profile: "profile-1234567890",
  action,
  arguments: arguments_,
  roots: ["D:/Allowed"],
  remoteRoots: [],
  capabilities: ["browser", "write", "settings"],
  deadline: Date.now() + 10000,
});
const run = (action: string, args: any) =>
  executeMCPBrowser(message(action, args), native as any, ui);
beforeEach(() => {
  data.clear();
  vi.clearAllMocks();
  vi.stubGlobal("navigator", {
    locks: { request: async (_: string, fn: Function) => fn() },
  });
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => false) },
  });
});
describe("MCP browser scopes and organization", () => {
  it("finishes comparison on native nextOffset=total, and refuses a stuck page", async () => {
    const request = vi.fn(async (_action: string, payload: any) => ({
      entries: [
        {
          path: payload.arguments.path + "/a.txt",
          name: "a.txt",
          type: "file",
          size: 1,
          mtime: 1,
          ext: ".txt",
        },
      ],
      total: 1,
      nextOffset: 1,
      snapshot: "snapshot",
    }));
    const result = await executeMCPBrowser(
      message("BROWSER_COMPARE", { paths: ["D:/Allowed/a", "D:/Allowed/b"] }),
      request as any,
      ui,
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.rows[0].status).toBe("same");
    request.mockResolvedValueOnce({
      entries: [],
      total: 2,
      nextOffset: 0,
      snapshot: "stuck",
    } as any);
    await expect(
      executeMCPBrowser(
        message("BROWSER_COMPARE", { paths: ["D:/Allowed/a", "D:/Allowed/b"] }),
        request as any,
        ui,
      ),
    ).rejects.toThrow(/Pagination/);
  });
  it("extracts nested Windows/remote paths, including map keys, without treating a web URL as a file", () => {
    expect(
      mcpPaths({
        path: "https://example.com",
        files: { "D:/Allowed/a": ["tag"] },
        tabs: [{ paths: ["D:/Allowed", "nxe-remote://profile-123/folder"] }],
        destination: "D:/Elsewhere",
      }),
    ).toEqual([
      "D:/Allowed/a",
      "D:/Allowed",
      "nxe-remote://profile-123/folder",
      "D:/Elsewhere",
    ]);
  });
  it("filters tag associations and preferences to the roots without erasing unrelated data", async () => {
    data.set("fileTags", {
      version: 1,
      labels: [{ id: "a", name: "A", color: "blue" }],
      files: { "d:/allowed/a": ["a"], "d:/private/b": ["a"] },
    });
    const visible = await run("BROWSER_ORGANIZATION_READ", { domain: "tags" });
    expect(Object.keys(visible.files)).toEqual(["d:/allowed/a"]);
    await run("BROWSER_ORGANIZATION_WRITE", {
      domain: "tags",
      operation: "unassign",
      paths: ["D:/Allowed/a"],
      id: "a",
    });
    expect(data.get("fileTags").files["d:/private/b"]).toEqual(["a"]);
    await expect(
      run("BROWSER_ORGANIZATION_WRITE", {
        domain: "tags",
        operation: "assign",
        paths: ["D:/Private/a"],
        id: "a",
      }),
    ).rejects.toThrow(/périmètre|autoris/);
  });
  it("uses validated domains and protects its own opt-in settings", async () => {
    await run("BROWSER_PREFERENCES", { value: { density: "compact" } });
    expect(data.get("explorerPreferences").density).toBe("compact");
    for (const value of [
      { mcpEnabled: true },
      { mcpWrite: true },
      { remoteEnabled: true },
      { startupPaths: ["D:/Elsewhere"] },
      { density: "invisible" },
    ])
      await expect(run("BROWSER_PREFERENCES", { value })).rejects.toThrow();
    await expect(
      run("BROWSER_ORGANIZATION_WRITE", {
        domain: "arbitrarySecretStorage",
        operation: "set",
        value: {},
      }),
    ).rejects.toThrow();
    await expect(
      run("BROWSER_ORGANIZATION_WRITE", {
        domain: "appearances",
        operation: "set",
        paths: ["D:/Allowed"],
        value: { color: "bad", symbol: "" },
      }),
    ).rejects.toThrow();
  });
  it("does not expose or remove a family outside scope; validates list updates before writing", async () => {
    const entry = (path: string) => ({
      path,
      name: path.split("/").pop(),
      type: "file",
      ext: ".txt",
      size: 1,
      mtime: 1,
    });
    data.set("fileFamilies", [
      {
        version: 1,
        id: "private",
        name: "Secret",
        date: new Date().toISOString(),
        members: [entry("D:/Private/a.txt"), entry("D:/Private/b.txt")],
      },
    ]);
    expect(
      (await run("BROWSER_ORGANIZATION_READ", { domain: "families" })).items,
    ).toEqual([]);
    await expect(
      run("BROWSER_ORGANIZATION_WRITE", {
        domain: "families",
        operation: "remove",
        id: "private",
      }),
    ).rejects.toThrow(/périmètre/);
    expect(data.get("fileFamilies")).toHaveLength(1);
  });
  it("keeps automatic filing behind the already granted downloads permission and rejects expired operations", async () => {
    await expect(
      run("BROWSER_DOWNLOAD_RULE", {
        operation: "upsert",
        value: {
          id: "a",
          name: "PDF",
          site: "",
          extension: ".pdf",
          destination: "D:/Allowed",
          enabled: true,
          automatic: true,
          automaticSince: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow(/permission/);
    const expired = message("BROWSER_CONSOLE_SETTINGS", {
      value: { palette: "lcd" },
    });
    expired.deadline = 1;
    await expect(executeMCPBrowser(expired, native as any, ui)).rejects.toThrow(
      /expirée/,
    );
    expect(data.has("nextexplorer:console-colors")).toBe(false);
  });
  it("does not execute a browser request until the user enables MCP, then honors the write switch", async () => {
    const bridge = startMCPBridge(native as any, ui);
    data.set("mcpProfileId", "profile-1234567890");
    await bridge.register();
    expect(native.mock.calls.at(-1)?.[1].enabled).toBe(false);
    await bridge.receive(message("BROWSER_CONTEXT", {}));
    expect(native.mock.calls.at(-1)?.[1].error).toMatch(/désactivé/);
    expect(ui).not.toHaveBeenCalled();
    data.set("explorerPreferences", {
      ...defaultPreferences,
      mcpEnabled: true,
      mcpWrite: false,
    });
    await bridge.register();
    await bridge.receive(
      message("BROWSER_PREFERENCES", { value: { density: "compact" } }),
    );
    expect(native.mock.calls.at(-1)?.[1].error).toMatch(/Modifications/);
    await bridge.receive(message("BROWSER_CONTEXT", {}));
    expect(ui).toHaveBeenCalledOnce();
  });
});
