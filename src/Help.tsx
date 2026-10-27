import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useOrganization } from "./OrganizationContext";

export function Help({ children }: { children: ReactNode }) {
  const { preferences } = useOrganization();
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!open || !button.current || !tooltip.current) return;
    const anchor = button.current.getBoundingClientRect(),
      box = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)),
      top: Math.max(
        8,
        Math.min(anchor.bottom - 1, innerHeight - box.height - 8),
      ),
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  if (!preferences.tooltips) return null;
  return (
    <span
      className="help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          tooltip.current?.contains(event.relatedTarget)
        )
          return;
        if (document.activeElement !== button.current) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label="Aide"
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onClick={() => setOpen(true)}
      >
        <Info size={15} />
      </button>
      <span id={id} hidden>
        {children}
      </span>
      {open &&
        createPortal(
          <span
            ref={tooltip}
            className="help-tooltip"
            style={position}
            role="tooltip"
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}

// Keep labels and warnings available when optional hover hints are disabled.
export function useOptionalTooltips(enabled: boolean) {
  useEffect(() => {
    if (enabled) return;
    const remove = () =>
      document.querySelectorAll<HTMLElement>("[title]").forEach((element) => {
        if (
          element.matches("button, a, input") &&
          !element.getAttribute("aria-label") &&
          !element.textContent?.trim()
        ) {
          element.setAttribute("aria-label", element.title);
          element.dataset.tooltipLabel = element.title;
        }
        element.dataset.disabledTitle = element.title;
        element.removeAttribute("title");
      });
    const observer = new MutationObserver(remove);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    remove();
    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLElement>("[data-disabled-title]")
        .forEach((element) => {
          element.title = element.dataset.disabledTitle || "";
          delete element.dataset.disabledTitle;
          if (
            element.dataset.tooltipLabel === element.getAttribute("aria-label")
          )
            element.removeAttribute("aria-label");
          delete element.dataset.tooltipLabel;
        });
    };
  }, [enabled]);
}
