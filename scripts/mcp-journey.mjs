import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mcpClient } from "./mcp-client.mjs";
import { PDFDocument } from "pdf-lib";
import { createServer } from "node:http";
export async function runMCPJourney({ page, context, fixture, root, appdata }) {
  const env = { ...process.env, APPDATA: appdata, AppData: appdata };
  const config = path.join(root, "mcp.json"),
    readConfig = path.join(root, "read-only.json");
  await writeFile(
    config,
    JSON.stringify({
      roots: [fixture],
      capabilities: [
        "write",
        "browser",
        "settings",
        "network",
        "terminal",
        "automation",
      ],
      session: "acceptance",
    }),
  );
  await writeFile(
    readConfig,
    JSON.stringify({
      roots: [fixture],
      capabilities: [],
      session: "acceptance",
    }),
  );
  const mcp = await mcpClient(
    path.resolve("native/native-host.exe"),
    config,
    env,
  );
  let readOnly;
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><title>MCP web acceptance</title><p id="text">Une sélection locale pour MCP.</p><label>Fichier<input id="file" type="file"></label>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const allTools = [];
    let cursor;
    do {
      const result = await mcp.rpc("tools/list", cursor ? { cursor } : {});
      allTools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);
    assert.ok(allTools.length >= 85, `Incomplete catalogue ${allTools.length}`);
    for (const tool of allTools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    const resources = await mcp.rpc("resources/list");
    assert.ok(
      resources.resources.some((r) => r.uri === "nextexplorer://capabilities"),
    );
    await mcp.rpc("resources/read", { uri: "nextexplorer://capabilities" });
    assert.equal(
      (await mcp.call("hello")).mcp.roots[0].toLowerCase(),
      fixture.toLowerCase(),
    );
    await assert.rejects(mcp.call("fs_stat", { path: root }), /hors|autoris/i);
    await assert.rejects(
      mcp.call("fs_stat", { path: fixture, owner: "forged" }),
      /invalid|additional|propert|inconnu/i,
    );
    await assert.rejects(mcp.call("browser_context"), /profil|activ/i);
    await assert.rejects(
      mcp.call("fs_write", {
        path: fixture,
        name: "oversized.txt",
        text: "x".repeat(800 * 1024),
      }),
      /768|volumineux/i,
    );
    await assert.rejects(readFile(path.join(fixture, "oversized.txt")));
    await mcp.call("fs_write", {
      path: fixture,
      name: "MCP.txt",
      text: "Bonjour depuis MCP, classement local.",
    });
    const file = path.join(fixture, "MCP.txt"),
      listing = await mcp.call("fs_list_dir", { path: fixture, limit: 1 });
    assert.ok(listing.entries.length <= 1);
    const doc = await mcp.call("editor_read", { path: file });
    await mcp.call("editor_save", {
      path: file,
      text: doc.text + "\nModifié sans conflit.",
      expected: doc.entry,
      snapshot: doc.hash,
    });
    await assert.rejects(
      mcp.call("editor_save", {
        path: file,
        text: "stale",
        expected: doc.entry,
        snapshot: doc.hash,
      }),
      /modifi/i,
    );
    const versions = await mcp.call("file_versions", { path: file });
    assert.ok(versions.length > 0);
    assert.match(
      (
        await mcp.call("file_version_read", {
          path: file,
          name: versions[0].id,
        })
      ).text,
      /Bonjour/,
    );
    const job = await mcp.call("scan", { path: fixture });
    assert.ok(job.jobId);
    for (let i = 0; i < 100; i++) {
      const rows = await mcp.call("jobs");
      const scan = rows.find((r) => r.id === job.jobId);
      assert.ok(scan);
      if (scan.state === "completed") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await mcp.call("job_result", { jobId: job.jobId, limit: 10 });
    await assert.rejects(
      mcp.call("job_result", { jobId: "someone-elses-job" }),
      /périmètre/,
    );
    readOnly = await mcpClient(
      path.resolve("native/native-host.exe"),
      readConfig,
      env,
    );
    await assert.rejects(
      readOnly.call("fs_write", {
        path: fixture,
        name: "denied.txt",
        text: "no",
      }),
      /capacité/,
    );
    await assert.rejects(
      readOnly.call("terminal_open", { path: fixture }),
      /capacité/,
    );
    await readOnly.call("fs_read", { path: file, offset: 0, limit: 100 });
    await page.getByRole("button", { name: "Réglages", exact: true }).click();
    await page.getByRole("button", { name: "Connexions", exact: true }).click();
    await page
      .getByLabel("Autoriser les assistants MCP locaux", { exact: true })
      .check();
    await page
      .getByLabel("Autoriser leurs modifications dans ce navigateur", {
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Enregistrer les préférences", exact: true })
      .click();
    await page.getByText("Préférences enregistrées", { exact: true }).waitFor();
    let browser;
    for (let i = 0; i < 40; i++) {
      try {
        browser = await mcp.call("browser_context");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(browser?.views?.length === 1, JSON.stringify(browser));
    const viewId = browser.views[0].viewId;
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("MCP document local");
    const sourcePDF = path.join(fixture, "MCP-source.pdf");
    await writeFile(sourcePDF, await pdf.save());
    const combined = await mcp.call("browser_document", {
      viewId,
      operation: "combine",
      paths: [sourcePDF],
      path: fixture,
      name: "MCP-combined.pdf",
    });
    assert.equal(combined.complete, true);
    assert.equal(
      (await PDFDocument.load(await readFile(combined.path))).getPageCount(),
      1,
    );
    const png = await readFile("public/icon128.png");
    const annotated = await mcp.call("browser_document", {
      viewId,
      operation: "annotate",
      paths: [sourcePDF],
      path: fixture,
      name: "MCP-annotated.pdf",
      value: {
        overlays: [
          {
            page: 0,
            x: 10,
            y: 10,
            width: 32,
            height: 32,
            angle: 0,
            data: png.toString("base64"),
          },
        ],
      },
    });
    assert.equal(annotated.complete, true);
    await assert.rejects(
      mcp.call("browser_document", {
        viewId,
        operation: "combine",
        paths: [sourcePDF],
        path: root,
        name: "outside.pdf",
      }),
      /hors|autoris/,
    );
    const compare = await mcp.call("browser_compare", {
      paths: [fixture, fixture],
    });
    assert.ok(compare.total > 0);
    assert.ok(compare.rows.every((r) => ["same", "folder"].includes(r.status)));
    if ((await mcp.call("hello")).tools.magick) {
      const image = path.join(fixture, "MCP-image.png");
      await writeFile(image, png);
      const prepared = await mcp.call("browser_prepare_images", {
        operation: "start",
        paths: [image],
        path: fixture,
        value: {
          format: "webp",
          width: 64,
          quality: 80,
          maxBytes: 1024 * 1024,
          strip: true,
        },
      });
      assert.ok(prepared.jobId);
      let checked;
      for (let i = 0; i < 100; i++) {
        checked = await mcp.call("browser_prepare_images", {
          operation: "check",
          id: prepared.id,
        });
        if (checked) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(checked?.every((r) => r.check.compatible));
      const imageCopy = await mcp.call("browser_document", {
        viewId,
        operation: "annotate-image",
        paths: [image],
        path: fixture,
        name: "MCP-image-annotated.png",
        value: {
          overlays: [
            {
              page: 0,
              x: 0,
              y: 0,
              width: 20,
              height: 20,
              angle: 0,
              data: png.toString("base64"),
            },
          ],
        },
      });
      assert.equal(imageCopy.complete, true);
      const expected = await mcp.call("fs_stat", { path: image });
      const preview = await mcp.rpc("tools/call", {
        name: "nxe_image_preview",
        arguments: { path: image, expected, width: 128 },
      });
      assert.ok(preview.content.some((c) => c.type === "image"));
    }
    await mcp.call("browser_organization_write", {
      domain: "tags",
      operation: "label",
      value: { id: "mcp", name: "MCP vérifié", color: "green" },
    });
    await mcp.call("browser_organization_write", {
      domain: "tags",
      operation: "assign",
      paths: [file],
      id: "mcp",
    });
    const tags = await mcp.call("browser_organization_read", {
      domain: "tags",
    });
    assert.ok(tags.labels.some((t) => t.id === "mcp"));
    assert.ok(Object.values(tags.files).some((v) => v.includes("mcp")));
    await assert.rejects(
      mcp.call("browser_organization_write", {
        domain: "appearances",
        operation: "set",
        paths: [root],
        value: { color: "blue", symbol: "" },
      }),
      /hors|autoris/,
    );
    await mcp.call("browser_organization_write", {
      domain: "favorites",
      operation: "add",
      value: { path: fixture, name: "MCP" },
    });
    await mcp.call("browser_organization_write", {
      domain: "appearances",
      operation: "set",
      paths: [fixture],
      value: { color: "blue", symbol: "" },
    });
    await mcp.call("browser_preferences", { value: { density: "compact" } });
    await assert.rejects(
      mcp.call("browser_preferences", { value: { mcpEnabled: false } }),
      /autoris/,
    );
    await mcp.call("browser_console_settings", {
      value: { palette: "lcd", fontSize: 14 },
    });
    const search = await mcp.call("browser_search", {
      path: fixture,
      query: "classement",
      mode: "content",
    });
    assert.ok(
      search.results.some((r) => r.entry?.path === file),
      JSON.stringify(search),
    );
    await mcp.call("browser_ui", {
      viewId,
      operation: "tab-new",
      path: fixture,
    });
    for (let i = 0; i < 30; i++) {
      browser = await mcp.call("browser_context");
      if (browser.views[0].tabs.length === 2) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(browser.views[0].tabs.length, 2);
    await mcp.call("browser_ui", { viewId, operation: "view", mode: "tiles" });
    await mcp.call("browser_ui", {
      viewId,
      operation: "sort",
      value: { by: "size", order: "desc" },
    });
    await mcp.call("browser_ui", {
      viewId,
      operation: "split",
      value: { enabled: true, ratio: 60 },
    });
    await mcp.call("browser_ui", {
      viewId,
      operation: "workspace-save",
      value: { name: "Espace MCP" },
    });
    const saved = await mcp.call("browser_organization_read", {
      domain: "spaces",
    });
    assert.equal(saved.items.length, 1);
    await mcp.call("browser_organization_write", {
      domain: "spaces",
      operation: "upsert",
      value: {
        ...saved.items[0],
        tasks: [{ id: "todo", label: "Tester MCP", done: false }],
      },
    });
    const session = await mcp.call("terminal_open", { path: fixture });
    assert.ok(session.id);
    await mcp.call("terminal_write", {
      session: session.id,
      data: "Write-Output 'MCP-TERMINAL-OK'\r",
    });
    let output = "";
    for (let i = 0; i < 100; i++) {
      const r = await mcp.call("terminal_read", { session: session.id });
      output += Buffer.from(r.data || "", "base64").toString();
      if (output.includes("MCP-TERMINAL-OK")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(output, /MCP-TERMINAL-OK/);
    await mcp.call("terminal_close", { session: session.id });
    await mcp.call("browser_ui", {
      viewId,
      operation: "filter",
      value: { query: "MCP" },
    });
    await mcp.call("browser_ui", {
      viewId,
      operation: "filter",
      value: { query: "" },
    });
    await mcp.call("browser_ui", {
      viewId,
      operation: "pane",
      value: { index: 1 },
    });
    const uiScan = await mcp.call("browser_tool", {
      viewId,
      operation: "scan",
    });
    assert.ok(uiScan.jobId);
    const site = await context.newPage(),
      url = `http://127.0.0.1:${server.address().port}/`;
    await site.goto(url);
    await site.bringToFront();
    const captured = await mcp.call("browser_web", {
      viewId,
      operation: "capture",
      path: fixture,
      url,
      mode: "markdown",
    });
    assert.match(await readFile(captured.path, "utf8"), /MCP web acceptance/);
    const pagePDF = await mcp.call("browser_web", {
      viewId,
      operation: "pdf",
      path: fixture,
    });
    assert.equal(pagePDF.complete, true);
    await site.locator("#text").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await mcp.call("browser_web", { viewId, operation: "selection" });
    const capture = await mcp.call("browser_organization_read", {
      domain: "captures",
    });
    assert.match(capture.text, /sélection locale/);
    await mcp.call("browser_organization_write", {
      domain: "captures",
      operation: "remove",
      id: capture.id,
    });
    const form = await mcp.call("browser_web", {
      viewId,
      operation: "uploads",
    });
    assert.equal(form.fields.length, 1);
    await mcp.call("browser_web", {
      viewId,
      operation: "insert",
      paths: [file],
      value: {
        target: {
          page: form.page,
          documentId: form.documentId,
          field: form.fields[0],
        },
      },
    });
    assert.equal(
      await site.locator("#file").evaluate((el) => el.files[0].name),
      "MCP.txt",
    );
    const browserSession = await mcp.call("browser_web", {
      operation: "session",
    });
    assert.ok(browserSession.tabs.some((t) => t.url === url));
    await site.close();
    const other = await context.newPage();
    await other.goto(page.url());
    await other.getByText("Compagnon connecté", { exact: true }).waitFor();
    await assert.rejects(
      mcp.call("browser_ui", { operation: "refresh" }),
      /vues|viewId/,
    );
    await mcp.call("browser_ui", { operation: "refresh", viewId });
    await other.close();
    await page.screenshot({ path: path.join(root, "mcp-ui.png") });
    // Disabling takes effect before a subsequent browser action can be relayed.
    await page.evaluate(async () => {
      const { explorerPreferences: p } = await chrome.storage.local.get(
        "explorerPreferences",
      );
      await chrome.storage.local.set({
        explorerPreferences: { ...p, mcpEnabled: false },
      });
    });
    await new Promise((r) => setTimeout(r, 250));
    await assert.rejects(mcp.call("browser_context"), /profils|désactiv|activ/);
    console.log(
      `MCP ${allTools.length} outils : stdio, schémas, scopes, écriture/édition/versions, tâches, navigateur, tags, apparence, favoris, recherche, onglets, double panneau, espaces, console, ambiguïté et révocation : OK`,
    );
  } finally {
    await readOnly?.close();
    await mcp.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
