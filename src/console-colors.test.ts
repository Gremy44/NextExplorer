import { expect, it } from "vitest";
import {
  consoleTheme,
  consoleFontFamily,
  defaultConsoleColors,
  restoreConsoleColors,
} from "./console-colors";

it("restores valid choices and rejects malformed stored colors", () => {
  expect(restoreConsoleColors(null)).toEqual(defaultConsoleColors);
  expect(
    restoreConsoleColors({
      palette: "unknown",
      background: "url(https://example.com)",
      foreground: 123,
    }),
  ).toEqual(defaultConsoleColors);
  expect(
    restoreConsoleColors({
      palette: "custom",
      background: "#001122",
      foreground: "#AABBCC",
    }),
  ).toEqual({
    ...defaultConsoleColors,
    palette: "custom",
    background: "#001122",
    foreground: "#AABBCC",
  });
});
it("follows the interface or applies a fixed palette with a matching cursor", () => {
  const inherited = { background: "#111318", foreground: "#e2e2e9" };
  expect(consoleTheme(defaultConsoleColors, inherited)).toBe(inherited);
  expect(
    consoleTheme({ ...defaultConsoleColors, palette: "blue" }, inherited)
      .background,
  ).toBe("#012456");
  expect(
    consoleTheme({ ...defaultConsoleColors, palette: "light" }, inherited)
      .background,
  ).toBe("#ffffff");
  const custom = consoleTheme(
    {
      ...defaultConsoleColors,
      palette: "custom",
      background: "#112233",
      foreground: "#abcdef",
    },
    inherited,
  );
  expect(custom).toMatchObject({
    background: "#112233",
    foreground: "#abcdef",
    cursor: "#abcdef",
    selectionBackground: "#abcdef40",
  });
});

it("migrates saved palettes without changing their colors or losing new typography", () => {
  const saved = {
    palette: "custom",
    background: "#112233",
    foreground: "#abcdef",
  };
  expect(restoreConsoleColors(saved)).toEqual({
    ...defaultConsoleColors,
    ...saved,
  });
  expect(
    restoreConsoleColors({
      ...saved,
      font: "ubuntu",
      fontSize: 16,
      lineHeight: 1.3,
    }),
  ).toEqual({ ...saved, font: "ubuntu", fontSize: 16, lineHeight: 1.3 });
});

it("rejects injected fonts and invalid typography from storage", () => {
  expect(
    restoreConsoleColors({
      font: "url(https://example.com)",
      fontSize: NaN,
      lineHeight: -5,
    }),
  ).toEqual(defaultConsoleColors);
  expect(restoreConsoleColors({ fontSize: Infinity })).toEqual(
    defaultConsoleColors,
  );
  expect(restoreConsoleColors({ fontSize: "18" })).toEqual(
    defaultConsoleColors,
  );
  expect(restoreConsoleColors({ fontSize: 1000 }).fontSize).toBe(24);
  expect(restoreConsoleColors({ fontSize: -1 }).fontSize).toBe(10);
  expect(restoreConsoleColors({ fontSize: 13.6 }).fontSize).toBe(14);
});

it("provides complete ANSI palettes and cursor/selection colors for all named themes", () => {
  for (const palette of [
    "ubuntu",
    "dracula",
    "nord",
    "solarized-dark",
    "solarized-light",
    "lcd",
  ] as const) {
    const theme = consoleTheme({ ...defaultConsoleColors, palette }, {});
    for (const color of [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
    ] as const) {
      expect(theme[color]).toMatch(/^#[0-9a-f]{6}$/);
      const bright =
        `bright${color[0].toUpperCase()}${color.slice(1)}` as keyof typeof theme;
      expect(theme[bright]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(theme.cursor).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.selectionBackground).toMatch(/^#[0-9a-f]{6,8}$/);
  }
  expect(
    consoleTheme({ ...defaultConsoleColors, palette: "ubuntu" }, {}),
  ).toMatchObject({
    background: "#300a24",
    red: "#cc0000",
    brightRed: "#ef2929",
  });
  expect(
    consoleTheme({ ...defaultConsoleColors, palette: "solarized-light" }, {})
      .background,
  ).toBe("#fdf6e3");
});

it("chooses a theme font and respects an independent font override", () => {
  expect(
    consoleFontFamily({ ...defaultConsoleColors, palette: "ubuntu" }),
  ).toContain("Ubuntu Mono");
  expect(
    consoleFontFamily({ ...defaultConsoleColors, palette: "dracula" }),
  ).toContain("JetBrains Mono");
  expect(
    consoleFontFamily({ ...defaultConsoleColors, palette: "nord" }),
  ).toContain("Cascadia Mono");
  expect(
    consoleFontFamily({ ...defaultConsoleColors, palette: "lcd" }),
  ).toContain("Cascadia Mono");
  expect(
    consoleFontFamily({
      ...defaultConsoleColors,
      palette: "ubuntu",
      font: "jetbrains",
    }),
  ).toContain("JetBrains Mono");
  expect(consoleFontFamily(defaultConsoleColors)).toBe(
    'Consolas, "Cascadia Mono", monospace',
  );
});
