import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, open, copyFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { PDFDocument, degrees } from "pdf-lib";

export async function previewCorpus(fixture) {
  const folder = path.join(fixture, "Aperçus V1");
  await mkdir(folder);
  const engine = (name, args, cwd) =>
    execFileSync(path.resolve(`native/tools/${name}.exe`), args, {
      cwd,
      windowsHide: true,
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
  const images = [];
  const source = path.join(folder, "image.png");
  engine("magick", [
    "-size",
    "160x120",
    "gradient:navy-gold",
    "-fill",
    "white",
    "-draw",
    "rectangle 12,15 70,80",
    source,
  ]);
  for (const ext of [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "tif",
    "tiff",
    "avif",
  ]) {
    const file = `image.${ext}`;
    if (ext !== "png")
      engine("magick", [source, "-depth", "8", path.join(folder, file)]);
    images.push(file);
  }
  const heicSource =
    "https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic";
  const heicResponse = await fetch(heicSource, {
    signal: AbortSignal.timeout(15000),
  });
  if (!heicResponse.ok)
    throw new Error(`Image HEIC de recette : HTTP ${heicResponse.status}`);
  const heic = Buffer.from(await heicResponse.arrayBuffer());
  if (heic.length > 8 * 1024 * 1024)
    throw new Error("Image HEIC de recette trop grande");
  for (const ext of ["heic", "heif"]) {
    await writeFile(path.join(folder, `image.${ext}`), heic);
    images.push(`image.${ext}`);
  }
  const large = path.join(folder, "grand-144Mio.tiff");
  engine("magick", [
    source,
    "-resize",
    "6000x4000!",
    "-depth",
    "16",
    "-compress",
    "None",
    large,
  ]);
  const oversized = path.join(folder, "hors-limite.tiff");
  const sparse = await open(oversized, "w");
  await sparse.truncate(256 * 1024 * 1024 + 1);
  await sparse.close();
  await writeFile(
    path.join(folder, "corrompue.png"),
    "Ce fichier n’est pas une image.",
  );
  await writeFile(
    path.join(folder, "vecteur.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
  );
  await writeFile(
    path.join(folder, "grand.log"),
    "Ligne de recette de texte volumineux\n".repeat(100000),
  );
  await writeFile(
    path.join(folder, "code.json"),
    '{"recette":"texte JSON","version":1}',
  );
  await writeFile(
    path.join(folder, "note.md"),
    '# Note de recette\n\nAperçu Markdown. <img src="https://example.invalid/interdit.png" onerror="window.__previewInjected=true">',
  );
  await writeFile(
    path.join(folder, "utf16.txt"),
    Buffer.concat([
      Buffer.from([255, 254]),
      Buffer.from("Texte UTF-16 avec électricité", "utf16le"),
    ]),
  );
  await writeFile(
    path.join(folder, "invalide.weblink"),
    '{"url":"https://example.com","title":{"malforme":true}}',
  );
  await writeFile(
    path.join(folder, "lien.weblink"),
    JSON.stringify({
      url: "https://example.com",
      title: "Lien de recette",
      description: "Aperçu de lien local",
    }),
  );
  const pdf = await PDFDocument.create();
  pdf
    .addPage([595, 842])
    .drawText("Premiere page de recette PDF", { x: 40, y: 700, size: 20 });
  pdf
    .addPage([20000, 30000])
    .drawText("Deuxieme page de recette PDF", { x: 40, y: 100, size: 20 });
  pdf.addPage([400, 600]).setRotation(degrees(90));
  await writeFile(path.join(folder, "document.pdf"), await pdf.save());
  const largePDF = await PDFDocument.create();
  largePDF
    .addPage([595, 842])
    .drawText("PDF volumineux avec piece jointe locale", {
      x: 40,
      y: 700,
      size: 18,
    });
  await largePDF.attach(randomBytes(17 * 1024 * 1024), "piece-jointe.bin");
  await writeFile(
    path.join(folder, "document-17Mio.pdf"),
    await largePDF.save(),
  );
  const tooLargePDF = await open(path.join(folder, "hors-limite.pdf"), "w");
  await tooLargePDF.truncate(32 * 1024 * 1024 + 1);
  await tooLargePDF.close();
  await writeFile(path.join(folder, "corrompu.pdf"), "PDF non valide");
  await copyFile(
    "public/fonts/UbuntuMono-Regular.ttf",
    path.join(folder, "police.ttf"),
  );
  const fontSources = {
    "police.otf":
      "https://raw.githubusercontent.com/adobe-fonts/source-code-pro/release/OTF/SourceCodePro-Regular.otf",
    "police.woff": "fonts/GentiumPlus-R.woff",
    "police.woff2": "css/css-fonts/resources/NotoSansMongolian-18xx.woff2",
  };
  for (const [name, source] of Object.entries(fontSources)) {
    const url = source.startsWith("https://")
      ? source
      : `https://raw.githubusercontent.com/web-platform-tests/wpt/master/${source}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
      throw new Error(`Police de recette ${name} : HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1024 * 1024)
      throw new Error("Police de recette trop grande");
    await writeFile(path.join(folder, name), bytes);
  }
  const media = [];
  const video = path.join(folder, "video.mp4");
  engine("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=128x96:duration=2:rate=8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    video,
  ]);
  for (const ext of ["mp4", "m4v", "mov", "mkv", "avi", "webm"]) {
    const file = `video.${ext}`;
    if (ext !== "mp4")
      engine("ffmpeg", [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        video,
        "-an",
        ...(ext === "webm"
          ? ["-c:v", "libvpx-vp9"]
          : ext === "avi"
            ? ["-c:v", "mpeg4"]
            : ["-c:v", "copy"]),
        path.join(folder, file),
      ]);
    media.push({ file, required: !["avi", "mkv"].includes(ext) });
  }
  await copyFile(video, path.join(folder, "video-512Mio.mp4"));
  const bigVideo = await open(path.join(folder, "video-512Mio.mp4"), "r+");
  await bigVideo.truncate(512 * 1024 * 1024);
  await bigVideo.close();
  for (const ext of ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"]) {
    const file = `audio.${ext}`;
    engine("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.5",
      "-ar",
      "48000",
      path.join(folder, file),
    ]);
    media.push({ file, required: true });
  }
  const files = {
    "word/document.xml":
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document Office de recette</w:t></w:r></w:p></w:body></w:document>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="inlineStr"><is><t>Tableur Office de recette</t></is></c></row></sheetData></worksheet>',
    "ppt/slides/slide1.xml":
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Presentation Office de recette</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    "note.txt": "Texte dans une archive de recette",
  };
  const archiveRoot = path.join(fixture, "contenu-archives-v1");
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(archiveRoot, name)), {
      recursive: true,
    });
    await writeFile(path.join(archiveRoot, name), text);
  }
  for (const [ext, name] of [
    ["docx", "word/document.xml"],
    ["xlsx", "xl/worksheets/sheet1.xml"],
    ["pptx", "ppt/slides/slide1.xml"],
  ])
    engine(
      "7z",
      ["a", "-tzip", path.join(folder, `document.${ext}`), name],
      archiveRoot,
    );
  for (const type of ["zip", "7z"])
    engine(
      "7z",
      ["a", `-t${type}`, path.join(folder, `archive.${type}`), "note.txt"],
      archiveRoot,
    );
  const hashes = Object.fromEntries(
    await Promise.all(
      [
        ...images,
        "grand-144Mio.tiff",
        "document.pdf",
        "document-17Mio.pdf",
        "document.docx",
        "document.xlsx",
        "document.pptx",
        "archive.zip",
        "archive.7z",
        "police.ttf",
        "police.otf",
        "police.woff",
        "police.woff2",
        ...media.map(({ file }) => file),
      ].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(path.join(folder, file)))
          .digest("hex"),
      ]),
    ),
  );
  return { folder, images, media, hashes, fontSources, heicSource };
}
