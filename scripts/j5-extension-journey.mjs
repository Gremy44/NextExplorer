import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  open,
  stat,
  cp,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { runConverterJourney } from "./converter-journey.mjs";
import { runFinderJourney } from "./finder-journey.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
const fixture = await mkdtemp(path.resolve("test-results/j5-extension-"));
const profile = path.join(fixture, "profile"),
  appdata = path.join(fixture, "appdata"),
  folder = path.join(fixture, "Images"),
  destination = path.join(fixture, "Exports"),
  extension = path.join(fixture, "extension");
await mkdir(folder);
await mkdir(destination);
await cp(path.resolve("dist"), extension, { recursive: true });
const id = (await readFile("extension-id.txt", "utf8")).trim(),
  base = `chrome-extension://${id}/index.html`;
function engine(name, args) {
  const result = spawnSync(path.resolve(`native/tools/${name}.exe`), args, {
    windowsHide: true,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const source = path.join(folder, "source.png"),
  variant = path.join(folder, "export.jpg"),
  tiff = path.join(folder, "large.tiff"),
  different = path.join(folder, "different.png"),
  video = path.join(folder, "video.mp4");
const tagged = path.join(folder, "tagged.txt");
const clip = path.join(folder, "clip.mp4");
await writeFile(tagged, "tagged original");
engine("magick", [
  "-size",
  "160x120",
  "gradient:navy-gold",
  "-fill",
  "white",
  "-draw",
  "rectangle 10,20 40,70",
  "-fill",
  "red",
  "-draw",
  "circle 100,60 120,65",
  source,
]);
engine("magick", [source, "-resize", "80x60!", "-quality", "78", variant]);
engine("magick", [
  source,
  "-resize",
  "2560x1920!",
  "-depth",
  "16",
  "-compress",
  "None",
  tiff,
]);
engine("magick", ["-size", "160x120", "pattern:checkerboard", different]);
engine("ffmpeg", [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=128x96:duration=3:rate=8",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  video,
]);
await cp(video, clip);
const largeVideo = await open(video, "r+");
await largeVideo.truncate(512 * 1024 * 1024);
await largeVideo.close();
const before = Object.fromEntries(
  await Promise.all(
    [source, variant, tiff, different, tagged, clip].map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ]),
  ),
);
const errors = [];
let context,
  workerInfo,
  alternateWorker,
  workerStopped = false;
async function offlineRequest(action, payload = {}) {
  assert.equal(
    workerInfo.tasks,
    path.join(appdata, "NextExplorer", "worker", "tasks"),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(workerInfo.executable, [`chrome-extension://${id}/`], {
      windowsHide: true,
      env: { ...process.env, APPDATA: appdata, AppData: appdata },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = Buffer.alloc(0),
      reply,
      error = "";
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("offline worker timeout"));
    }, 20000);
    child.stderr.on("data", (b) => {
      error = (error + b.toString()).slice(-4000);
    });
    child.stdout.on("data", (b) => {
      buffer = Buffer.concat([buffer, b]);
      while (
        buffer.length >= 4 &&
        buffer.length >= buffer.readUInt32LE(0) + 4
      ) {
        const n = buffer.readUInt32LE(0),
          message = JSON.parse(buffer.subarray(4, n + 4));
        buffer = buffer.subarray(n + 4);
        if (message.id === requestId) {
          reply = message;
          child.stdin.end();
        }
      }
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(timer);
      reply?.status === "SUCCESS"
        ? resolve(reply.data)
        : reject(new Error(reply?.error || error || "offline proxy exited"));
    });
    const body = Buffer.from(
        JSON.stringify({ id: requestId, action, payload }),
      ),
      header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
}
async function launch() {
  return chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    env: { ...process.env, APPDATA: appdata, AppData: appdata },
    viewport: { width: 1100, height: 850 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
}
async function rpc(page, action, payload = {}) {
  return page.evaluate(
    ({ action, payload }) =>
      new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: "explorer" }),
          id = crypto.randomUUID(),
          timer = setTimeout(() => {
            port.disconnect();
            reject(new Error(`timeout: ${action}`));
          }, 30000);
        port.onMessage.addListener((m) => {
          if (m.id !== id) return;
          clearTimeout(timer);
          port.disconnect();
          m.status === "SUCCESS" ? resolve(m.data) : reject(new Error(m.error));
        });
        port.postMessage({ id, action, payload });
      }),
    { action, payload },
  );
}
async function ready(panel = false) {
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!globalThis.chrome?.runtime?.connect) return;
    window.__j5Actions = [];
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const p = connect(...args),
        send = p.postMessage.bind(p);
      p.postMessage = (m) => {
        window.__j5Actions.push({ action: m.action, payload: m.payload });
        send(m);
      };
      return p;
    };
  });
  await page.goto(
    `${base}?path=${encodeURIComponent(folder)}${panel ? "&panel=1" : ""}`,
  );
  await page
    .getByRole("option", { name: /source.png/ })
    .first()
    .waitFor();
  return page;
}
async function command(page, name) {
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Aller à…", exact: true });
  await palette
    .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…")
    .fill(name);
  await palette.getByRole("button", { name, exact: true }).click();
  return page.getByRole("dialog").last();
}
async function waitJob(page, id) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const job = (await rpc(page, "JOBS")).find((j) => j.id === id);
    if (job?.state === "completed") return job;
    if (job && ["error", "cancelled"].includes(job.state))
      throw new Error(JSON.stringify(job));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("job not completed");
}
try {
  context = await launch();
  let page = await ready();
  workerInfo = await rpc(page, "WORKER_HELLO");
  assert.equal(
    workerInfo.tasks,
    path.join(appdata, "NextExplorer", "worker", "tasks"),
  );
  if (process.argv.includes("--finder-only")) {
    await runFinderJourney({
      context,
      page,
      command,
      rpc,
      folder,
      destination,
      source,
      clip,
      tagged,
      engine,
      base,
    });
    assert.deepEqual(errors, []);
    console.log("Finder extension recipe: OK", fixture);
  } else {
    await runConverterJourney({
      page,
      command,
      rpc,
      source,
      clip,
      tagged,
      destination,
      engine,
    });
    let dialog = await command(page, "Regrouper les fichiers");
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("similar");
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.locator(".group-results").waitFor();
    const group = dialog
      .locator("details.file-group")
      .filter({ hasText: "Images similaires · groupe 1" });
    await group.locator("summary").click();
    await group.getByText("source.png", { exact: true }).waitFor();
    await group.getByText("export.jpg", { exact: true }).waitFor();
    assert.equal(
      await group.getByText("different.png", { exact: true }).count(),
      0,
    );
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 850 });
      assert.ok(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      );
      await page.screenshot({
        path: `test-results/j5-similar-${width}.png`,
        fullPage: true,
      });
    }
    await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.setViewportSize({ width: 1100, height: 850 });
    await page
      .getByRole("option", { name: /large.tiff/ })
      .first()
      .click();
    await page.keyboard.press("Space");
    dialog = page.getByRole("dialog", {
      name: "Aperçu de large.tiff",
      exact: true,
    });
    await dialog.locator(".preview-body img").waitFor();
    await dialog.locator(".preview-body img").evaluate((img) => img.decode());
    assert.ok((await stat(tiff)).size > 24 * 1024 * 1024);
    await page.screenshot({
      path: "test-results/j5-large-tiff.png",
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Fermer l’aperçu", exact: true })
      .click();
    await page
      .getByRole("option", { name: /video.mp4/ })
      .first()
      .click();
    await page.keyboard.press("Space");
    dialog = page.getByRole("dialog", {
      name: "Aperçu de video.mp4",
      exact: true,
    });
    await dialog.locator("video").waitFor();
    await dialog.locator("video").evaluate(async (v) => {
      if (v.readyState < 1)
        await new Promise((resolve, reject) => {
          v.addEventListener("loadedmetadata", resolve, { once: true });
          v.addEventListener(
            "error",
            () => reject(new Error(`media error: ${v.error?.message}`)),
            { once: true },
          );
        });
      v.currentTime = 1.5;
      await new Promise((resolve) =>
        v.addEventListener("seeked", resolve, { once: true }),
      );
    });
    assert.ok(
      await dialog.locator("video").evaluate((v) => v.currentTime >= 1.4),
    );
    await dialog
      .getByRole("button", { name: "Fermer l’aperçu", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () =>
          window.__j5Actions.filter(
            (a) =>
              a.action === "FS_READ" &&
              /\.(tiff|mp4)$/.test(a.payload.path || ""),
          ).length,
      ),
      0,
    );
    await page
      .getByRole("option", { name: /source.png/ })
      .first()
      .click();
    dialog = await command(page, "Convertir les fichiers");
    await dialog.getByText("Préréglages et recettes", { exact: true }).click();
    await dialog
      .getByLabel("Choisir un préréglage")
      .selectOption({ label: "Images pour courriel + ZIP" });
    assert.equal(await dialog.locator('[name="archive"]').isChecked(), true);
    await dialog.locator('[name="destination"]').fill(destination);
    await dialog.locator('[name="recipeName"]').fill("Recette.zip");
    await dialog
      .getByLabel("Nom du nouveau préréglage", { exact: true })
      .fill("Ma recette");
    await dialog
      .getByRole("button", { name: "Enregistrer les options", exact: true })
      .click();
    await dialog.getByText(/Préréglage enregistré/).waitFor();
    await page.setViewportSize({ width: 320, height: 850 });
    assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await page.screenshot({
      path: "test-results/j5-presets-320.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1100, height: 850 });
    await dialog
      .getByRole("button", { name: "Créer 1 copie", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    let jobs = await rpc(page, "JOBS"),
      recipe = jobs.find((j) => j.kind === "recipe");
    assert.ok(recipe);
    await waitJob(page, recipe.id);
    const result = await rpc(page, "JOB_RESULT", { jobId: recipe.id });
    assert.equal(result.archive.path, path.join(destination, "Recette.zip"));
    const held = await rpc(page, "FS_TRANSFER", {
      paths: [source],
      destination,
      mode: "copy",
      conflict: "rename",
      paused: true,
    });
    await context.close();
    context = await launch();
    page = await ready();
    assert.equal((await rpc(page, "WORKER_HELLO")).pid, workerInfo.pid);
    assert.equal(
      (await rpc(page, "JOBS")).find((j) => j.id === held.jobId).state,
      "paused",
    );
    await rpc(page, "JOB_CONTROL", { jobId: held.jobId, command: "resume" });
    await waitJob(page, held.jobId);
    assert.deepEqual(
      await rpc(page, "JOB_RESULT", { jobId: recipe.id }),
      result,
    );
    await page
      .getByRole("option", { name: /source.png/ })
      .first()
      .click();
    dialog = await command(page, "Convertir les fichiers");
    await dialog.getByText("Préréglages et recettes", { exact: true }).click();
    await dialog
      .getByLabel("Choisir un préréglage")
      .selectOption({ label: "Ma recette" });
    assert.equal(await dialog.locator('[name="archive"]').isChecked(), true);
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    const sourceKey = tagged.replaceAll("\\", "/").toLowerCase(),
      target = path.join(destination, "tagged.txt"),
      targetKey = target.replaceAll("\\", "/").toLowerCase();
    await page.evaluate(
      async ({ sourceKey }) =>
        chrome.storage.local.set({
          fileTags: {
            version: 1,
            labels: [{ id: "work", name: "Travail", color: "primary" }],
            files: { [sourceKey]: ["work"] },
          },
        }),
      { sourceKey },
    );
    const moved = await rpc(page, "FS_TRANSFER", {
      paths: [tagged],
      destination,
      mode: "move",
      conflict: "rename",
      paused: true,
    });
    await context.close();
    context = null;
    await offlineRequest("JOB_CONTROL", {
      jobId: moved.jobId,
      command: "resume",
    });
    const offlineDeadline = Date.now() + 10000;
    while (Date.now() < offlineDeadline) {
      if (
        (await offlineRequest("JOBS")).find((j) => j.id === moved.jobId)
          ?.state === "completed"
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(await readFile(target, "utf8"), "tagged original");
    context = await launch();
    page = await ready();
    assert.equal((await rpc(page, "WORKER_HELLO")).pid, workerInfo.pid);
    const followed = await page.evaluate(async () =>
      chrome.storage.local.get("fileTags"),
    );
    assert.deepEqual(followed.fileTags.files[targetKey], ["work"]);
    assert.equal(followed.fileTags.files[sourceKey], undefined);
    await rpc(page, "TRANSFER_UNDO", { jobId: moved.jobId });
    await page.waitForFunction(
      async ({ sourceKey, targetKey }) => {
        const data = await chrome.storage.local.get("fileTags");
        return (
          data.fileTags.files[sourceKey]?.[0] === "work" &&
          !data.fileTags.files[targetKey]
        );
      },
      { sourceKey, targetKey },
    );
    for (const file of Object.keys(before))
      assert.equal(
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
        before[file],
      );
    // Exercise an incompatible active worker without touching the installed manifest.
    await context.close();
    context = null;
    const alternateExe = path.join(fixture, "previous-worker.exe");
    await cp(workerInfo.executable, alternateExe);
    process.kill(workerInfo.pid);
    workerStopped = true;
    alternateWorker = spawn(alternateExe, ["--worker"], {
      windowsHide: true,
      env: { ...process.env, APPDATA: appdata, AppData: appdata },
      stdio: "ignore",
    });
    await new Promise((resolve, reject) => {
      alternateWorker.once("spawn", resolve);
      alternateWorker.once("error", reject);
    });
    context = await launch();
    page = await ready();
    await page
      .getByText(/Exploration disponible, tâches locales indisponibles/)
      .waitFor();
    await assert.rejects(
      rpc(page, "FS_TRANSFER", {
        paths: [source],
        destination,
        mode: "copy",
        conflict: "rename",
      }),
      /ancien worker/,
    );
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(fixture, "result.json"),
      JSON.stringify(
        {
          passed: true,
          worker: workerInfo,
          images: Object.keys(before),
          largeVideoBytes: (await stat(video)).size,
          recipe: recipe.id,
        },
        null,
        2,
      ),
    );
    console.log(
      "J5 extension: visual variants, TIFF >24 MiB, MP4 512 MiB with seek/no FS_READ, presets/recipe, Chromium close/reopen with same worker, offline move/tag replay/undo, intact originals, responsive layouts and navigation with an incompatible worker: OK",
      fixture,
    );
  }
} catch (error) {
  if (context) {
    for (const page of context.pages()) {
      try {
        await page.screenshot({
          path: "test-results/j5-extension-failure.png",
          fullPage: true,
        });
        console.error((await page.locator("body").innerText()).slice(-5000));
      } catch {}
    }
  }
  throw error;
} finally {
  if (context) await context.close();
  if (alternateWorker) alternateWorker.kill();
  if (
    !workerStopped &&
    workerInfo?.tasks === path.join(appdata, "NextExplorer", "worker", "tasks")
  ) {
    try {
      process.kill(workerInfo.pid);
    } catch {}
  }
}
