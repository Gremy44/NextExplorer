import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

export async function runSearchJourney({ page, fixture, reads }) {
  page.setDefaultTimeout(25000);
  const folder = path.join(fixture, "Recherche V1");
  await mkdir(folder);
  const flatCount = 11005;
  // Work in small batches to avoid making the fixture itself exhaust OS handles.
  for (let offset = 0; offset < flatCount; offset += 100)
    await Promise.all(
      Array.from({ length: Math.min(100, flatCount - offset) }, (_, i) =>
        writeFile(
          path.join(
            folder,
            `Document-${String(offset + i).padStart(5, "0")}.bin`,
          ),
          "",
        ),
      ),
    );
  for (let i = 0; i < 115; i++) {
    const child = path.join(folder, `Dossier-${String(i).padStart(3, "0")}`);
    await mkdir(child);
    await writeFile(
      path.join(child, `Rapport-${i}.txt`),
      "Contenu atelier électricité",
    );
  }
  let deep = folder;
  for (let i = 0; i < 14; i++) {
    deep = path.join(deep, "Niveau");
    await mkdir(deep);
  }
  await writeFile(
    path.join(deep, "Électricité-profonde.txt"),
    "Atelier familial",
  );
  await writeFile(path.join(folder, ".secret.txt"), "Fichier caché");
  await page
    .getByRole("option", { name: "Recherche V1", exact: true })
    .dblclick();
  const open = async () => {
    await page.keyboard.press("Control+Shift+f");
    const dialog = page.getByRole("dialog", {
      name: "Rechercher dans mes fichiers et espaces",
      exact: true,
    });
    await dialog.waitFor();
    return dialog;
  };
  let dialog = await open();
  await dialog
    .getByRole("button", { name: "Choisir un dossier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choisir ce dossier", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: /^(Indexer ce dossier|Actualiser l’index)$/ })
    .waitFor();
  await dialog
    .getByRole("checkbox", { name: "Contenu des documents", exact: true })
    .uncheck();
  const readsBefore = reads.length;
  await dialog
    .getByRole("button", { name: /^(Indexer ce dossier|Actualiser l’index)$/ })
    .click();
  const done = () =>
    dialog
      .getByText(/fichier\(s\) · \d+ dossier\(s\) · \d+ ms/)
      .waitFor({ timeout: 120000 });
  await done();
  const total = flatCount + 116;
  await dialog
    .getByRole("heading", { name: `Fichiers locaux (${total})`, exact: true })
    .waitFor();
  assert.equal(
    await dialog.locator("article.organization-record").count(),
    100,
  );
  assert.equal(
    reads.length,
    readsBefore,
    "mode noms uniquement : aucune lecture de contenu ni de provenance",
  );
  assert.equal(
    await dialog
      .locator("[data-search-coverage]")
      .getAttribute("data-search-coverage"),
    "complete",
  );
  const query = dialog.getByLabel("Recherche commune", { exact: true });
  await query.fill("Document-11004.bin");
  await dialog
    .getByRole("heading", { name: "Fichiers locaux (1)", exact: true })
    .waitFor();
  await dialog
    .locator("article")
    .getByText("Document-11004.bin", { exact: true })
    .waitFor();
  await query.fill("electricite profonde");
  await dialog
    .locator("article")
    .getByText("Électricité-profonde.txt", { exact: true })
    .waitFor();
  await query.fill("Rapport-114");
  await dialog
    .locator("article")
    .getByText("Rapport-114.txt", { exact: true })
    .waitFor();
  await query.fill("Document-");
  await dialog
    .getByRole("heading", {
      name: `Fichiers locaux (${flatCount})`,
      exact: true,
    })
    .waitFor();
  const pagination = dialog.getByRole("navigation", {
    name: "Pages des résultats locaux",
  });
  await pagination
    .getByRole("button", { name: "Suivant", exact: true })
    .click();
  await pagination
    .getByText(`101–200 sur ${flatCount}`, { exact: true })
    .waitFor();
  assert.equal(
    await dialog.locator("article.organization-record").count(),
    100,
  );
  await query.fill("absent-introuvable");
  await dialog
    .getByText("Aucun fichier trouvé dans le périmètre analysé.", {
      exact: true,
    })
    .waitFor();
  await query.fill("Document-11004.bin");
  await dialog
    .getByRole("heading", { name: "Fichiers locaux (1)", exact: true })
    .waitFor();
  await page.screenshot({ path: "test-results/search-large.png" });
  const checks = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("nextexplorer-search", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const r = db.transaction("index").objectStore("index").get("current");
        r.onsuccess = () =>
          resolve({
            files: r.result.files.length,
            directories: r.result.directories,
          });
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
  assert.equal(checks.files, total);
  assert.ok(checks.directories > 100);
  await dialog
    .getByRole("checkbox", { name: "Fichiers cachés", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Actualiser l’index", exact: true })
    .click();
  await done();
  await query.fill(".secret.txt");
  await dialog
    .locator("article")
    .getByText(".secret.txt", { exact: true })
    .waitFor();
  const small = path.join(fixture, "Recherche contenus V1");
  await mkdir(small);
  const note = path.join(small, "notes.txt");
  const original = "Facture électricité atelier\r\nUne deuxième ligne\r\n";
  await writeFile(note, original);
  await writeFile(path.join(small, "devis.md"), "Devis électricité atelier");
  await writeFile(
    path.join(small, "image.tiff"),
    Buffer.alloc(24 * 1024 * 1024),
  );
  await dialog.getByLabel("Dossier à indexer", { exact: true }).fill(small);
  await dialog
    .getByRole("checkbox", { name: "Fichiers cachés", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", { name: "Contenu des documents", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Actualiser l’index", exact: true })
    .click();
  await done();
  await query.fill("electric");
  await dialog
    .getByRole("heading", { name: "Fichiers locaux (2)", exact: true })
    .waitFor();
  assert.equal(
    reads.some((read) => read.path.endsWith("image.tiff")),
    false,
  );
  await dialog
    .getByRole("button", { name: "Vocabulaire proche", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("region", { name: "Textes au vocabulaire proche", exact: true })
    .waitFor();
  assert.equal(await readFile(note, "utf8"), original);
  // The folder is not the active pane: freshness must also detect unobserved changes.
  await writeFile(note, "Nouveau contenu photovoltaïque");
  await unlink(path.join(small, "devis.md"));
  await query.fill("photovolta");
  await dialog
    .locator("article")
    .getByText("notes.txt", { exact: true })
    .waitFor({ timeout: 35000 });
  await query.fill("devis");
  await dialog
    .getByText("Aucun fichier trouvé dans le périmètre analysé.", {
      exact: true,
    })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await query.fill("photovolta");
    await dialog
      .locator("article")
      .getByText("notes.txt", { exact: true })
      .waitFor();
    assert.ok(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await page.screenshot({ path: `test-results/search-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await dialog.getByLabel("Dossier à indexer", { exact: true }).fill(folder);
  await dialog
    .getByRole("button", { name: "Actualiser l’index", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Arrêter l’indexation", exact: true })
    .click();
  await dialog
    .getByText("Index à actualiser : les résultats locaux sont masqués.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await dialog.locator("article.organization-record").count(), 0);
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .locator(".pane .pathbar")
    .getByRole("button", { name: "Dossier parent", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Recherche contenus V1", exact: true })
    .dblclick();
  const readsBeforeReopen = reads.length;
  // Stopping the other scan must not replace this saved scope.
  dialog = await open();
  await done();
  await dialog
    .getByRole("heading", { name: "Fichiers locaux (2)", exact: true })
    .waitFor();
  assert.equal(
    reads.length,
    readsBeforeReopen,
    "réouverture : revalidation sans relire les documents",
  );
  await dialog
    .getByRole("button", { name: "Effacer l’index", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Indexer ce dossier", exact: true })
    .waitFor();
  assert.equal(await dialog.locator("article.organization-record").count(), 0);
  console.log(
    `Recherche V1 : ${total} fichiers, >100 dossiers et profondeur 14 ; dernier nom après 10 000, pagination, accents/fragments, noms seuls sans lectures, cachés, contenu, TF-IDF worker, changement non surveillé, 320/390/1440 px, cache et effacement : OK`,
  );
}
