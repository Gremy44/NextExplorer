// Real Chrome side panel + installed Native Messaging host + Windows mouse input.
import { createServer } from "node:http";
import { mkdtemp, writeFile, readFile, cp, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import assert from "node:assert/strict";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
const root = await mkdtemp(path.resolve("test-results/sidepanel-drag-"));
const presentation = process.argv.includes("--presentation");
const proof = presentation ? "Brief du projet.txt" : "preuve.txt";
const demo = presentation
  ? await mkdtemp(
      path.join(process.env.PUBLIC, "Documents", "NextExplorer-Web-"),
    )
  : root;
const title = "NextExplorer drag test " + path.basename(root);
const extension = path.join(root, "extension"),
  fixture = path.join(demo, presentation ? "Projet Atlas" : "files");
await cp("dist", extension, { recursive: true });
await mkdir(fixture);
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
manifest.commands["open-explorer"].suggested_key.default = "Ctrl+Shift+Y"; // Test-only key; Alt+E is reserved by Chrome.
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
await writeFile(path.join(fixture, proof), "Windows side panel real file");
await writeFile(
  path.join(fixture, "large.tiff"),
  Buffer.alloc(24 * 1024 * 1024, 73),
);
const id = (await readFile("extension-id.txt", "utf8")).trim();
const host = JSON.parse(
  await readFile(
    path.join(
      process.env.LOCALAPPDATA,
      "Programs/NextExplorer/com.local.file_explorer.json",
    ),
    "utf8",
  ),
).path;
const run = promisify(execFile);
const receiver = presentation
  ? (await readFile("scripts/presentation-receiver.html", "utf8")).replace(
      "__TITLE__",
      title,
    )
  : null;
const input = async (actions) =>
  (
    await run(
      "py",
      [
        "-3.11",
        "scripts/windows-drag-input.py",
        title,
        JSON.stringify(actions),
        host,
      ],
      { windowsHide: true },
    )
  ).stdout;
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    receiver ||
      `<title>${title}</title><div id="zone" style="position:absolute;left:40px;top:100px;width:450px;height:400px;background:#acf">Drop here</div><script>window.events=[];zone.ondragover=e=>{e.preventDefault();events.push({type:e.type,trusted:e.isTrusted,types:[...e.dataTransfer.types]})};zone.ondrop=async e=>{e.preventDefault();window.result={trusted:e.isTrusted,files:await Promise.all([...e.dataTransfer.files].map(async f=>({name:f.name,size:f.size,text:f.size<1000?await f.text():null})))}}</script>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const context = await chromium.launchPersistentContext(
  path.join(root, "profile"),
  {
    channel: "chromium",
    headless: false,
    viewport: null,
    args: [
      presentation ? "--window-size=1936,1119" : "--window-size=1400,1100",
      "--force-device-scale-factor=1",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  },
);
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(
    (fixture) => chrome.storage.local.set({ lastPath: fixture, stash: [] }),
    fixture,
  );
  const page = await context.newPage();
  if (presentation)
    for (const other of context.pages())
      if (other !== page) await other.close();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.bringToFront();
  await input([["focus"], ["panel"]]);
  const cdp = await context.browser().newBrowserCDPSession();
  let side;
  for (let i = 0; i < 50; i++) {
    side = (await cdp.send("Target.getTargets")).targetInfos.find(
      (t) => t.url === `chrome-extension://${id}/index.html?panel=1`,
    );
    if (side) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!side)
    console.log("TARGETS", (await cdp.send("Target.getTargets")).targetInfos);
  assert.ok(side, "Actual side panel target must open");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: side.targetId,
    flatten: false,
  });
  let serial = 0;
  const pending = new Map();
  cdp.on(
    "Target.receivedMessageFromTarget",
    ({ sessionId: source, message }) => {
      if (source !== sessionId) return;
      const reply = JSON.parse(message);
      if (reply.id) {
        const p = pending.get(reply.id);
        pending.delete(reply.id);
        reply.error
          ? p?.reject(Error(reply.error.message))
          : p?.resolve(reply.result);
      }
    },
  );
  async function evaluate(expression) {
    const sequence = ++serial;
    const response = new Promise((resolve, reject) => {
      pending.set(sequence, { resolve, reject });
      setTimeout(() => reject(Error("Side panel eval timeout")), 5000).unref();
    });
    await cdp.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: sequence,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    });
    return (await response).result.value;
  }
  for (let i = 0; i < 50; i++) {
    if ((await evaluate("document.body?.innerText || ''")).includes("Fichiers"))
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Test-only DOM access selects the mode; the file gesture itself uses Windows input.
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.innerText==='Fichiers').click()`,
  );
  for (let i = 0; i < 50; i++) {
    if ((await evaluate("document.body?.innerText || ''")).includes(proof))
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  async function drop(name, cancel = false) {
    await page.evaluate(() => {
      window.result = null;
      window.events = [];
    });
    const position = JSON.parse(await input([["info"]]));
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const sideMetrics = JSON.parse(
      await evaluate("JSON.stringify({width:innerWidth,height:innerHeight})"),
    );
    const button = JSON.parse(
      await evaluate(
        `(async()=>{const b=[...document.querySelectorAll('.companion-entry-name')].find(b=>b.innerText.includes(${JSON.stringify(name)}));if(b?.dataset.fileDrag!=='true')throw Error('Native file gesture unavailable');b.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=b.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height})})()`,
      ),
    );
    const sourceX =
      position.x + position.width - sideMetrics.width + button.x + 70;
    const sourceY =
      position.y +
      position.height -
      sideMetrics.height +
      button.y +
      button.height / 2;
    const zone = await page.locator("#zone").boundingBox();
    const targetX = position.x + zone.x + zone.width / 2,
      targetY =
        position.y +
        position.height -
        metrics.height +
        zone.y +
        zone.height / 2;
    await input([
      ["move", sourceX, sourceY],
      ["down"],
      ["move", sourceX - 15, sourceY],
      ["pause", 0.8],
      ["move", targetX, targetY],
      ["pause", 0.3],
      ...(cancel ? [["escape"], ["pause", 0.2]] : []),
      ["up"],
    ]);
    for (let i = 0; i < 60; i++) {
      if (
        (await evaluate("document.body?.innerText || ''")).includes(
          cancel ? "Glissement annulé." : "Fichier déposé.",
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (cancel) {
      assert.equal(await page.evaluate(() => window.result), null);
      assert.ok(
        (await evaluate("document.body?.innerText || ''")).includes(
          "Glissement annulé.",
        ),
      );
      return;
    }
    await page.waitForFunction(() => window.result, undefined, {
      timeout: 10000,
    });
    const result = await page.evaluate(() => window.result);
    assert.equal(result.trusted, true);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, name);
    assert.ok(
      (await page.evaluate(() => window.events)).some((event) =>
        event.types.includes("Files"),
      ),
    );
    return result;
  }
  if (!presentation) await drop(proof, true);
  assert.equal(
    (await drop(proof)).files[0].text,
    "Windows side panel real file",
  );
  if (presentation) {
    const info = JSON.parse(await input([["info"]]));
    const output = path.resolve("release/presentation/images/panneau-web.png");
    await mkdir(path.dirname(output), { recursive: true });
    // Capture only the isolated browser client, including Chrome's real side panel.
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Add-Type -AssemblyName System.Drawing; $r=ConvertFrom-Json $env:NEXTEXPLORER_CAPTURE_RECT; $b=New-Object System.Drawing.Bitmap($r.width,$r.height); $g=[System.Drawing.Graphics]::FromImage($b); try {$g.CopyFromScreen($r.x,$r.y,0,0,$b.Size); $b.Save($env:NEXTEXPLORER_CAPTURE_FILE,[System.Drawing.Imaging.ImageFormat]::Png)} finally {$g.Dispose();$b.Dispose()}",
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          NEXTEXPLORER_CAPTURE_RECT: JSON.stringify(info),
          NEXTEXPLORER_CAPTURE_FILE: output,
        },
      },
    );
    const bytes = await readFile(output);
    assert.ok(bytes.readUInt32BE(16) >= 1900 && bytes.readUInt32BE(20) >= 1000);
    await writeFile(
      "test-results/presentation-drag.json",
      JSON.stringify(
        {
          screenshot: info,
          result: await page.evaluate(() => window.result),
          collection: 0,
        },
        null,
        2,
      ),
    );
    console.log(
      "Présentation : fenêtre Chrome et vrai panneau latéral, dépôt Windows reçu et contenu vérifié.",
    );
  }
  if (!presentation) {
    await evaluate(
      `document.querySelector('button[aria-label="Affichage des fichiers"]').click()`,
    );
    await evaluate(
      `document.querySelector('.file-options-menu [data-value="large-icons"]').click()`,
    );
    assert.equal((await drop("large.tiff")).files[0].size, 24 * 1024 * 1024);
    await evaluate(
      `document.querySelector('button[aria-label="Affichage des fichiers"]').click()`,
    );
    await evaluate(
      `document.querySelector('.file-options-menu [data-value="small-icons"]').click()`,
    );
    assert.equal(
      (await drop(proof)).files[0].text,
      "Windows side panel real file",
    );
  }
  assert.equal(
    await readFile(path.join(fixture, proof), "utf8"),
    "Windows side panel real file",
  );
  assert.equal(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("stash")).stash.length,
    ),
    0,
  );
  assert.equal(
    await worker.evaluate(() =>
      chrome.permissions.contains({ permissions: ["debugger"] }),
    ),
    false,
  );
  console.log(
    `Actual side panel: Windows Shell drag, real contents, ${presentation ? "one presentation drop" : "TIFF 24 MiB, three successive drops, Escape"}, empty collection, sources retained, debugger permission absent: OK`,
  );
} finally {
  await input([["up"]]).catch(() => {});
  await context.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
