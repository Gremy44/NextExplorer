import { useLayoutEffect, useRef } from "react";
import { ArrowRightLeft, Copy } from "lucide-react";
import { isRemote } from "./remote";

export type DroppedFiles = {
  paths: string[];
  destination: string;
  x: number;
  y: number;
};

export function DropTransferMenu({
  drop,
  onTransfer,
  onClose,
}: {
  drop: DroppedFiles;
  onTransfer: (mode: "move" | "copy") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const copyOnly = isRemote(drop.destination) || drop.paths.some(isRemote);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const previous = document.activeElement;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(drop.x, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(drop.y, innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target))
        onClose();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("dragstart", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("dragstart", onClose);
      window.removeEventListener("blur", onClose);
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (menu.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        previous.focus();
    };
  }, [drop.x, drop.y, onClose]);
  return (
    <div
      ref={ref}
      className="context-menu drop-transfer-menu"
      role="menu"
      aria-label="Déplacer ou dupliquer les fichiers"
      aria-description={`${drop.paths.length} élément(s) vers ${drop.destination}. Les fichiers existants sont conservés ; les nouveaux noms sont numérotés en cas de conflit.`}
      style={{ left: drop.x, top: drop.y }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={copyOnly}
        tabIndex={-1}
        title={
          copyOnly
            ? "Les transferts distants permettent uniquement la copie."
            : `Déplacer vers ${drop.destination}. Conserver les deux si un nom existe déjà.`
        }
        onClick={() => onTransfer("move")}
      >
        <ArrowRightLeft size={18} aria-hidden="true" />
        <span>Déplacer</span>
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        title={`Dupliquer vers ${drop.destination}. Conserver les deux si un nom existe déjà.`}
        onClick={() => onTransfer("copy")}
      >
        <Copy size={18} aria-hidden="true" />
        <span>Dupliquer</span>
      </button>
    </div>
  );
}
