import { RotateCcw, Pencil, FilePlus2, Scissors, FileCog } from "lucide-react";
import {
  quickActions,
  type QuickAction,
  type QuickTool,
} from "./quick-actions";
import { conversionKind } from "./media-conversion";
import type { Entry, Hello } from "./types";
export function QuickActions({
  entries,
  hello,
  onAction,
  onConvert,
  activeAction,
  busy = false,
}: {
  entries: Entry[];
  hello: Hello | null;
  onAction: (action: QuickAction) => void;
  onConvert: () => void;
  activeAction?: QuickTool;
  busy?: boolean;
}) {
  const actions = quickActions(entries, hello);
  const convert =
    activeAction === "convert" || entries.some((e) => conversionKind(e));
  if (!actions.length && !convert) return null;
  const icons = {
    rotate: RotateCcw,
    annotate: Pencil,
    "pdf-create": FilePlus2,
    trim: Scissors,
  };
  return (
    <section
      className={`quick-actions${activeAction ? " quick-action-switcher" : ""}`}
      aria-label="Actions rapides"
    >
      {!activeAction && <h3>Actions rapides</h3>}
      <div className="organization-actions">
        {actions.map((action) => {
          const Icon = icons[action.id];
          return (
            <button
              key={action.id}
              type="button"
              disabled={busy || action.disabled}
              aria-pressed={
                activeAction ? activeAction === action.id : undefined
              }
              title={action.disabled ? action.reason : undefined}
              aria-description={action.disabled ? action.reason : undefined}
              onClick={() => onAction(action.id)}
            >
              <Icon size={16} />
              {action.label}
            </button>
          );
        })}
        {convert && (
          <button
            type="button"
            disabled={busy}
            onClick={onConvert}
            aria-pressed={activeAction ? activeAction === "convert" : undefined}
          >
            <FileCog size={16} />
            Convertir…
          </button>
        )}
      </div>
    </section>
  );
}
