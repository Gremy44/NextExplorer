import { RotateCcw, Pencil, FilePlus2, Scissors, FileCog } from "lucide-react";
import { quickActions, type QuickAction } from "./quick-actions";
import { conversionKind } from "./media-conversion";
import type { Entry, Hello } from "./types";
export function QuickActions({
  entries,
  hello,
  onAction,
  onConvert,
}: {
  entries: Entry[];
  hello: Hello | null;
  onAction: (action: QuickAction) => void;
  onConvert: () => void;
}) {
  const actions = quickActions(entries, hello);
  const convert = entries.length > 0 && entries.every((e) => conversionKind(e));
  if (!actions.length && !convert) return null;
  const icons = {
    rotate: RotateCcw,
    annotate: Pencil,
    "pdf-create": FilePlus2,
    trim: Scissors,
  };
  return (
    <section className="quick-actions" aria-label="Actions rapides">
      <h3>Actions rapides</h3>
      <div className="organization-actions">
        {actions.map((action) => {
          const Icon = icons[action.id];
          return (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              title={action.disabled ? action.reason : undefined}
              onClick={() => onAction(action.id)}
            >
              <Icon size={16} />
              {action.label}
            </button>
          );
        })}
        {convert && (
          <button type="button" onClick={onConvert}>
            <FileCog size={16} />
            Convertir…
          </button>
        )}
      </div>
    </section>
  );
}
