import { describe, it, expect } from "vitest";
import { subtitleToVTT, codecWarning } from "./subtitles";
import { archiveChildren } from "./ArchiveBrowser";

describe("documents and media", () => {
  it("converts SRT to safe timed text and discards styling", () => {
    const output = subtitleToVTT(
      "1\r\n00:00:01,000 --> 00:00:02,500\r\n<b>Bonjour</b> & salut\r\n\r\nSTYLE\r\n::cue { color:red }",
    );
    expect(output).toContain("00:00:01.000 --> 00:00:02.500");
    expect(output).toContain("&lt;b&gt;Bonjour&lt;/b&gt; &amp; salut");
    expect(output).not.toContain("color:red");
  });
  it("accepts WebVTT but rejects invalid timestamps and oversized inputs", () => {
    expect(subtitleToVTT("WEBVTT\n\n00:01.000 --> 00:02.000\nHello")).toContain(
      "Hello",
    );
    for (const value of [
      "00:99.000 --> 01:00.000\nx",
      "00:02.000 --> 00:01.000\nx",
      "x".repeat(131073),
      "plain text",
    ])
      expect(() => subtitleToVTT(value)).toThrow();
    expect(codecWarning("hevc")).toContain("non garanti");
    expect(codecWarning("h264")).toBe("");
  });
  it("builds virtual archive folders without mixing sibling prefixes", () => {
    const files = [
      { name: "a/b.txt", size: 2, directory: false },
      { name: "a/c.txt", size: 3, directory: false },
      { name: "ab/z.txt", size: 4, directory: false },
      { name: "root.txt", size: 8, directory: false },
    ];
    expect(archiveChildren(files, "").map((x) => x.name)).toEqual([
      "a/",
      "ab/",
      "root.txt",
    ]);
    expect(archiveChildren(files, "a/").map((x) => x.name)).toEqual([
      "a/b.txt",
      "a/c.txt",
    ]);
  });
});
