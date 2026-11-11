import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./web", () => ({
  verifyPage: vi.fn(async () => {}),
  writeChunks: vi.fn(async () => ({ path: "D:/Exports/Page-id.pdf" })),
}));
vi.mock("./bridge", () => ({ bridge: { request: vi.fn(async () => ({})) } }));
import { capturePagePDF } from "./page-capture";
import { verifyPage, writeChunks } from "./web";
import { bridge } from "./bridge";
const page = {
  id: 7,
  windowId: 2,
  url: "https://example.com/page?token=private#section",
  title: "Article",
};
const frame = { id: "frame", loaderId: "document", url: page.url };
const sendCommand = vi.fn(async (_target, method) => {
  if (method === "Page.getFrameTree") return { frameTree: { frame } };
  if (method === "Page.printToPDF") return { stream: "pdf-stream" };
  if (method === "IO.read")
    return { data: btoa("%PDF-1.7\nCapture"), base64Encoded: true, eof: true };
  return {};
});
const attach = vi.fn(async () => {}),
  detach = vi.fn(async () => {}),
  permission = vi.fn(async () => true);
beforeEach(() => {
  vi.stubGlobal("chrome", {
    permissions: { request: permission },
    debugger: { attach, detach, sendCommand },
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("capture exactement l’onglet confirmé, détache avant écriture et exporte une provenance épurée", async () => {
  await capturePagePDF("D:/Exports", page, "id");
  expect(attach).toHaveBeenCalledWith({ tabId: 7 }, "1.3");
  expect(writeChunks).toHaveBeenCalledWith(
    "D:/Exports",
    "Page-id.pdf",
    [new TextEncoder().encode("%PDF-1.7\nCapture")],
    expect.any(Function),
  );
  expect(detach.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(writeChunks).mock.invocationCallOrder[0],
  );
  const payload = vi.mocked(bridge.request).mock.calls[0][1] as {
    text: string;
  };
  expect(JSON.parse(payload.text)).toMatchObject({
    sourceUrl: "https://example.com/page",
    title: "Article",
    format: "pdf",
  });
  expect(verifyPage).toHaveBeenCalledTimes(3);
});
it("refuse une permission refusée ou une page qui n’est plus active sans écriture", async () => {
  permission.mockResolvedValueOnce(false);
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "non autorisée",
  );
  vi.mocked(verifyPage).mockRejectedValueOnce(new Error("La page a changé"));
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "changé",
  );
  expect(attach).not.toHaveBeenCalled();
  expect(writeChunks).not.toHaveBeenCalled();
});
it("refuse le remplacement du document même à URL identique et libère le flux", async () => {
  sendCommand.mockResolvedValueOnce({ frameTree: { frame } });
  sendCommand.mockResolvedValueOnce({ stream: "pdf-stream" });
  sendCommand.mockResolvedValueOnce({
    data: "%PDF-1.7",
    base64Encoded: false,
    eof: true,
  });
  sendCommand.mockResolvedValueOnce({
    frameTree: { frame: { ...frame, loaderId: "reloaded" } },
  });
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "changé",
  );
  expect(writeChunks).not.toHaveBeenCalled();
  expect(sendCommand).toHaveBeenCalledWith({ tabId: 7 }, "IO.close", {
    handle: "pdf-stream",
  });
  expect(detach).toHaveBeenCalled();
});
it("détache lors d’une erreur d’impression et ne publie aucun fichier", async () => {
  sendCommand.mockResolvedValueOnce({ frameTree: { frame } });
  sendCommand.mockRejectedValueOnce(new Error("Impression impossible"));
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "Impression",
  );
  expect(detach).toHaveBeenCalled();
  expect(writeChunks).not.toHaveBeenCalled();
});
it("refuse un PDF supérieur à 32 Mo et ferme le flux", async () => {
  sendCommand.mockResolvedValueOnce({ frameTree: { frame } });
  sendCommand.mockResolvedValueOnce({ stream: "pdf-stream" });
  sendCommand.mockResolvedValueOnce({
    data: "%PDF-" + "a".repeat(32 * 1024 * 1024),
    base64Encoded: false,
    eof: true,
  });
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "32 Mo",
  );
  expect(writeChunks).not.toHaveBeenCalled();
  expect(detach).toHaveBeenCalled();
});
it("signale une provenance échouée après publication du PDF", async () => {
  vi.mocked(bridge.request).mockRejectedValueOnce(new Error("Droits refusés"));
  await expect(capturePagePDF("D:/Exports", page, "id")).rejects.toThrow(
    "PDF enregistré",
  );
  expect(writeChunks).toHaveBeenCalledTimes(1);
});
