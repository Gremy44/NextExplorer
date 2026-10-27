import assert from "node:assert/strict";

export function createRemoteMock() {
  const calls = [],
    servers = [];
  const profileID = "browser-test-server",
    root = `nxe-remote://${profileID}/`;
  const entry = (name, type = "file", directory = "/") => ({
    name,
    path:
      root +
      directory.split("/").filter(Boolean).map(encodeURIComponent).join("/") +
      (directory === "/" ? "" : "/") +
      encodeURIComponent(name),
    type,
    size: type === "file" ? 23 : 0,
    mtime: 1000,
    ext: type === "file" ? ".txt" : "",
    stamp: "fixture",
  });
  const request = (message) => {
    calls.push(structuredClone(message));
    const { action, payload: p = {} } = message;
    const success = (data) => ({ id: message.id, status: "SUCCESS", data });
    if (action === "REMOTE_PROFILES") return success(servers);
    if (action === "REMOTE_PROFILE_SAVE") {
      const profile = { ...p.profile, id: p.profile.id || profileID };
      const previous = servers.findIndex(
        (server) => server.profile.id === profile.id,
      );
      const saved = { profile, connected: false, hasSecret: p.remember };
      if (previous >= 0) servers.splice(previous, 1, saved);
      else servers.push(saved);
      return success(profile);
    }
    if (action === "REMOTE_CONNECT") {
      if (!p.confirmFingerprint && !servers[0].profile.fingerprint)
        return success({
          needsTrust: true,
          fingerprint: "SHA256:TEST-FINGERPRINT-ONLY",
        });
      servers[0].connected = true;
      servers[0].profile.fingerprint =
        p.confirmFingerprint || servers[0].profile.fingerprint;
      return success({ connected: true, path: root });
    }
    if (action === "REMOTE_DISCONNECT") {
      servers[0].connected = false;
      return success(true);
    }
    if (action === "REMOTE_PROFILE_DELETE") {
      servers.splice(0);
      return success(true);
    }
    if (action === "REMOTE_TERMINAL_OPEN")
      return success({ id: "ssh-test-session", ssh: true });
    if (action === "REMOTE_TERMINAL_READ")
      return success({
        data: "",
        path: root,
        pending: "",
        ready: true,
        closed: false,
        error: "",
      });
    if (action.startsWith("REMOTE_")) return success(true);
    if (
      action === "FS_TRANSFER" &&
      (p.destination?.startsWith(root) ||
        p.paths?.some((path) => path.startsWith(root)))
    )
      return success({ jobId: "mock-remote-job" });
    if (p.path?.startsWith(root)) {
      if (action === "FS_LIST_DIR")
        return success({
          currentPath: p.path,
          parentPath: p.path === root ? null : root,
          entries:
            p.path === root
              ? [entry("Données été", "directory"), entry("remote-only.txt")]
              : [entry("rapport.txt", "file", "/Données été")],
          total: p.path === root ? 2 : 1,
          nextOffset: p.path === root ? 2 : 1,
          truncated: false,
        });
      if (action === "FS_STAT")
        return success({
          name: p.path.split("/").pop() || "/",
          path: p.path,
          type: p.path.endsWith(".txt") ? "file" : "directory",
          size: 23,
          mtime: 1000,
          ext: ".txt",
          stamp: "fixture",
        });
      if (action === "FS_READ")
        return success({
          data: Buffer.from("Texte distant de test.").toString("base64"),
          eof: true,
          size: 23,
        });
      return {
        id: message.id,
        status: "ERROR",
        error: "Outil local interdit par la fixture distante",
      };
    }
  };
  return { request, calls, servers, root };
}

export async function runRemoteJourney({ page, fixture, mock }) {
  page.setDefaultTimeout(12000);
  const dialog = (name) => page.getByRole("dialog", { name, exact: true });
  const screenshot = (name) =>
    page.screenshot({
      path: `test-results/remote-${name}.png`,
      animations: "disabled",
    });
  assert.equal(await page.locator("#navigation-servers").count(), 0);
  assert.equal(
    mock.calls.filter((call) => call.action.startsWith("REMOTE_")).length,
    0,
  );
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const settings = dialog("Réglages et moteurs");
  await settings
    .getByRole("button", { name: "Connexions", exact: true })
    .click();
  await settings
    .getByLabel("Activer les connexions aux serveurs", { exact: true })
    .check();
  await settings
    .getByRole("button", { name: "Enregistrer les préférences", exact: true })
    .click();
  await settings
    .getByText("Préférences enregistrées", { exact: true })
    .waitFor();
  await settings
    .getByRole("button", { name: "Gérer les connexions", exact: true })
    .click();
  const manager = dialog("Dossiers distants");
  await manager.getByLabel("Nom", { exact: true }).fill("Mon serveur SFTP");
  await manager
    .getByLabel("Serveur", { exact: true })
    .fill("serveur.exemple.fr");
  await manager.getByLabel("Utilisateur", { exact: true }).fill("remy");
  await manager
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-not-a-real-password");
  await manager
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await manager
    .getByText("Vérifier la clé du serveur", { exact: true })
    .waitFor();
  assert.ok(
    mock.calls.some(
      (call) =>
        call.action === "REMOTE_CONNECT" && !call.payload.confirmFingerprint,
    ),
  );
  assert.equal(
    mock.calls.some(
      (call) =>
        call.action === "FS_LIST_DIR" &&
        call.payload.path?.startsWith(mock.root),
    ),
    false,
  );
  const storage = await page.evaluate(() =>
    localStorage.getItem("test-storage"),
  );
  assert.ok(!storage.includes("test-not-a-real-password"));
  await screenshot("trust");
  await manager
    .getByRole("button", { name: "Approuver et se connecter", exact: true })
    .click();
  await manager.waitFor({ state: "hidden" });
  await page.getByRole("option", { name: /remote-only.txt/ }).waitFor();
  assert.ok(
    (
      await page.locator('.tab-select[aria-selected="true"]').innerText()
    ).includes("Mon serveur SFTP"),
  );
  assert.ok(
    await page
      .locator(".remote-toolbar")
      .innerText()
      .then((text) => text.includes("SFTP · Mon serveur SFTP")),
  );
  assert.ok(
    mock.calls
      .filter((call) => call.action === "FS_WATCH")
      .every((call) =>
        call.payload.paths.every((path) => !path.startsWith("nxe-remote:")),
      ),
  );
  await page.getByRole("option", { name: /Données été/ }).dblclick();
  await page.getByRole("option", { name: /rapport.txt/ }).waitFor();
  const activePane = page.locator(".pane.active");
  await activePane
    .locator(".breadcrumbs")
    .getByRole("button", { name: "Serveur", exact: true })
    .click();
  await page.getByRole("option", { name: /remote-only.txt/ }).waitFor();
  await page
    .getByRole("button", { name: "Double panneau", exact: true })
    .click();
  const panes = page.locator(".pane");
  await panes.nth(1).locator(".edit-path").click();
  const address = panes
    .nth(1)
    .getByRole("textbox", { name: "Chemin du dossier", exact: true });
  await address.fill(fixture);
  await address.press("Enter");
  await panes
    .nth(1)
    .getByRole("option", { name: /README.md/ })
    .waitFor();
  await panes
    .nth(0)
    .getByRole("option", { name: /remote-only.txt/ })
    .dragTo(panes.nth(1).locator(".pathbar"));
  const transfer = dialog("Transférer les fichiers");
  assert.deepEqual(
    await transfer
      .locator('select[name="mode"] option')
      .evaluateAll((options) => options.map((option) => option.value)),
    ["copy"],
  );
  assert.equal(
    await transfer
      .locator('select[name="conflict"] option[value="overwrite"]')
      .count(),
    0,
  );
  await transfer
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await transfer.waitFor({ state: "hidden" });
  assert.ok(
    mock.calls.some(
      (call) =>
        call.action === "FS_TRANSFER" &&
        call.payload.mode === "copy" &&
        call.payload.paths[0].endsWith("remote-only.txt") &&
        call.payload.destination === fixture,
    ),
  );
  await panes
    .nth(0)
    .getByRole("option", { name: /remote-only.txt/ })
    .click();
  await page.getByRole("button", { name: "Comparer", exact: true }).click();
  await dialog("Comparer les dossiers")
    .getByText("Absent à destination", { exact: true })
    .first()
    .waitFor();
  await screenshot("compare");
  await dialog("Comparer les dossiers")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await page.getByRole("button", { name: "Console", exact: true }).click();
  await page
    .getByRole("region", {
      name: "Console SSH · Mon serveur SFTP",
      exact: true,
    })
    .waitFor();
  assert.equal(
    mock.calls.some((call) => call.action === "REMOTE_TERMINAL_OPEN"),
    false,
  );
  await page
    .getByRole("button", { name: "Ouvrir une console SSH ici", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fermer la session SSH", exact: true })
    .waitFor();
  assert.ok(
    mock.calls.some(
      (call) =>
        call.action === "REMOTE_TERMINAL_OPEN" &&
        call.payload.path === mock.root,
    ),
  );
  await screenshot("workspace");
  await page
    .getByRole("button", { name: "Fermer la session SSH", exact: true })
    .click();
  await page
    .locator(".remote-toolbar")
    .getByRole("button", { name: "Connexions", exact: true })
    .click();
  await manager.getByLabel("Nom", { exact: true }).waitFor();
  await page.setViewportSize({ width: 600, height: 820 });
  await screenshot("compact");
  assert.ok(
    await manager.evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
  );
  await manager.getByLabel("Protocole", { exact: true }).selectOption("ftps");
  await manager
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await manager
    .getByText("Connexion enregistrée sur cet appareil.", { exact: true })
    .waitFor();
  await manager.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  assert.equal(
    await page.getByRole("button", { name: "Console", exact: true }).count(),
    0,
    "FTP/FTPS does not offer an SSH terminal",
  );
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await settings
    .getByRole("button", { name: "Connexions", exact: true })
    .click();
  await settings
    .getByLabel("Activer les connexions aux serveurs", { exact: true })
    .uncheck();
  await settings
    .getByRole("button", { name: "Enregistrer les préférences", exact: true })
    .click();
  await settings
    .getByText("Préférences enregistrées", { exact: true })
    .waitFor();
  await settings.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#navigation-servers") &&
      !document.querySelector(".remote-toolbar"),
  );
  console.log(
    "Browser remote: activation, profiles, explicit SSH trust, Unicode navigation, copy-only drop, comparison, explicit SSH console and compact layout: OK (network mocked; SFTP engine tested separately in Go).",
  );
}
