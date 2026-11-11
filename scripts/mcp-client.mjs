// Test client using MCP's JSON-RPC stdio framing. Product protocol handling is
// provided by the official Go SDK in native/mcp.go.
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
export async function mcpClient(exe, config, env) {
  const child = spawn(exe, ["--mcp", "--config", config], {
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let id = 0,
    buffer = "",
    stderr = "";
  const fail = (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", (code) =>
    fail(new Error(`MCP arrêté (${code}) : ${stderr}`)),
  );
  child.stderr.on("data", (b) => {
    stderr = (stderr + b.toString()).slice(-8192);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (text) => {
    buffer += text;
    if (buffer.length > 2 * 1024 * 1024) {
      fail(new Error("MCP oversized output"));
      child.kill();
      return;
    }
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail(new Error("Non-JSON diagnostic on MCP stdout"));
        child.kill();
        return;
      }
      const p = pending.get(message.id);
      if (!p) continue;
      pending.delete(message.id);
      clearTimeout(p.timer);
      message.error
        ? p.reject(new Error(JSON.stringify(message.error)))
        : p.resolve(message.result);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id,
        timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new Error(`MCP timeout ${method}; do not blindly retry mutations`),
          );
        }, 65000);
      pending.set(requestId, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) +
          "\n",
      );
    });
  const initialize = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "NextExplorer acceptance", version: "1.0" },
  });
  assert.ok(initialize.serverInfo?.name === "NextExplorer");
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n",
  );
  return {
    initialize,
    rpc,
    async call(name, arguments_ = {}) {
      const r = await rpc("tools/call", {
        name: "nxe_" + name.toLowerCase(),
        arguments: arguments_,
      });
      if (r.isError)
        throw new Error(
          r.content?.map((c) => c.text || "").join("\n") || "MCP tool error",
        );
      return (
        r.structuredContent ||
        JSON.parse(r.content.find((c) => c.type === "text").text)
      ).value;
    },
    async close() {
      child.stdin.end();
      const exited = once(child, "exit");
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((resolve) => {
            timer = setTimeout(() => {
              child.kill();
              resolve();
            }, 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        fail(new Error("MCP closed"));
      }
    },
  };
}
