import { useEffect, useRef } from "react";
import { bridge } from "./bridge";
import { mcpPaths, type MCPMessage } from "./mcp-background";

export type MCPViewMessage = MCPMessage & { requestId: string; viewId: string };
export function mcpNative(message: MCPMessage) {
  return <T = any>(action: string, arguments_: unknown = {}): Promise<T> => {
    if (Date.now() >= message.deadline)
      return Promise.reject(new Error("Requête MCP expirée"));
    return bridge.request<T>("MCP_SCOPED_CALL", {
      ticket: message.ticket,
      action,
      arguments: arguments_,
    });
  };
}
export function mcpIO(message: MCPMessage) {
  const request = mcpNative(message);
  return {
    request,
    bytes: (...args: Parameters<typeof bridge.bytes>) =>
      bridge.bytes.call({ request } as typeof bridge, ...args),
  };
}
export async function mcpScope(message: MCPMessage, value: unknown) {
  const paths = mcpPaths(value),
    allowed: Record<string, boolean> = {};
  for (let i = 0; i < paths.length; i += 1000)
    Object.assign(
      allowed,
      await bridge.request("MCP_SCOPE_CHECK", {
        ticket: message.ticket,
        paths: paths.slice(i, i + 1000),
      }),
    );
  return (v: unknown) => mcpPaths(v).every((path) => allowed[path] === true);
}
export function useMCPView(
  handler: (message: MCPViewMessage) => Promise<unknown>,
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!globalThis.chrome?.runtime?.id) return;
    void bridge.request("MCP_UI_HELLO").catch(() => {});
    return bridge.subscribe((event) => {
      if (event.event !== "MCP_UI_REQUEST") return;
      const message: MCPViewMessage = event.data;
      void (async () => {
        let value: unknown,
          error = "";
        try {
          if (Date.now() >= message.deadline)
            throw new Error("Requête MCP expirée");
          value = await latest.current(message);
        } catch (e) {
          error = (e as Error).message;
        }
        await bridge.request("MCP_UI_REPLY", {
          requestId: message.requestId,
          ...(error ? { error } : { value: value ?? null }),
        });
      })().catch(() => {});
    });
  }, []);
}
