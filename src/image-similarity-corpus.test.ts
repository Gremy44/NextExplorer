import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareImageSamples, type ImageSample } from "./image-similarity";

const magick = path.resolve(
  `native/tools/magick${process.platform === "win32" ? ".exe" : ""}`,
);
it.skipIf(!existsSync(magick))(
  "calibrates resized/reencoded variants against a small labelled synthetic image corpus",
  () => {
    mkdirSync("test-results", { recursive: true });
    const root = mkdtempSync(path.resolve("test-results/image-corpus-"));
    function run(args: string[]) {
      const result = spawnSync(magick, args, { windowsHide: true });
      if (result.status !== 0) throw new Error(result.stderr.toString());
      return result.stdout;
    }
    const source = path.join(root, "source.png");
    run([
      "-size",
      "160x120",
      "gradient:navy-gold",
      "-fill",
      "white",
      "-draw",
      "rectangle 10,20 40,70",
      "-fill",
      "red",
      "-draw",
      "circle 100,60 120,65",
      source,
    ]);
    function sample(file: string): ImageSample {
      const [width, height] = run([
        "-ping",
        file + "[0]",
        "-format",
        "%w %h",
        "info:",
      ])
        .toString()
        .split(" ")
        .map(Number);
      const pixels = run([
        file + "[0]",
        "-auto-orient",
        "-background",
        "white",
        "-alpha",
        "remove",
        "-alpha",
        "off",
        "-colorspace",
        "sRGB",
        "-resize",
        "9x8!",
        "-depth",
        "8",
        "rgb:-",
      ]).toString("hex");
      return {
        entry: {
          name: path.basename(file),
          path: file,
          type: "file",
          size: 1,
          mtime: 1,
          stamp: "1",
          ext: path.extname(file),
        },
        width,
        height,
        pixels,
      };
    }
    const cases: { name: string; positive: boolean; args: string[] }[] = [
      {
        name: "jpeg-78.jpg",
        positive: true,
        args: [source, "-resize", "80x60!", "-quality", "78"],
      },
      {
        name: "jpeg-60.jpg",
        positive: true,
        args: [source, "-resize", "120x90!", "-quality", "60"],
      },
      {
        name: "webp.webp",
        positive: true,
        args: [source, "-resize", "80x60!", "-quality", "80"],
      },
      {
        name: "resized.png",
        positive: true,
        args: [source, "-resize", "320x240!"],
      },
      {
        name: "tiff.tiff",
        positive: true,
        args: [
          source,
          "-resize",
          "320x240!",
          "-depth",
          "16",
          "-compress",
          "None",
        ],
      },
      ...["red", "blue", "white", "black", "gray", "green"].map((color) => ({
        name: `flat-${color}.png`,
        positive: false,
        args: ["-size", "160x120", `xc:${color}`],
      })),
      ...["checkerboard", "bricks", "gray50", "hexagons"].map((pattern) => ({
        name: `pattern-${pattern}.png`,
        positive: false,
        args: ["-size", "160x120", `pattern:${pattern}`],
      })),
      ...[30, 60, 140, 160].map((amount) => ({
        name: `recolor-${amount}.png`,
        positive: false,
        args: [source, "-modulate", `100,100,${amount}`],
      })),
      { name: "rotated.png", positive: false, args: [source, "-rotate", "90"] },
    ];
    const a = sample(source),
      report = cases.map((test) => {
        const file = path.join(root, test.name);
        run([...test.args, file]);
        return {
          name: test.name,
          expected: test.positive,
          ...compareImageSamples(a, sample(file)),
        };
      });
    const positive = report.filter((row) => row.expected),
      negative = report.filter((row) => !row.expected),
      tp = positive.filter((row) => row.similar).length,
      fp = negative.filter((row) => row.similar);
    writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(
        {
          corpus: "synthetic only",
          positives: positive.length,
          negatives: negative.length,
          truePositives: tp,
          falsePositives: fp.length,
          report,
        },
        null,
        2,
      ),
    );
    console.info("Image similarity corpus", {
      root,
      positives: positive.length,
      truePositives: tp,
      negatives: negative.length,
      falsePositives: fp.length,
    });
    expect(report.find((row) => row.name === "jpeg-78.jpg")?.similar).toBe(
      true,
    );
    expect(tp / positive.length).toBeGreaterThanOrEqual(0.8);
    expect(fp).toEqual([]);
  },
  30000,
);
