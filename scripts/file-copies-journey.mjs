import assert from "node:assert/strict";
import {
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export async function runFileCopyJourney({ context, baseURL, fixture }) {
  const folder = path.join(fixture, "Copies C2"),
    child = path.join(folder, "Sous-dossier");
  await mkdir(child, { recursive: true });
  const samples = {
    "a-facture.txt": "Même contenu local",
    "b-copie.bin": "Même contenu local",
    "c-different.txt": "Autre contenu égal",
    "unique.txt": "Unique",
    "vide-a": "",
    "vide-b": "",
    "gros-a.TIFF": Buffer.alloc(24 * 1024 * 1024),
    "gros-b.TIFF": Buffer.alloc(24 * 1024 * 1024),
    "a-facture.txt.source.json": "{}",
  };
  assert.equal(
    Buffer.byteLength(samples["a-facture.txt"]),
    Buffer.byteLength(samples["c-different.txt"]),
  );
  for (const [name, bytes] of Object.entries(samples))
    await writeFile(path.join(folder, name), bytes);
  for (const name of ["trop-grand-a.bin", "trop-grand-b.bin"]) {
    const file = await open(path.join(folder, name), "w");
    try {
      await file.truncate(65 * 1024 * 1024);
    } finally {
      await file.close();
    }
  }
  await writeFile(path.join(child, "non-parcouru.txt"), "Même contenu local");
  async function digest(file) {
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest("hex");
  }
  const before = await Promise.all(
    (await readdir(folder, { withFileTypes: true }))
      .filter((file) => file.isFile())
      .map(async (file) => ({
        name: file.name,
        hash: await digest(path.join(folder, file.name)),
        ...(await stat(path.join(folder, file.name))),
      })),
  );
  const page = await context.newPage(),
    panel = await context.newPage(),
    errors = [];
  const keys = [
    "explorerPreferences",
    "theme",
    "hybridSpaces",
    "followedSpace:page",
    "followedSpace:panel",
  ];
  for (const view of [page, panel]) {
    view.setDefaultTimeout(20000);
    view.on("pageerror", (error) => errors.push(error.message));
    await view.addInitScript(() => {
      window.__copyActions = [];
      window.__copyHeld = [];
      window.__copyHeldIds = [];
      window.__copyLateReceived = 0;
      const connect = chrome.runtime.connect.bind(chrome.runtime);
      chrome.runtime.connect = (...args) => {
        const port = connect(...args),
          send = port.postMessage.bind(port);
        port.onMessage.addListener((message) => {
          if (window.__copyHeldIds.includes(message.id))
            window.__copyLateReceived++;
        });
        port.postMessage = (message) => {
          window.__copyActions.push({
            action: message.action,
            payload: message.payload,
          });
          if (message.action === "HASH" && window.__copyHold) {
            window.__copyHeldIds.push(message.id);
            window.__copyHeld.push(() => send(message));
          } else send(message);
        };
        return port;
      };
    });
  }
  await page.goto(`${baseURL}?path=${encodeURIComponent(folder)}`);
  const backup = await page.evaluate(
    (keys) => chrome.storage.local.get(keys),
    keys,
  );
  async function openGroups(view) {
    await view.keyboard.press("Control+k");
    const palette = view.getByRole("dialog", { name: "Aller à…", exact: true });
    await palette
      .getByPlaceholder("Action, chemin ou alias (~dl, ~desk)…", {
        exact: true,
      })
      .fill("Regrouper les fichiers");
    await palette
      .getByRole("button", { name: "Regrouper les fichiers", exact: true })
      .click();
    const dialog = view.getByRole("dialog").last();
    await dialog
      .getByLabel("Regrouper par", { exact: true })
      .selectOption("copies");
    return dialog;
  }
  async function analyze(dialog) {
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await dialog.locator(".group-results").waitFor();
  }
  async function close(view) {
    await view
      .getByRole("dialog")
      .getByRole("button", { name: "Fermer", exact: true })
      .click();
  }
  const hashes = (view) =>
    view.evaluate(
      () =>
        window.__copyActions.filter((message) => message.action === "HASH")
          .length,
    );
  try {
    await page.evaluate(() =>
      chrome.storage.local.remove(["explorerPreferences", "theme"]),
    );
    await page.reload();
    await page
      .getByRole("option", { name: "a-facture.txt", exact: true })
      .waitFor();
    let dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    assert.equal(await hashes(page), 0);
    await analyze(dialog);
    const copyGroups = dialog.locator("details.file-group").filter({
      has: page
        .locator("summary strong")
        .filter({ hasText: /^Copies identiques/ }),
    });
    assert.equal(await copyGroups.count(), 3);
    await dialog
      .getByText(/6 fichiers en copies identiques · 7 empreintes calculées/)
      .waitFor();
    assert.equal(await hashes(page), 7);
    await copyGroups.first().locator("summary").click();
    await dialog
      .locator("details.file-group")
      .filter({ has: page.getByText("Non comparés", { exact: true }) })
      .locator("summary")
      .click();
    await dialog
      .getByText("Plus de 64 Mio : contenu non lu.", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: /Corbeille|Examiner le transfert/ })
        .count(),
      0,
    );
    assert.equal(await dialog.locator("img").count(), 0);
    await analyze(dialog);
    await dialog.getByText(/0 empreintes calculées · 7 réutilisées/).waitFor();
    assert.equal(await hashes(page), 7);
    await copyGroups.first().locator("summary").click();
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const region of [
        dialog,
        dialog.locator(".modal-content"),
        dialog.locator(".file-groups"),
      ])
        assert.ok(
          await region.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        );
      await page.screenshot({
        path: `test-results/file-copies-${width}.png`,
        animations: "disabled",
      });
    }
    await writeFile(
      path.join(folder, "c-different.txt"),
      samples["a-facture.txt"],
    );
    await dialog
      .getByText(
        "Les fichiers ont changé. Relancez le regroupement pour comparer leur contenu actuel.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await dialog.locator(".group-results").count(), 0);
    await analyze(dialog);
    await dialog.getByText(/7 fichiers en copies identiques/).waitFor();
    await writeFile(
      path.join(folder, "c-different.txt"),
      samples["c-different.txt"],
    );
    await dialog
      .getByText(
        "Les fichiers ont changé. Relancez le regroupement pour comparer leur contenu actuel.",
        { exact: true },
      )
      .waitFor();
    await close(page);
    await page
      .getByRole("option", { name: "a-facture.txt", exact: true })
      .click();
    await page
      .getByRole("option", { name: "b-copie.bin", exact: true })
      .click({ modifiers: ["Control"] });
    dialog = await openGroups(page);
    assert.equal(
      await dialog.getByLabel("Regrouper depuis", { exact: true }).inputValue(),
      "selection",
    );
    await analyze(dialog);
    await dialog.getByText(/2 fichiers en copies identiques/).waitFor();
    await close(page);
    const spaceEntries = await Promise.all(
      ["a-facture.txt", "b-copie.bin"].map(async (name) => {
        const info = await stat(path.join(folder, name));
        return {
          name,
          path: path.join(folder, name),
          type: "file",
          size: info.size,
          mtime: Math.floor(info.mtimeMs / 1000),
          ext: path.extname(name),
        };
      }),
    );
    await page.evaluate(
      async ({ folder, entries }) => {
        const space = {
          version: 1,
          id: "c2-copies-space",
          name: "Copies de recette",
          date: new Date().toISOString(),
          tabs: [
            {
              paths: [folder, folder],
              modes: ["details", "details"],
              active: 0,
              dual: false,
              split: 50,
            },
          ],
          current: 0,
          entries,
          links: {},
          browser: { tabs: [], groups: [] },
          tasks: [],
        };
        const old =
          (await chrome.storage.local.get("hybridSpaces")).hybridSpaces || [];
        await chrome.storage.local.set({
          hybridSpaces: [...old, space],
          "followedSpace:panel": space.id,
        });
      },
      {
        folder,
        entries: [
          ...spaceEntries,
          {
            ...spaceEntries[0],
            name: "absent.txt",
            path: path.join(folder, "absent.txt"),
          },
          {
            type: "web",
            name: "Web",
            path: "https://example.com/",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    );
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.goto(`${baseURL}?panel=1`);
    await panel
      .getByRole("button", { name: "Changer de dossier", exact: true })
      .waitFor();
    let other = await openGroups(panel);
    await other
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("space");
    await analyze(other);
    await other.getByText(/2 fichiers en copies identiques/).waitFor();
    await other
      .locator("details.file-group")
      .filter({ has: panel.getByText("Non comparés", { exact: true }) })
      .locator("summary")
      .click();
    await other
      .getByText("Référence absente ou modifiée ; actualisez la source.", {
        exact: true,
      })
      .waitFor();
    await close(panel);
    if ((await page.locator("html").getAttribute("data-theme")) !== "light")
      await page.getByTitle("Changer de thème", { exact: true }).click();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await page.evaluate(() => {
      window.__copyHold = true;
    });
    const beforeCancel = await hashes(page);
    await dialog
      .getByRole("button", { name: "Regrouper", exact: true })
      .click();
    await page.waitForFunction(() => window.__copyHeld.length > 0, null, {
      polling: 50,
    });
    assert.equal(await hashes(page), beforeCancel + 1);
    await dialog.getByRole("button", { name: "Arrêter", exact: true }).click();
    await dialog
      .getByText("Regroupement arrêté. Aucun fichier modifié.", { exact: true })
      .waitFor();
    const afterCancel = await hashes(page);
    await page.evaluate(() => {
      window.__copyHold = false;
      for (const send of window.__copyHeld.splice(0)) send();
    });
    await page.waitForFunction(() => window.__copyLateReceived > 0, null, {
      polling: 50,
    });
    await page.waitForTimeout(100);
    assert.equal(await hashes(page), afterCancel);
    assert.equal(await dialog.locator(".group-results").count(), 0);
    await analyze(dialog);
    await dialog.getByText(/7 empreintes calculées · 0 réutilisées/).waitFor();
    await dialog
      .locator("details.file-group")
      .first()
      .locator("summary")
      .click();
    await page.screenshot({
      path: "test-results/file-copies-light.png",
      animations: "disabled",
    });
    const requests = await page.evaluate(() => window.__copyActions);
    assert.equal(
      requests.some((message) =>
        ["FS_READ", "FS_TRANSFER", "TRASH", "FS_WRITE", "CONVERT"].includes(
          message.action,
        ),
      ),
      false,
    );
    assert.ok(
      requests
        .filter((message) => message.action === "HASH")
        .every(
          (message) =>
            message.payload.expected &&
            message.payload.algorithm === "blake3" &&
            message.payload.expected.size <= 64 * 1024 * 1024 &&
            !message.payload.path.includes("Sous-dossier"),
        ),
    );
    await close(page);
    const large = path.join(fixture, "Copies C2 1003");
    await mkdir(large);
    for (let offset = 0; offset < 1003; offset += 32)
      await Promise.all(
        Array.from({ length: Math.min(32, 1003 - offset) }, (_, i) =>
          writeFile(
            path.join(large, `${String(offset + i).padStart(4, "0")}.txt`),
            "même copie",
          ),
        ),
      );
    await page.goto(`${baseURL}?path=${encodeURIComponent(large)}`);
    await page.getByRole("option", { name: "0000.txt", exact: true }).waitFor();
    dialog = await openGroups(page);
    await dialog
      .getByLabel("Regrouper depuis", { exact: true })
      .selectOption("folder");
    await page.evaluate(() => {
      window.__copyBeats = 0;
      window.__copyBeatTimer = setInterval(() => window.__copyBeats++, 16);
    });
    const started = Date.now();
    await analyze(dialog);
    const milliseconds = Date.now() - started;
    await dialog
      .getByText(
        /200 fichiers examinés · 100 fichiers en copies identiques · 100 empreintes calculées · 0 réutilisées · 900 non comparés/,
      )
      .waitFor();
    await dialog.getByText(/1000 premières entrées sur 1003/).waitFor();
    const beats = await page.evaluate(() => {
      clearInterval(window.__copyBeatTimer);
      return window.__copyBeats;
    });
    assert.ok(beats >= 2);
    await writeFile(
      "test-results/c2-copies-performance.json",
      JSON.stringify(
        {
          entries: 1003,
          checked: 200,
          hashed: 100,
          unexamined: 900,
          milliseconds,
          uiTicks: beats,
          synthetic: true,
        },
        null,
        2,
      ),
    );
    for (const item of before) {
      const current = await stat(path.join(folder, item.name));
      assert.equal(current.size, item.size);
      assert.equal(await digest(path.join(folder, item.name)), item.hash);
      if (item.name !== "c-different.txt")
        assert.equal(current.mtimeMs, item.mtimeMs);
    }
    assert.deepEqual(errors, []);
    console.log(
      `C2 copies : sélection/dossier/espace, BLAKE3 natif, tailles distinctes, vides, TIFF 24 Mio sans décodage Chrome, 64/256 Mio et 100/200/1000, cache invalidé, arrêt/réponse tardive, 320/390/1024 px, deux vues et SHA256 intacts : OK (${milliseconds} ms, ${beats} événements, corpus synthétique)`,
    );
  } catch (error) {
    await page.screenshot({
      path: "test-results/file-copies-failure.png",
      fullPage: true,
    });
    console.error(await page.getByRole("dialog").allTextContents());
    console.error(await panel.getByRole("dialog").allTextContents());
    throw error;
  } finally {
    await page.evaluate(
      async ({ keys, backup }) => {
        await chrome.storage.local.remove(keys);
        await chrome.storage.local.set(backup);
      },
      { keys, backup },
    );
    await page.close();
    await panel.close();
  }
}
