import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
  utimes,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function runOrganizationJourney({ context, baseURL, fixture }) {
  const folder = path.join(fixture, "Organisation J4"),
    child = path.join(folder, "Dossier"),
    target = path.join(folder, "Destination");
  await mkdir(child, { recursive: true });
  await mkdir(target);
  const names = {
    "facture.txt": "Facture électricité atelier décembre",
    "devis.md": "Devis électricité atelier janvier",
    "vacances.csv": "plage,soleil",
    "gros.tiff": Buffer.alloc(24 * 1024 * 1024),
  };
  for (const [name, bytes] of Object.entries(names))
    await writeFile(path.join(folder, name), bytes);
  await writeFile(
    path.join(child, "enfant.txt"),
    "Pièce justificative atelier",
  );
  const before = await readFile(path.join(folder, "gros.tiff")),
    hash = createHash("sha256").update(before).digest("hex");
  const page = await context.newPage(),
    panel = await context.newPage(),
    errors = [];
  for (const view of [page, panel]) {
    view.setDefaultTimeout(20000);
    view.on("pageerror", (error) => errors.push(error.message));
  }
  const keys = [
    "explorerPreferences",
    "fileTags",
    "folderPreferences",
    "textKeywordRules",
    "recentFolders",
    "theme",
    "stash",
    "hybridSpaces",
  ];
  await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
  const backup = await page.evaluate(
    (keys) => chrome.storage.local.get(keys),
    keys,
  );
  await page.addInitScript(() => {
    window.__j4Actions = [];
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args),
        send = port.postMessage.bind(port);
      port.postMessage = (message) => {
        window.__j4Actions.push({
          action: message.action,
          payload: message.payload,
        });
        if (window.__j4Delay && message.action === "FS_READ")
          setTimeout(() => send(message), 1000);
        else send(message);
      };
      return port;
    };
  });
  async function command(view, name) {
    await view.keyboard.press("Escape");
    await view.keyboard.press("Control+k");
    await view
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
        exact: true,
      })
      .fill(name);
    await view
      .getByRole("dialog", { name: "Aller à…", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
    return view.getByRole("dialog").last();
  }
  async function index(view) {
    const dialog = await command(
      view,
      "Rechercher dans mes fichiers et espaces",
    );
    await dialog.getByLabel("Dossier à indexer", { exact: true }).fill(folder);
    await dialog
      .getByRole("button", {
        name: /^(Indexer ce dossier|Actualiser l’index)$/,
      })
      .click();
    await dialog
      .getByText(/fichier\(s\) · \d+ dossier\(s\) · \d+ ms/)
      .waitFor();
    return dialog;
  }
  async function close(view) {
    await view
      .getByRole("dialog")
      .getByRole("button", { name: "Fermer", exact: true })
      .click();
  }
  async function noHorizontalOverflow(dialog) {
    for (const region of [
      dialog,
      dialog.locator(".modal-content"),
      dialog.locator(".organization-dialog"),
    ])
      assert.ok(
        await region.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      );
  }
  try {
    await page.evaluate(async () =>
      chrome.storage.local.remove([
        "explorerPreferences",
        "fileTags",
        "folderPreferences",
        "textKeywordRules",
      ]),
    );
    await page.reload();
    await page.evaluate(async (folder) => {
      const data = await chrome.storage.local.get(["stash", "hybridSpaces"]);
      const link = {
        type: "web",
        name: "Atelier source web",
        path: "https://example.com/atelier",
        collectedAt: new Date().toISOString(),
      };
      const space = {
        version: 1,
        id: "j4-search-space",
        name: "Espace atelier",
        date: new Date().toISOString(),
        tabs: [
          {
            paths: [folder, folder],
            modes: ["details", "details"],
            active: 0,
            dual: false,
            split: 50,
          },
        ],
        current: 0,
        entries: [],
        links: {},
        browser: { tabs: [], groups: [] },
        tasks: [],
      };
      await chrome.storage.local.set({
        stash: [...(data.stash || []), link],
        hybridSpaces: [...(data.hybridSpaces || []), space],
      });
    }, folder);
    await page
      .getByRole("option", { name: "facture.txt", exact: true })
      .waitFor();
    let dialog = await index(page);
    const outside = path.join(fixture, "Autre périmètre J4");
    await mkdir(outside);
    await writeFile(
      path.join(outside, "secret.txt"),
      "Hors du périmètre confirmé",
    );
    const mutationsBefore = await page.evaluate(
      () => window.__j4Actions.length,
    );
    await writeFile(
      path.join(folder, "notification.txt"),
      "Notification de changement",
    );
    await dialog
      .getByText("Index à actualiser : les résultats locaux sont masqués.", {
        exact: true,
      })
      .waitFor();
    await dialog.getByLabel("Dossier à indexer", { exact: true }).fill(outside);
    await page.waitForTimeout(900);
    assert.equal(
      await page.evaluate(
        ({ offset, outside }) =>
          window.__j4Actions
            .slice(offset)
            .some(
              (row) =>
                ["FS_STAT", "FS_LIST_DIR", "FS_READ"].includes(row.action) &&
                row.payload.path.startsWith(outside),
            ),
        { offset: mutationsBefore, outside },
      ),
      false,
    );
    await dialog.getByLabel("Dossier à indexer", { exact: true }).fill(folder);
    await dialog
      .getByRole("button", { name: "Actualiser l’index", exact: true })
      .click();
    await dialog
      .getByText(/fichier\(s\) · \d+ dossier\(s\) · \d+ ms/)
      .waitFor();
    await dialog
      .getByLabel("Recherche commune", { exact: true })
      .fill("atelier");
    await dialog.getByRole("link", { name: /Atelier source web/ }).waitFor();
    await dialog
      .getByRole("button", { name: "Espace atelier", exact: true })
      .waitFor();
    await dialog
      .getByLabel("Recherche commune", { exact: true })
      .fill("electricite");
    assert.equal(await dialog.locator("article").count(), 2);
    await dialog
      .getByRole("button", { name: "Vocabulaire proche", exact: true })
      .first()
      .click();
    await dialog
      .getByRole("region", { name: "Textes au vocabulaire proche" })
      .waitFor();
    await dialog
      .getByLabel("Mots-clés du contenu", { exact: true })
      .fill("atelier");
    await dialog
      .getByText("Règles de mots-clés enregistrées", { exact: true })
      .click();
    await dialog.getByLabel("Nom de la règle", { exact: true }).fill("Atelier");
    await dialog
      .getByRole("button", { name: "Enregistrer ces mots-clés", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Atelier · atelier", exact: true })
      .waitFor();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await noHorizontalOverflow(dialog);
      await page.screenshot({
        path: `test-results/j4-search-${width}.png`,
        animations: "disabled",
      });
    }
    const reads = await page.evaluate(() =>
      window.__j4Actions
        .filter((row) => row.action === "FS_READ")
        .map((row) => row.payload),
    );
    assert.equal(
      reads.some((row) => row.path.endsWith("gros.tiff")),
      false,
    );
    assert.ok(
      reads
        .filter((row) => !row.path.endsWith(".source.json"))
        .every((row) => row.limit <= 16 * 1024),
    );
    await dialog
      .getByLabel("Recherche commune", { exact: true })
      .fill("remplace");
    await dialog.getByLabel("Mots-clés du contenu", { exact: true }).fill("");
    await writeFile(
      path.join(folder, "facture.txt"),
      "Remplacé document nouveau",
    );
    await utimes(
      path.join(folder, "facture.txt"),
      new Date(),
      new Date(Date.now() + 3000),
    );
    await writeFile(path.join(folder, "ajout.txt"), "Remplacé nouveau");
    await unlink(path.join(folder, "vacances.csv"));
    await dialog
      .getByRole("button", { name: "Actualiser l’index", exact: true })
      .click();
    await dialog
      .getByText(/fichier\(s\) · \d+ dossier\(s\) · \d+ ms/)
      .waitFor();
    assert.equal(await dialog.locator("article").count(), 2);
    await close(page);
    await page
      .getByRole("option", { name: "facture.txt", exact: true })
      .click();
    dialog = await command(page, "Gérer les tags");
    await dialog.getByLabel("Nom du tag", { exact: true }).fill("Compta");
    await dialog
      .getByRole("button", { name: "Créer le tag", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Ajouter à la sélection", exact: true })
      .click();
    await dialog.getByText("Tags enregistrés", { exact: true }).waitFor();
    await close(page);
    await page.keyboard.press("F2");
    dialog = page.getByRole("dialog", { name: "Renommer", exact: true });
    await dialog.locator('input[name="name"]').fill("facture-renommee.txt");
    await dialog
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await page.waitForFunction(
      async (path) => {
        const data = await chrome.storage.local.get("fileTags");
        return (
          data.fileTags?.files[path.replaceAll("\\", "/").toLowerCase()]
            ?.length === 1
        );
      },
      path.join(folder, "facture-renommee.txt"),
    );
    await page
      .getByRole("option", { name: "facture-renommee.txt", exact: true })
      .click();
    await page.keyboard.press("Control+x");
    await page
      .getByRole("option", { name: "Destination", exact: true })
      .dblclick();
    await page
      .getByRole("heading", { name: "Destination", exact: true })
      .waitFor();
    await page.keyboard.press("Control+v");
    dialog = page.getByRole("dialog").last();
    await dialog
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await page.waitForFunction(
      async (path) => {
        const data = await chrome.storage.local.get("fileTags");
        return (
          data.fileTags?.files[path.replaceAll("\\", "/").toLowerCase()]
            ?.length === 1
        );
      },
      path.join(target, "facture-renommee.txt"),
    );
    // Browser routes are independent; settings and tags must propagate to the side panel.
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.goto(`${baseURL}?panel=1`);
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    dialog = await command(panel, "Gérer les tags");
    await dialog.getByText("Compta", { exact: true }).waitFor();
    await close(panel);
    dialog = await command(page, "Réglages et moteurs");
    await dialog.getByLabel("Thème", { exact: true }).selectOption("light");
    await dialog.getByText("Afficher les miniatures", { exact: true }).click();
    await dialog.getByText("Cases de sélection", { exact: true }).click();
    await dialog
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await dialog
      .getByText("Préférences enregistrées", { exact: true })
      .waitFor();
    assert.equal(
      await panel.locator("html").getAttribute("data-theme"),
      "light",
    );
    await dialog.getByText("Raccourcis clavier", { exact: true }).click();
    const searchShortcut = dialog.getByLabel(
      "Raccourci Rechercher dans mes fichiers et espaces",
      { exact: true },
    );
    await searchShortcut.focus();
    await page.keyboard.press("Control+k");
    await dialog
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "déjà utilisé" })
      .waitFor();
    await searchShortcut.focus();
    await page.keyboard.press("Control+Shift+f");
    await dialog
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await dialog
      .getByText("Préférences enregistrées", { exact: true })
      .waitFor();
    await close(page);
    await page.keyboard.press("Control+Shift+f");
    await page
      .getByRole("dialog", {
        name: "Rechercher dans mes fichiers et espaces",
        exact: true,
      })
      .waitFor();
    await close(page);
    dialog = await command(page, "Réglages et moteurs");
    await dialog
      .getByText("Exporter / importer les préférences et tags", { exact: true })
      .click();
    const downloadEvent = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Exporter", exact: true }).click();
    const download = await downloadEvent,
      exportFile = path.join(fixture, "organization-export.json");
    assert.equal(
      download.suggestedFilename(),
      "NextExplorer-preferences-tags.json",
    );
    if (
      await page.evaluate(() =>
        chrome.permissions.contains({ permissions: ["downloads"] }),
      )
    ) {
      // The full recipe configures Chrome to save under its filename rather than Playwright's GUID.
      let saved;
      for (let attempt = 0; attempt < 100; attempt++) {
        saved = await page.evaluate(async (url) => {
          const [item] = await chrome.downloads.search({
            url,
            orderBy: ["-startTime"],
            limit: 1,
          });
          return item;
        }, download.url());
        if (saved?.state === "complete") break;
        await page.waitForTimeout(100);
      }
      assert.equal(saved?.state, "complete", "Export non terminé");
      const filename = saved.filename;
      assert.ok(
        path.resolve(filename).startsWith(path.resolve(fixture) + path.sep),
      );
      await writeFile(exportFile, await readFile(filename));
    } else await download.saveAs(exportFile);
    const data = JSON.parse(await readFile(exportFile, "utf8"));
    assert.equal(data.tags.labels[0].name, "Compta");
    assert.equal(data.rules[0].name, "Atelier");
    assert.equal(data.preferences.theme, "light");
    assert.equal("index" in data, false);
    await dialog.locator('input[type="file"]').setInputFiles(exportFile);
    await dialog
      .getByRole("button", { name: "Annuler l’import", exact: true })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Remplacer avec cet export", exact: true })
      .click();
    await dialog.getByText("Import appliqué", { exact: true }).waitFor();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await noHorizontalOverflow(dialog);
      await page.screenshot({
        path: `test-results/j4-settings-${width}.png`,
        animations: "disabled",
      });
    }
    await close(page);
    await page
      .getByRole("button", { name: "Affichage des fichiers", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Colonnes de dossiers", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Navigation en colonnes", exact: true })
      .waitFor();
    await command(page, "Accueil");
    await page
      .getByRole("heading", { name: "Votre espace local", exact: true })
      .waitFor();
    await close(page);
    dialog = await index(page);
    await page.evaluate(() => (window.__j4Delay = true));
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
    await page.evaluate(() => (window.__j4Delay = false));
    await dialog
      .getByRole("button", { name: "Effacer l’index", exact: true })
      .click();
    assert.equal(await dialog.locator("article").count(), 0);
    // A deletion in another view must also defeat a pending indexing commit.
    dialog = await index(page);
    await page.evaluate(() => (window.__j4Delay = true));
    await dialog
      .getByRole("button", { name: "Actualiser l’index", exact: true })
      .click();
    const panelSearch = await command(
      panel,
      "Rechercher dans mes fichiers et espaces",
    );
    await panelSearch
      .getByRole("button", { name: "Effacer l’index", exact: true })
      .click();
    await dialog
      .getByText("Index à actualiser : les résultats locaux sont masqués.", {
        exact: true,
      })
      .waitFor();
    await page.waitForTimeout(1200);
    assert.equal(
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("nextexplorer-search", 1);
            request.onsuccess = () => {
              const db = request.result,
                transaction = db.transaction("index"),
                read = transaction.objectStore("index").get("current");
              transaction.oncomplete = () => {
                resolve(read.result === undefined);
                db.close();
              };
              transaction.onerror = () => reject(transaction.error);
            };
          }),
      ),
      true,
    );
    await page.evaluate(() => (window.__j4Delay = false));
    await close(panel);
    await close(page);
    await page
      .locator(".breadcrumbs")
      .getByRole("button", { name: "Organisation J4", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Organisation J4", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Affichage des fichiers", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Détails", exact: true })
      .click();
    await page.getByRole("button", { name: "Filtres et organisation", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Calculer les tailles des dossiers",
        exact: true,
      })
      .click();
    const folderRow = page.getByRole("option", {
      name: "Dossier",
      exact: true,
    });
    await folderRow
      .locator(".file-size")
      .filter({
        hasText:
          String(Buffer.byteLength("Pièce justificative atelier")) + " o",
      })
      .waitFor();
    console.log(
      "J4 : effacement entre vues sans réapparition tardive, tailles natives visibles : OK",
    );
    const large = path.join(fixture, "Index J4 1003");
    await mkdir(large);
    for (let offset = 0; offset < 1003; offset += 32)
      await Promise.all(
        Array.from({ length: Math.min(32, 1003 - offset) }, (_, i) =>
          writeFile(
            path.join(large, `${String(offset + i).padStart(4, "0")}.txt`),
            "suivi atelier",
          ),
        ),
      );
    const performanceDialog = await command(
      page,
      "Rechercher dans mes fichiers et espaces",
    );
    await performanceDialog
      .getByLabel("Dossier à indexer", { exact: true })
      .fill(large);
    await page.evaluate(() => {
      window.__j4Beats = 0;
      window.__j4BeatTimer = setInterval(() => window.__j4Beats++, 16);
    });
    const started = Date.now();
    await performanceDialog
      .getByRole("button", {
        name: /^(Indexer ce dossier|Actualiser l’index)$/,
      })
      .click();
    await performanceDialog
      .getByText(/1000 fichier\(s\) · 1 dossier\(s\) · \d+ ms/)
      .waitFor({ timeout: 60000 });
    const milliseconds = Date.now() - started,
      beats = await page.evaluate(() => {
        clearInterval(window.__j4BeatTimer);
        return window.__j4Beats;
      });
    assert.ok(
      beats >= 2,
      "l’interface doit continuer à traiter des événements pendant l’indexation",
    );
    await performanceDialog
      .getByText(/3 entrée\(s\) ou sous-dossier\(s\) omis/)
      .waitFor();
    await writeFile(
      path.resolve("test-results/j4-performance.json"),
      JSON.stringify(
        {
          entries: 1003,
          indexed: 1000,
          milliseconds,
          uiTicks: beats,
          synthetic: true,
        },
        null,
        2,
      ),
    );
    await performanceDialog
      .getByRole("button", { name: "Effacer l’index", exact: true })
      .click();
    console.log(
      `J4 : corpus synthétique 1003 → 1000 indexés, interface active (${beats} événements), ${milliseconds} ms : OK`,
    );
    assert.equal(
      createHash("sha256")
        .update(await readFile(path.join(folder, "gros.tiff")))
        .digest("hex"),
      hash,
    );
    assert.equal(
      (await stat(path.join(folder, "gros.tiff"))).size,
      24 * 1024 * 1024,
    );
    assert.deepEqual(errors, []);
    console.log(
      "J4 : index lexical/TF-IDF, mots-clés, ajouts/modifications/suppressions, TIFF non lu, tags renommés/déplacés entre vues, préférences/import/export/raccourcis, colonnes/accueil, 320/390/1024 px, arrêt et effacement : OK",
    );
  } catch (error) {
    for (const view of [page, panel]) {
      console.error(
        (await view.getByRole("dialog").allTextContents())
          .join("\n")
          .slice(0, 6000),
      );
      await view.screenshot({
        path: `test-results/j4-failure-${view === page ? "page" : "panel"}.png`,
        fullPage: true,
      });
    }
    throw error;
  } finally {
    await page.evaluate(
      async ({ keys, backup }) => {
        await chrome.storage.local.remove(keys);
        await chrome.storage.local.set(backup);
      },
      { keys, backup },
    );
    await page.close();
    await panel.close();
  }
}
