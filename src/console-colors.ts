import type { ITheme } from "@xterm/xterm";

export const consoleColorsKey = "nextexplorer:console-colors";
export const consolePalettes = [
  ["interface", "Suivre l’interface"],
  ["dark", "Sombre"],
  ["light", "Clair"],
  ["blue", "Bleu PowerShell"],
  ["ubuntu", "Ubuntu (apparence)"],
  ["dracula", "Dracula"],
  ["nord", "Nord"],
  ["solarized-dark", "Solarized sombre"],
  ["solarized-light", "Solarized clair"],
  ["lcd", "LCD rétro"],
  ["custom", "Personnalisé"],
] as const;
export const consoleFonts = [
  ["preset", "Police du thème"],
  ["ubuntu", "Ubuntu Mono"],
  ["jetbrains", "JetBrains Mono"],
  ["cascadia", "Cascadia Mono"],
  ["consolas", "Consolas (Windows)"],
] as const;
export const consoleLineHeights = [1, 1.15, 1.3, 1.5] as const;
export type ConsoleColors = {
  palette: (typeof consolePalettes)[number][0];
  background: string;
  foreground: string;
  font: (typeof consoleFonts)[number][0];
  fontSize: number;
  lineHeight: number;
};
export const defaultConsoleColors: ConsoleColors = {
  palette: "interface",
  background: "#0c0c0c",
  foreground: "#e5e5e5",
  font: "preset",
  fontSize: 13,
  lineHeight: 1,
};
export function restoreConsoleColors(value: unknown): ConsoleColors {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const color = (key: "background" | "foreground") =>
    typeof data[key] === "string" && /^#[0-9a-f]{6}$/i.test(data[key])
      ? data[key]
      : defaultConsoleColors[key];
  return {
    palette:
      consolePalettes.find(([id]) => id === data.palette)?.[0] || "interface",
    background: color("background"),
    foreground: color("foreground"),
    font: consoleFonts.find(([id]) => id === data.font)?.[0] || "preset",
    fontSize:
      typeof data.fontSize === "number" && Number.isFinite(data.fontSize)
        ? Math.max(10, Math.min(24, Math.round(data.fontSize)))
        : defaultConsoleColors.fontSize,
    lineHeight:
      consoleLineHeights.find((height) => height === data.lineHeight) ||
      defaultConsoleColors.lineHeight,
  };
}

// Original palettes and redistribution notices: THIRD_PARTY.md.
const solarized: ITheme = {
  red: "#dc322f",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  brightRed: "#cb4b16",
  brightMagenta: "#6c71c4",
};
const themes: Record<
  Exclude<ConsoleColors["palette"], "interface" | "custom">,
  ITheme
> = {
  dark: { background: "#0c0c0c", foreground: "#e5e5e5" },
  light: { background: "#ffffff", foreground: "#202124" },
  blue: { background: "#012456", foreground: "#ffffff" },
  ubuntu: {
    background: "#300a24",
    foreground: "#ffffff",
    black: "#2e3436",
    red: "#cc0000",
    green: "#4e9a06",
    yellow: "#c4a000",
    blue: "#3465a4",
    magenta: "#75507b",
    cyan: "#06989a",
    white: "#d3d7cf",
    brightBlack: "#555753",
    brightRed: "#ef2929",
    brightGreen: "#8ae234",
    brightYellow: "#fce94f",
    brightBlue: "#729fcf",
    brightMagenta: "#ad7fa8",
    brightCyan: "#34e2e2",
    brightWhite: "#eeeeec",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    selectionBackground: "#44475a",
    black: "#000000",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#bfbfbf",
    brightBlack: "#4d4d4d",
    brightRed: "#ff6e67",
    brightGreen: "#5af78e",
    brightYellow: "#f4f99d",
    brightBlue: "#caa9fa",
    brightMagenta: "#ff92d0",
    brightCyan: "#9aedfe",
    brightWhite: "#e6e6e6",
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  "solarized-dark": {
    ...solarized,
    background: "#002b36",
    foreground: "#839496",
    cursor: "#93a1a1",
    black: "#073642",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightWhite: "#fdf6e3",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightCyan: "#93a1a1",
  },
  "solarized-light": {
    ...solarized,
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#586e75",
    black: "#eee8d5",
    white: "#073642",
    brightBlack: "#fdf6e3",
    brightWhite: "#002b36",
    brightGreen: "#93a1a1",
    brightYellow: "#839496",
    brightBlue: "#657b83",
    brightCyan: "#586e75",
  },
  lcd: {
    background: "#c5cfad",
    foreground: "#25301f",
    cursor: "#25301f",
    cursorAccent: "#c5cfad",
    selectionBackground: "#344331",
    selectionForeground: "#c5cfad",
    black: "#25301f",
    red: "#45442c",
    green: "#344331",
    yellow: "#4b482d",
    blue: "#35443c",
    magenta: "#424035",
    cyan: "#34463c",
    white: "#47513b",
    brightBlack: "#4d573f",
    brightRed: "#373623",
    brightGreen: "#293928",
    brightYellow: "#3b3824",
    brightBlue: "#293a32",
    brightMagenta: "#353329",
    brightCyan: "#293c31",
    brightWhite: "#25301f",
  },
};

export function consoleFontFamily(colors: ConsoleColors): string {
  const font =
    colors.font !== "preset"
      ? colors.font
      : colors.palette === "ubuntu"
        ? "ubuntu"
        : ["nord", "lcd"].includes(colors.palette)
          ? "cascadia"
          : ["dracula", "solarized-dark", "solarized-light"].includes(
                colors.palette,
              )
            ? "jetbrains"
            : "consolas";
  return {
    ubuntu: '"NextExplorer Ubuntu Mono", Consolas, monospace',
    jetbrains: '"NextExplorer JetBrains Mono", Consolas, monospace',
    cascadia: '"NextExplorer Cascadia Mono", Consolas, monospace',
    consolas: 'Consolas, "Cascadia Mono", monospace',
  }[font];
}
export function consoleTheme(colors: ConsoleColors, inherited: ITheme): ITheme {
  if (colors.palette === "interface") return inherited;
  const palette =
    colors.palette === "custom"
      ? { background: colors.background, foreground: colors.foreground }
      : themes[colors.palette];
  return {
    cursor: palette.foreground,
    selectionBackground: palette.foreground + "40",
    selectionForeground: palette.foreground,
    ...palette,
  };
}
