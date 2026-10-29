import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export async function runDownloadFiling({ page, fixture }) {
  const context = page.context(),
    base = page.url().split("?")[0];
  const worker = context.serviceWorkers()[0];
  const downloads = path.join(fixture, "Browser-downloads"),
    destination = path.join(fixture, "Rangement");
  await mkdir(downloads, { recursive: true });
  await mkdir(destination);
  const server = createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").searchParams.get("name");
    if (!/^[a-z-]+\.auto$/.test(name || "")) {
      res.writeHead(400);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.end("Téléchargement réel à ranger");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/download`;
  const until = async (test, message) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await test()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(message);
  };
  const download = async (name) => {
    const id = await worker.evaluate(
      ({ url, name }) =>
        chrome.downloads.download({
          url: `${url}?name=${name}`,
          filename: name,
          saveAs: false,
        }),
      { url, name },
    );
    await until(
      async () =>
        (await worker.evaluate(
          async (id) => (await chrome.downloads.search({ id }))[0]?.state,
          id,
        )) === "complete",
      `Téléchargement incomplet : ${name}`,
    );
    const item = await worker.evaluate(
      async (id) => (await chrome.downloads.search({ id }))[0],
      id,
    );
    assert.ok(
      path
        .resolve(item.filename)
        .startsWith(path.resolve(downloads) + path.sep),
      "Les téléchargements de recette doivent rester dans la fixture",
    );
    return item;
  };
  const runs = () =>
    worker.evaluate(
      async () =>
        (await chrome.storage.local.get("downloadRuns")).downloadRuns || [],
    );
  const openList = async () => {
    await page.getByRole("tab", { name: "Page", exact: true }).click();
    const button = page.getByRole("button", {
      name: "Ranger les téléchargements…",
      exact: true,
    });
    if (!(await button.isVisible()))
      await page
        .locator(".companion-disclosure > summary")
        .filter({ hasText: "Plus d’actions" })
        .click();
    await button.click();
    return page.getByRole("dialog", {
      name: "Ranger les téléchargements",
      exact: true,
    });
  };
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloads,
    });
    await worker.evaluate(
      (lastPath) => chrome.storage.local.set({ lastPath }),
      fixture,
    );
    const manual = await download("manuel.auto");
    await page.goto(`${base}?panel=1&path=${encodeURIComponent(fixture)}`);
    await page.getByText("Fichiers connectés", { exact: true }).waitFor();
    let list = await openList();
    await list
      .getByRole("button", { name: "Ranger manuel.auto", exact: true })
      .click();
    let transfer = page.getByRole("dialog", {
      name: "Transférer les fichiers",
      exact: true,
    });
    await transfer
      .getByLabel("Dossier de destination", { exact: true })
      .fill(destination);
    assert.equal(
      await transfer.locator('select[name="mode"]').inputValue(),
      "move",
    );
    await transfer
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    assert.equal(
      await readFile(manual.filename, "utf8"),
      "Téléchargement réel à ranger",
    );
    assert.equal((await runs()).length, 0);
    await writeFile(
      path.join(destination, "manuel.auto"),
      "Collision manuelle conservée",
    );
    list = await openList();
    await list
      .getByRole("button", { name: "Ranger manuel.auto", exact: true })
      .click();
    await transfer
      .getByLabel("Dossier de destination", { exact: true })
      .fill(destination);
    await transfer
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await until(
      async () =>
        (await runs()).some(
          (r) => r.key.startsWith(`${manual.id}/`) && r.state === "completed",
        ),
      "Rangement manuel non terminé",
    );
    const manualRun = (await runs()).find((r) =>
      r.key.startsWith(`${manual.id}/`),
    );
    assert.equal(
      await readFile(manualRun.destination, "utf8"),
      "Téléchargement réel à ranger",
    );
    assert.equal(
      await readFile(path.join(destination, "manuel.auto"), "utf8"),
      "Collision manuelle conservée",
    );
    await assert.rejects(stat(manual.filename), { code: "ENOENT" });
    const old = await download("ancien.auto");
    list = await openList();
    await list
      .locator(".download-rules > summary")
      .filter({ hasText: "Règles de rangement" })
      .click();
    await list
      .getByRole("button", { name: "Nouvelle règle", exact: true })
      .click();
    const form = list.getByRole("form", {
      name: "Éditer une règle de rangement",
      exact: true,
    });
    const auto = form.getByRole("checkbox", {
      name: "Ranger automatiquement les nouveaux téléchargements",
      exact: true,
    });
    assert.equal(await auto.isChecked(), false);
    await form
      .getByLabel("Nom de la règle", { exact: true })
      .fill("Recette V1");
    await form.getByLabel("Site d’origine (facultatif)").fill("127.0.0.1");
    await form.getByLabel("Extension (facultative)").fill(".auto");
    await form
      .getByLabel("Dossier de destination", { exact: true })
      .fill(destination);
    await auto.check();
    await form
      .getByRole("button", { name: "Enregistrer la règle", exact: true })
      .click();
    await form.waitFor({ state: "hidden" });
    const rule = await worker.evaluate(async () =>
      (
        await chrome.storage.local.get("downloadFiling")
      ).downloadFiling.rules.find((r) => r.name === "Recette V1"),
    );
    assert.equal(rule.automatic, true);
    assert.ok(Date.parse(rule.automaticSince) > Date.parse(old.startTime));
    await writeFile(
      path.join(destination, "nouveau.auto"),
      "Collision automatique conservée",
    );
    for (const view of context.pages().filter((v) => v.url().startsWith(base)))
      await view.close();
    const next = await download("nouveau.auto");
    await until(
      async () =>
        (await runs()).some(
          (r) => r.key.startsWith(`${next.id}/`) && r.state === "completed",
        ),
      "Automatisme panneau fermé non terminé",
    );
    const autoRun = (await runs()).find((r) => r.key.startsWith(`${next.id}/`));
    assert.equal(autoRun.automatic, true);
    assert.equal(
      await readFile(autoRun.destination, "utf8"),
      "Téléchargement réel à ranger",
    );
    assert.equal(
      await readFile(path.join(destination, "nouveau.auto"), "utf8"),
      "Collision automatique conservée",
    );
    await assert.rejects(stat(next.filename), { code: "ENOENT" });
    const provenance = JSON.parse(
      await readFile(autoRun.destination + ".source.json", "utf8"),
    );
    assert.equal(provenance.sourceUrl, url);
    assert.equal(
      await readFile(old.filename, "utf8"),
      "Téléchargement réel à ranger",
    );
    await worker.evaluate(async (id) => {
      const { downloadFiling } =
        await chrome.storage.local.get("downloadFiling");
      downloadFiling.rules.find((r) => r.id === id).enabled = false;
      await chrome.storage.local.set({ downloadFiling });
    }, rule.id);
    const paused = await download("pause.auto");
    await worker.evaluate(
      async ({ id, destination }) => {
        const { downloadFiling } =
          await chrome.storage.local.get("downloadFiling");
        Object.assign(
          downloadFiling.rules.find((r) => r.id === id),
          {
            enabled: true,
            destination,
            automaticSince: new Date().toISOString(),
          },
        );
        await chrome.storage.local.set({ downloadFiling });
      },
      { id: rule.id, destination: path.join(fixture, "Absent") },
    );
    const blocked = await download("bloque.auto");
    await until(
      async () =>
        (await runs()).some(
          (r) => r.key.startsWith(`${blocked.id}/`) && r.state === "blocked",
        ),
      "Destination absente non signalée",
    );
    assert.equal(
      await readFile(paused.filename, "utf8"),
      "Téléchargement réel à ranger",
    );
    assert.equal(
      await readFile(blocked.filename, "utf8"),
      "Téléchargement réel à ranger",
    );
    assert.equal(
      (await runs()).filter((r) => r.key.startsWith(`${paused.id}/`)).length,
      0,
    );
    page = await context.newPage();
    await page.goto(`${base}?panel=1&path=${encodeURIComponent(fixture)}`);
    list = await openList();
    await list
      .locator(".download-rules > summary")
      .filter({ hasText: "Suivi des rangements" })
      .click();
    await list
      .getByText(
        "Automatique · À ranger manuellement — aucun transfert lancé",
        { exact: true },
      )
      .waitFor();
    await page.screenshot({
      path: "test-results/v1-rangement-extension.png",
      animations: "disabled",
    });
    console.log(
      "Rangement compilé : téléchargement Chrome réel, annulation manuelle, déplacement avec collision, automatisme opt-in panneau fermé, provenance, ancien téléchargement conservé, pause et destination absente : OK",
    );
    return page;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
