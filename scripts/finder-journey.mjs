import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, degrees, PDFName } from "pdf-lib";

export async function runFinderJourney({
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
}) {
  const proof = [];
  const originals = Object.fromEntries(
    await Promise.all(
      [source, clip, tagged].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]),
    ),
  );
  const styled = path.join(folder, "Dossier personnalisé");
  await mkdir(styled);
  await writeFile(
    path.join(styled, "inside.txt"),
    "Données du dossier intactes",
  );
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]).drawText("Texte original");
  pdf.addPage([200, 300]).setRotation(degrees(90));
  const pdfPath = path.join(folder, "document.pdf");
  await writeFile(pdfPath, await pdf.save());
  await page.keyboard.press("F5");
  async function select(file, modifiers = []) {
    await page
      .getByRole("option", { name: path.basename(file), exact: true })
      .first()
      .click({ modifiers });
  }
  async function chooseQuick(label, file) {
    await select(file);
    let dialog = await command(page, "Actions rapides");
    await dialog.getByRole("button", { name: label, exact: true }).click();
    return page.getByRole("dialog").last();
  }
  async function quickDestination(dialog, destination) {
    const field = dialog.getByLabel("Destination de l’action rapide", {
      exact: true,
    });
    if (!(await field.isVisible()))
      await dialog.locator(".quick-output-settings summary").click();
    await field.fill(destination);
  }
  async function waitOutput(file) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        if ((await stat(file)).size > 0) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Output absent: ${file}`);
  }
  await select(styled);
  let dialog = await command(page, "Personnaliser les dossiers");
  await dialog
    .getByLabel("Couleur du dossier", { exact: true })
    .selectOption("purple");
  await dialog.getByLabel("Symbole du dossier", { exact: true }).fill("📷");
  await dialog
    .getByRole("button", { name: "Appliquer aux dossiers", exact: true })
    .click();
  await page
    .getByRole("option", { name: path.basename(styled), exact: true })
    .locator(".custom-folder-icon")
    .waitFor();
  await select(styled);
  dialog = await command(page, "Gérer les tags");
  await dialog
    .getByRole("button", { name: "Créer les 7 tags de couleur", exact: true })
    .click();
  const blue = dialog
    .locator("article.organization-record")
    .filter({ has: page.locator(".tag-chip", { hasText: "Bleu" }) });
  await blue
    .getByRole("button", { name: "Ajouter à la sélection", exact: true })
    .click();
  await blue
    .getByRole("button", { name: "Retirer de la sélection", exact: true })
    .waitFor();
  await blue.getByText("Modifier Bleu", { exact: true }).click();
  await blue.getByLabel("Renommer Bleu", { exact: true }).fill("Projet photo");
  await blue
    .getByRole("button", { name: "Enregistrer le tag", exact: true })
    .click();
  await dialog.getByText("Projet photo", { exact: true }).first().waitFor();
  await page.keyboard.press("Escape");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Projet photo", exact: true })
    .click();
  dialog = page.getByRole("dialog").last();
  await dialog
    .getByRole("button", { name: new RegExp("Dossier personnalisé") })
    .waitFor();
  assert.equal(await dialog.getByText(/tous dossiers confondus/).count(), 1);
  await page.keyboard.press("Escape");
  const moved = await rpc(page, "FS_TRANSFER", {
    paths: [styled],
    destination,
    mode: "move",
    conflict: "rename",
  });
  const deadline = Date.now() + 30000;
  let job;
  while (Date.now() < deadline) {
    job = (await rpc(page, "JOBS")).find((j) => j.id === moved.jobId);
    if (["completed", "error"].includes(job?.state)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(job?.state, "completed", JSON.stringify(job));
  const key = path
    .join(destination, path.basename(styled))
    .replaceAll("\\", "/")
    .toLowerCase();
  await page.waitForFunction(async (key) => {
    const data = await chrome.storage.local.get([
      "folderAppearance.v1",
      "fileTags",
    ]);
    return (
      data["folderAppearance.v1"]?.[key]?.symbol === "📷" &&
      data.fileTags.files[key]?.length === 1
    );
  }, key);
  proof.push(
    "tags, couleurs, renommage, recherche globale et déplacement des apparences",
  );

  const volumes = await rpc(page, "DISK_VOLUMES");
  assert.ok(volumes.some((v) => v.total > 0 && v.available >= 0));
  await command(page, "Ce PC · lecteurs et espace disponible");
  const drives = page.getByRole("region", {
    name: "Lecteurs et périphériques",
  });
  await page.locator(".drives-view meter").first().waitFor();
  await page.screenshot({
    path: "test-results/finder-drives.png",
    fullPage: true,
  });
  await page.locator(".pane").getByTitle("Précédent", { exact: true }).click();
  await page
    .getByRole("option", { name: "source.png", exact: true })
    .first()
    .waitFor();
  const analysisFolder = path.join(folder, "Pour analyse");
  await mkdir(analysisFolder);
  await writeFile(
    path.join(analysisFolder, "nested.txt"),
    "Analyse persistante",
  );
  await command(page, "Analyser l’espace disque");
  const analysis = page.getByRole("region", {
    name: "Analyse de l’espace disque",
  });
  await page.locator(".space-items").first().waitFor();
  assert.equal(
    await page
      .getByRole("dialog", { name: "Résultat de la tâche", exact: true })
      .count(),
    0,
  );
  await page
    .locator(".space-items button")
    .filter({ hasText: "Pour analyse" })
    .click();
  await page.getByRole("option", { name: "nested.txt", exact: true }).waitFor();
  await page.locator(".space-analysis").waitFor();
  await page.locator(".pane").getByTitle("Précédent", { exact: true }).click();
  await select(source);
  await page.locator(".space-analysis").waitFor();
  await page.screenshot({
    path: "test-results/finder-space-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Fermer l’analyse", exact: true })
    .click();
  proof.push("Ce PC et analyse persistante dans le volet");

  dialog = await chooseQuick("Faire pivoter", source);
  await quickDestination(dialog, destination);
  await dialog.getByRole("button", { name: "À droite", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  await waitOutput(path.join(destination, "source-rotation.png"));
  const dimensions = engine("magick", [
    path.join(destination, "source-rotation.png"),
    "-format",
    "%w %h",
    "info:",
  ]).trim();
  assert.equal(dimensions, "120 160");

  dialog = await chooseQuick("Raccourcir", clip);
  await dialog.getByLabel("Début de l’extrait", { exact: true }).fill("0.5");
  await dialog.getByLabel("Fin de l’extrait", { exact: true }).fill("1.5");
  await quickDestination(dialog, destination);
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  await waitOutput(path.join(destination, "clip-extrait.mp4"));
  const info = JSON.parse(
    engine("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_name",
      "-of",
      "json",
      path.join(destination, "clip-extrait.mp4"),
    ]),
  );
  assert.ok(
    Number(info.format.duration) >= 0.95 && Number(info.format.duration) <= 1.2,
  );
  assert.equal(info.streams[0].codec_name, "h264");
  proof.push("rotation PNG et extrait MP4 réels");

  await select(source);
  await select(pdfPath, ["Control"]);
  dialog = await command(page, "Actions rapides");
  await dialog
    .getByRole("button", { name: "Créer un PDF", exact: true })
    .click();
  dialog = page.getByRole("dialog").last();
  await quickDestination(dialog, destination);
  await dialog
    .getByRole("button", { name: "Créer le PDF", exact: true })
    .click();
  await waitOutput(path.join(destination, "Selection.pdf"));
  assert.equal(
    (
      await PDFDocument.load(
        await readFile(path.join(destination, "Selection.pdf")),
      )
    ).getPageCount(),
    3,
  );
  dialog = await chooseQuick("Annoter", source);
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".quick-action-dialog .primary")?.disabled,
  );
  const canvas = dialog.getByLabel("Zone d’annotation", { exact: true });
  await canvas.focus();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowDown");
  await canvas.press("Enter");
  await quickDestination(dialog, destination);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [320, 390, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await page.screenshot({
        path: `test-results/finder-markup-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const annotatedImage = path.join(destination, "source-annote.png");
  await waitOutput(annotatedImage);
  assert.notEqual(
    createHash("sha256")
      .update(await readFile(annotatedImage))
      .digest("hex"),
    originals[source],
  );
  assert.ok(
    Number(
      engine("magick", [
        source,
        annotatedImage,
        "-compose",
        "Difference",
        "-composite",
        "-format",
        "%[fx:mean]",
        "info:",
      ]),
    ) > 0,
  );
  await page.setViewportSize({ width: 1100, height: 900 });
  dialog = await chooseQuick("Annoter", pdfPath);
  await context.setOffline(true);
  await page.waitForFunction(
    () => !document.querySelector(".quick-action-dialog .primary")?.disabled,
  );
  await dialog
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".quick-action-dialog .primary")?.disabled,
  );
  await dialog.getByRole("button", { name: "Texte", exact: true }).click();
  await dialog
    .getByLabel("Texte de l’annotation", { exact: true })
    .fill("Annotation locale");
  await dialog.getByLabel("Zone d’annotation", { exact: true }).focus();
  await dialog.getByLabel("Zone d’annotation", { exact: true }).press("Enter");
  await quickDestination(dialog, destination);
  await page.screenshot({
    path: "test-results/finder-markup-pdf.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Créer la copie", exact: true })
    .click();
  const annotatedPDF = path.join(destination, "document-annote.pdf");
  await waitOutput(annotatedPDF);
  const result = await PDFDocument.load(await readFile(annotatedPDF));
  assert.equal(result.getPageCount(), 2);
  assert.equal(result.getPage(1).getRotation().angle, 90);
  assert.ok(result.getPage(1).node.Resources().has(PDFName.of("XObject")));
  await context.setOffline(false);
  proof.push(
    "création PDF, annotation image au clavier et PDF avec page tournée",
  );
  const panel = await context.newPage();
  await panel.goto(`${base}?panel=1&path=${encodeURIComponent(folder)}`);
  await panel.locator(".companion-files .file-item").first().waitFor();
  await panel.getByText("Organiser ce dossier", { exact: true }).click();
  await panel
    .getByRole("button", { name: "Personnaliser le dossier…", exact: true })
    .click();
  await panel
    .getByRole("dialog", { name: "Personnaliser les dossiers", exact: true })
    .waitFor();
  await panel.keyboard.press("Escape");
  await panel.close();
  for (const [file, hash] of Object.entries(originals))
    assert.equal(
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      hash,
    );
  console.log(
    "Finder additions:",
    proof.join("; "),
    "; originaux intacts : OK",
  );
}
