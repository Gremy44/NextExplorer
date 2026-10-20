import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function runSpaceJourney({ page, fixture, reads }) {
  const folder = path.join(fixture, "Analyse ergonomie");
  const child = path.join(folder, "Sous-dossier");
  await mkdir(child, { recursive: true });
  const longName =
    "Rapport annuel avec un nom complet qui reste lisible au survol et au clavier.txt";
  const files = [
    [path.join(folder, "Fichier principal.bin"), 1024 * 1024],
    [path.join(folder, longName), 200000],
    [path.join(folder, "Image de test.bin"), 180000],
    [path.join(child, "document.txt"), 250000],
    ...Array.from({ length: 90 }, (_, i) => [
      path.join(folder, `Petit-${String(i).padStart(2, "0")}.txt`),
      i + 1024,
    ]),
  ];
  await Promise.all(
    files.map(([file, bytes]) => writeFile(file, Buffer.alloc(bytes, 65))),
  );
  const hashes = () =>
    Promise.all(
      files.map(async ([file]) =>
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ),
    );
  const before = await hashes();
  const readCount = reads.length;
  await page
    .getByRole("option", { name: "Analyse ergonomie", exact: true })
    .dblclick();
  const scan = async () => {
    await page.keyboard.press("Control+k");
    await page
      .locator(".palette-search input")
      .fill("Analyser l’espace disque");
    await page
      .locator(".command-list")
      .getByRole("button", { name: "Analyser l’espace disque", exact: true })
      .click();
  };
  await scan();
  const analysis = page.getByRole("region", {
    name: "Analyse de l’espace disque",
    exact: true,
  });
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  const divider = page.getByRole("separator", {
    name: "Ajuster la largeur de l’aperçu",
    exact: true,
  });
  const map = analysis.locator(".space-map");
  const tooltip = page.getByRole("tooltip");
  await page.waitForFunction(
    () => document.querySelectorAll(".space-items > button").length === 80,
  );
  assert.equal(await map.getByRole("button").count(), 41);
  assert.equal(await page.getByRole("dialog").count(), 0);
  const colors = await map
    .getByRole("button")
    .evaluateAll((buttons) => [
      ...new Set(
        buttons.map((button) => getComputedStyle(button).backgroundColor),
      ),
    ]);
  assert.equal(colors.length, 6);
  assert.ok(
    await map
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.every(
          (button) => getComputedStyle(button).color === "rgb(255, 255, 255)",
        ),
      ),
  );
  const small = map.getByRole("button", { name: /Petit-89/ });
  assert.equal(await small.locator("span").count(), 0);
  await small.hover();
  await tooltip.getByText("Petit-89.txt", { exact: true }).waitFor();
  assert.ok(
    (await tooltip.textContent()).includes(path.join(folder, "Petit-89.txt")),
  );
  assert.ok((await tooltip.textContent()).includes("< 0,1 %"));
  await page.screenshot({
    path: "test-results/space-tooltip-small.png",
    fullPage: true,
  });
  await small.focus();
  await tooltip.waitFor();
  assert.equal(
    await small.getAttribute("aria-describedby"),
    await tooltip.getAttribute("id"),
  );
  await page.keyboard.press("Escape");
  await tooltip.waitFor({ state: "hidden" });
  await analysis
    .getByRole("button", { name: "Actualiser", exact: true })
    .focus();
  const initialWidth = (await details.boundingBox()).width;
  const grip = await divider.boundingBox();
  await page.mouse.move(grip.x + 8, grip.y + 120);
  await page.mouse.down();
  await page.mouse.move(grip.x + 8 - 390, grip.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelector(".details-pane").getBoundingClientRect().width >
      640,
  );
  assert.ok((await details.boundingBox()).width > initialWidth + 350);
  await divider.press("End");
  const maximum = Number(await divider.getAttribute("aria-valuemax"));
  assert.ok(maximum > 640);
  assert.ok(Math.abs((await details.boundingBox()).width - maximum) < 2);
  await divider.press("ArrowRight");
  const savedWidth = Number(await divider.getAttribute("aria-valuenow"));
  assert.equal(savedWidth, maximum - 20);
  await details
    .getByRole("button", { name: "Agrandir le volet d’aperçu", exact: true })
    .click();
  assert.equal(await page.locator(".panes").isVisible(), false);
  assert.equal(await divider.isVisible(), false);
  assert.ok((await details.boundingBox()).width > savedWidth + 100);
  await page.screenshot({
    path: "test-results/space-expanded-dark.png",
    fullPage: true,
  });
  await analysis
    .locator(".space-items button")
    .filter({ hasText: "Sous-dossier" })
    .click();
  await page
    .getByRole("option", { name: "document.txt", exact: true })
    .waitFor();
  assert.equal(await page.locator(".panes").isVisible(), true);
  await analysis.waitFor();
  assert.ok(
    (await analysis.locator(".space-path").textContent()).includes(folder),
  );
  await details.getByRole("button", { name: "Sélection", exact: true }).click();
  await analysis.waitFor({ state: "hidden" });
  await details
    .getByRole("button", { name: "Espace disque", exact: true })
    .click();
  await analysis.waitFor();
  console.log(
    "Espace disque : six couleurs, petites surfaces au survol/clavier, largeur > 640 px, agrandissement et navigation conservant le résultat : OK",
  );
  await analysis
    .getByRole("button", { name: "Voir 80 éléments de plus", exact: true })
    .click();
  assert.equal(await analysis.locator(".space-items > button").count(), 94);
  await analysis
    .getByRole("button", { name: "Actualiser", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".space-items > button").length === 80,
  );
  await analysis
    .getByRole("button", { name: "Fermer l’analyse", exact: true })
    .click();
  await page.reload();
  await details.waitFor();
  await page.waitForFunction(
    (width) =>
      Number(
        document
          .querySelector(".details-divider")
          .getAttribute("aria-valuenow"),
      ) === width,
    savedWidth,
  );
  await page.getByTitle("Précédent", { exact: true }).click();
  await scan();
  await map.getByRole("button").first().waitFor();
  await divider.dblclick();
  assert.equal(await divider.getAttribute("aria-valuenow"), "330");
  await page.getByTitle("Masquer la navigation", { exact: true }).click();
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByTitle("Changer de thème", { exact: true }).click();
    for (const width of [320, 390, 900, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await details
        .getByRole("button", {
          name: "Agrandir le volet d’aperçu",
          exact: true,
        })
        .click();
      await map
        .getByRole("button", {
          name: new RegExp("Ouvrir " + longName.replaceAll(".", "\\.")),
        })
        .hover();
      await tooltip.getByText(longName, { exact: true }).waitFor();
      const bounds = await tooltip.boundingBox();
      assert.ok(bounds.width >= Math.min(380, width - 16));
      assert.ok(
        await tooltip.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        ),
      );
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y + bounds.height <= 1000,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.ok(
        await details.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      );
      await page.screenshot({
        path: `test-results/space-${theme}-${width}.png`,
        fullPage: true,
      });
      await details
        .getByRole("button", { name: "Réduire le volet d’aperçu", exact: true })
        .click();
    }
  }
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await page.locator(".appbar .brand").click();
  assert.equal(
    reads.length,
    readCount,
    "aucune lecture de contenu par le navigateur pour cette analyse",
  );
  assert.deepEqual(await hashes(), before);
  assert.equal((await readdir(folder)).length, 94);
  console.log(
    "Espace disque : actualisation/pagination, largeur mémorisée, thèmes, 320/390/900/1440 px et originaux intacts sans lecture de contenu dans Chrome : OK",
  );
}
