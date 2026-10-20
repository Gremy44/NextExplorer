import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

export async function runStoreScreenshots({ page, context, fixture }) {
  const output = "release/store/visuels";
  await mkdir(output, { recursive: true });
  await mkdir(path.join(fixture, "Documents"), { recursive: true });
  await mkdir(path.join(fixture, "Images"), { recursive: true });
  await writeFile(
    path.join(fixture, "Brief du projet.md"),
    "# Projet Atlas\n\nUn espace de travail pour préparer notre prochain site.\n\n## À préparer\n\n- Rassembler les documents\n- Préparer les images pour le web\n- Vérifier les exports\n\nDonnées de démonstration entièrement fictives.\n",
  );
  await writeFile(
    path.join(fixture, "Notes.txt"),
    "Données de démonstration NextExplorer.\n",
  );
  await copyFile(
    "public/icon128.png",
    path.join(fixture, "Images", "Logo du projet.png"),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  const brief = page
    .getByRole("listbox", { name: "Fichiers", exact: true })
    .getByText("Brief du projet.md", { exact: true });
  await brief.waitFor();
  await brief.click();
  const preview = page.getByRole("button", { name: "Aperçu", exact: true });
  if ((await preview.getAttribute("aria-pressed")) !== "true")
    await preview.click();
  await page
    .getByRole("heading", { name: "Projet Atlas", exact: true })
    .last()
    .waitFor();
  await brief.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/01-explorateur.png` });
  const details = page.getByRole("complementary", {
    name: "Volet d’aperçu",
    exact: true,
  });
  await details.getByRole("button", { name: "Console", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "true",
  );
  const appearance = page.getByRole("button", {
    name: "Apparence du terminal",
    exact: true,
  });
  await appearance.click();
  const dialog = page.getByRole("dialog", {
    name: "Apparence du terminal",
    exact: true,
  });
  const palette = dialog.getByRole("combobox", {
    name: "Palette du terminal",
    exact: true,
  });
  await palette.selectOption("lcd");
  await palette.press("Escape");
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector(".xterm-rows")).fontFamily.includes(
      "Cascadia",
    ),
  );
  const command = page.getByRole("textbox", {
    name: "Saisir une commande PowerShell",
    exact: true,
  });
  await command.pressSequentially("Get-ChildItem -Name");
  await command.press("Enter");
  await page
    .locator(".xterm-screen")
    .filter({ hasText: "Notes.txt" })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector(".console-pane")?.dataset.ready === "true",
  );
  await page.screenshot({ path: `${output}/02-console.png` });
  await appearance.click();
  await palette.selectOption("interface");
  await palette.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await copyFile("public/icon128.png", `${output}/icone-128.png`);
  const logo = (await readFile("public/icon128.png")).toString("base64");
  const promo = await context.newPage();
  try {
    await promo.setViewportSize({ width: 440, height: 280 });
    await promo.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;background:#233f6c;width:440px;height:280px;display:grid;place-items:center}
      .window{position:relative;width:336px;height:196px;border:1px solid #a9c7ff;border-radius:24px;background:#dce7ff;box-shadow:0 12px 30px #10233d66;overflow:hidden}
      .bar{height:36px;background:#abc8fa;border-bottom:1px solid #819dcc;display:flex;align-items:center;gap:6px;padding:0 18px}
      .bar i{width:7px;height:7px;background:#415f91;border-radius:100%}.side{position:absolute;top:36px;bottom:0;left:0;width:76px;background:#c3d5f5}
      .side i{display:block;width:45px;height:9px;margin:18px auto;background:#8ba9d8;border-radius:8px}
      img{position:absolute;left:141px;top:51px;width:110px;height:110px}.line{position:absolute;left:118px;bottom:17px;width:156px;height:7px;background:#9ab4df;border-radius:9px}
    </style></head><body><div class="window"><div class="bar"><i></i><i></i><i></i></div><div class="side"><i></i><i></i><i></i></div><img src="data:image/png;base64,${logo}"><div class="line"></div></div></body></html>`);
    await promo.locator("img").evaluate((element) => element.decode());
    await promo.screenshot({ path: `${output}/promotion-440x280.png` });
  } finally {
    await promo.close();
  }
  console.log(
    "Store : captures réelles 1280x800 avec fichiers synthétiques et vignette 440x280 préparées.",
  );
}
