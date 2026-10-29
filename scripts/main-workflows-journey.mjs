import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { runDropTransferJourney } from "./drop-transfer-journey.mjs";
import { runTrashJourney } from "./trash-journey.mjs";
import { runQuickActionJourney } from "./quick-action-journey.mjs";
import { runConverterJourney } from "./converter-journey.mjs";

export async function runMainWorkflows({ page, fixture, rpc }) {
  const context = page.context(),
    transfers = [],
    trashes = [];
  const base = page.url().split("?")[0];
  await context.exposeFunction("__workflowRequest", (request) => {
    if (request.action === "FS_TRANSFER") transfers.push(request.payload);
    if (request.action === "FS_TRASH") trashes.push(request.payload);
  });
  await context.addInitScript(() => {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args),
        send = port.postMessage.bind(port);
      port.postMessage = (request) => {
        if (["FS_TRANSFER", "FS_TRASH"].includes(request.action))
          void window.__workflowRequest(request);
        send(request);
      };
      return port;
    };
  });
  const reset = async () => {
    await page.goto(`${base}?path=${encodeURIComponent(fixture)}`);
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
    const split = page.getByRole("button", {
      name: "Double panneau",
      exact: true,
    });
    if ((await split.getAttribute("aria-pressed")) === "true")
      await split.click();
  };
  await mkdir(path.join(fixture, "Exports"));
  await writeFile(
    path.join(fixture, "brief.txt"),
    "Texte original à dupliquer",
  );
  await reset();
  await runDropTransferJourney({ page, fixture, transfers });
  await reset();
  await runTrashJourney({ page, fixture, trashes });
  await reset();
  await runQuickActionJourney({ page, fixture });
  await reset();
  const source = path.join(fixture, "source.png"),
    clip = path.join(fixture, "clip.mp4"),
    tagged = path.join(fixture, "tagged.txt");
  await copyFile("public/icon128.png", source);
  await writeFile(tagged, "Ce document ne doit pas être converti.");
  const engine = (name, args) =>
    execFileSync(path.resolve(`native/tools/${name}.exe`), args, {
      windowsHide: true,
      encoding: "utf8",
    });
  engine("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=128x96:duration=1:rate=8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    clip,
  ]);
  await page.keyboard.press("F5");
  const command = async (view, name) => {
    await view.keyboard.press("Control+k");
    const palette = view.getByRole("dialog", { name: "Aller à…", exact: true });
    await palette
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…")
      .fill(name);
    await palette.getByRole("button", { name, exact: true }).click();
    return view.getByRole("dialog").last();
  };
  await runConverterJourney({
    page,
    command,
    rpc,
    source,
    clip,
    tagged,
    destination: path.join(fixture, "Exports"),
    engine,
  });
  assert.ok(transfers.length >= 4);
  console.log(
    "Parcours compilés : transferts, corbeille/restauration, atelier et convertisseur sous Native Messaging réel : OK",
  );
}
