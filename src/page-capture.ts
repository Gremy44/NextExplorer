import { bridge } from "./bridge";
import { collectedLink } from "./types";
import { verifyPage, writeChunks, type BrowserPage } from "./web";

const PDF_LIMIT = 32 * 1024 * 1024;

// A timed-out command is stopped by detaching the debugger in the caller's finally block.
async function command(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: object,
): Promise<any> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      chrome.debugger.sendCommand(target, method, params),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("La capture PDF a dépassé le délai de 30 secondes"),
            ),
          30000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function capturePagePDF(
  path: string,
  page: BrowserPage,
  id: string,
) {
  const source = new URL(collectedLink(page.url, "").path);
  source.search = "";
  source.hash = "";
  if (!(await chrome.permissions.request({ permissions: ["debugger"] })))
    throw new Error("Capture PDF non autorisée");
  await verifyPage(page);
  const target = { tabId: page.id };
  await chrome.debugger.attach(target, "1.3");
  let stream: string | undefined;
  const parts: Uint8Array[] = [];
  let total = 0;
  const collectedAt = new Date().toISOString();
  try {
    await verifyPage(page);
    const before = (await command(target, "Page.getFrameTree")).frameTree.frame;
    if (!before.id || !before.loaderId)
      throw new Error("Impossible de vérifier le document à capturer");
    const result = await command(target, "Page.printToPDF", {
      printBackground: true,
      transferMode: "ReturnAsStream",
    });
    stream = result.stream;
    if (!stream) throw new Error("Chrome n’a pas fourni de flux PDF");
    const started = Date.now();
    while (true) {
      if (Date.now() - started > 30000)
        throw new Error("Lecture du PDF trop longue");
      const chunk = await command(target, "IO.read", {
        handle: stream,
        size: 256 * 1024,
      });
      let bytes: Uint8Array;
      if (chunk.base64Encoded) {
        const raw = atob(chunk.data);
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      } else bytes = new TextEncoder().encode(chunk.data);
      total += bytes.length;
      if (total > PDF_LIMIT) throw new Error("PDF supérieur à 32 Mo");
      if (bytes.length) parts.push(bytes);
      if (chunk.eof) break;
      if (!bytes.length) throw new Error("Lecture du PDF interrompue");
    }
    await verifyPage(page);
    const after = (await command(target, "Page.getFrameTree")).frameTree.frame;
    if (
      after.id !== before.id ||
      after.loaderId !== before.loaderId ||
      after.url !== before.url
    )
      throw new Error("La page a changé pendant la capture. Recommencez.");
    if (new TextDecoder().decode(parts[0]?.subarray(0, 5)) !== "%PDF-")
      throw new Error("Chrome n’a pas renvoyé un PDF valide");
  } finally {
    if (stream)
      await command(target, "IO.close", { handle: stream }).catch(() => {});
    await chrome.debugger.detach(target).catch(() => {});
  }
  const name = `Page-${id}.pdf`;
  const saved = await writeChunks(path, name, parts);
  try {
    await bridge.request("FS_WRITE", {
      path,
      name: `${name}.source.json`,
      text: JSON.stringify(
        {
          version: 1,
          file: name,
          title: page.title,
          sourceUrl: source.href,
          collectedAt,
          size: total,
          format: "pdf",
        },
        null,
        2,
      ),
    });
  } catch (error) {
    throw new Error(
      `PDF enregistré (${saved.path}), mais provenance non écrite : ${(error as Error).message}. Vérifiez ce fichier avant de recommencer.`,
    );
  }
  return saved;
}
