import { useEffect, useId, useRef, useState } from "react";
import { Eraser, Link2, Palette, Power, RotateCcw, Square } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { bridge } from "./bridge";
import { isRemote, remotePath } from "./remote";
import {
  consoleColorsKey,
  consoleFontFamily,
  consoleFonts,
  consoleLineHeights,
  consolePalettes,
  consoleTheme,
  defaultConsoleColors,
  restoreConsoleColors,
  type ConsoleColors,
} from "./console-colors";
import "@xterm/xterm/css/xterm.css";
import "./console.css";

type ConsoleState = {
  path: string;
  pending: string;
  ready: boolean;
  closed: boolean;
  error: string;
};
const emptyState: ConsoleState = {
  path: "",
  pending: "",
  ready: false,
  closed: false,
  error: "",
};

export function ConsolePane({
  path,
  active,
  available,
  remoteName,
}: {
  path: string;
  active: boolean;
  available: boolean;
  remoteName?: string;
}) {
  const remote = isRemote(path);
  const shell = remote ? `SSH · ${remoteName || "serveur"}` : "PowerShell";
  const rpc = (action: string) => (remote ? "REMOTE_" + action : action);
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const session = useRef("");
  const directory = useRef(path);
  directory.current = path;
  const generation = useRef(0);
  const inputGeneration = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const attempted = useRef(false);
  const suspended = useRef(false);
  const inputQueue = useRef(Promise.resolve());
  const queuedBytes = useRef(0);
  const [id, setId] = useState("");
  const [starting, setStarting] = useState(false);
  const [follow, setFollow] = useState(true);
  const [state, setState] = useState(emptyState);
  const [colors, setColors] = useState<ConsoleColors>(() => {
    try {
      return restoreConsoleColors(
        JSON.parse(localStorage.getItem(consoleColorsKey) || "null"),
      );
    } catch {
      return defaultConsoleColors;
    }
  });
  const appearance = useRef(colors);
  appearance.current = colors;
  const colorsId = useId();
  const colorsPopover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => colorsPopover.current?.hidePopover();
    if (!active) close();
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [active]);
  function applyColors() {
    if (!terminal.current || !container.current) return;
    const styles = getComputedStyle(container.current);
    const color = (name: string) => styles.getPropertyValue(name).trim();
    terminal.current.options.theme = consoleTheme(appearance.current, {
      background: color("--panel"),
      foreground: color("--text"),
      cursor: color("--text"),
      selectionBackground: color("--md-sys-color-secondary-container"),
    });
    container.current.style.backgroundColor =
      terminal.current.options.theme.background || "";
  }
  useEffect(() => {
    applyColors();
    try {
      localStorage.setItem(consoleColorsKey, JSON.stringify(colors));
    } catch {}
  }, [colors]);

  function failInput(error: unknown) {
    suspended.current = true;
    if (terminal.current) terminal.current.options.disableStdin = true;
    setState((value) => ({
      ...value,
      error: `Entrée interrompue : ${(error as Error).message}. Utilisez Interrompre avant de continuer.`,
    }));
  }
  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      scrollback: 2000,
      screenReaderMode: true,
      minimumContrastRatio: 4.5,
      disableStdin: true,
      windowsPty: remote ? undefined : { backend: "conpty" },
      linkHandler: { activate() {} },
    });
    const fit = new FitAddon();
    fitAddon.current = fit;
    term.loadAddon(fit);
    term.open(container.current!);
    terminal.current = term;
    term.textarea?.setAttribute(
      "aria-label",
      remote ? "Saisir une commande SSH" : "Saisir une commande PowerShell",
    );
    const clipboard = term.parser.registerOscHandler(52, () => true);
    applyColors();
    const theme = new MutationObserver(applyColors);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    let resizeTimer: ReturnType<typeof setTimeout>;
    const terminalResize = term.onResize(({ cols, rows }) => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (session.current)
          void bridge
            .request(
              rpc("TERMINAL_RESIZE"),
              {
                session: session.current,
                columns: Math.max(10, Math.min(300, cols)),
                rows: Math.max(2, Math.min(120, rows)),
              },
              5000,
            )
            .catch((error) =>
              setState((value) => ({ ...value, error: error.message })),
            );
      }, 80);
    });
    const resize = new ResizeObserver(() => {
      if (container.current?.clientWidth && container.current.clientHeight)
        fit.fit();
    });
    resize.observe(container.current!);
    const input = term.onData((data) => {
      if (!session.current || suspended.current) return;
      const bytes = new TextEncoder().encode(data).length;
      if (bytes > 16384 || queuedBytes.current + bytes > 32768) {
        failInput(new Error("collage trop volumineux ou terminal occupé"));
        return;
      }
      const target = session.current;
      const version = inputGeneration.current;
      queuedBytes.current += bytes;
      inputQueue.current = inputQueue.current
        .then(async () => {
          if (
            suspended.current ||
            session.current !== target ||
            version !== inputGeneration.current
          )
            return;
          await bridge.request(
            rpc("TERMINAL_WRITE"),
            { session: target, data },
            5000,
          );
        })
        .catch((error) => {
          if (session.current === target && version === inputGeneration.current)
            failInput(error);
        })
        .finally(() => {
          queuedBytes.current -= bytes;
        });
    });
    return () => {
      generation.current++;
      attempted.current = false;
      const current = session.current;
      session.current = "";
      if (current)
        void bridge
          .request(rpc("TERMINAL_CLOSE"), { session: current }, 5000)
          .catch(() => {});
      clearTimeout(resizeTimer);
      input.dispose();
      clipboard.dispose();
      terminalResize.dispose();
      resize.disconnect();
      theme.disconnect();
      term.dispose();
      terminal.current = null;
      fitAddon.current = null;
    };
  }, []);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    let live = true;
    const family = consoleFontFamily(colors);
    // Load both weights before xterm measures cells; retain fallbacks on failure.
    void Promise.allSettled([
      document.fonts.load(`${colors.fontSize}px ${family}`),
      document.fonts.load(`bold ${colors.fontSize}px ${family}`),
    ]).then(() => {
      if (!live) return;
      term.options.fontFamily = family;
      term.options.fontSize = colors.fontSize;
      term.options.lineHeight = colors.lineHeight;
      if (container.current?.clientWidth && container.current.clientHeight)
        fitAddon.current?.fit();
    });
    return () => {
      live = false;
    };
  }, [colors.font, colors.fontSize, colors.lineHeight, colors.palette]);

  async function open() {
    if (!available || !directory.current) return;
    attempted.current = true;
    const current = ++generation.current;
    setStarting(true);
    setState(emptyState);
    suspended.current = false;
    try {
      const previous = session.current;
      session.current = "";
      setId("");
      if (previous)
        await bridge.request(
          rpc("TERMINAL_CLOSE"),
          { session: previous },
          5000,
        );
      const result = await bridge.request<{ id: string; build: number }>(
        rpc("TERMINAL_OPEN"),
        {
          path: directory.current,
          columns: Math.max(10, Math.min(300, terminal.current?.cols || 80)),
          rows: Math.max(2, Math.min(120, terminal.current?.rows || 24)),
        },
        15000,
      );
      if (generation.current !== current) {
        void bridge
          .request(rpc("TERMINAL_CLOSE"), { session: result.id }, 5000)
          .catch(() => {});
        return;
      }
      session.current = result.id;
      setId(result.id);
      if (terminal.current && !remote)
        terminal.current.options.windowsPty = {
          backend: "conpty",
          buildNumber: result.build,
        };
      terminal.current?.reset();
      if (terminal.current) terminal.current.options.disableStdin = false;
      terminal.current?.focus();
    } catch (error) {
      if (generation.current === current)
        setState({
          ...emptyState,
          closed: true,
          error: (error as Error).message,
        });
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }
  useEffect(() => {
    if (available && path && !attempted.current && !remote) void open();
  }, [available, path]);

  useEffect(() => {
    if (!id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await bridge.request<
          ConsoleState & { data: string; dropped: boolean; more?: boolean }
        >(rpc("TERMINAL_READ"), { session: id }, 5000);
        if (!live) return;
        if (result.dropped) {
          terminal.current?.reset();
          terminal.current?.writeln(
            "[Sortie ancienne retirée : mémoire du terminal limitée.]",
          );
        }
        if (result.data && terminal.current) {
          const term = terminal.current;
          await new Promise<void>((resolve) =>
            term.write(
              Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0)),
              resolve,
            ),
          );
          if (!live) return;
        }
        setState((previous) => ({
          ...result,
          error: suspended.current ? previous.error : result.error,
        }));
        if (result.closed && terminal.current)
          terminal.current.options.disableStdin = true;
        if (!result.closed || result.more)
          timer = setTimeout(read, activeRef.current ? 100 : 750);
      } catch (error) {
        if (!live) return;
        suspended.current = true;
        if (terminal.current) terminal.current.options.disableStdin = true;
        setState((value) => ({
          ...value,
          closed: true,
          error: `Connexion de la console interrompue : ${(error as Error).message}`,
        }));
      }
    };
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);
  useEffect(() => {
    if (id && !state.closed)
      void bridge
        .request(
          rpc("TERMINAL_SYNC"),
          { session: id, path: follow ? path : "" },
          5000,
        )
        .catch((error) =>
          setState((value) => ({ ...value, error: error.message })),
        );
  }, [id, path, follow, state.closed]);

  async function interrupt() {
    if (!id) return;
    const target = id;
    inputGeneration.current++;
    suspended.current = true;
    try {
      await inputQueue.current;
      if (session.current !== target) return;
      await bridge.request(
        rpc("TERMINAL_WRITE"),
        { session: target, data: "\x03" },
        5000,
      );
      suspended.current = false;
      if (terminal.current) terminal.current.options.disableStdin = false;
      setState((value) => ({ ...value, error: "" }));
      terminal.current?.focus();
    } catch (error) {
      failInput(error);
    }
  }
  return (
    <section
      className="console-pane"
      aria-label={"Console " + shell}
      data-ready={state.ready}
      data-session={id}
    >
      <div className="console-toolbar">
        <strong>{shell}</strong>
        <button
          className={follow ? "toggled" : ""}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
          title="Suivre le dossier actif quand la console est disponible"
        >
          <Link2 size={16} /> Suivre le dossier
        </button>
        <div
          className="console-actions"
          role="group"
          aria-label="Actions de la console"
        >
          <button
            popoverTarget={colorsId}
            title="Apparence du terminal"
            aria-label="Apparence du terminal"
            aria-haspopup="dialog"
          >
            <Palette size={16} />
          </button>
          <div
            ref={colorsPopover}
            id={colorsId}
            className="console-colors-popover"
            popover="auto"
            role="dialog"
            aria-label="Apparence du terminal"
            onBeforeToggle={(event) => {
              if (event.newState !== "open") return;
              const trigger =
                event.currentTarget.previousElementSibling!.getBoundingClientRect();
              const width = Math.min(320, innerWidth - 16);
              const top = Math.max(
                8,
                Math.min(trigger.bottom + 4, innerHeight - 540),
              );
              Object.assign(event.currentTarget.style, {
                width: `${width}px`,
                left: `${Math.max(8, Math.min(trigger.right - width, innerWidth - width - 8))}px`,
                top: `${top}px`,
                maxHeight: `${innerHeight - top - 8}px`,
              });
            }}
            onToggle={(event) => {
              if (event.newState === "open")
                event.currentTarget.querySelector("select")?.focus();
            }}
          >
            <strong>Apparence du terminal</strong>
            <label>
              Palette
              <select
                aria-label="Palette du terminal"
                value={colors.palette}
                onChange={(event) =>
                  setColors({
                    ...colors,
                    palette: event.target.value as ConsoleColors["palette"],
                  })
                }
              >
                {consolePalettes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {colors.palette === "custom" && (
              <div className="console-color-fields">
                <label>
                  Fond
                  <input
                    type="color"
                    aria-label="Couleur de fond du terminal"
                    value={colors.background}
                    onChange={(event) =>
                      setColors({ ...colors, background: event.target.value })
                    }
                  />
                </label>
                <label>
                  Texte par défaut
                  <input
                    type="color"
                    aria-label="Couleur du texte du terminal"
                    value={colors.foreground}
                    onChange={(event) =>
                      setColors({ ...colors, foreground: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
            <label>
              Police
              <select
                aria-label="Police du terminal"
                value={colors.font}
                onChange={(event) =>
                  setColors({
                    ...colors,
                    font: event.target.value as ConsoleColors["font"],
                  })
                }
              >
                {consoleFonts.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="console-font-fields">
              <label>
                Taille (px)
                <select
                  aria-label="Taille de la police du terminal"
                  value={colors.fontSize}
                  onChange={(event) =>
                    setColors({
                      ...colors,
                      fontSize: Number(event.target.value),
                    })
                  }
                >
                  {Array.from({ length: 15 }, (_, index) => index + 10).map(
                    (size) => (
                      <option key={size} value={size}>
                        {size} px
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Interligne
                <select
                  aria-label="Interligne du terminal"
                  value={colors.lineHeight}
                  onChange={(event) =>
                    setColors({
                      ...colors,
                      lineHeight: Number(event.target.value),
                    })
                  }
                >
                  {consoleLineHeights.map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)} %
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              La coloration des commandes dépend aussi du programme. Le
              contraste du texte est ajusté pour rester lisible.
            </p>
          </div>
          <button
            disabled={!id || state.closed}
            onClick={interrupt}
            title="Interrompre · Ctrl+C"
            aria-label="Interrompre la commande"
          >
            <Square size={16} />
          </button>
          <button
            onClick={() => terminal.current?.clear()}
            title="Effacer l’affichage"
            aria-label="Effacer l’affichage"
          >
            <Eraser size={16} />
          </button>
          {id && !state.closed ? (
            <button
              title="Fermer la session et ses commandes"
              aria-label={
                remote
                  ? "Fermer la session SSH"
                  : "Fermer la session PowerShell"
              }
              onClick={async () => {
                try {
                  await bridge.request(
                    rpc("TERMINAL_CLOSE"),
                    { session: id },
                    5000,
                  );
                  session.current = "";
                  setId("");
                  setState((value) => ({ ...value, closed: true }));
                  if (terminal.current)
                    terminal.current.options.disableStdin = true;
                } catch (error) {
                  setState((value) => ({
                    ...value,
                    error: (error as Error).message,
                  }));
                }
              }}
            >
              <Power size={16} />
            </button>
          ) : (
            <button
              disabled={starting || !available || !path}
              onClick={open}
              title={
                remote
                  ? "Ouvrir une console SSH ici"
                  : "Ouvrir une nouvelle session"
              }
              aria-label={
                remote
                  ? "Ouvrir une console SSH ici"
                  : "Ouvrir une nouvelle session PowerShell"
              }
            >
              <RotateCcw size={16} />
              {remote && "Ouvrir SSH"}
            </button>
          )}
        </div>
      </div>
      <p className="console-path" title={state.path || path}>
        {(remote && (state.path || path)
          ? remotePath(state.path || path).directory
          : state.path || path) ||
          "Choisissez un dossier pour ouvrir la console."}
      </p>
      {colors.palette === "ubuntu" && !remote && (
        <p className="console-appearance-note" role="note">
          Apparence Ubuntu uniquement : vous utilisez PowerShell, pas Bash.
        </p>
      )}
      <p className="console-status" role="status">
        {!available
          ? "Mettez à jour le compagnon Windows pour utiliser la console."
          : starting
            ? `Ouverture de ${shell}…`
            : state.closed
              ? "Session terminée"
              : state.pending
                ? `Changement de dossier en attente : ${state.pending}`
                : !path && follow
                  ? "Suivi en attente d’un dossier"
                  : state.ready
                    ? "Prêt"
                    : !id && remote
                      ? "Ouvrez explicitement une console SSH pour exécuter des commandes sur ce serveur."
                      : "Commande ou saisie en cours"}
      </p>
      {state.error && (
        <p className="error console-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="console-terminal" ref={container} />
      <p className="console-hint">
        {remote
          ? "Commandes exécutées sur le serveur avec vos droits SSH. Le serveur doit autoriser un shell POSIX et un terminal interactif."
          : "Commandes locales avec vos droits."}{" "}
        Masquer ce volet conserve la session ; fermer cette page l’arrête.
      </p>
    </section>
  );
}
