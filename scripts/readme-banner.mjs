import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 640 },
  });
  // Brand illustration, separate from the unchanged screenshots of the actual product.
  await page.setContent(`<!doctype html><html lang="fr"><meta charset="utf-8"><style>
    body{margin:0}svg{display:block;font-family:"Segoe UI",sans-serif}
  </style><svg xmlns="http://www.w3.org/2000/svg" width="1920" height="640" viewBox="0 0 1920 640" role="img" aria-label="NextExplorer : votre explorateur, dans Chrome">
    <rect width="1920" height="640" fill="#111318"/>
    <rect x="1100" width="820" height="640" fill="#1b1e25"/>
    <path d="M1100 0H1920V640H984Z" fill="#222b3b"/>
    <g transform="translate(72 58)">
      <rect width="52" height="52" rx="15" fill="#284777"/>
      <g fill="none" stroke="#d6e3ff" stroke-width="2.7" stroke-linejoin="round">
        <path d="m26 12 14 7-14 7-14-7 14-7Z"/><path d="m12 25 14 7 14-7M12 32l14 7 14-7"/>
      </g>
      <text x="70" y="37" font-size="34" font-weight="600" fill="#e2e2e9">NextExplorer</text>
    </g>
    <text x="72" y="255" font-size="104" font-weight="650" letter-spacing="-4" fill="#f0f2f8">Votre explorateur,</text>
    <text x="72" y="369" font-size="104" font-weight="650" letter-spacing="-4" fill="#aac7ff">dans Chrome.</text>
    <text x="76" y="444" font-size="31" fill="#c4c6d0">Gardez vos fichiers à côté du web.</text>
    <g transform="translate(76 546)" font-size="24" fill="#d6e3ff">
      <circle cx="7" cy="-8" r="6" fill="#bfd1ba"/>
      <text x="26">Fichiers locaux</text><text x="254" fill="#8e9099">/</text>
      <text x="288">Windows + Chrome</text><text x="566" fill="#8e9099">/</text>
      <text x="600">Préversion gratuite</text>
    </g>
    <g transform="translate(1132 112)">
      <rect x="0" y="12" width="700" height="414" rx="25" fill="#101318" stroke="#506582" stroke-width="2"/>
      <path d="M25 12h650a25 25 0 0 1 25 25v47H0V37a25 25 0 0 1 25-25Z" fill="#34445f"/>
      <circle cx="28" cy="48" r="5" fill="#aac7ff"/>
      <rect x="52" y="31" width="252" height="36" rx="18" fill="#222b3b"/>
      <text x="75" y="56" fill="#d6e3ff" font-size="19">Votre page web</text>
      <path d="M465 85V425" stroke="#506582" stroke-width="2"/>
      <text x="494" y="131" fill="#d6e3ff" font-size="21" font-weight="600">Vos fichiers</text>
      <g fill="none" stroke="#e7bd72" stroke-width="3" stroke-linejoin="round">
        <path d="M498 167h17l7 8h29v29h-53Z"/>
        <path d="M498 227h17l7 8h29v29h-53Z"/>
      </g>
      <path d="M567 182h93M567 242h70" stroke="#697a94" stroke-width="7" stroke-linecap="round"/>
      <rect x="47" y="133" width="364" height="235" rx="18" fill="#1b1e25" stroke="#aac7ff" stroke-width="2" stroke-dasharray="9 9"/>
      <text x="229" y="337" text-anchor="middle" fill="#c4c6d0" font-size="22">Déposez sur le site</text>
      <path d="M564 333C515 346 439 282 328 242" fill="none" stroke="#aac7ff" stroke-width="4" stroke-dasharray="8 8"/>
      <path d="m345 238-20 3 10 17" fill="none" stroke="#aac7ff" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(188 172) rotate(-9 51 56)">
        <path d="M0 8a8 8 0 0 1 8-8h59l35 35v81a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8Z" fill="#d6e3ff"/>
        <path d="M67 0v35h35" fill="#aac7ff"/>
        <path d="M24 64h52M24 82h39" stroke="#284777" stroke-width="6" stroke-linecap="round"/>
      </g>
    </g>
  </svg></html>`);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator("svg").getAttribute("width"), "1920");
  for (const text of await page.locator("svg text").all()) {
    const box = await text.boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 1920 &&
        box.y + box.height <= 640,
      "Banner text clipped",
    );
  }
  await mkdir("distribution/images", { recursive: true });
  const bytes = await page.screenshot({
    path: "distribution/images/banniere.png",
  });
  assert.equal(bytes.readUInt32BE(16), 1920);
  assert.equal(bytes.readUInt32BE(20), 640);
  console.log(
    "README : bannière de marque 1920 × 640, illustration vectorielle, texte sans débordement.",
  );
  await page.setViewportSize({ width: 800, height: 160 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block;font-family:"Segoe UI",sans-serif}</style>
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="160" viewBox="0 0 800 160" role="img" aria-label="Offrir un café sur Buy Me a Coffee">
      <rect x="3" y="3" width="794" height="154" rx="34" fill="#e7bd72" stroke="#b78e49" stroke-width="3"/>
      <g fill="none" stroke="#322914" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M138 66h10a18 18 0 0 1 0 36h-10"/>
        <path d="M62 58h76v42a24 24 0 0 1-24 24H86a24 24 0 0 1-24-24Z" fill="#fff4d8"/>
        <path d="M55 136h92M83 40c-8-10 8-12 0-22M111 40c-8-10 8-12 0-22"/>
        <path d="M712 80h34m-13-13 13 13-13 13"/>
      </g>
      <text x="202" y="76" fill="#322914" font-size="50" font-weight="650">Offrir un café</text>
      <text x="204" y="121" fill="#4c3a1d" font-size="30">sur Buy Me a Coffee</text>
    </svg>`);
  await page.evaluate(() => document.fonts.ready);
  for (const text of await page.locator("svg text").all()) {
    const box = await text.boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 700 &&
        box.y + box.height <= 160,
      "Support button text clipped",
    );
  }
  const support = await page.screenshot({
    path: "distribution/images/soutenir.png",
    omitBackground: true,
  });
  assert.equal(support.readUInt32BE(16), 800);
  assert.equal(support.readUInt32BE(20), 160);
  console.log(
    "README : bouton de soutien 800 × 160, affichage 320 × 64, destination Buy Me a Coffee.",
  );
} finally {
  await browser.close();
}
