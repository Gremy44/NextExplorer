import { useState } from "react";
import { Check, Minus, Settings2 } from "lucide-react";
import { useOrganization } from "./OrganizationContext";
import { fileKey } from "./file-families";
import { saveSelectionTags } from "./tag-selection";
import {
  addNamedTag,
  clearSelectionTags,
  colorTags,
  tagSelectionState,
  toggleColorTag,
  toggleTag,
  type FinderColor,
  type TagStore,
} from "./tags";
import type { Entry } from "./types";

export function TagColors({
  selection,
  menu = false,
  busy = false,
  onColor,
}: {
  selection: Entry[];
  menu?: boolean;
  busy?: boolean;
  onColor: (color: FinderColor) => void;
}) {
  const { tags } = useOrganization();
  const paths = selection.map((entry) => entry.path);
  return (
    <div
      className="quick-tag-colors"
      role="group"
      aria-label="Tags de couleur"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        buttons[
          (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) %
            buttons.length
        ]?.focus();
      }}
    >
      {colorTags(tags).map((tag) => {
        const state = tagSelectionState(tags, paths, tag.id);
        return (
          <button
            key={tag.color}
            type="button"
            role={menu ? "menuitemcheckbox" : undefined}
            tabIndex={menu ? -1 : undefined}
            aria-checked={menu ? state : undefined}
            aria-pressed={menu ? undefined : state}
            aria-label={tag.name}
            title={`${state === true ? "Retirer" : "Ajouter"} le tag ${tag.name}`}
            className={`quick-tag-color tag-${tag.color}`}
            disabled={busy || !selection.length || selection.length > 1000}
            onClick={() => onColor(tag.color)}
          >
            <span className="quick-tag-circle" aria-hidden="true">
              {state === true ? (
                <Check size={14} />
              ) : state === "mixed" ? (
                <Minus size={14} />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TagPicker({
  selection,
  onManage,
}: {
  selection: Entry[];
  onManage: () => void;
}) {
  const { tags } = useOrganization();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const paths = selection.map((entry) => entry.path);
  const query = name.trim().normalize("NFC").toLocaleLowerCase("fr");
  const matching = tags.labels.filter((tag) =>
    tag.name.toLocaleLowerCase("fr").includes(query),
  );
  const existing = tags.labels.some(
    (tag) => tag.name.toLocaleLowerCase("fr") === query,
  );
  const disabled = busy || !selection.length || selection.length > 1000;
  async function save(update: (value: unknown) => TagStore) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveSelectionTags(selection, update);
      setMessage("Tags enregistrés");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="tag-picker"
      aria-label="Attribuer des tags"
      aria-busy={busy}
    >
      <p className="muted">{selection.length} élément(s) sélectionné(s)</p>
      {selection.length > 1000 && (
        <p role="alert" className="error">
          Réduisez la sélection à 1 000 éléments pour modifier les tags.
        </p>
      )}
      <TagColors
        selection={selection}
        busy={busy}
        onColor={(color) =>
          void save((value) => toggleColorTag(value, paths, color))
        }
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (query && !disabled)
            void save((value) => addNamedTag(value, paths, name));
        }}
      >
        <input
          data-autofocus
          aria-label="Nom du tag à ajouter"
          placeholder="Choisir ou saisir un tag…"
          maxLength={40}
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
        />
        {query && (
          <button type="submit" disabled={disabled}>
            {existing ? "Appliquer ce tag" : "Créer et appliquer"}
          </button>
        )}
      </form>
      <div
        className="tag-picker-list"
        role="group"
        aria-label="Choisir des tags"
      >
        {matching.map((tag) => {
          const state = tagSelectionState(tags, paths, tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              role="checkbox"
              aria-label={tag.name}
              aria-checked={state}
              disabled={disabled}
              onClick={() =>
                void save((value) => toggleTag(value, paths, tag.id))
              }
            >
              <span className={`tag-dot tag-${tag.color}`} aria-hidden="true" />
              <span>{tag.name}</span>
              {state === true ? (
                <Check size={18} aria-hidden="true" />
              ) : state === "mixed" ? (
                <Minus size={18} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
        {!matching.length && (
          <p className="muted">
            {query
              ? "Ce nom créera un nouveau tag."
              : "Choisissez une couleur ou saisissez un nom."}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      <footer>
        <button
          type="button"
          disabled={
            disabled || !paths.some((path) => tags.files[fileKey(path)]?.length)
          }
          onClick={() => void save((value) => clearSelectionTags(value, paths))}
        >
          Retirer tous les tags
        </button>
        <button type="button" disabled={busy} onClick={onManage}>
          <Settings2 size={16} /> Gérer les tags…
        </button>
      </footer>
    </section>
  );
}
