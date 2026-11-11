import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function event() {
  const listeners: Function[] = [];
  return {
    addListener: (listener: Function) => listeners.push(listener),
    fire: (...args: any[]) => listeners.forEach((fn) => fn(...args)),
  };
}
function harness(ready = Promise.resolve()) {
  const sent: any[] = [];
  const native = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: (message: any) => sent.push(message),
  };
  const onConnect = event();
  const runtime = {
    id: "test-extension",
    onConnect,
    onInstalled: event(),
    connectNative: () => native,
  };
  const source = readFileSync(
    new URL("../public/background.js", import.meta.url),
    "utf8",
  ).replace(/^import\s+(?:"[^"]+"|[\s\S]*?from\s+"[^"]+");\s*/gm, "");
  vm.runInNewContext(source, {
    chrome: {
      runtime,
      commands: { onCommand: event() },
      storage: { onChanged: event(), local: { get: async () => ({}) } },
    },
    crypto,
    URL,
    setTimeout,
    clearTimeout,
    startDownloadFiling: () => () => {},
    startMCPBridge: () => ({
      register: () => Promise.resolve(),
      receive: () => Promise.resolve(),
    }),
    recordRelocations: () => Promise.resolve(),
    synchronizeRelocations: () => ready,
  });
  const client = (url = "chrome-extension://test-extension/index.html") => {
    const replies: any[] = [];
    const port = {
      name: "explorer",
      sender: { id: runtime.id, url },
      onMessage: event(),
      onDisconnect: event(),
      postMessage: (message: any) => replies.push(message),
    };
    onConnect.fire(port);
    return {
      port,
      replies,
      send: (action: string, payload = {}) =>
        port.onMessage.fire({ id: crypto.randomUUID(), action, payload }),
    };
  };
  return { sent, native, client };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("console native routing", () => {
  it("reports the missing companion once while retaining connected organization errors", async () => {
    for (const disconnected of [true, false]) {
      let fail!: (error: Error) => void;
      const h = harness(
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
      );
      const c = h.client();
      c.send("HELLO");
      if (disconnected) h.native.onDisconnect.fire();
      fail(new Error("Organization unavailable"));
      await tick();
      expect(
        c.replies.some((message) => message.event === "ORGANIZATION_ERROR"),
      ).toBe(!disconnected);
      expect(
        c.replies.some((message) => message.event === "DISCONNECTED"),
      ).toBe(disconnected);
    }
  });
  it("rejects web pages and other extension pages before native access", () => {
    const h = harness();
    for (const url of [
      "https://example.com/",
      "chrome-extension://test-extension/index.html-evil",
      "chrome-extension://test-extension/other.html",
    ]) {
      const c = h.client(url);
      c.send("TERMINAL_OPEN");
      expect(c.replies[0].status).toBe("ERROR");
    }
    expect(h.sent).toHaveLength(0);
  });
  it("overrides supplied owners, isolates views and closes a late opening session after disconnect", async () => {
    const h = harness(),
      first = h.client(),
      second = h.client();
    first.send("TERMINAL_OPEN", { owner: "spoofed" });
    second.send("TERMINAL_OPEN");
    await tick();
    const opens = h.sent.filter(
      (message) => message.action === "TERMINAL_OPEN",
    );
    expect(opens).toHaveLength(2);
    expect(opens[0].payload.owner).not.toBe("spoofed");
    expect(opens[0].payload.owner).not.toBe(opens[1].payload.owner);
    first.port.onDisconnect.fire();
    h.native.onMessage.fire({
      id: opens[0].id,
      status: "SUCCESS",
      data: { id: "late-session" },
    });
    expect(
      h.sent.filter(
        (message) =>
          message.action === "TERMINAL_CLOSE_OWNER" &&
          message.payload.owner === opens[0].payload.owner,
      ),
    ).toHaveLength(2);
    expect(first.replies).toHaveLength(0);
    h.native.onMessage.fire({
      id: opens[1].id,
      status: "SUCCESS",
      data: { id: "other-session" },
    });
    expect(second.replies[0].data.id).toBe("other-session");
  });
  it("does not open a shell for a view closed while organization initializes", async () => {
    let release!: () => void;
    const h = harness(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const c = h.client();
    c.send("TERMINAL_OPEN");
    c.port.onDisconnect.fire();
    release();
    await tick();
    expect(h.sent.some((message) => message.action === "TERMINAL_OPEN")).toBe(
      false,
    );
  });
  it("isolates SSH ownership and cleans up a late SSH opening in the worker", async () => {
    const h = harness();
    const c = h.client();
    c.send("REMOTE_TERMINAL_OPEN", {
      owner: "spoofed",
      path: "nxe-remote://server-test/",
    });
    await tick();
    const opened = h.sent.find(
      (message) => message.action === "REMOTE_TERMINAL_OPEN",
    );
    expect(opened.payload.owner).not.toBe("spoofed");
    c.port.onDisconnect.fire();
    h.native.onMessage.fire({
      id: opened.id,
      status: "SUCCESS",
      data: { id: "late-ssh" },
    });
    expect(
      h.sent.filter(
        (message) =>
          message.action === "REMOTE_TERMINAL_CLOSE_OWNER" &&
          message.payload.owner === opened.payload.owner,
      ),
    ).toHaveLength(2);
    expect(c.replies).toHaveLength(0);
  });
  it("rejects remote profile and SSH commands from content pages", () => {
    const h = harness();
    for (const action of [
      "REMOTE_PROFILES",
      "REMOTE_PROFILE_SAVE",
      "REMOTE_CONNECT",
      "REMOTE_TERMINAL_OPEN",
    ]) {
      const c = h.client("https://example.com/");
      c.send(action);
      expect(c.replies[0].status).toBe("ERROR");
    }
    expect(h.sent).toHaveLength(0);
  });
});
