import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function runQuickTagsJourney({ page, fixture }) {
  const files = ["README.md", "brief.txt", "Documents/document.txt"].map(
    (name) => path.join(fixture, name),
  );
  const hashes = async () =>
    Promise.all(
      files.map(async (file) =>
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ),
    );
  const originalHashes = await hashes();
  const readme = page.getByRole("option", { name: /README.md/ });
  const brief = page.getByRole("option", { name: /brief.txt/ });
  const menu = page.getByRole("menu", {
    name: "Actions sur les fichiers",
    exact: true,
  });
  const picker = page.getByRole("dialog", {
    name: "Modifier les tags",
    exact: true,
  });
  const store = () =>
    page.evaluate(
      async () =>
        (await chrome.storage.local.get("fileTags")).fileTags || {
          labels: [],
          files: {},
        },
    );
  // An async waitForFunction predicate resolves once; poll storage explicitly.
  const waitTag = async (file, name, present = true) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const tags = await store();
      const id = tags.labels.find((tag) => tag.name === name)?.id;
      if (
        !!tags.files[file.replaceAll("\\", "/").toLowerCase()]?.includes(id) ===
        present
      )
        return;
      await page.waitForTimeout(50);
    }
    assert.fail(
      `${name} sur ${file}, attendu ${present} : ${JSON.stringify(await store())}`,
    );
  };
  const openMenu = async (entry = readme) => {
    await entry.click({ button: "right" });
    await menu.waitFor();
  };
  const color = async (name) => {
    await menu.getByRole("menuitemcheckbox", { name, exact: true }).click();
    await menu.waitFor({ state: "hidden" });
  };

  assert.equal((await store()).labels.length, 0);
  await openMenu();
  assert.equal(await menu.getByRole("menuitemcheckbox").count(), 7);
  await color("Bleu");
  await waitTag(files[0], "Bleu");
  assert.equal((await store()).labels.length, 1);
  assert.equal(await page.getByRole("dialog").count(), 0);
  const blueId = (await store()).labels[0].id;
  await openMenu();
  assert.equal(
    await menu
      .getByRole("menuitemcheckbox", { name: "Bleu", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await color("Bleu");
  await waitTag(files[0], "Bleu", false);
  await openMenu();
  await color("Bleu");
  await openMenu();
  await color("Orange");
  await brief.click({ modifiers: ["Control"] });
  await openMenu();
  assert.equal(
    await menu
      .getByRole("menuitemcheckbox", { name: "Bleu", exact: true })
      .getAttribute("aria-checked"),
    "mixed",
  );
  await color("Bleu");
  await waitTag(files[1], "Bleu");
  await openMenu();
  await color("Bleu");
  await waitTag(files[0], "Bleu", false);
  await waitTag(files[1], "Bleu", false);
  await waitTag(files[0], "Orange");
  await openMenu();
  await menu
    .getByRole("menuitemcheckbox", { name: "Bleu", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "Violet",
  );
  await page.keyboard.press("Enter");
  await menu.waitFor({ state: "hidden" });
  await waitTag(files[0], "Violet");
  await waitTag(files[1], "Violet");
  console.log(
    "Tags directs : profil neuf, une couleur sans dialogue, retrait, sélection mixte et clavier : OK",
  );

  await openMenu();
  await menu.getByRole("menuitem", { name: "Tags…", exact: true }).click();
  await picker.waitFor();
  const input = picker.getByRole("textbox", {
    name: "Nom du tag à ajouter",
    exact: true,
  });
  assert.equal(
    await input.evaluate((element) => element === document.activeElement),
    true,
  );
  const orange = picker.getByRole("checkbox", { name: "Orange", exact: true });
  assert.equal(await orange.getAttribute("aria-checked"), "mixed");
  await orange.click();
  await waitTag(files[1], "Orange");
  await orange.click();
  await waitTag(files[0], "Orange", false);
  await waitTag(files[1], "Orange", false);
  await input.fill("À relire");
  await picker
    .getByRole("button", { name: "Créer et appliquer", exact: true })
    .click();
  await waitTag(files[0], "À relire");
  await waitTag(files[1], "À relire");
  assert.equal((await store()).labels.length, 4, JSON.stringify(await store()));
  await picker
    .getByRole("button", { name: "Gérer les tags…", exact: true })
    .click();
  const manager = page.getByRole("dialog", {
    name: "Tags des fichiers",
    exact: true,
  });
  await manager.getByText("Modifier Bleu", { exact: true }).click();
  await manager
    .getByLabel("Renommer Bleu", { exact: true })
    .fill("Projet client");
  await manager
    .locator("article.organization-record")
    .filter({ has: page.getByLabel("Renommer Bleu", { exact: true }) })
    .getByRole("button", { name: "Enregistrer le tag", exact: true })
    .click();
  await manager.getByText("Projet client", { exact: true }).first().waitFor();
  await page.keyboard.press("Escape");
  await openMenu();
  await color("Projet client");
  await waitTag(files[0], "Projet client");
  assert.equal(
    (await store()).labels.find((tag) => tag.name === "Projet client").id,
    blueId,
  );
  assert.equal((await store()).labels.length, 4);

  await page.getByRole("option", { name: "Documents", exact: true }).dblclick();
  const document = page.getByRole("option", { name: /document.txt/ });
  await openMenu(document);
  await menu.getByRole("menuitem", { name: "Tags…", exact: true }).click();
  await picker.getByRole("checkbox", { name: "À relire", exact: true }).click();
  await waitTag(files[2], "À relire");
  await page.keyboard.press("Escape");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "À relire", exact: true })
    .click();
  const results = page.getByRole("dialog", {
    name: "Fichiers et dossiers tagués",
    exact: true,
  });
  await results.getByRole("button", { name: /document.txt/ }).waitFor();
  assert.equal(await results.locator("article.organization-record").count(), 3);
  await page.keyboard.press("Escape");
  await page.getByTitle("Précédent", { exact: true }).click();
  await readme.waitFor();
  console.log(
    "Sélecteur de tags : attribution multiple, création appliquée, renommage réutilisé et références de plusieurs dossiers : OK",
  );

  await readme.click();
  const beforeFailure = await store();
  await page.evaluate(() => {
    window.__tagSetBackup = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error("Stockage indisponible pour la recette");
    };
  });
  await openMenu();
  await menu
    .getByRole("menuitemcheckbox", { name: "Rouge", exact: true })
    .click();
  await menu
    .getByRole("alert")
    .getByText("Stockage indisponible pour la recette", { exact: true })
    .waitFor();
  assert.deepEqual(await store(), beforeFailure);
  await page.evaluate(() => {
    chrome.storage.local.set = window.__tagSetBackup;
  });
  await page.keyboard.press("Escape");
  await page
    .locator(".selectionbar")
    .getByRole("button", { name: "Tags", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Retirer tous les tags", exact: true })
    .click();
  await waitTag(files[0], "À relire", false);
  assert.equal(
    (await store()).files[files[0].replaceAll("\\", "/").toLowerCase()],
    undefined,
  );
  await waitTag(files[1], "À relire");
  await waitTag(files[2], "À relire");
  await page.keyboard.press("Escape");
  await page.reload();
  await readme.waitFor();
  assert.deepEqual(await hashes(), originalHashes);
  await waitTag(files[1], "À relire");

  const panel = await page.context().newPage();
  try {
    await panel.goto(new URL("?panel=1", page.url()).href);
    await panel.getByRole("tab", { name: "Fichiers", exact: true }).click();
    await panel.getByText("Organiser ce dossier", { exact: true }).click();
    await panel
      .getByRole("button", { name: "Tags du dossier…", exact: true })
      .click();
    const panelPicker = panel.getByRole("dialog", {
      name: "Modifier les tags",
      exact: true,
    });
    await panelPicker
      .getByRole("button", { name: "Vert", exact: true })
      .click();
    await waitTag(fixture, "Vert");
    await panel.screenshot({
      path: "test-results/quick-tags-panel.png",
      fullPage: true,
    });
  } finally {
    await panel.close();
  }

  await page.getByTitle("Masquer la navigation", { exact: true }).click();
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByTitle("Changer de thème", { exact: true }).click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openMenu();
      assert.equal(await menu.getByRole("menuitemcheckbox").count(), 7);
      const bounds = await menu.boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= 900,
      );
      await menu
        .getByRole("menuitemcheckbox", { name: "Projet client", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/quick-tags-menu-${theme}-${width}.png`,
        fullPage: true,
      });
      await menu.getByRole("menuitem", { name: "Tags…", exact: true }).click();
      await picker
        .getByRole("textbox", { name: "Nom du tag à ajouter", exact: true })
        .waitFor();
      assert.ok(
        await picker.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `test-results/quick-tags-picker-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
    }
  }
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await page.locator(".appbar .brand").click();
  assert.deepEqual(await hashes(), originalHashes);
  console.log(
    "Tags : échec de stockage sans mutation, retrait ciblé, persistance, dossier du panneau, thèmes et 320/390/1440 px, originaux intacts : OK",
  );
}
