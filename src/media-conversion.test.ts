import { describe, expect, it } from "vitest";
import {
  conversionKind,
  conversionOptions,
  conversionPayload,
  videoCodecs,
  videoFormats,
} from "./media-conversion";
describe("contextual image and video conversion", () => {
  it("uses only installed encoders and keeps remux available without one", () => {
    expect(
      conversionOptions("video", { codec: "libsvtav1" }, ["libx264"]).codec,
    ).toBe("libx264");
    expect(
      conversionOptions("video", { format: "webm" }, ["libx264"]).codec,
    ).toBe("");
    expect(
      conversionPayload(
        "video",
        conversionOptions("video", { mode: "remux" }, []),
      ),
    ).toEqual({ format: "mp4", mode: "remux", strip: false, archive: false });
  });
  it("excludes documents, audio, directories, links and misleading suffixes", () => {
    for (const path of [
      "x.txt",
      "x.pdf",
      "x.mp3",
      "x.wav",
      "x.png.exe",
      "x.svg",
    ])
      expect(conversionKind({ type: "file", path })).toBeNull();
    expect(conversionKind({ type: "directory", path: "x.png" })).toBeNull();
    expect(conversionKind({ type: "symlink", path: "x.mp4" })).toBeNull();
    expect(conversionKind({ type: "file", path: "PHOTO.TIFF" })).toBe("image");
    expect(conversionKind({ type: "file", path: "film.m4v" })).toBe("video");
  });
  it("sends only image options for an image, including legacy presets", () => {
    const payload = conversionPayload(
      "image",
      conversionOptions("image", {
        format: "jpeg",
        codec: "libx264",
        normalize: true,
        mode: "remux",
        width: "640",
        quality: "90",
      }),
    );
    expect(payload).toEqual({
      format: "jpg",
      width: 640,
      quality: 90,
      strip: true,
      archive: false,
    });
  });
  it("selects a compatible encoder for every container and excludes image quality", () => {
    for (const format of videoFormats) {
      const options = conversionOptions("video", {
        format,
        codec: "h264_nvenc",
        width: "20000",
      });
      expect(videoCodecs[format]).toContain(options.codec);
      expect(options.width).toBe("0");
      expect(conversionOptions("video", { width: "1.5" }).width).toBe("0");
      expect(conversionPayload("video", options)).not.toHaveProperty("quality");
    }
    expect(() =>
      conversionPayload("video", {
        ...conversionOptions("video"),
        format: "webm",
        codec: "libx264",
      }),
    ).toThrow();
  });
  it("does not send reencoding options when only changing containers", () => {
    expect(
      conversionPayload(
        "video",
        conversionOptions("video", { mode: "remux", format: "mkv" }),
      ),
    ).toEqual({ format: "mkv", mode: "remux", strip: false, archive: false });
  });
});
