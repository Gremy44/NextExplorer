import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

export async function runQuickActionJourney({ page, fixture, request }) {
  const engine = (name, args) =>
    execFileSync(path.resolve(`native/tools/${name}.exe`), args, {
      windowsHide: true,
      encoding: "utf8",
    });
  const photo = path.join(fixture, "Atelier.png"),
    second = path.join(fixture, "Planche.png"),
    clip = path.join(fixture, "Sequence.mp4");
  engine("magick", [
    "-size",
    "900x600",
    "gradient:#21435b-#d89954",
    "-fill",
    "#efdbc2",
    "-draw",
    "rectangle 100,100 350,430",
    "-fill",
    "#477a91",
    "-draw",
    "circle 650,280 810,280",
    photo,
  ]);
  engine("magick", ["-size", "600x900", "gradient:#487c74-#d7d0ad", second]);
  engine("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:duration=4:rate=12",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    clip,
  ]);
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]).drawText("Document de travail");
  const pdfPath = path.join(fixture, "Dossier.pdf");
  await writeFile(pdfPath, await pdf.save());
  const existingCopy = path.join(fixture, "Selection.pdf");
  await writeFile(existingCopy, await pdf.save());
  const originals = await Promise.all(
    [photo, second, clip, pdfPath, existingCopy].map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ]),
  );
  await page.keyboard.press("F5");
  const select = (file, modifiers = []) =>
    page
      .getByRole("option", { name: path.basename(file), exact: true })
      .click({ modifiers });
  async function open(file) {
    await select(file);
    await page
      .locator(".selectionbar")
      .getByRole("button", { name: "Actions rapides", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Actions rapides", exact: true });
  }
  const dialog = page.getByRole("dialog", {
    name: "Actions rapides",
    exact: true,
  });
  const output = async (filename) => {
    const file = path.join(fixture, filename),
      until = Date.now() + 30000;
    while (Date.now() < until) {
      try {
        if ((await stat(file)).size) return file;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("Sortie absente : " + filename);
  };
  const capture = (name) =>
    page.screenshot({
      path: `test-results/quick-action-${name}.png`,
      animations: "disabled",
    });
  await open(photo);
  assert.match(
    await dialog.evaluate((element) => getComputedStyle(element).animationName),
    /surface-enter/,
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "Faire pivoter", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await dialog
    .getByRole("img", { name: "Aperçu de Atelier.png", exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByLabel("Destination de l’action rapide", { exact: true })
      .isVisible(),
    false,
  );
  await dialog.getByRole("button", { name: "À droite", exact: true }).click();
  assert.equal(
    await dialog
      .getByRole("img", { name: "Aperçu de Atelier.png", exact: true })
      .evaluate((el) => el.style.transform),
    "rotate(90deg)",
  );
  await capture("rotation");
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const rotated = await output("Atelier-rotation.png");
  assert.equal(
    engine("magick", [rotated, "-format", "%w %h", "info:"]).trim(),
    "600 900",
  );

  await open(photo);
  await dialog.getByRole("button", { name: "Annoter", exact: true }).click();
  const canvas = dialog.getByLabel("Zone d’annotation", { exact: true });
  await page.waitForFunction(
    () => !document.querySelector(".quick-action-footer .primary")?.disabled,
  );
  await canvas.focus();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowDown");
  await canvas.press("Enter");
  await dialog.evaluate((element) => {
    element.dataset.retained = "same-workspace";
  });
  await dialog.getByRole("button", { name: "Convertir…", exact: true }).click();
  const conversion = dialog.locator(".quick-conversion");
  await conversion.locator('[name="format"]').selectOption("jpg");
  await conversion.locator('[name="quality"]').fill("65");
  assert.equal(await dialog.getAttribute("data-retained"), "same-workspace");
  await capture("conversion");
  await dialog.getByRole("button", { name: "Annoter", exact: true }).click();
  await canvas.waitFor();
  await dialog.getByRole("button", { name: "Convertir…", exact: true }).click();
  assert.equal(await conversion.locator('[name="format"]').inputValue(), "jpg");
  assert.equal(await conversion.locator('[name="quality"]').inputValue(), "65");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await dialog.evaluate((element) => getComputedStyle(element).animationName),
    "none",
  );
  await dialog.getByRole("button", { name: "Annoter", exact: true }).click();
  assert.equal(
    await dialog
      .locator(".quick-tool-body")
      .evaluate((element) => element.getAnimations().length),
    0,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await dialog
    .getByRole("button", { name: "Créer un PDF", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Annoter", exact: true }).click();
  await canvas.waitFor();
  await capture("annotation");
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 800, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--text-scale", "1.5");
      document.documentElement.style.setProperty("--ui-scale", "0.8");
    });
    assert.ok(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    const button = await dialog
      .getByRole("button", { name: "Créer la copie", exact: true })
      .boundingBox();
    assert.ok(
      button.y + button.height <= viewport.height,
      "commande d’export visible",
    );
    await capture(`annotation-${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--text-scale", "1");
    document.documentElement.style.setProperty("--ui-scale", "1");
  });
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const marked = await output("Atelier-annote.png");
  assert.notEqual(
    createHash("sha256")
      .update(await readFile(marked))
      .digest("hex"),
    originals[0][1],
  );

  await select(photo);
  await page
    .locator(".selectionbar")
    .getByRole("button", { name: "Convertir", exact: true })
    .click();
  const directConverter = page.getByRole("dialog", {
    name: "Convertir les fichiers",
    exact: true,
  });
  await directConverter.locator('[name="format"]').selectOption("webp");
  await directConverter
    .getByRole("button", { name: "Faire pivoter", exact: true })
    .click();
  await directConverter
    .getByRole("button", { name: "Convertir…", exact: true })
    .click();
  assert.equal(
    await directConverter.locator('[name="format"]').inputValue(),
    "webp",
  );
  await directConverter
    .getByRole("button", { name: "Créer 1 copie", exact: true })
    .click();
  await output("Atelier.webp");

  await open(photo);
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await select(photo);
  await select(second, ["Control"]);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Aller à…", exact: true });
  await palette
    .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…")
    .fill("Actions rapides");
  await palette
    .getByRole("button", { name: "Actions rapides", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Créer un PDF", exact: true })
    .click();
  const items = dialog.locator(".pdf-source-list li");
  await items.nth(1).dragTo(items.first());
  await items.first().getByText("Planche.png", { exact: true }).waitFor();
  assert.ok((await items.first().textContent()).includes("Planche.png"));
  await capture("pdf");
  await dialog
    .getByRole("button", { name: "Créer le PDF", exact: true })
    .click();
  const assembled = await PDFDocument.load(
    await readFile(await output("Selection (2).pdf")),
  );
  assert.equal(assembled.getPageCount(), 2);
  assert.ok(
    assembled.getPage(0).getHeight() > assembled.getPage(0).getWidth(),
    "ordre du PDF exporté",
  );

  await open(clip);
  assert.equal(
    await dialog
      .getByRole("button", { name: "Raccourcir", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.waitForFunction(
    () => document.querySelector(".trim-player video")?.readyState >= 1,
  );
  await dialog.locator(".trim-player video").evaluate((el) => {
    el.currentTime = 0.5;
  });
  await dialog.getByRole("button", { name: "Début ici", exact: true }).click();
  await dialog.locator(".trim-player video").evaluate((el) => {
    el.currentTime = 2;
  });
  await dialog.getByRole("button", { name: "Fin ici", exact: true }).click();
  assert.equal(
    Number(
      await dialog
        .getByLabel("Début de l’extrait", { exact: true })
        .inputValue(),
    ),
    0.5,
  );
  assert.equal(
    Number(
      await dialog.getByLabel("Fin de l’extrait", { exact: true }).inputValue(),
    ),
    2,
  );
  await capture("trim");
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const excerpt = await output("Sequence-extrait.mp4");
  const duration = Number(
    engine("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      excerpt,
    ]).trim(),
  );
  assert.ok(duration > 1.4 && duration < 1.7);

  await open(pdfPath);
  assert.equal(
    await dialog
      .getByRole("button", { name: "Annoter", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.waitForFunction(
    () => !document.querySelector(".quick-action-footer .primary")?.disabled,
  );
  await canvas.focus();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await dialog.locator(".quick-output-settings summary").click();
  await dialog
    .getByLabel("Destination de l’action rapide", { exact: true })
    .fill(path.join(fixture, "Exports"));
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const annotatedPdf = await PDFDocument.load(
    await readFile(await output(path.join("Exports", "Dossier-annote.pdf"))),
  );
  assert.equal(annotatedPdf.getPageCount(), 1);
  for (const [file, hash] of originals)
    assert.equal(
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      hash,
    );
  console.log(
    "Actions rapides : accès direct, aperçu rotation et export réels, annotations conservées entre outils, PDF ordonné par glisser-déposer, repères média et extrait réel, destination facultative, petits écrans et originaux intacts : OK",
  );
}
