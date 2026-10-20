import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

const root = process.cwd();
const fixture = await mkdtemp(path.resolve("test-results/j5-worker-"));
const appdata = path.join(fixture, "appdata");
const destination = path.join(fixture, "output");
await mkdir(destination);
const id = (await readFile("extension-id.txt", "utf8")).trim();
const original = path.join(fixture, "image.png");
const originalBytes = await readFile("public/icon128.png");
await writeFile(original, originalBytes);
const text = path.join(fixture, "source.txt");
await writeFile(text, "keep these bytes");
let workerInfo;
const proxies = new Set();
function proxy() {
  const child = spawn(
    path.resolve("native/native-host.exe"),
    [`chrome-extension://${id}/`],
    {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, APPDATA: appdata, AppData: appdata },
    },
  );
  proxies.add(child);
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  let closed = false;
  child.stderr.on("data", (b) => process.stderr.write(b));
  child.stdout.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
      const size = buffer.readUInt32LE(0);
      const m = JSON.parse(buffer.subarray(4, 4 + size));
      buffer = buffer.subarray(4 + size);
      const route = pending.get(m.id);
      if (route) {
        pending.delete(m.id);
        clearTimeout(route.timer);
        m.status === "SUCCESS"
          ? route.resolve(m.data)
          : route.reject(new Error(m.error));
      }
    }
  });
  child.on("exit", () => {
    closed = true;
    proxies.delete(child);
    for (const route of pending.values()) {
      clearTimeout(route.timer);
      route.reject(new Error("native proxy exited"));
    }
    pending.clear();
  });
  return {
    child,
    async request(action, payload = {}) {
      if (closed) throw new Error("closed");
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timeout: ${action}`));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        const body = Buffer.from(JSON.stringify({ id, action, payload })),
          header = Buffer.alloc(4);
        header.writeUInt32LE(body.length);
        child.stdin.write(Buffer.concat([header, body]));
      });
    },
    async close() {
      if (closed) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.stdin.end();
      await exited;
    },
  };
}
async function waitJob(client, id) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const j = (await client.request("JOBS")).find((j) => j.id === id);
    if (j?.state === "completed") return j;
    if (j && ["error", "cancelled"].includes(j.state))
      throw new Error(JSON.stringify(j));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("job timeout");
}
try {
  let client = proxy();
  const hello = await client.request("HELLO", { protocolVersion: 1 });
  assert.equal(hello.features.durableJobs, true);
  workerInfo = await client.request("WORKER_HELLO");
  assert.equal(
    workerInfo.tasks,
    path.join(appdata, "NextExplorer", "worker", "tasks"),
  );
  const first = await client.request("FS_TRANSFER", {
    paths: [text],
    destination,
    mode: "copy",
    conflict: "rename",
    paused: true,
  });
  const second = await client.request("ZIP", {
    paths: [text],
    destination,
    name: "source.zip",
  });
  await client.close();
  client = proxy();
  assert.equal((await client.request("WORKER_HELLO")).pid, workerInfo.pid);
  let jobs = await client.request("JOBS");
  assert.equal(jobs.find((j) => j.id === first.jobId).state, "paused");
  assert.equal(jobs.find((j) => j.id === second.jobId).state, "queued");
  assert.deepEqual(await readdir(destination), []);
  await assert.rejects(
    client.request("FS_TRASH", { paths: [text] }),
    /bloque les modifications/,
  );
  assert.equal(await readFile(text, "utf8"), "keep these bytes");
  await client.request("JOB_CONTROL", {
    jobId: first.jobId,
    command: "resume",
  });
  await waitJob(client, first.jobId);
  await waitJob(client, second.jobId);
  const recipe = await client.request("RECIPE", {
    paths: [original],
    destination,
    format: "webp",
    width: 64,
    quality: 82,
    strip: true,
    archive: true,
    name: "images.zip",
  });
  await waitJob(client, recipe.jobId);
  const result = await client.request("JOB_RESULT", { jobId: recipe.jobId });
  assert.equal(result.copies.length, 1);
  assert.equal(result.archive.path, path.join(destination, "images.zip"));
  const entry = await client.request("FS_STAT", { path: original });
  const sample = await client.request("IMAGE_SAMPLE", {
    path: original,
    expected: entry,
  });
  assert.equal(sample.pixels.length, 432);
  const thumbnail = await client.request("IMAGE_PREVIEW", {
    path: original,
    expected: entry,
    width: 640,
  });
  assert.ok(Buffer.from(thumbnail.data, "base64").length < 700 * 1024);
  const pending = await client.request("FS_TRANSFER", {
    paths: [original],
    destination,
    mode: "copy",
    conflict: "rename",
    paused: true,
  });
  process.kill(workerInfo.pid);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    (await client.request("FS_STAT", { path: original })).size,
    originalBytes.length,
  );
  const oldPid = workerInfo.pid;
  workerInfo = await client.request("WORKER_HELLO");
  assert.notEqual(workerInfo.pid, oldPid);
  jobs = await client.request("JOBS");
  const interrupted = jobs.find((j) => j.id === pending.jobId);
  assert.equal(interrupted.state, "interrupted");
  assert.equal(interrupted.recoverable, true);
  assert.ok(!(await readdir(destination)).includes("image.png"));
  assert.deepEqual(
    await client.request("JOB_RESULT", { jobId: recipe.jobId }),
    result,
  );
  await client.request("JOB_CONTROL", {
    jobId: pending.jobId,
    command: "recover",
  });
  await waitJob(client, pending.jobId);
  assert.equal(
    (await readdir(destination)).filter((name) =>
      /^image(?: \(\d+\))?\.png$/.test(name),
    ).length,
    1,
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(original))
      .digest("hex"),
    createHash("sha256").update(originalBytes).digest("hex"),
  );
  await writeFile(
    path.join(fixture, "result.json"),
    JSON.stringify(
      {
        passed: true,
        first: first.jobId,
        recipe: recipe.jobId,
        recovered: pending.jobId,
        worker: workerInfo,
      },
      null,
      2,
    ),
  );
  console.log(
    "J5 worker: proxy reconnect, FIFO, paused crash/recovery, durable results, recipe, native thumbnail/sample and intact originals: OK",
    fixture,
  );
} finally {
  for (const child of proxies) child.kill();
  if (
    workerInfo?.tasks === path.join(appdata, "NextExplorer", "worker", "tasks")
  ) {
    try {
      process.kill(workerInfo.pid);
    } catch {}
  }
}
