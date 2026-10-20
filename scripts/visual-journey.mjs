import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

export async function runVisualJourney({
  page,
  context,
  fixture,
  baseline = false,
}) {
  const output = `release/visual-preview/${baseline ? "before" : "after"}`;
  await mkdir(output, { recursive: true });
  const project = path.join(fixture, "Studio Nord");
  await mkdir(project);
  for (const name of ["Documents", "Images", "Livrables", "Sources"])
    await mkdir(path.join(project, name));
  for (const [name, content] of [
    [
      "Plan de lancement.md",
      "# Studio Nord\n\nUne nouvelle identité, pensée pour durer.\n\n## La prochaine étape\n\nPréparer une collection de visuels et les documents de présentation du projet.\n\n- Finaliser la direction artistique\n- Préparer les images pour le web\n- Rassembler les livrables\n\n## Notre espace de travail\n\nLes documents, les images et les liens restent réunis dans un même dossier.\n\n*Dossier de démonstration · fichiers synthétiques*",
    ],
    [
      "Notes de réunion.txt",
      "Préparer les visuels de la prochaine collection.\n",
    ],
    [
      "Planning.csv",
      "Étape,Statut\nDirection artistique,Validée\nVisuels,En cours\nPublication,À préparer\n",
    ],
    [
      "Palette.json",
      JSON.stringify({ graphite: "#252728", bleu: "#79b8e8" }, null, 2),
    ],
    ["Sources/README.md", "# Sources du projet de démonstration\n"],
  ])
    await writeFile(path.join(project, name), content);
  await writeFile(
    path.join(project, "Images/Aperçu.png"),
    await readFile("public/icon128.png"),
  );
  const tab = (folder) => ({
    panes: [0, 1].map(() => ({ path: folder, viewMode: "details" })),
    active: 0,
    dual: false,
    split: 50,
  });
  await page.evaluate(
    async ({ project, tabs }) => {
      localStorage.setItem(
        "nextexplorer:tabs:page",
        JSON.stringify({ tabs, current: 0 }),
      );
      localStorage.setItem("nextexplorer:details", "true");
      localStorage.setItem("nextexplorer:details-width", "380");
      await chrome.storage.local.set({
        lastPath: project,
        theme: "dark",
        favorites: [{ name: "Studio Nord", path: project }],
      });
    },
    {
      project,
      tabs: [
        tab(project),
        tab(path.join(project, "Images")),
        tab(path.join(project, "Sources")),
      ],
    },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.reload();
  await page.getByText("Compagnon connecté", { exact: true }).waitFor();
  const collapse = page.getByTitle("Replier la collecte", { exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const files = page
    .getByRole("listbox", { name: "Fichiers", exact: true })
    .first();
  await files
    .getByRole("option", { name: "Plan de lancement.md", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Volet d’aperçu", exact: true })
    .getByRole("heading", { name: "Studio Nord", exact: true })
    .waitFor();
  const shot = async (target, name) => {
    await target.mouse.move(1, 1);
    await target.evaluate(() => document.fonts.ready);
    await target
      .getByText("Lecture des métadonnées…", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await target.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      name,
    );
    await target.screenshot({
      path: `${output}/${name}.png`,
      animations: "disabled",
    });
  };
  await shot(page, "01-explorateur");
  if (!baseline) {
    assert.equal(await page.locator(".quicklinks").count(), 0);
    await page.getByTitle("Épingler un lien", { exact: true }).click();
    const pin = page.getByRole("dialog");
    await pin.waitFor();
    await pin.press("Escape");
    await pin.waitFor({ state: "hidden" });
  }
  await page.getByTitle("Nouveau dossier", { exact: true }).click();
  await page
    .getByRole("dialog", { name: "Nouveau dossier", exact: true })
    .waitFor();
  await shot(page, "03-dialogue");
  await page.getByRole("dialog").press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByTitle("Réglages", { exact: true }).click();
  await shot(page, "04-reglages");
  await page.getByRole("dialog").press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await page.getByTitle("Double panneau", { exact: true }).click();
  await page
    .getByRole("listbox", { name: "Fichiers", exact: true })
    .nth(1)
    .getByRole("option", { name: "Plan de lancement.md", exact: true })
    .waitFor();
  await shot(page, "05-double-panneau");
  await page.getByTitle("Double panneau", { exact: true }).click();
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await shot(page, "06-theme-clair");
  await page.getByTitle("Changer de thème", { exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  const panel = await context.newPage();
  try {
    await panel.setViewportSize({ width: 420, height: 1000 });
    const url = new URL(page.url());
    url.searchParams.set("panel", "1");
    await panel.goto(url.href);
    await panel.getByRole("tab", { name: "Fichiers", exact: true }).waitFor();
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    await panel
      .locator(".companion-files")
      .getByText("Plan de lancement.md", { exact: true })
      .waitFor();
    await shot(panel, "02-panneau");
    for (const width of [320, 760]) {
      await panel.setViewportSize({ width, height: 1000 });
      const expand = await panel.locator(".companion-expand").boundingBox();
      assert.ok(
        expand && expand.x >= 0 && expand.x + expand.width <= width,
        "Agrandir remains inside the panel",
      );
      await shot(panel, `panneau-${width}`);
      await panel
        .getByRole("button", { name: "Changer de dossier", exact: true })
        .click();
      const dialog = panel.getByRole("dialog");
      await dialog.waitFor();
      await dialog
        .locator("button:enabled")
        .filter({ hasText: "Choisir ce dossier" })
        .waitFor();
      await shot(panel, `dossier-${width}`);
      await dialog.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
    if (!baseline) {
      // Visual study only: a real overlay would need a separate, isolated integration.
      await panel.setViewportSize({ width: 1600, height: 1100 });
      await panel.evaluate(() => {
        const scene = document.createElement("article");
        scene.className = "visual-web-scene";
        scene.innerHTML = `
          <nav><b>STUDIO NORD</b><span>Projets</span><span>Équipe</span><span>Documents</span></nav>
          <section><small>Espace de collaboration</small><h1>Une nouvelle<br>perspective.</h1>
          <p>Collection automne · Direction artistique</p>
          <div class="visual-web-art"><span>Nord / 26</span></div>
          <h2>Les documents du projet</h2><p>Rassemblez les visuels, les notes et les livrables de l’équipe.</p>
          <div class="visual-web-drop">Déposez les fichiers du projet ici</div></section>
          <aside>Étude visuelle · panneau flottant sur une page fictive.<br>Ce mode n’est pas encore activé dans l’extension.</aside>`;
        document.body.prepend(scene);
        const style = document.createElement("style");
        style.textContent = `
          body { background:#e5e8e5; }
          .visual-web-scene { position:fixed; inset:0; overflow:hidden; background:#e5e8e5; color:#243934; font-family:"Segoe UI",sans-serif; }
          .visual-web-scene nav { display:flex; gap:45px; align-items:center; height:86px; padding:0 64px; border-bottom:1px solid #24393425; }
          .visual-web-scene nav b { margin-right:90px; letter-spacing:3px; font-size:17px; }
          .visual-web-scene section { padding:60px 64px; }
          .visual-web-scene small { font-size:15px; }
          .visual-web-scene h1 { position:relative; z-index:1; font-size:76px; line-height:1.05; letter-spacing:-4px; margin:24px 0; font-weight:500; }
          .visual-web-scene p { font-size:17px; }
          .visual-web-art { height:330px; margin-top:32px; background:radial-gradient(ellipse at 75% 130%,#c6a66c 0 26%,transparent 26.2%),radial-gradient(ellipse at 96% 35%,#81a5a0 0 35%,transparent 35.2%),linear-gradient(130deg,#26483e,#5c8975); border-radius:12px; display:flex; align-items:end; padding:32px; color:#edf0e7; }
          .visual-web-art span { font-size:62px; letter-spacing:-3px; }
          .visual-web-scene h2 { margin-top:30px; font-size:27px; font-weight:500; }
          .visual-web-drop { width:650px; margin-top:25px; padding:35px; border:1px dashed #5e7c73; border-radius:12px; text-align:center; }
          .visual-web-scene > aside { position:absolute; bottom:22px; left:64px; font-size:13px; line-height:1.7; }
          .app.sidepanel { position:fixed; z-index:2; right:24px; top:104px; bottom:24px; width:420px; height:auto; border:1px solid #ffffff30; border-radius:14px; overflow:hidden; background:linear-gradient(135deg,#ffffff12,transparent 60%),#202728cf; backdrop-filter:blur(24px) saturate(125%); box-shadow:0 24px 70px #15241b55,inset 0 1px #ffffff25; }
          .sidepanel .companion-folder, .sidepanel .companion-folder-tiles button { background:#20272855; }
        `;
        document.head.append(style);
      });
      await shot(panel, "07-concept-flottant");
    }
  } finally {
    await panel.close();
  }
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    if (
      width === 390 &&
      (await page
        .getByTitle("Masquer la navigation", { exact: true })
        .isVisible())
    )
      await page.getByTitle("Masquer la navigation", { exact: true }).click();
    await shot(page, `explorateur-${width}`);
    await page.getByTitle("Nouveau dossier", { exact: true }).click();
    await shot(page, `dialogue-${width}`);
    await page.getByRole("dialog").press("Escape");
  }
  console.log(
    `Visual preview: actual UI, file operations through the native test bridge, dialogs/Escape and responsive screenshots: ${output}`,
  );
  if (!baseline) {
    const gallery = `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>NextExplorer · aperçu du nouveau visuel</title>
<style>
body{margin:0;background:#202223;color:#eceeef;font:16px/1.6 "Segoe UI",sans-serif}
main{max-width:1500px;margin:auto;padding:40px 24px}h1{font-size:32px;line-height:1.2}h2{font-size:22px}
a{color:#9bcdf1}img{display:block;width:100%;border-radius:10px;border:1px solid #454b4f}
section{margin:44px 0}.pair{display:grid;grid-template-columns:420px 1fr;gap:28px;align-items:start}
small,p{color:#b4bdc2}figure{margin:0}figcaption{margin:12px 0}
@media(max-width:850px){.pair{grid-template-columns:1fr}.pair img{max-width:100%}}
</style><main><h1>NextExplorer — graphite & verre dépoli</h1>
<p>Aperçus locaux de l’interface réelle, avec fichiers de démonstration. Ancienne version conservée : <b>visual-safe-1.0.3</b>.</p>
<section><h2>Explorateur principal</h2><a href="after/01-explorateur.png"><img src="after/01-explorateur.png" alt="Explorateur principal graphite avec volet droit givré"></a><p><a href="before/01-explorateur.png">Comparer avec l’ancien visuel</a> · <a href="after/06-theme-clair.png">Thème clair</a> · <a href="after/05-double-panneau.png">Double panneau</a></p></section>
<section class="pair"><figure><h2>Panneau du navigateur</h2><a href="after/02-panneau.png"><img src="after/02-panneau.png" alt="Panneau latéral avec dossiers et fichiers"></a></figure><figure><h2>Dialogues et réglages</h2><a href="after/03-dialogue.png"><img src="after/03-dialogue.png" alt="Création d’un dossier dans un dialogue en verre dépoli"></a><figcaption><a href="after/04-reglages.png">Voir les réglages</a> · <a href="after/dossier-320.png">Sélecteur de dossier étroit</a></figcaption></figure></section>
<section><h2>Concept : panneau flottant sur le site</h2><p>Étude visuelle, pas une fonctionnalité livrée. La page est fictive ; le panneau utilise les composants réels. Le panneau natif de Chrome reste à côté du site.</p><a href="after/07-concept-flottant.png"><img src="after/07-concept-flottant.png" alt="Concept du panneau en verre dépoli superposé à une page web fictive"></a></section>
</main></html>`;
    const galleryPath = "release/visual-preview/index.html";
    if ((await readFile(galleryPath, "utf8").catch(() => "")) !== gallery)
      await writeFile(galleryPath, gallery);
  }
}
