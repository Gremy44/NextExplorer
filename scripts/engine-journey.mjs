import assert from "node:assert/strict";

export async function runEngineJourney({ page, tools }) {
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Réglages et moteurs",
    exact: true,
  });
  const engines = dialog.getByRole("region", {
    name: "Fonctions supplémentaires",
    exact: true,
  });
  await engines.waitFor();
  const ready = tools.ffmpeg && tools.ffprobe ? "Prêt" : "À ajouter";
  await engines
    .getByRole("listitem", { name: `Vidéo et audio : ${ready}`, exact: true })
    .waitFor();
  assert.equal(await engines.locator("details[open]").count(), 0);
  assert.equal(
    await engines
      .getByRole("link", { name: "Comment ajouter les moteurs", exact: true })
      .getAttribute("href"),
    "https://github.com/Gremy44/NextExplorer-Downloads/blob/main/INSTALLATION.md#moteurs-et-limites",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await engines
      .getByRole("heading", { name: "Fonctions supplémentaires", exact: true })
      .scrollIntoViewIfNeeded();
    const bounds = await engines.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(
      await engines.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
      false,
    );
    await page.screenshot({ path: `test-results/engines-${width}.png` });
  }
  await dialog.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(
    "Moteurs : fonctions et manques réels, FFmpeg/FFprobe associés, diagnostic replié, guide, clavier et 320/390/1440 px : OK",
  );
}
