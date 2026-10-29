import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function runConverterJourney({
  page,
  command,
  rpc,
  source,
  clip,
  tagged,
  destination,
  engine,
}) {
  async function select(file, modifiers = []) {
    await page
      .getByRole("option", { name: path.basename(file), exact: true })
      .first()
      .click({ modifiers });
  }
  await select(tagged);
  assert.equal(
    await page
      .locator(".selectionbar")
      .getByRole("button", { name: "Convertir", exact: true })
      .isDisabled(),
    true,
  );
  let dialog = await command(page, "Convertir les fichiers");
  await dialog.getByText(/documents, fichiers audio seuls/).waitFor();
  assert.equal(
    await dialog.getByRole("button", { name: /Créer 0 copie/ }).isDisabled(),
    true,
  );
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await assert.rejects(
    rpc(page, "CONVERT", { paths: [tagged], destination, format: "jpg" }),
    /images.*vidéos/,
  );

  await select(source);
  await select(clip, ["Control"]);
  await select(tagged, ["Control"]);
  dialog = await command(page, "Convertir les fichiers");
  await dialog
    .getByRole("button", { name: "Images (1)", exact: true })
    .waitFor();
  assert.equal(await dialog.locator('[name="codec"]').count(), 0);
  assert.equal(await dialog.locator('[name="bitrate"]').count(), 0);
  await dialog.getByText("Préréglages et recettes", { exact: true }).click();
  const presets = await dialog
    .getByLabel("Choisir un préréglage")
    .locator("option")
    .allTextContents();
  assert.ok(presets.includes("Images pour le web"));
  assert.ok(!presets.some((name) => /Vidéo|Audio/.test(name)));
  await dialog.locator('[name="format"]').selectOption("png");
  assert.equal(await dialog.locator('[name="quality"]').count(), 0);
  await dialog.locator('[name="format"]').selectOption("jpg");
  await dialog.getByText(/zones transparentes deviennent blanches/).waitFor();
  assert.equal(await dialog.locator('[name="quality"]').count(), 1);
  await dialog
    .getByText("Voir la sélection et les exclusions", { exact: true })
    .click();
  assert.match(
    await dialog.locator(".conversion-files").innerText(),
    /tagged.txt[\s\S]*Non traité/,
  );
  for (const theme of ["dark", "light"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `test-results/converter-images-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1100, height: 900 });
  await dialog.getByRole("button", { name: "Vidéos (1)", exact: true }).click();
  assert.equal(await dialog.locator('[name="quality"]').count(), 0);
  await dialog.locator('[name="format"]').selectOption("webm");
  await dialog.getByText("Réglages avancés", { exact: true }).click();
  const installed = await rpc(page, "CONVERSION_CAPABILITIES");
  assert.equal(
    await dialog.locator('[name="codec"]').inputValue(),
    "libvpx-vp9",
  );
  assert.deepEqual(
    await dialog
      .locator('[name="codec"] option')
      .evaluateAll((options) => options.map((o) => o.value)),
    ["libvpx-vp9", "libsvtav1"].filter((codec) =>
      installed.encoders.includes(codec),
    ),
  );
  const remux = dialog.getByRole("checkbox", {
    name: "Changer de conteneur sans réencoder",
    exact: true,
  });
  await remux.check();
  assert.equal(await dialog.locator('[name="width"]').count(), 0);
  assert.equal(await dialog.locator('[name="codec"]').count(), 0);
  await remux.uncheck();
  await dialog.locator('[name="width"]').fill("1280");
  await dialog.locator('[name="destination"]').fill(destination);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "test-results/converter-video-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1100, height: 900 });
  const original = await readFile(clip);
  const previousJobs = new Set((await rpc(page, "JOBS")).map((job) => job.id));
  await dialog
    .getByRole("button", { name: "Créer 1 copie", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const deadline = Date.now() + 30000;
  let job;
  while (Date.now() < deadline) {
    job = (await rpc(page, "JOBS")).find(
      (j) => j.kind === "convert" && !previousJobs.has(j.id),
    );
    if (job?.state === "completed" || job?.state === "error") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(job?.state, "completed", JSON.stringify(job));
  const outputs = await rpc(page, "JOB_RESULT", { jobId: job.id });
  assert.equal(outputs.length, 1);
  assert.equal(path.basename(outputs[0]), "clip.webm");
  const metadata = JSON.parse(
    engine("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "json",
      outputs[0],
    ]),
  );
  assert.equal(metadata.streams[0].codec_name, "vp9");
  assert.equal(metadata.streams[0].width, 128);
  assert.deepEqual(await readFile(clip), original);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  console.log(
    "Convertisseur : documents exclus, lots images/vidéos séparés, réglages et préréglages contextuels, qualité sans perte, transparence, codecs compatibles, remux, WebM réel sans agrandissement, originaux intacts et thèmes/320/390/1024 px : OK",
  );
}
