import assert from "node:assert/strict";

export async function runLayoutJourney({ page }) {
  const pane = page.locator(".panes > .pane").first();
  const toggle = pane.getByRole("button", {
    name: "Filtres et organisation",
    exact: true,
  });
  const filters = pane.getByRole("region", {
    name: "Filtres et organisation",
    exact: true,
  });
  const readme = pane.getByRole("option", { name: /README.md/ });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await filters.isVisible(), false);
  assert.equal(
    await toggle.evaluate((button) =>
      button.nextElementSibling.classList.contains("filter"),
    ),
    true,
  );
  const closedTop = (await pane.getByRole("listbox").boundingBox()).y;
  await toggle.click();
  assert.ok((await pane.getByRole("listbox").boundingBox()).y > closedTop + 50);
  await filters
    .getByLabel("Type d’élément", { exact: true })
    .selectOption("directory");
  await readme.waitFor({ state: "hidden" });
  await toggle.click();
  assert.equal(await filters.isVisible(), false);
  assert.equal(await pane.getByRole("option").count(), 5);
  assert.equal(
    await toggle.locator(".organization-filter-count").textContent(),
    "1",
  );
  assert.ok(
    Math.abs((await pane.getByRole("listbox").boundingBox()).y - closedTop) < 2,
  );
  await toggle.click();
  await filters
    .getByRole("button", { name: "Effacer les filtres", exact: true })
    .click();
  await readme.waitFor();
  assert.equal(await toggle.locator(".organization-filter-count").count(), 0);
  await filters.getByLabel("Type d’élément", { exact: true }).press("Escape");
  assert.equal(await filters.isVisible(), false);
  assert.equal(
    await toggle.evaluate((button) => button === document.activeElement),
    true,
  );

  await page.getByTitle("Double panneau", { exact: true }).click();
  const otherToggle = page
    .locator(".panes > .pane")
    .nth(1)
    .getByRole("button", { name: "Filtres et organisation", exact: true });
  await toggle.click();
  assert.equal(await otherToggle.getAttribute("aria-expanded"), "false");
  assert.notEqual(
    await toggle.getAttribute("aria-controls"),
    await otherToggle.getAttribute("aria-controls"),
  );
  await toggle.click();
  await page.getByTitle("Double panneau", { exact: true }).click();

  const jobs = page.getByRole("complementary", {
    name: "Activité",
    exact: true,
  });
  const divider = page.getByRole("separator", {
    name: "Ajuster la largeur de l’activité",
    exact: true,
  });
  const openJobs = () =>
    page.getByRole("button", { name: "Activité", exact: true }).click();
  const width = () =>
    jobs.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    );
  const waitWidth = (expected) =>
    page.waitForFunction(
      (value) =>
        Math.round(
          document.querySelector(".jobs").getBoundingClientRect().width,
        ) === value,
      expected,
    );
  await openJobs();
  await waitWidth(280);
  const handle = await divider.boundingBox();
  await page.mouse.move(handle.x + 8, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + 8 - 120, handle.y + 100, { steps: 6 });
  await page.mouse.up();
  await waitWidth(400);
  await divider.press("ArrowLeft");
  await waitWidth(420);
  await divider.press("ArrowRight");
  await waitWidth(400);
  await divider.press("Home");
  await waitWidth(240);
  await divider.press("End");
  await waitWidth(640);
  await divider.dblclick();
  await waitWidth(280);
  await divider.press("ArrowLeft");
  await waitWidth(300);
  await jobs.getByTitle("Fermer l’activité", { exact: true }).click();
  await openJobs();
  await waitWidth(300);
  await page.reload();
  await readme.waitFor();
  await openJobs();
  await waitWidth(300);

  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByTitle("Changer de thème", { exact: true }).click();
    for (const viewportWidth of [320, 390, 900, 1440]) {
      await page.setViewportSize({ width: viewportWidth, height: 960 });
      await page.waitForFunction(() => {
        const jobs = document.querySelector(".jobs").getBoundingClientRect();
        return jobs.x >= 16 && jobs.right <= innerWidth;
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const grip = await divider.boundingBox();
      assert.ok(grip.x >= 0 && grip.x + grip.width <= viewportWidth);
      if (viewportWidth === 1440) assert.equal(await width(), 300);
      await page.screenshot({
        path: `test-results/layout-activity-${theme}-${viewportWidth}.png`,
        fullPage: true,
      });
    }
  }
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await divider.dblclick();
  await jobs.getByTitle("Fermer l’activité", { exact: true }).click();
  await page.getByTitle("Masquer la navigation", { exact: true }).click();
  for (const viewportWidth of [320, 390, 900, 1440]) {
    await page.setViewportSize({ width: viewportWidth, height: 960 });
    await toggle.click();
    await filters.getByLabel("Type d’élément", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      await filters.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    );
    const reset = filters.getByRole("button", {
      name: "Effacer les filtres",
      exact: true,
    });
    await reset.scrollIntoViewIfNeeded();
    const resetBounds = await reset.boundingBox();
    const filterBounds = await filters.boundingBox();
    assert.ok(
      resetBounds.y >= filterBounds.y &&
        resetBounds.y + resetBounds.height <=
          filterBounds.y + filterBounds.height,
    );
    await reset.click();
    await filters.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `test-results/layout-filters-${viewportWidth}.png`,
      fullPage: true,
    });
    await toggle.click();
  }
  await page.locator(".appbar .brand").click();
  const panelURL = new URL(page.url());
  panelURL.searchParams.set("panel", "1");
  await page.goto(panelURL.href);
  await page.locator(".app.sidepanel").waitFor();
  for (const height of [320, 600, 1200]) {
    await page.setViewportSize({ width: 420, height });
    const bounds = await page.locator(".app.sidepanel").boundingBox();
    assert.equal(bounds.y, 0);
    assert.equal(
      bounds.height,
      height,
      "Native panel must fit the available height",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
  }
  console.log(
    "Panneau natif : hauteur disponible 320/600/1200 px sans débordement de page : OK",
  );
  console.log(
    "Disposition : activité redimensionnable souris/clavier, bornes, fermeture/rechargement, thèmes et 320/390/900/1440 px ; filtres sans ligne à vide, indicateur actif, réinitialisation, Échap et panneaux indépendants : OK",
  );
}
