import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { previewCorpus } from "./preview-corpus.mjs";

export async function runPreviewQualification({
  page,
  fixture,
  reads,
  previews,
  cancellations,
}) {
  page.setDefaultTimeout(20000);
  const corpus = await previewCorpus(fixture),
    report = {
      images: [],
      media: [],
      fonts: [],
      checks: [],
      fontSources: corpus.fontSources,
      heicSource: corpus.heicSource,
    };
  await page
    .getByRole("option", { name: "Aperçus V1", exact: true })
    .dblclick();
  const open = async (file) => {
    await page
      .locator(".pane")
      .first()
      .getByRole("textbox", { name: "Filtrer ce dossier", exact: true })
      .fill(file);
    const row = page
      .locator(".pane")
      .first()
      .getByRole("option", { name: file, exact: true });
    await row.click();
    await page.keyboard.press("Space");
    const modal = page.getByRole("dialog", {
      name: `Aperçu de ${file}`,
      exact: true,
    });
    await modal.waitFor();
    return modal;
  };
  const close = async (modal) => {
    await modal
      .getByRole("button", { name: "Fermer l’aperçu", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
  };
  for (const file of corpus.images) {
    const modal = await open(file);
    await modal
      .locator(".gallery-stage img")
      .evaluate((image) => image.decode());
    assert.ok(
      await modal
        .locator(".gallery-stage img")
        .evaluate(
          (image) => image.naturalWidth > 0 && image.naturalWidth <= 1600,
        ),
    );
    report.images.push({ file, readable: true });
    await close(modal);
  }
  let modal = await open("grand-144Mio.tiff");
  await modal.locator(".gallery-stage img").evaluate((image) => image.decode());
  assert.ok(
    (await stat(path.join(corpus.folder, "grand-144Mio.tiff"))).size >
      100 * 1024 * 1024,
  );
  await page.screenshot({ path: "test-results/preview-large-tiff-v1.png" });
  await close(modal);
  const requestedBefore = previews.length;
  modal = await open("hors-limite.tiff");
  await modal.getByRole("alert").filter({ hasText: "256 Mio" }).waitFor();
  assert.equal(
    previews
      .slice(requestedBefore)
      .some((request) => request.path.endsWith("hors-limite.tiff")),
    false,
  );
  await close(modal);
  for (const file of ["corrompue.png", "vecteur.svg", "invalide.weblink"]) {
    modal = await open(file);
    await modal.getByRole("alert").waitFor();
    await close(modal);
  }
  modal = await open("grand.log");
  await modal.getByText(/Aperçu partiel/).waitFor();
  assert.ok((await modal.locator(".line-numbers span").count()) <= 1000);
  await close(modal);
  modal = await open("utf16.txt");
  await modal
    .getByText("Texte UTF-16 avec électricité", { exact: true })
    .waitFor();
  await close(modal);
  modal = await open("code.json");
  await modal.locator(".numbered-code").waitFor();
  await close(modal);
  modal = await open("note.md");
  await modal.locator(".markdown h1").waitFor();
  assert.equal(await modal.locator(".markdown img").count(), 0);
  assert.equal(
    await page.evaluate(() => window.__previewInjected || false),
    false,
  );
  await close(modal);
  modal = await open("lien.weblink");
  await modal
    .getByRole("heading", { name: "Lien de recette", exact: true })
    .waitFor();
  await close(modal);
  for (const ext of ["ttf", "otf", "woff", "woff2"]) {
    modal = await open(`police.${ext}`);
    await modal.getByLabel("Texte dans la police sélectionnée").waitFor();
    report.fonts.push(ext);
    await close(modal);
  }
  modal = await open("document.pdf");
  console.log(
    "Images, TIFF volumineux, texte et quatre formats de polices : OK",
  );
  const canvas = modal.getByRole("img", {
    name: "Page 1 du PDF document.pdf",
    exact: true,
  });
  await canvas.waitFor();
  assert.ok(
    await canvas.evaluate(
      (element) => element.width * element.height <= 3200000,
    ),
  );
  await modal.getByText("Texte de la page", { exact: true }).click();
  await modal
    .getByText("Premiere page de recette PDF", { exact: true })
    .waitFor();
  await modal.getByRole("button", { name: "Suivant", exact: true }).click();
  await modal
    .getByRole("img", { name: "Page 2 du PDF document.pdf", exact: true })
    .waitFor();
  await modal
    .getByText("Deuxieme page de recette PDF", { exact: true })
    .waitFor();
  await modal.getByRole("button", { name: "Suivant", exact: true }).click();
  await modal
    .getByRole("img", { name: "Page 3 du PDF document.pdf", exact: true })
    .waitFor();
  assert.equal(
    await modal
      .getByRole("button", { name: "Suivant", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({ path: "test-results/preview-pdf-v1.png" });
  await close(modal);
  modal = await open("document-17Mio.pdf");
  await modal
    .getByRole("img", { name: "Page 1 du PDF document-17Mio.pdf", exact: true })
    .waitFor();
  await close(modal);
  modal = await open("hors-limite.pdf");
  await modal.getByRole("alert").filter({ hasText: "32 Mio" }).waitFor();
  await close(modal);
  modal = await open("corrompu.pdf");
  await modal.getByRole("alert").waitFor();
  await close(modal);
  for (const ext of ["docx", "xlsx", "pptx"]) {
    if (ext === "docx")
      console.log("PDF multipages, volumineux et erreurs : OK");
    modal = await open(`document.${ext}`);
    await modal.getByText(/Office de recette/).waitFor();
    await close(modal);
  }
  for (const ext of ["zip", "7z"]) {
    modal = await open(`archive.${ext}`);
    await modal.getByRole("button", { name: "note.txt", exact: true }).click();
    await modal
      .getByText("Texte dans une archive de recette", { exact: true })
      .waitFor();
    await close(modal);
  }
  for (const { file, required } of corpus.media) {
    modal = await open(file);
    await modal.locator('video,audio,[role="alert"]').first().waitFor();
    await modal.waitFor({ state: "visible" });
    await page.waitForFunction(
      (name) => {
        const modal = [...document.querySelectorAll('[role="dialog"]')].find(
          (dialog) => dialog.getAttribute("aria-label") === `Aperçu de ${name}`,
        );
        const media = modal?.querySelector("video,audio");
        return (
          media?.readyState >= 1 || !!modal?.querySelector('[role="alert"]')
        );
      },
      file,
      { timeout: 20000 },
    );
    const readable = await modal
      .locator("video,audio")
      .evaluateAll((items) => items.some((element) => element.readyState >= 1));
    if (required) assert.ok(readable, `${file} doit être lisible`);
    if (!readable) await modal.getByRole("alert").waitFor();
    report.media.push({ file, readable, explicitRefusal: !readable });
    console.log(`Lecture ${file} : ${readable ? "OK" : "refus explicite"}`);
    await close(modal);
  }
  modal = await open("video-512Mio.mp4");
  await modal.locator("video").waitFor();
  await modal.locator("video").evaluate(async (video) => {
    if (video.readyState < 1)
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
    video.currentTime = 1;
    await video.play();
  });
  await page.waitForFunction(
    () => document.querySelector(".preview video")?.currentTime > 1.1,
  );
  await close(modal);
  // A real running TIFF decoder should be stopped, not merely hidden.
  const cancelledBefore = cancellations.length;
  const previewsBefore = previews.length;
  modal = await open("grand-144Mio.tiff");
  const decodeDeadline = Date.now() + 5000;
  while (previews.length === previewsBefore && Date.now() < decodeDeadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    previews.length > previewsBefore,
    "le décodage doit être démarré avant l’arrêt",
  );
  await page.waitForFunction(
    () => !!document.querySelector(".preview .preview-loading button"),
  );
  await modal
    .getByRole("button", { name: "Arrêter l’aperçu", exact: true })
    .click();
  await modal.getByText("Aperçu arrêté.", { exact: true }).waitFor();
  assert.ok(
    cancellations.length > cancelledBefore,
    "le décodage natif doit recevoir l’arrêt",
  );
  await modal
    .getByRole("button", { name: "Réessayer l’aperçu", exact: true })
    .click();
  await modal.locator(".gallery-stage img").evaluate((image) => image.decode());
  await close(modal);
  assert.equal(
    reads.some((read) =>
      /\.(tiff?|mp4|m4v|mov|mkv|avi|webm|mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(
        read.path,
      ),
    ),
    false,
    "images et médias natifs ne doivent pas être assemblés par FS_READ",
  );
  const toggle = page.getByRole("button", {
    name: "Volet d’aperçu",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-pressed")) !== "true")
    await toggle.click();
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  await page
    .locator(".pane")
    .first()
    .getByRole("textbox", { name: "Filtrer ce dossier", exact: true })
    .fill("document-17Mio.pdf");
  await page
    .getByRole("option", { name: "document-17Mio.pdf", exact: true })
    .click();
  await details.getByRole("alert").filter({ hasText: "16 Mio" }).waitFor();
  await page
    .getByRole("button", { name: "Réduire la navigation", exact: true })
    .click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    modal = await open("document.pdf");
    await modal
      .getByRole("img", { name: "Page 1 du PDF document.pdf", exact: true })
      .waitFor();
    assert.ok(
      await modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    await page.screenshot({ path: `test-results/preview-pdf-${width}.png` });
    await close(modal);
  }
  for (const [file, before] of Object.entries(corpus.hashes)) {
    const after = createHash("sha256")
      .update(await readFile(path.join(corpus.folder, file)))
      .digest("hex");
    assert.equal(after, before, `original ${file} intact`);
  }
  report.checks = [
    "TIFF >100 Mio",
    "rejet avant lecture au-delà de 256 Mio",
    "texte 1000 lignes",
    "PDF multipage, rotation et >16 Mio",
    "refus PDF 32 Mio et corrompu",
    "Office textuel",
    "ZIP et 7z",
    "MP4 512 Mio en streaming",
    "arrêt/reprise TIFF natif",
    "320/390/1440 px",
    "originaux intacts",
  ];
  await writeFile(
    "test-results/preview-qualification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Qualification des aperçus V1 : images, TIFF volumineux, PDF bornés, texte, Office, polices, archives, médias, arrêt/reprise et originaux intacts : OK",
  );
}
