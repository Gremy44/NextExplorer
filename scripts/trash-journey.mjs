import assert from "node:assert/strict";
import { readFile, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export async function runTrashJourney({ page, fixture, trashes }) {
  const names = ["corbeille-directe.txt", "corbeille-a.txt", "corbeille-b.txt"];
  for (const name of names)
    await writeFile(path.join(fixture, name), `Original ${name}`);
  const entry = (name) => page.getByRole("option", { name, exact: true });
  await entry(names[0]).waitFor();
  await entry(names[0]).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Mettre à la corbeille", exact: true })
    .click();
  await entry(names[0]).waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  await assert.rejects(stat(path.join(fixture, names[0])), { code: "ENOENT" });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Corbeille", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Corbeille NextExplorer",
    exact: true,
  });
  await writeFile(path.join(fixture, names[0]), "Nouveau fichier à conserver");
  await dialog.getByRole("button", { name: "Restaurer", exact: true }).click();
  await page.getByText("la destination existe déjà", { exact: true }).waitFor();
  assert.equal(
    await readFile(path.join(fixture, names[0]), "utf8"),
    "Nouveau fichier à conserver",
  );
  assert.equal(await dialog.locator(".trash-row").count(), 1);
  await unlink(path.join(fixture, names[0]));
  await dialog.getByRole("button", { name: "Restaurer", exact: true }).click();
  await entry(names[0]).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await readFile(path.join(fixture, names[0]), "utf8"),
    `Original ${names[0]}`,
  );
  await entry(names[1]).click();
  await entry(names[2]).click({ modifiers: ["Control"] });
  await page.locator(".file-scroll").focus();
  await page.evaluate(() => {
    const target = document.activeElement;
    for (const repeat of [false, true])
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Delete",
          repeat,
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  for (const name of names.slice(1))
    await entry(name).waitFor({ state: "hidden" });
  assert.equal(
    trashes.length,
    2,
    "le raccourci répété ne duplique pas la mise à la corbeille",
  );
  assert.equal(trashes[1].paths.length, 2);
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.reload();
  await entry(names[0]).waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Corbeille", exact: true })
    .click();
  await dialog.locator(".trash-row").nth(1).waitFor();
  assert.equal(await dialog.locator(".trash-row").count(), 2);
  for (const name of names.slice(1)) {
    await dialog
      .getByRole("button", { name: "Restaurer", exact: true })
      .first()
      .click();
    await entry(name).waitFor();
    assert.equal(
      await readFile(path.join(fixture, name), "utf8"),
      `Original ${name}`,
    );
  }
  await page.keyboard.press("Escape");
  console.log(
    "Corbeille directe : clic droit sans modale, sélection multiple/Suppr, répétition bloquée, historique après rechargement et restauration exacte : OK",
  );
}
