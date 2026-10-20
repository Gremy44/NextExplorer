import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Public gallery uses actual released UI and synthetic files; Store captures stay separate.
export async function runPresentationScreenshots({ page, context, fixture }) {
  const output = "release/presentation/images";
  await mkdir(output, { recursive: true });
  for (const folder of ["Documents", "Images", "Site web", "Livrables"])
    await mkdir(path.join(fixture, folder), { recursive: true });
  await writeFile(
    path.join(fixture, "Brief du projet.md"),
    `# Projet Atlas

Un site à préparer. Tous les éléments du projet, au même endroit.

## Notre prochaine publication

- Retrouver les références et les pages du projet.
- Préparer les visuels pour le web.
- Vérifier les fichiers avant de les déposer sur le site.

## Un espace pour travailler

Les documents, les images et le code restent dans leurs dossiers locaux.
Le navigateur accueille les pages, les outils et la console.

*Projet de démonstration · aucun document personnel.*
`,
  );
  await writeFile(
    path.join(fixture, "Notes.txt"),
    "Projet fictif : préparer les images et vérifier la publication.\n".repeat(
      140,
    ),
  );
  await writeFile(
    path.join(fixture, "Livrables", "Publication.txt"),
    "Livrable fictif : vérifier les liens, les illustrations et les documents.\n".repeat(
      180,
    ),
  );
  await writeFile(
    path.join(fixture, "Site web", "README.md"),
    "# Atlas\n\nSite de démonstration, sans service externe.\n",
  );
  await writeFile(
    path.join(fixture, "Site web", "index.html"),
    '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Atlas</title><h1>Un nouveau départ.</h1></html>\n',
  );
  await writeFile(
    path.join(fixture, "Site web", "styles.css"),
    "body { font-family: system-ui; background: #eef3eb; color: #173b2b; }\n",
  );
  execFileSync(
    "git",
    ["-C", path.join(fixture, "Site web"), "init", "--quiet"],
    { windowsHide: true },
  );
  const art = await context.newPage();
  try {
    await art.setViewportSize({ width: 1200, height: 720 });
    await art.setContent(`<!doctype html><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#edf2e9;color:#183a2b;font-family:Georgia,serif;width:1200px;height:720px;padding:86px;overflow:hidden}
      small{font:20px system-ui;letter-spacing:2px}h1{font-size:100px;line-height:1.05;font-weight:400;margin:62px 0 32px;width:720px}p{font:24px system-ui;color:#44614f}
      .sun{position:absolute;right:90px;top:90px;width:140px;height:140px;border-radius:100%;background:#e8a56a}.hill{position:absolute;right:-60px;bottom:-160px;width:550px;height:470px;border-radius:100% 100% 0 0;background:#89a78c;transform:rotate(-24deg)}
      </style><small>Atlas · carnet de voyage</small><h1>Un nouveau<br>départ.</h1><p>Prendre le temps de découvrir.</p><div class="sun"></div><div class="hill"></div>`);
    await art.screenshot({
      path: path.join(fixture, "Images", "Couverture Atlas.png"),
    });
  } finally {
    await art.close();
  }
  await writeFile(
    path.join(fixture, "Documents", "Planning.md"),
    "# Planning de démonstration\n\nPréparer les contenus, vérifier les ressources et publier.\n".repeat(
      220,
    ),
  );
  const pane = (folder, viewMode = "details") => ({ path: folder, viewMode });
  const tab = (folder) => ({
    panes: [pane(folder), pane(folder)],
    active: 0,
    dual: false,
    split: 50,
  });
  const tabs = [
    tab(fixture),
    tab(path.join(fixture, "Images")),
    tab(path.join(fixture, "Site web")),
  ];
  await page.evaluate(
    ({ tabs, fixture }) => {
      localStorage.setItem(
        "nextexplorer:tabs:page",
        JSON.stringify({ tabs, current: 0 }),
      );
      localStorage.setItem("nextexplorer:details", "true");
      localStorage.setItem("nextexplorer:details-width", "620");
      return chrome.storage.local.set({
        favorites: [{ name: "Projet Atlas", path: fixture }],
      });
    },
    { tabs, fixture },
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  const collapse = page.getByTitle("Replier la collecte", { exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const files = () =>
    page.getByRole("listbox", { name: "Fichiers", exact: true }).first();
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  const shot = async (name) => {
    await page.mouse.move(8, 1070);
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.screenshot({ path: `${output}/${name}.png` });
    assert.equal(bytes.readUInt32BE(16), 1920);
    assert.equal(bytes.readUInt32BE(20), 1080);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  };
  await files().getByText("Brief du projet.md", { exact: true }).click();
  await details
    .getByRole("heading", { name: "Projet Atlas", exact: true })
    .waitFor();
  await shot("explorateur-1920");

  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await page.getByTitle("Double panneau", { exact: true }).click();
  await files().getByText("Images", { exact: true }).dblclick();
  await files().getByText("Couverture Atlas.png", { exact: true }).waitFor();
  await page
    .locator(".panes > .pane")
    .first()
    .getByRole("button", { name: "Affichage des fichiers", exact: true })
    .click();
  await page
    .locator(".panes > .pane")
    .first()
    .locator('.file-options-menu [data-value="large-icons"]')
    .click();
  await shot("double-panneau-1920");

  // Return to one pane before opening a wide console in the code directory.
  await page.getByTitle("Double panneau", { exact: true }).click();
  await page.getByTitle("Dossier parent", { exact: true }).click();
  await files().getByText("Brief du projet.md", { exact: true }).waitFor();
  await page.getByRole("tab", { name: /Site web/ }).click();
  await files().getByText("index.html", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await details.getByRole("button", { name: "Console", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "true",
  );
  const divider = page.getByRole("separator", {
    name: "Ajuster la largeur de l’aperçu",
    exact: true,
  });
  const grip = await divider.boundingBox();
  await page.mouse.move(grip.x + 8, grip.y + 100);
  await page.mouse.down();
  await page.mouse.move(920, grip.y + 100, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Apparence du terminal", exact: true })
    .click();
  const palette = page.getByRole("combobox", {
    name: "Palette du terminal",
    exact: true,
  });
  await palette.selectOption("dracula");
  await page
    .getByRole("combobox", {
      name: "Taille de la police du terminal",
      exact: true,
    })
    .selectOption("18");
  await palette.press("Escape");
  const input = page.getByRole("textbox", {
    name: "Saisir une commande PowerShell",
    exact: true,
  });
  await input.pressSequentially("Get-ChildItem -Name");
  await input.press("Enter");
  await page
    .locator(".xterm-screen")
    .filter({ hasText: "styles.css" })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "true",
  );
  await shot("console-1920");
  await input.pressSequentially(
    "codex.cmd --no-daemon --no-alt-screen --sandbox read-only",
  );
  await input.press("Enter");
  // Capture only startup, never submit a model request or fabricate an agent response.
  await page.waitForTimeout(4500);
  if (
    (await page.locator(".xterm-screen").innerText()).includes(
      "Trust this folder?",
    )
  ) {
    // Only the synthetic Git project created above is trusted for this demonstration.
    await input.press("Enter");
    await page.waitForTimeout(5000);
  }
  const codexScreen = await page.locator(".xterm-screen").innerText();
  assert.match(codexScreen, /OpenAI Codex/);
  assert.match(codexScreen, /Ask Codex to do anything/);
  await writeFile("test-results/presentation-codex.txt", codexScreen);
  await shot("codex-1920");
  await page
    .getByRole("button", { name: "Fermer la session PowerShell", exact: true })
    .click();
  await page.goto(
    `${page.url().split("?")[0]}?path=${encodeURIComponent(fixture)}`,
  );
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  if (await collapse.isVisible()) await collapse.click();
  await page.keyboard.press("Control+k");
  await page.locator(".palette-search input").fill("Analyser l’espace disque");
  await page
    .locator(".command-list")
    .getByRole("button", { name: "Analyser l’espace disque", exact: true })
    .click();
  await page.locator(".space-map button").first().waitFor();
  await shot("espace-disque-1920");
  await page
    .getByRole("button", { name: "Fermer l’analyse", exact: true })
    .click();
  await page.evaluate(() =>
    localStorage.removeItem("nextexplorer:console-colors"),
  );
  await page.evaluate((fixture) => {
    localStorage.removeItem("nextexplorer:details-width");
    localStorage.setItem(
      "nextexplorer:tabs:page",
      JSON.stringify({
        tabs: [
          {
            panes: [{ path: fixture }, { path: fixture }],
            active: 0,
            dual: false,
            split: 50,
          },
        ],
        current: 0,
      }),
    );
  }, fixture);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  console.log(
    "Présentation : captures réelles 1920×1080, projet fictif, lancement Codex sans requête au modèle.",
  );
}
