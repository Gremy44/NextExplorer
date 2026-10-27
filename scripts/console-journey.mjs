import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function runConsoleJourney({ page, fixture }) {
  const child = path.join(fixture, "Console [été] ' dossier");
  await mkdir(child, { recursive: true });
  const toggle = page.getByRole("button", { name: "Aperçu", exact: true });
  if ((await toggle.getAttribute("aria-pressed")) !== "true")
    await toggle.click();
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  await details.getByRole("button", { name: "Console", exact: true }).click();
  const consolePane = details.getByRole("region", {
    name: "Console PowerShell",
    exact: true,
  });
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector(".console-pane")?.dataset.ready === "true",
    );
  const at = (folder) =>
    page.waitForFunction(
      (value) =>
        document.querySelector(".console-path")?.textContent === value &&
        document.querySelector(".console-pane")?.dataset.ready === "true",
      folder,
    );
  const input = consolePane.getByRole("textbox", {
    name: "Saisir une commande PowerShell",
    exact: true,
  });
  const type = async (text) => {
    await input.pressSequentially(text);
  };
  const command = async (text) => {
    await type(text);
    await page.keyboard.press("Enter");
  };
  const navigate = async (folder, index = 0) => {
    const pane = page.locator(".panes > .pane").nth(index);
    await pane.getByTitle("Saisir un chemin", { exact: true }).click();
    const address = pane.getByRole("textbox", {
      name: "Chemin du dossier",
      exact: true,
    });
    await address.fill(folder);
    await address.press("Enter");
    await pane
      .locator(".breadcrumbs")
      .getByRole("button", { name: path.basename(folder), exact: true })
      .waitFor();
  };
  const file = async (name, folder = fixture) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const content = await readFile(path.join(folder, name), "utf8");
        if (content) return content;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`PowerShell did not create ${name}`);
  };
  await at(fixture);
  console.log("Console : session initiale prête");
  const session = await consolePane.getAttribute("data-session");
  await command(
    "$nextExplorerValue = 'session-conservee'; Set-Content -LiteralPath 'console-result.txt' -Value $nextExplorerValue",
  );
  assert.match(await file("console-result.txt"), /session-conservee/);
  await ready();
  const colorsButton = consolePane.getByRole("button", {
    name: "Apparence du terminal",
    exact: true,
  });
  const colorsDialog = page.getByRole("dialog", {
    name: "Apparence du terminal",
    exact: true,
  });
  const palette = colorsDialog.getByRole("combobox", {
    name: "Palette du terminal",
    exact: true,
  });
  const font = colorsDialog.getByRole("combobox", {
    name: "Police du terminal",
    exact: true,
  });
  const fontSize = colorsDialog.getByRole("combobox", {
    name: "Taille de la police du terminal",
    exact: true,
  });
  const lineHeight = colorsDialog.getByRole("combobox", {
    name: "Interligne du terminal",
    exact: true,
  });
  const expectFont = (family, size = 13) =>
    page.waitForFunction(
      ([family, size]) => {
        const row = document.querySelector(".xterm-rows");
        return (
          row &&
          getComputedStyle(row).fontFamily.includes(family) &&
          getComputedStyle(row).fontSize === `${size}px`
        );
      },
      [family, size],
    );
  const background = () =>
    consolePane
      .locator(".console-terminal")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  const expectBackground = (color) =>
    page.waitForFunction(
      (value) =>
        getComputedStyle(document.querySelector(".console-terminal"))
          .backgroundColor === value,
      color,
    );
  await colorsButton.focus();
  await colorsButton.press("Enter");
  await colorsDialog.waitFor();
  assert.equal(
    await palette.evaluate((element) => element === document.activeElement),
    true,
  );
  for (const [choice, color] of [
    ["dark", "rgb(12, 12, 12)"],
    ["light", "rgb(255, 255, 255)"],
    ["blue", "rgb(1, 36, 86)"],
    ["ubuntu", "rgb(48, 10, 36)"],
    ["dracula", "rgb(40, 42, 54)"],
    ["nord", "rgb(46, 52, 64)"],
    ["solarized-dark", "rgb(0, 43, 54)"],
    ["solarized-light", "rgb(253, 246, 227)"],
    ["lcd", "rgb(197, 207, 173)"],
  ]) {
    await palette.selectOption(choice);
    await expectBackground(color);
    assert.equal(await consolePane.getAttribute("data-session"), session);
    if (choice === "ubuntu") {
      await consolePane
        .getByRole("note")
        .filter({ hasText: "PowerShell, pas Bash" })
        .waitFor();
      await expectFont("NextExplorer Ubuntu Mono");
      await page.screenshot({ path: "test-results/console-theme-ubuntu.png" });
    } else {
      assert.equal(await consolePane.getByRole("note").count(), 0);
    }
    if (choice === "dracula") await expectFont("NextExplorer JetBrains Mono");
    if (choice === "nord") await expectFont("NextExplorer Cascadia Mono");
    if (choice === "lcd") {
      await expectFont("NextExplorer Cascadia Mono");
      await page.screenshot({ path: "test-results/console-theme-lcd.png" });
    }
  }
  await font.selectOption("ubuntu");
  await fontSize.selectOption("16");
  await expectFont("NextExplorer Ubuntu Mono", 16);
  const rowHeight = await consolePane
    .locator(".xterm-rows > div")
    .first()
    .evaluate((row) => row.getBoundingClientRect().height);
  await lineHeight.selectOption("1.3");
  await page.waitForFunction(
    (height) =>
      document.querySelector(".xterm-rows > div")?.getBoundingClientRect()
        .height > height,
    rowHeight,
  );
  const fontFaces = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.family.startsWith("NextExplorer"))
      .map((face) => ({ family: face.family, status: face.status })),
  );
  assert.equal(fontFaces.length, 4);
  assert.ok(
    fontFaces.every((face) => face.status === "loaded"),
    JSON.stringify(fontFaces),
  );
  await palette.selectOption("blue");
  await expectFont("NextExplorer Ubuntu Mono", 16);
  await palette.press("Escape");
  await colorsDialog.waitFor({ state: "hidden" });
  await page.getByTitle("Changer de thème", { exact: true }).click();
  assert.equal(await background(), "rgb(1, 36, 86)");
  await colorsButton.click();
  await palette.selectOption("interface");
  await page.waitForFunction(() => {
    // The terminal uses the opaque surface token; the surrounding glass pane can be translucent.
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--panel)";
    document.querySelector(".console-terminal").append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return (
      getComputedStyle(document.querySelector(".console-terminal"))
        .backgroundColor === expected
    );
  });
  await palette.selectOption("custom");
  for (const [label, color] of [
    ["Couleur de fond du terminal", "#16202a"],
    ["Couleur du texte du terminal", "#c8f5d2"],
  ]) {
    await colorsDialog
      .getByLabel(label, { exact: true })
      .evaluate((element, value) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }, color);
    await page.waitForFunction(
      ([key, value]) =>
        JSON.parse(localStorage.getItem("nextexplorer:console-colors"))[key] ===
        value,
      [
        label.startsWith("Couleur de fond") ? "background" : "foreground",
        color,
      ],
    );
  }
  await expectBackground("rgb(22, 32, 42)");
  assert.equal(await palette.inputValue(), "custom");
  await page.screenshot({ path: "test-results/console-colors-custom.png" });
  await details.getByRole("button", { name: "Sélection", exact: true }).click();
  await colorsDialog.waitFor({ state: "hidden" });
  await details.getByRole("button", { name: "Console", exact: true }).click();
  await toggle.click();
  await toggle.click();
  assert.equal(await consolePane.getAttribute("data-session"), session);
  await command(
    "Set-Content -LiteralPath 'console-retained.txt' -Value $nextExplorerValue",
  );
  assert.match(await file("console-retained.txt"), /session-conservee/);
  await ready();

  await page.getByTitle("Double panneau", { exact: true }).click();
  await navigate(child, 1);
  await at(child);
  await page
    .locator(".panes > .pane")
    .first()
    .locator(".folder-heading")
    .click();
  await at(fixture);
  await page.getByTitle("Double panneau", { exact: true }).click();
  await page
    .getByRole("button", { name: "Nouvel onglet", exact: true })
    .click();
  await navigate(child);
  await at(child);
  await page.locator(".tab-select").first().click();
  await at(fixture);
  assert.equal(await consolePane.getAttribute("data-session"), session);

  await type("Write-Output 'saisie-conservee");
  await navigate(child);
  await consolePane
    .getByRole("status")
    .filter({ hasText: "Changement de dossier en attente" })
    .waitFor();
  assert.equal(
    await consolePane.locator(".console-path").textContent(),
    fixture,
  );
  await type("'");
  await page.keyboard.press("Enter");
  await at(child);
  const follow = consolePane.getByRole("button", {
    name: "Suivre le dossier",
    exact: true,
  });
  await follow.click();
  await navigate(fixture);
  assert.equal(await follow.getAttribute("aria-pressed"), "false");
  assert.equal(await consolePane.locator(".console-path").textContent(), child);
  await follow.click();
  await at(fixture);

  await command("Start-Sleep -Seconds 30");
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "false",
  );
  await navigate(child);
  await consolePane
    .getByRole("status")
    .filter({ hasText: "Changement de dossier en attente" })
    .waitFor();
  assert.equal(
    await consolePane.locator(".console-path").textContent(),
    fixture,
  );
  await consolePane
    .getByRole("button", { name: "Interrompre la commande", exact: true })
    .click();
  await at(child);
  await details
    .getByRole("button", { name: "Agrandir le volet d’aperçu", exact: true })
    .click();
  await page.screenshot({ path: "test-results/console-expanded.png" });
  await details
    .getByRole("button", { name: "Réduire le volet d’aperçu", exact: true })
    .click();
  await page.setViewportSize({ width: 900, height: 780 });
  await command(
    "Set-Content -LiteralPath 'console-resized.txt' -Value 'resize-ok'",
  );
  assert.match(await file("console-resized.txt", child), /resize-ok/);
  await ready();
  await page.screenshot({ path: "test-results/console-compact.png" });
  assert.ok(
    await consolePane.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  );
  await page.getByTitle("Masquer la navigation", { exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await consolePane
      .getByRole("button", { name: "Interrompre la commande", exact: true })
      .waitFor();
    assert.ok(
      await consolePane.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    assert.ok(
      (await consolePane.locator(".console-terminal").boundingBox()).height >=
        70,
    );
    await page.getByTitle("Changer de thème", { exact: true }).click();
    await command(`Write-Output 'affichage-${width}'`);
    await consolePane
      .locator(".xterm-screen")
      .filter({ hasText: `affichage-${width}` })
      .waitFor();
    await page.screenshot({ path: `test-results/console-${width}.png` });
    await colorsButton.click();
    const colorBounds = await colorsDialog.boundingBox();
    assert.ok(colorBounds.x >= 0 && colorBounds.x + colorBounds.width <= width);
    assert.ok(colorBounds.y >= 0 && colorBounds.y + colorBounds.height <= 900);
    await page.screenshot({ path: `test-results/console-colors-${width}.png` });
    await palette.press("Escape");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await consolePane
    .getByRole("button", { name: "Fermer la session PowerShell", exact: true })
    .click();
  await consolePane
    .getByRole("status")
    .filter({ hasText: "Session terminée" })
    .waitFor();
  await consolePane
    .getByRole("button", {
      name: "Ouvrir une nouvelle session PowerShell",
      exact: true,
    })
    .click();
  await at(child);
  assert.notEqual(await consolePane.getAttribute("data-session"), session);
  await command("exit");
  await consolePane
    .getByRole("status")
    .filter({ hasText: "Session terminée" })
    .waitFor();
  await page.reload();
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  await details.getByRole("button", { name: "Console", exact: true }).click();
  await ready();
  await expectBackground("rgb(22, 32, 42)");
  await colorsButton.click();
  assert.equal(await palette.inputValue(), "custom");
  assert.equal(await font.inputValue(), "ubuntu");
  assert.equal(await fontSize.inputValue(), "16");
  assert.equal(await lineHeight.inputValue(), "1.3");
  await expectFont("NextExplorer Ubuntu Mono", 16);
  assert.equal(
    await colorsDialog
      .getByLabel("Couleur du texte du terminal", { exact: true })
      .inputValue(),
    "#c8f5d2",
  );
  await palette.press("Escape");
  await consolePane
    .getByRole("button", { name: "Fermer la session PowerShell", exact: true })
    .click();
  console.log(
    "Console réelle : thèmes complets/Ubuntu explicitement PowerShell, trois polices locales chargées, taille/interligne en direct sans redémarrage, réglages mémorisés après rechargement, clavier/320/390 px ; session conservée, suivi différé, chemin Unicode/apostrophe, épinglage, Ctrl+C et relance : OK",
  );
}
