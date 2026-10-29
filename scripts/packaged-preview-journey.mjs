import assert from "node:assert/strict";
import { writeFile, readFile, open } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

export async function runPackagedPreviews({ page, fixture }) {
  const pdf = await PDFDocument.create();
  pdf
    .addPage([595, 842])
    .drawText("PDF dans une vraie extension", { x: 40, y: 700, size: 20 });
  pdf
    .addPage([400, 600])
    .drawText("Deuxieme page", { x: 40, y: 500, size: 20 });
  await writeFile(path.join(fixture, "recette.pdf"), await pdf.save());
  const file = path.join(fixture, "recette.tiff");
  execFileSync(
    path.resolve("native/tools/magick.exe"),
    [
      "-size",
      "2560x1920",
      "gradient:navy-gold",
      "-depth",
      "16",
      "-compress",
      "None",
      file,
    ],
    { windowsHide: true, timeout: 20000 },
  );
  const hash = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  const show = async (name) => {
    await page.getByRole("option", { name, exact: true }).click();
    await page.keyboard.press("Space");
    const modal = page.getByRole("dialog", {
      name: `Aperçu de ${name}`,
      exact: true,
    });
    await modal.waitFor();
    return modal;
  };
  let modal = await show("recette.pdf");
  await modal
    .getByRole("img", { name: "Page 1 du PDF recette.pdf", exact: true })
    .waitFor();
  assert.ok(
    page.workers().some((worker) => /pdf.worker|blob:/.test(worker.url())),
    "PDF.js doit utiliser un vrai worker sous la CSP de l’extension",
  );
  await modal.getByRole("button", { name: "Suivant", exact: true }).click();
  await modal
    .getByRole("img", { name: "Page 2 du PDF recette.pdf", exact: true })
    .waitFor();
  assert.equal(
    await modal.locator(".pdf-preview details pre").textContent(),
    "Deuxieme page",
  );
  await page.screenshot({ path: "test-results/preview-extension-pdf.png" });
  await modal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  for (
    let i = 0;
    i < 100 &&
    page.workers().some((worker) => /pdf.worker|blob:/.test(worker.url()));
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    page.workers().some((worker) => /pdf.worker|blob:/.test(worker.url())),
    false,
    "worker PDF libéré à la fermeture",
  );
  modal = await show("recette.tiff");
  await modal.locator(".gallery-stage img").evaluate((image) => image.decode());
  assert.ok(
    await modal
      .locator(".gallery-stage img")
      .evaluate((image) => image.naturalWidth <= 1600),
  );
  await modal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  assert.equal(
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
    hash,
  );
  const large = await open(path.join(fixture, "trop-grand.pdf"), "w");
  await large.truncate(32 * 1024 * 1024 + 1);
  await large.close();
  modal = await show("trop-grand.pdf");
  await modal.getByRole("alert").filter({ hasText: "32 Mio" }).waitFor();
  await modal
    .getByRole("button", { name: "Fermer l’aperçu", exact: true })
    .click();
  console.log(
    "Extension empaquetée : PDF.js en vrai worker sous CSP, pages, libération du worker, TIFF natif, limites et original intact : OK",
  );
}
