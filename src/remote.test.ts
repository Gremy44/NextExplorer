import { describe, it, expect } from "vitest";
import {
  isRemote,
  remotePath,
  remoteLocation,
  compareFolders,
  remoteActions,
} from "./remote";
import { basename, join, pathBreadcrumbs, type Entry } from "./types";
import { defaultPreferences, restorePreferences } from "./preferences";

const entry = (
  name: string,
  size = 10,
  mtime = 100,
  type: Entry["type"] = "file",
): Entry => ({ name, path: `/test/${name}`, type, size, mtime, ext: ".txt" });
describe("remote folders", () => {
  it("keeps SFTP paths case-sensitive and encodes names without credentials", () => {
    const location = remoteLocation(
      "server-test",
      "/Images été/Versions #1%/a?.txt",
    );
    expect(remotePath(location)).toEqual({
      id: "server-test",
      directory: "/Images été/Versions #1%/a?.txt",
    });
    expect(basename(location)).toBe("a?.txt");
    expect(
      remotePath(join(remoteLocation("server-test", "/Images été"), "A #.txt"))
        .directory,
    ).toBe("/Images été/A #.txt");
    expect(pathBreadcrumbs(location).map((part) => part.name)).toEqual([
      "Serveur",
      "Images été",
      "Versions #1%",
      "a?.txt",
    ]);
    expect(isRemote("C:\\Images")).toBe(false);
  });
  it.each([
    "https://example.com/",
    "nxe-remote://bad/path",
    "nxe-remote://user@server-test/path",
    "nxe-remote://server-test/a?secret=x",
    "nxe-remote://server-test/a#b",
    "nxe-remote://server-test/a%5Cb",
    "nxe-remote://server-test/%00",
  ])("rejects invalid remote URI %s", (value) =>
    expect(() => remotePath(value)).toThrow(),
  );
  it("compares the displayed level without claiming equal content", () => {
    expect(
      compareFolders(
        [
          entry("missing"),
          entry("other-size", 12),
          entry("newer", 10, 110),
          entry("same"),
          entry("folder", 0, 100, "directory"),
          entry("FILE"),
        ],
        [
          entry("other-size"),
          entry("newer"),
          entry("same", 10, 101),
          entry("folder", 0, 100, "directory"),
          entry("file"),
        ],
      ).map((row) => row.status),
    ).toEqual(["missing", "different", "newer", "same", "folder", "missing"]);
  });
  it("keeps networking off for existing users and validates the activation switch", () => {
    expect(defaultPreferences.remoteEnabled).toBe(false);
    expect(restorePreferences({ version: 1 }).remoteEnabled).toBe(false);
    expect(() =>
      restorePreferences({ ...defaultPreferences, remoteEnabled: "true" }),
    ).toThrow();
    expect(
      restorePreferences({ ...defaultPreferences, remoteEnabled: true })
        .remoteEnabled,
    ).toBe(true);
  });
  it("exposes only actions that understand remote paths", () => {
    for (const action of [
      "cut",
      "open",
      "convert",
      "terminal",
      "quick",
      "zip",
      "trash",
    ])
      expect(remoteActions.has(action)).toBe(false);
    for (const action of [
      "copy",
      "paste",
      "preview",
      "mkdir",
      "remote-permissions",
    ])
      expect(remoteActions.has(action)).toBe(true);
  });
});
