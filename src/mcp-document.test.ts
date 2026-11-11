import { expect, it } from "vitest";
import { mcpOverlay } from "./mcp-document";
it("validates overlay coordinates and PNG dimensions before decoding untrusted annotations", () => {
  const data = new Uint8Array(24);
  data.set([137, 80, 78, 71]);
  const view = new DataView(data.buffer);
  view.setUint32(16, 10);
  view.setUint32(20, 10);
  const overlay = {
    data: btoa(String.fromCharCode(...data)),
    page: 0,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
  };
  expect(mcpOverlay(overlay).data).toEqual(data);
  expect(() => mcpOverlay({ ...overlay, width: -1 })).toThrow();
  expect(() => mcpOverlay({ ...overlay, page: 0.5 })).toThrow();
  view.setUint32(16, 100000);
  view.setUint32(20, 100000);
  expect(() =>
    mcpOverlay({ ...overlay, data: btoa(String.fromCharCode(...data)) }),
  ).toThrow(/mégapixels/);
  expect(() => mcpOverlay({ ...overlay, data: btoa("not a PNG") })).toThrow(
    /PNG/,
  );
});
