import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import path from "node:path";

export async function runDropTransferJourney({ page, fixture, transfers }) {
  const destination = path.join(fixture, "Exports");
  const nested = path.join(destination, "Sous-cible");
  await mkdir(nested);
  for (const name of ["deplacer.txt", "groupe-a.txt", "groupe-b.txt"])
    await writeFile(path.join(fixture, name), `Contenu ${name}`);
  const menu = page.getByRole("menu", {
    name: "Déplacer ou dupliquer les fichiers",
    exact: true,
  });
  const panes = page.locator(".pane");
  const source = (name) =>
    panes.nth(0).getByRole("option", { name, exact: true });
  await page
    .getByRole("button", { name: "Double panneau", exact: true })
    .click();
  await panes.nth(1).locator(".edit-path").click();
  await panes
    .nth(1)
    .getByLabel("Chemin du dossier", { exact: true })
    .fill(destination);
  await panes
    .nth(1)
    .getByLabel("Chemin du dossier", { exact: true })
    .press("Enter");
  await panes
    .nth(1)
    .getByRole("option", { name: "Sous-cible", exact: true })
    .waitFor();
  const drop = async (name, target = panes.nth(1).locator(".pathbar")) => {
    await source(name).dragTo(target);
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem").count(), 2);
    assert.equal(await page.getByRole("dialog").count(), 0);
  };
  const waitForFile = async (filename) => {
    const deadline = Date.now() + 12000;
    while (true) {
      try {
        return await readFile(filename, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT" || Date.now() >= deadline) throw error;
        await wait(40);
      }
    }
  };

  const before = transfers.length;
  await drop("brief.txt");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  assert.equal(transfers.length, before, "Échap ne lance aucune opération");
  await drop("brief.txt");
  await menu.getByRole("menuitem", { name: "Dupliquer", exact: true }).click();
  const brief = await readFile(path.join(fixture, "brief.txt"), "utf8");
  assert.equal(await waitForFile(path.join(destination, "brief.txt")), brief);
  assert.equal(await readFile(path.join(fixture, "brief.txt"), "utf8"), brief);
  assert.equal(transfers.length, before + 1);
  assert.equal(transfers.at(-1).mode, "copy");

  await drop("brief.txt");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(
    await waitForFile(path.join(destination, "brief (1).txt")),
    brief,
  );
  assert.equal(
    await readFile(path.join(destination, "brief.txt"), "utf8"),
    brief,
  );
  assert.equal(transfers.at(-1).conflict, "rename");

  await drop("deplacer.txt");
  await menu.getByRole("menuitem", { name: "Déplacer", exact: true }).click();
  assert.equal(
    await waitForFile(path.join(destination, "deplacer.txt")),
    "Contenu deplacer.txt",
  );
  await source("deplacer.txt").waitFor({ state: "hidden" });
  await assert.rejects(stat(path.join(fixture, "deplacer.txt")), {
    code: "ENOENT",
  });
  assert.equal(transfers.at(-1).mode, "move");

  await source("groupe-a.txt").click();
  await source("groupe-b.txt").click({ modifiers: ["Control"] });
  await drop(
    "groupe-a.txt",
    panes.nth(1).getByRole("option", { name: "Sous-cible", exact: true }),
  );
  await menu.getByRole("menuitem", { name: "Dupliquer", exact: true }).click();
  for (const name of ["groupe-a.txt", "groupe-b.txt"])
    assert.equal(
      await waitForFile(path.join(nested, name)),
      await readFile(path.join(fixture, name), "utf8"),
    );
  assert.equal(transfers.at(-1).paths.length, 2);
  assert.equal(transfers.at(-1).destination, nested);
  assert.equal(
    transfers.length,
    before + 4,
    "un seul transfert par choix, même sur un sous-dossier",
  );

  const count = transfers.length;
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.evaluate(
      ({ filename }) => {
        const dataTransfer = new DataTransfer();
        const source = document.querySelector(
          '.pane [role="option"][aria-label="brief.txt"]',
        );
        if (!source) throw Error(`Source absente : ${filename}`);
        source.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
        document.querySelectorAll(".pane")[1].dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: innerWidth - 1,
            clientY: innerHeight - 1,
          }),
        );
        source.dispatchEvent(
          new DragEvent("dragend", { bubbles: true, dataTransfer }),
        );
      },
      { filename: path.join(fixture, "brief.txt") },
    );
    await menu.waitFor();
    await menu.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))),
    );
    const box = await menu.boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= width &&
        box.y >= 0 &&
        box.y + box.height <= 640,
    );
    await page.screenshot({ path: `test-results/drop-transfer-${width}.png` });
    await page.keyboard.press("Tab");
    await menu.waitFor({ state: "hidden" });
  }
  assert.equal(transfers.length, count, "quitter le menu n’exécute rien");
  await drop("brief.txt");
  await page.locator(".appbar .brand").click();
  await menu.waitFor({ state: "hidden" });
  assert.equal(transfers.length, count, "cliquer ailleurs annule le dépôt");
  await page.evaluate(
    (filename) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData(
        "application/x-nextexplorer",
        JSON.stringify([filename]),
      );
      document
        .querySelectorAll(".pane")[1]
        .dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
    },
    path.join(fixture, "brief.txt"),
  );
  await page
    .getByRole("dialog", { name: "Transférer les fichiers", exact: true })
    .waitFor();
  assert.equal(
    transfers.length,
    count,
    "un type MIME externe ne permet pas l’exécution directe",
  );
  await page.keyboard.press("Escape");
  console.log(
    "Dépôt : deux choix sans modale, copie/déplacement réels, collision numérotée sans écrasement, sélection multiple vers un sous-dossier, clavier/annulation et bords 320/390/1440 px : OK",
  );
}
