import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  ChevronDown,
  Grid2x2,
  Grid3x3,
  Grip,
  List,
  ListEnd,
  ListStart,
  PanelsTopLeft,
  Rows3,
  Square,
  TableProperties,
  type LucideIcon,
  Columns3,
  Tags,
  FileType,
} from "lucide-react";
import { CardPreview, FileIcon } from "./Preview";
import { size, type Entry } from "./types";
import { useOrganization } from "./OrganizationContext";
import { displaySize } from "./preferences";
import { fileKey } from "./file-families";
import { fileMetrics } from "./interface-layout";

export const fileViews = [
  {
    value: "extra-large-icons",
    label: "Très grandes icônes",
    icon: Square,
    layout: "icons",
    iconSize: 96,
    width: 220,
    height: 218,
  },
  {
    value: "large-icons",
    label: "Grandes icônes",
    icon: Grid2x2,
    layout: "icons",
    iconSize: 64,
    width: 170,
    height: 178,
  },
  {
    value: "medium-icons",
    label: "Icônes moyennes",
    icon: Grid3x3,
    layout: "icons",
    iconSize: 40,
    width: 130,
    height: 134,
  },
  {
    value: "small-icons",
    label: "Petites icônes",
    icon: Grip,
    layout: "compact",
    iconSize: 18,
    width: 190,
    height: 36,
  },
  {
    value: "list",
    label: "Liste",
    icon: List,
    layout: "compact",
    iconSize: 18,
    width: 0,
    height: 36,
  },
  {
    value: "details",
    label: "Détails",
    icon: TableProperties,
    layout: "details",
    iconSize: 18,
    width: 0,
    height: 40,
  },
  {
    value: "tiles",
    label: "Mosaïques",
    icon: PanelsTopLeft,
    layout: "tiles",
    iconSize: 40,
    width: 280,
    height: 80,
  },
  {
    value: "content",
    label: "Contenu",
    icon: Rows3,
    layout: "content",
    iconSize: 64,
    width: 0,
    height: 104,
  },
  {
    value: "columns",
    label: "Colonnes de dossiers",
    icon: Columns3,
    layout: "compact",
    iconSize: 18,
    width: 0,
    height: 40,
  },
] as const;
export type ViewMode = (typeof fileViews)[number]["value"];
export const fileView = (mode: ViewMode) =>
  fileViews.find((view) => view.value === mode)!;
export function restoreViewMode(
  value: unknown,
  legacyGrid: unknown,
  fallback: ViewMode,
): ViewMode {
  return (
    fileViews.find((view) => view.value === value)?.value ||
    (legacyGrid === true ? "medium-icons" : fallback)
  );
}
const fileSorts = [
  { value: "type:asc", label: "Type de fichier", icon: FileType },
  { value: "tags:asc", label: "Tags A–Z", icon: Tags },
  { value: "name:asc", label: "Nom A–Z", icon: ArrowDownAZ },
  { value: "name:desc", label: "Nom Z–A", icon: ArrowUpAZ },
  { value: "mtime:desc", label: "Plus récents", icon: CalendarArrowDown },
  { value: "mtime:asc", label: "Plus anciens", icon: CalendarArrowUp },
  { value: "size:desc", label: "Plus volumineux", icon: ListStart },
  { value: "size:asc", label: "Plus petits", icon: ListEnd },
] as const;

function FileOptionsMenu({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: readonly { value: string; label: string; icon: LucideIcon }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const current =
    choices.find((choice) => choice.value === value) || choices[0];
  const Icon = current.icon;
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        !event.target.contains(trigger.current)
      )
        return;
      if (
        !(event.target instanceof Node) ||
        !menu.current?.contains(event.target)
      )
        menu.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  return (
    <div className="file-options">
      <button
        ref={trigger}
        type="button"
        className="file-menu-trigger"
        aria-label={label}
        title={`${label} : ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        data-value={current.value}
        popoverTarget={id}
        onKeyDown={(event) => {
          if (event.key === "Tab") menu.current?.hidePopover();
          if (
            ["Enter", " ", "Escape", "ArrowDown", "ArrowUp"].includes(event.key)
          )
            event.stopPropagation();
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          menu.current?.showPopover();
          menu.current
            ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
            ?.focus();
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{current.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        className="file-options-menu"
        popover="auto"
        role="menu"
        aria-label={label}
        onBeforeToggle={(event) => {
          if (event.newState !== "open") return;
          const box = trigger.current!.getBoundingClientRect();
          const width = Math.min(280, window.innerWidth - 16);
          const height = Math.min(
            choices.length * 44 + 16,
            window.innerHeight - 16,
          );
          const top =
            box.bottom + 4 + height > window.innerHeight - 8 &&
            box.top > height + 12
              ? box.top - height - 4
              : Math.min(box.bottom + 4, window.innerHeight - height - 8);
          Object.assign(event.currentTarget.style, {
            width: `${width}px`,
            left: `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`,
            top: `${Math.max(8, top)}px`,
            maxHeight: `${height}px`,
          });
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (isOpen && !menu.current?.contains(document.activeElement))
            menu.current
              ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
              ?.focus();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Tab") {
            menu.current?.hidePopover();
            trigger.current?.focus();
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button",
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
        }}
      >
        {choices.map((choice) => {
          const ChoiceIcon = choice.icon;
          return (
            <button
              key={choice.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice.value === value}
              tabIndex={-1}
              data-value={choice.value}
              onClick={() => {
                onChange(choice.value);
                menu.current?.hidePopover();
                trigger.current?.focus();
              }}
            >
              <ChoiceIcon size={20} aria-hidden="true" />
              <span>{choice.label}</span>
              {choice.value === value && <Check size={18} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FileViewMenu({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <FileOptionsMenu
      label="Affichage des fichiers"
      value={value}
      choices={fileViews}
      onChange={(mode) => onChange(mode as ViewMode)}
    />
  );
}
export function FileSortMenu({
  sortBy,
  sortOrder,
  onChange,
}: {
  sortBy: string;
  sortOrder: string;
  onChange: (sort: { sortBy: string; sortOrder: string }) => void;
}) {
  return (
    <FileOptionsMenu
      label="Trier les fichiers"
      value={`${sortBy}:${sortOrder}`}
      choices={fileSorts}
      onChange={(value) => {
        const [sortBy, sortOrder] = value.split(":");
        onChange({ sortBy, sortOrder });
      }}
    />
  );
}
export function FileEntryContent({
  entry,
  mode,
  interactive = true,
  customDetails = false,
  detailColumns,
}: {
  entry: Entry;
  mode: ViewMode;
  interactive?: boolean;
  customDetails?: boolean;
  detailColumns?: string[];
}) {
  const { preferences, tags, sizes } = useOrganization();
  const columns = detailColumns || preferences.columns;
  const bytes = (n: number) => displaySize(n, preferences.units);
  const folderSize = sizes[fileKey(entry.path)];
  const fileSize =
    entry.type === "directory"
      ? folderSize
        ? `${folderSize.partial ? "≥ " : ""}${bytes(folderSize.size)}`
        : "—"
      : bytes(entry.size);
  const name =
    preferences.extensions || entry.type !== "file" || !entry.ext
      ? entry.name
      : entry.name.slice(0, -entry.ext.length);
  const labels = (tags.files[fileKey(entry.path)] || [])
    .map((id) => tags.labels.find((tag) => tag.id === id))
    .filter((tag) => !!tag);
  const chips = (
    <span className="tag-chips">
      {labels.map((tag) => (
        <small key={tag.id} className={`tag-chip tag-${tag.color}`}>
          {tag.name}
        </small>
      ))}
    </span>
  );
  const baseView = fileView(mode);
  const view = { ...baseView, ...fileMetrics(baseView, preferences) };
  const date = new Date(entry.mtime * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const format =
    entry.type === "directory"
      ? "Dossier"
      : entry.type === "symlink"
        ? "Lien"
        : entry.ext
          ? entry.ext.slice(1).toUpperCase()
          : "Fichier";
  const description =
    entry.type === "directory"
      ? `${format}${folderSize ? " · " + fileSize : ""}`
      : `${format} · ${fileSize}`;
  if (view.layout === "details" || view.layout === "compact")
    return (
      <>
        <span className="file-name">
          <FileIcon entry={entry} size={view.iconSize} />
          <span>{name}</span>
          {!customDetails && chips}
          {entry.type === "symlink" && <small>lien</small>}
        </span>
        {view.layout === "details" && (
          <>
            {(!customDetails || columns.includes("mtime")) && (
              <time
                className="detail-date"
                dateTime={new Date(entry.mtime * 1000).toISOString()}
              >
                {date}
              </time>
            )}
            {(!customDetails || columns.includes("size")) && (
              <span className="file-size detail-size">{fileSize}</span>
            )}
            {customDetails && columns.includes("type") && (
              <span className="detail-type">{format}</span>
            )}
            {customDetails && columns.includes("tags") && chips}
          </>
        )}
      </>
    );
  return (
    <>
      <span className="file-item-visual">
        {preferences.thumbnails &&
        (view.layout === "icons" || view.layout === "content") ? (
          <CardPreview
            entry={entry}
            iconSize={view.iconSize}
            interactive={interactive}
          />
        ) : (
          <FileIcon entry={entry} size={view.iconSize} />
        )}
      </span>
      <span className="file-item-info">
        <span className="file-item-name">{name}</span>
        {chips}
        <small>{description}</small>
        {view.layout === "content" && (
          <time dateTime={new Date(entry.mtime * 1000).toISOString()}>
            Modifié le {date}
          </time>
        )}
      </span>
    </>
  );
}
