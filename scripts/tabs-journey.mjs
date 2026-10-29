import assert from "node:assert/strict";

export async function runTabsJourney({ page }) {
  const tabs = page.getByRole("tab");
  const nav = page.getByRole("complementary", {
    name: "Navigation de l’explorateur",
  });
  const readme = page.getByRole("option", { name: "README.md", exact: true });
  const document = page
    .locator(".pane")
    .first()
    .getByRole("option", { name: "document.txt", exact: true });
  const drives = page.getByRole("region", { name: "Ce PC", exact: true });
  await page
    .getByRole("option", { name: "Documents", exact: true })
    .click({ button: "middle" });
  await document.waitFor();
  await tabs.nth(0).click();
  await readme.waitFor();
  await tabs.nth(1).click();
  await document.waitFor();
  await nav.getByRole("button", { name: "Ce PC", exact: true }).click();
  await drives.waitFor();
  await tabs.nth(0).click();
  await readme.waitFor();
  await tabs.nth(1).click();
  await drives.waitFor();
  assert.equal(await page.locator(".appbar").count(), 1);
  assert.equal(await tabs.count(), 2);
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await document.waitFor();
  // The file list is created again when leaving Ce PC, so it must be observed again.
  await page.waitForFunction(
    () => document.querySelector(".pane")?.dataset.narrow === "false",
  );
  assert.ok(
    await page
      .getByRole("button", { name: "Affichage des fichiers", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Double panneau", exact: true })
    .click();
  assert.equal(await page.locator(".pane").count(), 2);
  await tabs.nth(0).click();
  await readme.waitFor();
  await tabs.nth(1).click();
  await document.waitFor();
  assert.equal(await page.locator(".pane").count(), 2);
  await nav.getByRole("button", { name: "Ce PC", exact: true }).click();
  await drives.waitFor();
  await page
    .getByRole("button", { name: "Nouvel onglet", exact: true })
    .click();
  await drives.waitFor();
  await page.locator(".workspace-tab.current .tab-close").click();
  await drives.waitFor();
  await page.reload();
  await drives.waitFor();
  await tabs.nth(0).click();
  await readme.waitFor();
  await tabs.nth(1).click();
  await drives.waitFor();
  await page.screenshot({ path: "test-results/tabs-switch.png" });
  console.log(
    "Onglets : allers-retours entre dossiers, Ce PC, retour aux fichiers et double panneau sans disparition de l’interface : OK",
  );
}
