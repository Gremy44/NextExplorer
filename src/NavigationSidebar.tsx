import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  createContext,
  useContext,
} from "react";
import { ChevronDown } from "lucide-react";

const CollapsedNavigation = createContext(false);

export function NavigationSection({
  id,
  label,
  action,
  children,
}: {
  id: string;
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useContext(CollapsedNavigation);
  const key = `nextexplorer:navigation:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "closed";
    } catch {
      return true;
    }
  });
  return (
    <section className="navigation-section">
      <div className="nav-section">
        <button
          aria-expanded={open}
          aria-controls={`navigation-${id}`}
          onClick={() => {
            setOpen(!open);
            try {
              localStorage.setItem(key, open ? "closed" : "open");
            } catch {}
          }}
        >
          <ChevronDown
            size={14}
            style={{ transform: open ? undefined : "rotate(-90deg)" }}
          />
          {label}
        </button>
        {action}
      </div>
      <div id={`navigation-${id}`} hidden={!open && !collapsed}>
        {children}
      </div>
    </section>
  );
}

export function NavigationSidebar({
  children,
  collapsed = false,
}: {
  children: ReactNode;
  collapsed?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(
        localStorage.getItem("nextexplorer:navigation-width"),
      );
      return saved >= 160 && saved <= 420 ? saved : 224;
    } catch {
      return 224;
    }
  });
  const [limit, setLimit] = useState(420);
  useLayoutEffect(() => {
    if (collapsed)
      ref.current?.querySelector(".navigation-scroll")?.scrollTo(0, 0);
  }, [collapsed]);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () =>
      setLimit(
        Math.max(
          160,
          Math.min(420, parent.clientWidth - (innerWidth <= 760 ? 40 : 400)),
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("nextexplorer:navigation-width", String(width));
    } catch {}
  }, [width]);
  const visible = Math.min(width, limit);
  const resize = (next: number) =>
    setWidth(Math.max(160, Math.min(limit, Math.round(next))));
  const drag = (x: number) => {
    if (ref.current) resize(x - ref.current.getBoundingClientRect().left);
  };
  return (
    <aside
      ref={ref}
      className={"sidebar" + (collapsed ? " collapsed" : "")}
      style={{ width: collapsed ? 52 : visible }}
      aria-label="Navigation de l’explorateur"
    >
      <CollapsedNavigation.Provider value={collapsed}>
        <div className="navigation-scroll">{children}</div>
      </CollapsedNavigation.Provider>
      <div
        hidden={collapsed}
        className="navigation-divider"
        role="separator"
        aria-label="Ajuster la largeur de la navigation"
        aria-orientation="vertical"
        aria-valuemin={160}
        aria-valuemax={limit}
        aria-valuenow={visible}
        tabIndex={0}
        title="Glisser pour ajuster · double-clic pour réinitialiser"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          drag(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            drag(event.clientX);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onDoubleClick={() => resize(224)}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowLeft"
              ? visible - 20
              : event.key === "ArrowRight"
                ? visible + 20
                : event.key === "Home"
                  ? 160
                  : event.key === "End"
                    ? limit
                    : null;
          if (next !== null) {
            event.preventDefault();
            resize(next);
          }
        }}
      />
    </aside>
  );
}
