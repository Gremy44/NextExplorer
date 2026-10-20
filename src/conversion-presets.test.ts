import { describe, expect, it } from "vitest";
import {
  defaultConversionPresets,
  restoreConversionPresets,
} from "./conversion-presets";
describe("conversion presets", () => {
  it("accepts builtins without files, destinations or credentials", () => {
    expect(restoreConversionPresets(defaultConversionPresets)).toEqual(
      defaultConversionPresets,
    );
    for (const key of [
      "path",
      "paths",
      "destination",
      "password",
      "__proto__",
      "toString",
    ]) {
      const values = JSON.parse(`{"format":"jpg","${key}":"private"}`);
      expect(() =>
        restoreConversionPresets([{ name: "bad", context: "convert", values }]),
      ).toThrow();
    }
  });
  it("checks names, limits, formats, codecs and booleans", () => {
    const preset = defaultConversionPresets[0];
    expect(() =>
      restoreConversionPresets([
        preset,
        { ...preset, name: preset.name.toUpperCase() },
      ]),
    ).toThrow();
    expect(() => restoreConversionPresets(Array(31).fill(preset))).toThrow();
    for (const values of [
      { format: "exe" },
      { format: "jpg", width: "20001" },
      { format: "jpg", strip: "true" },
      { format: "mp4", codec: "external-command" },
      { format: "mp4", videoQuality: "unknown" },
    ])
      expect(() =>
        restoreConversionPresets([{ name: "bad", context: "convert", values }]),
      ).toThrow();
    expect(() =>
      restoreConversionPresets([
        {
          name: "bad",
          context: "prepare",
          values: { format: "webp", width: "9000", quality: "80", maxMB: "2" },
        },
      ]),
    ).toThrow();
  });
  it("keeps legacy personal presets without offering an audio conversion", () => {
    const legacy = {
      name: "Ancien MP3",
      context: "convert",
      values: { format: "mp3", bitrate: "192" },
    };
    expect(restoreConversionPresets([legacy])).toEqual([legacy]);
    expect(
      defaultConversionPresets.some((preset) => preset.values.format === "mp3"),
    ).toBe(false);
  });
});
