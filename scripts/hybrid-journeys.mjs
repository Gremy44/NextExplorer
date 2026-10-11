import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

// Called by the real-extension recipe: reuse its isolated profile and native connection.
export async function runHybridJourneys({
  context,
  worker,
  companion,
  fixture,
  imageBytes,
}) {
  const submissions = [];
  const results = [];
  const server = createServer(async (request, response) => {
    try {
      const route = new URL(request.url, "http://localhost").pathname;
      if (
        request.method === "POST" &&
        /^\/upload\/(admin|images)$/.test(route)
      ) {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) throw new Error("Test upload too large");
          chunks.push(chunk);
        }
        const form = await new Request("http://localhost" + route, {
          method: "POST",
          headers: { "Content-Type": request.headers["content-type"] },
          body: Buffer.concat(chunks),
        }).formData();
        const files = await Promise.all(
          form.getAll("files").map(async (file) => ({
            name: file.name,
            type: file.type,
            bytes: Buffer.from(await file.arrayBuffer()),
          })),
        );
        submissions.push({ scenario: route.split("/").at(-1), files });
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end("<!doctype html><h1>Dépôt reçu</h1>");
        return;
      }
      const images = route === "/images";
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><title>${images ? "Projet images" : "Dossier administratif"}</title>
        <h1>${images ? "Publier un visuel" : "Déposer un dossier"}</h1>
        <label>Autre justificatif<input id="proof" type="file"></label>
        <form method="post" action="/upload/${images ? "images" : "admin"}" enctype="multipart/form-data">
          <label>Pièces du projet<input id="attachments" name="files" type="file" accept="${images ? "image/webp" : "text/plain,image/png"}" ${images ? "" : "multiple"}></label>
          <button>Envoyer au site témoin</button>
        </form>`);
    } catch {
      response.writeHead(400);
      response.end("Test upload refused");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const savedStash = await worker.evaluate(
    async () => (await chrome.storage.local.get("stash")).stash,
  );
  const site = await context.newPage();

  async function chooseFolder(folder) {
    await companion.getByRole("tab", { name: "Fichiers", exact: true }).click();
    await companion
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .click();
    const picker = companion.getByRole("dialog", {
      name: "Choisir un dossier",
      exact: true,
    });
    await picker
      .locator("summary")
      .filter({ hasText: "Saisir un chemin" })
      .click();
    await picker
      .getByRole("textbox", { name: "Chemin du dossier", exact: true })
      .fill(folder);
    await picker
      .getByRole("button", { name: "Ouvrir ce dossier", exact: true })
      .click();
    await picker
      .getByRole("button", { name: "Choisir ce dossier", exact: true })
      .click();
    await picker.waitFor({ state: "hidden" });
  }

  try {
    for (const scenario of ["admin", "images"]) {
      console.log(
        `J3 parcours ${scenario} : collecte, espace, préparation et réception par le site témoin`,
      );
      const root = path.join(fixture, "J3-" + scenario);
      const sources =
        scenario === "admin"
          ? [
              {
                folder: "Documents",
                name: "demande.txt",
                bytes: Buffer.from("Demande administrative de recette.\n"),
                type: "text/plain",
              },
              {
                folder: "Justificatifs",
                name: "justificatif.png",
                bytes: imageBytes,
                type: "image/png",
              },
            ]
          : [
              {
                folder: "Sources",
                name: "visuel-original.png",
                bytes: imageBytes,
                type: "image/png",
              },
            ];
      const exports = path.join(root, "Exports");
      await mkdir(exports, { recursive: true });
      await worker.evaluate(async () =>
        chrome.storage.local.set({ stash: [] }),
      );
      await site.goto(`${origin}/${scenario}`);
      for (const source of sources) {
        const folder = path.join(root, source.folder);
        await mkdir(folder, { recursive: true });
        source.path = path.join(folder, source.name);
        await writeFile(source.path, source.bytes);
        await chooseFolder(folder);
        const collect = companion.getByRole("button", {
          name: `Ajouter ${source.name} à la collecte`,
          exact: true,
        });
        await collect.click();
        await collect.and(companion.locator(":disabled")).waitFor();
      }
      const stash = await worker.evaluate(
        async () => (await chrome.storage.local.get("stash")).stash,
      );
      assert.deepEqual(
        stash.map((entry) => entry.path).sort(),
        sources.map((source) => source.path).sort(),
      );
      await companion.getByTitle("Options du panneau", { exact: true }).click();
      await companion
        .getByRole("button", { name: "Espaces hybrides…", exact: true })
        .click();
      const spaces = companion.getByRole("dialog", {
        name: "Espaces hybrides",
        exact: true,
      });
      const project =
        scenario === "admin" ? "Dossier administratif J3" : "Projet images J3";
      await spaces.getByLabel("Nom de l’espace", { exact: true }).fill(project);
      await spaces
        .getByRole("checkbox", {
          name: "Inclure les onglets web et leurs groupes dans cette fenêtre",
          exact: true,
        })
        .check();
      await spaces
        .getByRole("button", { name: "Enregistrer cet espace", exact: true })
        .click();
      await spaces
        .getByText(`Espace « ${project} » enregistré.`, { exact: true })
        .waitFor();
      const space = await worker.evaluate(
        async (name) =>
          (await chrome.storage.local.get("hybridSpaces")).hybridSpaces.find(
            (space) => space.name === name,
          ),
        project,
      );
      assert.deepEqual(space.entries, stash);
      assert.ok(
        space.browser.tabs.some((tab) => tab.url === `${origin}/${scenario}`),
      );
      await spaces.getByRole("button", { name: "Fermer", exact: true }).click();
      await companion.reload();
      await companion
        .locator(".space-follow-name strong")
        .getByText(project, { exact: true })
        .waitFor();
      await companion.getByRole("tab", { name: /Collecte/ }).click();
      for (const source of sources)
        await companion
          .getByRole("button", {
            name: `Retirer ${source.name} de la collecte`,
            exact: true,
          })
          .waitFor();
      assert.deepEqual(
        await worker.evaluate(
          async () => (await chrome.storage.local.get("stash")).stash,
        ),
        stash,
      );
      await site.bringToFront();
      const insert = companion.locator(".companion-insert");
      await insert.locator("summary").click();
      await insert
        .getByRole("button", {
          name: "Repérer les champs de la page",
          exact: true,
        })
        .click();
      await insert
        .getByLabel("Champ de destination", { exact: true })
        .selectOption("1");
      assert.match(
        await insert
          .getByLabel("Champ de destination", { exact: true })
          .locator("option:checked")
          .textContent(),
        /Pièces du projet/,
      );
      assert.equal(
        submissions.length,
        results.length,
        "Aucun envoi avant validation du formulaire",
      );

      let expected = sources.map((source) => ({
        name: source.name,
        type: source.type,
        bytes: source.bytes,
      }));
      if (scenario === "images") {
        assert.equal(
          await insert
            .getByRole("button", { name: "Insérer 1 fichier(s)", exact: true })
            .isDisabled(),
          true,
        );
        await insert
          .getByRole("button", {
            name: "Préparer les images pour ce champ…",
            exact: true,
          })
          .click();
        const preparation = companion.getByRole("dialog", {
          name: "Préparer des images pour le web",
          exact: true,
        });
        assert.equal(
          await preparation
            .getByLabel("Format des copies", { exact: true })
            .inputValue(),
          "webp",
        );
        await preparation
          .getByLabel("Largeur maximale en pixels", { exact: true })
          .fill("64");
        await preparation
          .getByLabel("Poids maximal en Mo par copie", { exact: true })
          .fill("0.25");
        await preparation
          .getByLabel("Dossier de destination", { exact: true })
          .fill(exports);
        await preparation
          .getByRole("button", {
            name: "Créer et vérifier les copies",
            exact: true,
          })
          .click();
        await preparation
          .getByText("Respecte les contraintes saisies", { exact: true })
          .waitFor();
        assert.equal(
          submissions.length,
          results.length,
          "Préparer ne transmet aucun fichier",
        );
        assert.deepEqual(
          await worker.evaluate(
            async () => (await chrome.storage.local.get("stash")).stash,
          ),
          stash,
        );
        const names = await readdir(exports);
        assert.equal(names.length, 1);
        assert.match(names[0], /\.webp$/);
        const bytes = await readFile(path.join(exports, names[0]));
        assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
        assert.ok(bytes.length <= 0.25 * 1024 * 1024);
        expected = [{ name: names[0], type: "image/webp", bytes }];
        await preparation
          .getByRole("button", {
            name: "Insérer les copies dans ce champ",
            exact: true,
          })
          .click();
        await preparation
          .getByText(
            "Copies insérées dans le champ choisi. Vérifiez leur réception avant de valider le formulaire.",
            { exact: true },
          )
          .waitFor();
        await preparation
          .getByRole("button", { name: "Fermer", exact: true })
          .click();
        const dimensions = await site.evaluate(async () => {
          const image = await createImageBitmap(
            document.getElementById("attachments").files[0],
          );
          const size = { width: image.width, height: image.height };
          image.close();
          return size;
        });
        assert.equal(dimensions.width, 64);
        assert.equal(dimensions.height, 64);
      } else {
        await insert
          .getByRole("button", { name: "Insérer 2 fichier(s)", exact: true })
          .click();
        await companion
          .getByText(
            "Fichiers insérés dans le champ choisi. Vérifiez le formulaire avant de le valider.",
            { exact: true },
          )
          .waitFor();
      }
      assert.equal(
        submissions.length,
        results.length,
        "Insérer ne soumet pas le formulaire",
      );
      assert.equal(
        await site.evaluate(
          () => document.getElementById("proof").files.length,
        ),
        0,
      );
      const receipt = await worker.evaluate(
        async () =>
          (await chrome.storage.local.get("fileInsertions")).fileInsertions[0],
      );
      assert.equal(receipt.state, "inserted");
      assert.equal(receipt.origin, origin);
      assert.deepEqual(
        receipt.files,
        expected.map((file) => ({ name: file.name, size: file.bytes.length })),
      );
      for (const width of [320, 390, 1024]) {
        await companion.setViewportSize({ width, height: 844 });
        assert.ok(
          await companion.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await companion.setViewportSize({ width: 390, height: 844 });
      const history = companion.locator(".insertion-history");
      await history.locator("summary").click();
      await history.locator("article").first().scrollIntoViewIfNeeded();
      await companion.screenshot({
        path: `test-results/j3-${scenario}.png`,
        fullPage: true,
      });
      await site
        .getByRole("button", { name: "Envoyer au site témoin", exact: true })
        .click();
      await site
        .getByRole("heading", { name: "Dépôt reçu", exact: true })
        .waitFor();
      assert.equal(submissions.length, results.length + 1);
      const received = submissions.at(-1);
      assert.equal(received.scenario, scenario);
      assert.deepEqual(
        received.files,
        expected,
        "Le serveur reçoit les noms, MIME et octets exacts",
      );
      for (const source of sources)
        assert.deepEqual(
          await readFile(source.path),
          source.bytes,
          "Original intact",
        );
      assert.deepEqual(
        await worker.evaluate(
          async () => (await chrome.storage.local.get("stash")).stash,
        ),
        stash,
      );
      results.push({
        scenario,
        project,
        explicitSubmit: true,
        originalsPreserved: true,
        files: received.files.map((file) => ({
          name: file.name,
          type: file.type,
          bytes: file.bytes.length,
          sha256: createHash("sha256").update(file.bytes).digest("hex"),
        })),
      });
      console.log(
        `J3 ${scenario} : réception HTTP réelle, octets exacts, originaux et collecte intacts : OK`,
      );
    }
    await writeFile(
      "test-results/j3-journeys.json",
      JSON.stringify(
        { version: 1, date: new Date().toISOString(), scenarios: results },
        null,
        2,
      ),
    );
  } catch (error) {
    await companion
      .screenshot({
        path: "test-results/j3-journey-failure.png",
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await worker.evaluate(
      async (stash) => chrome.storage.local.set({ stash }),
      savedStash,
    );
    await site.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
