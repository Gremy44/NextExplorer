import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  readdir,
  unlink,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";

export async function runProtectionJourney({
  page,
  fixture,
  label = "browser",
}) {
  page.setDefaultTimeout(15000);
  const context = page.context(),
    url = page.url(),
    errors = [];
  const file = path.join(fixture, "protection.txt");
  const original = "\ufeffTexte origine\r\nDeuxième ligne\r\n";
  const recovered = "Brouillon récupéré 👋\nAutre ligne\n";
  await writeFile(file, original);
  const area = () =>
    page.getByRole("textbox", { name: "Contenu du fichier", exact: true });
  const document = () =>
    page.getByRole("dialog", {
      name: "Document : protection.txt",
      exact: true,
    });
  const openRecovery = async () => {
    await page
      .getByRole("button", { name: /^Brouillons à récupérer :/ })
      .click();
    return page.getByRole("dialog", {
      name: "Brouillons à récupérer",
      exact: true,
    });
  };
  const resume = async () => {
    const modal = await openRecovery();
    await modal
      .getByRole("button", { name: "Reprendre", exact: true })
      .first()
      .click();
    await area().waitFor();
    await page.getByText(/Brouillon récupéré sur cet appareil/).waitFor();
  };
  const reopen = async () => {
    await page.close({ runBeforeUnload: false });
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  };
  try {
    await page
      .getByRole("option", { name: "protection.txt", exact: true })
      .dblclick();
    const preview = page.getByRole("dialog", {
      name: "Aperçu de protection.txt",
      exact: true,
    });
    await preview
      .getByRole("button", { name: "Modifier", exact: true })
      .click();
    await area().fill(recovered);
    await page
      .getByText("Brouillon sauvegardé sur cet appareil", { exact: true })
      .waitFor();
    assert.equal(await readFile(file, "utf8"), original);
    await reopen();
    let recovery = await openRecovery();
    assert.equal(await recovery.locator(".draft-recovery-row").count(), 1);
    const downloaded = page.waitForEvent("download");
    await recovery
      .getByRole("button", { name: "Télécharger", exact: true })
      .click();
    const download = await downloaded;
    assert.equal(await readFile(await download.path(), "utf8"), recovered);
    await recovery
      .getByRole("button", { name: "Reprendre", exact: true })
      .click();
    await area().waitFor();
    assert.equal(await area().inputValue(), recovered);
    const info = await stat(file);
    const external = original.replace("origine", "modifie");
    await writeFile(file, external);
    await utimes(file, info.atime, info.mtime);
    await document()
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await document().getByRole("alert").waitFor();
    assert.equal(await area().inputValue(), recovered);
    assert.equal(await readFile(file, "utf8"), external);
    await reopen();
    await resume();
    assert.equal(await area().inputValue(), recovered);
    page.once("dialog", (d) => d.accept());
    await document()
      .getByRole("button", { name: "Recharger depuis le disque", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('textarea[aria-label="Contenu du fichier"]')
        ?.value.includes("modifie"),
    );
    assert.equal(
      await page
        .getByRole("button", { name: /^Brouillons à récupérer :/ })
        .count(),
      0,
    );
    await area().fill("Version enregistrée\n");
    await area().press("Control+s");
    await page
      .getByText("Enregistré. La version précédente est conservée.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await readFile(file, "utf8"), "\ufeffVersion enregistrée\r\n");
    await document()
      .getByRole("button", { name: "Versions", exact: true })
      .click();
    const version = document().locator(".version-row").first();
    await version.waitFor();
    await version.getByRole("button", { name: "Voir", exact: true }).click();
    assert.equal(
      await document().getByLabel("Contenu de la version").textContent(),
      external,
    );
    const occupied = path.join(fixture, "protection-restaure.txt");
    await writeFile(occupied, "Copie déjà existante");
    const before = new Set(await readdir(fixture));
    await version
      .getByRole("button", { name: "Restaurer une copie", exact: true })
      .click();
    await page.getByText(/^Copie restaurée :/).waitFor();
    const added = (await readdir(fixture)).filter((name) => !before.has(name));
    assert.equal(added.length, 1);
    assert.equal(
      await readFile(path.join(fixture, added[0]), "utf8"),
      external,
    );
    assert.equal(await readFile(occupied, "utf8"), "Copie déjà existante");
    assert.equal(await readFile(file, "utf8"), "\ufeffVersion enregistrée\r\n");
    await document()
      .getByRole("button", { name: "Modifier", exact: true })
      .click();
    await page.evaluate(() => {
      window.__draftSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("nextexplorer:document-draft:"))
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        return window.__draftSetItem.call(this, key, value);
      };
    });
    await area().fill("Saisie malgré le quota");
    await document()
      .getByRole("alert")
      .filter({ hasText: "uniquement dans cette page" })
      .waitFor();
    assert.equal(await area().inputValue(), "Saisie malgré le quota");
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__draftSetItem;
    });
    await area().fill("Variante fenêtre A");
    await page
      .getByText("Brouillon sauvegardé sur cet appareil", { exact: true })
      .waitFor();
    const firstPage = page;
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByText("Compagnon connecté", { exact: true }).waitFor();
    await resume();
    await area().fill("Variante fenêtre B");
    await firstPage
      .getByRole("textbox", { name: "Contenu du fichier", exact: true })
      .fill("Variante fenêtre A, suite");
    await page
      .getByRole("button", { name: "Brouillons à récupérer : 2", exact: true })
      .waitFor();
    await firstPage
      .getByRole("textbox", { name: "Contenu du fichier", exact: true })
      .press("Control+s");
    await firstPage
      .getByText("Enregistré. La version précédente est conservée.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Brouillons à récupérer : 1", exact: true })
      .waitFor();
    await area().press("Control+s");
    await document().getByRole("alert").waitFor();
    assert.equal(await area().inputValue(), "Variante fenêtre B");
    assert.equal(
      await readFile(file, "utf8"),
      "\ufeffVariante fenêtre A, suite",
    );
    await firstPage.close({ runBeforeUnload: false });
    await unlink(file);
    await reopen();
    recovery = await openRecovery();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      assert.ok(
        await recovery.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        `récupération à ${width}px`,
      );
      await page.screenshot({
        path: `test-results/protection-recovery-${label}-${width}.png`,
        animations: "disabled",
      });
    }
    await recovery.getByRole("button", { name: "Fermer", exact: true }).click();
    await resume();
    assert.equal(await area().inputValue(), "Variante fenêtre B");
    await area().press("Control+s");
    await document().getByRole("alert").waitFor();
    assert.equal(await area().inputValue(), "Variante fenêtre B");
    await assert.rejects(stat(file), { code: "ENOENT" });
    await page.screenshot({ path: `test-results/protection-${label}.png` });
    page.once("dialog", (d) => d.accept());
    await document()
      .getByRole("button", { name: "Fermer le document", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: /^Brouillons à récupérer :/ })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      `Protection ${label} : vraie fermeture/réouverture, téléchargement exact, conflit même taille/date, relecture explicite, BOM/CRLF, version restaurée sans écrasement, deux fenêtres indépendantes et fichier supprimé : OK`,
    );
    return page;
  } catch (e) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: `test-results/protection-${label}-failure.png`,
      });
      await writeFile(
        `test-results/protection-${label}-failure.txt`,
        await page.locator("body").innerText(),
      );
    }
    throw e;
  }
}
