import { Help } from "./Help";
import { useEffect, useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { storageUpdate } from "./bridge";
import { saveSelectionTags } from "./tag-selection";
import { useOrganization } from "./OrganizationContext";
import {
  assignTag,
  emptyTags,
  restoreTags,
  tagColors,
  tagsKey,
  finderColors,
  colorNames,
  type FileTag,
} from "./tags";
import { fileKey } from "./file-families";
import type { Entry } from "./types";

export function TagsDialog({
  selection,
  onSearch,
}: {
  selection: Entry[];
  onSearch: (tag: string) => void;
}) {
  const { tags } = useOrganization();
  const [name, setName] = useState(""),
    [color, setColor] = useState<(typeof tagColors)[number]>("blue"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(
    update: (value: unknown) => ReturnType<typeof restoreTags>,
    verify = false,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (verify) await saveSelectionTags(selection, update);
      else await storageUpdate(tagsKey, emptyTags(), update);
      setMessage("Tags enregistrés");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="organization-dialog">
      <Help>
        Les tags restent dans ce profil et ne modifient pas les fichiers. Ils
        suivent les renommages et déplacements réalisés ici ; les changements
        externes nécessitent une nouvelle association.
      </Help>
      <p>
        {selection.length} élément(s) sélectionné(s) · 32 tags et 2 000 chemins
        maximum.
      </p>
      <div className="organization-filters">
        <label>
          Nouveau tag
          <input
            aria-label="Nom du tag"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Couleur
          <select
            aria-label="Couleur du tag"
            value={color}
            onChange={(event) => setColor(event.target.value as typeof color)}
          >
            {Object.entries(colorNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            void change((value) => {
              const store = restoreTags(value);
              const next = restoreTags({
                ...store,
                labels: [
                  ...store.labels,
                  { id: crypto.randomUUID(), name, color },
                ],
              });
              setName("");
              return next;
            })
          }
        >
          <Plus size={16} />
          Créer le tag
        </button>
      </div>
      <div className="color-swatches" aria-label="Palette des tags">
        {finderColors.map((id) => (
          <button
            type="button"
            key={id}
            disabled={busy}
            aria-label={`Nouveau tag ${colorNames[id]}`}
            aria-pressed={color === id}
            style={{ "--swatch": `var(--label-${id})` } as React.CSSProperties}
            onClick={() => setColor(id)}
          >
            <span />
          </button>
        ))}
      </div>
      {!tags.labels.length && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void change((value) =>
              restoreTags({
                ...restoreTags(value),
                labels: finderColors.map((color) => ({
                  id: crypto.randomUUID(),
                  name: colorNames[color],
                  color,
                })),
              }),
            )
          }
        >
          Créer les 7 tags de couleur
        </button>
      )}
      {tags.labels.map((tag) => {
        const count = selection.filter((entry) =>
          tags.files[fileKey(entry.path)]?.includes(tag.id),
        ).length;
        return (
          <article className="organization-record" key={tag.id}>
            <TagEditor
              tag={tag}
              busy={busy}
              onSave={(name, color) =>
                void change((value) => {
                  const store = restoreTags(value);
                  return restoreTags({
                    ...store,
                    labels: store.labels.map((label) =>
                      label.id === tag.id ? { ...label, name, color } : label,
                    ),
                  });
                })
              }
            />
            <div className="organization-actions">
              <span className={`tag-chip tag-${tag.color}`}>
                <Tag size={14} />
                {tag.name}
              </span>
              <span>
                {count}/{selection.length} dans la sélection
              </span>
            </div>
            <div className="organization-actions">
              <button
                type="button"
                disabled={busy || !selection.length || selection.length > 1000}
                onClick={() =>
                  void change(
                    (value) =>
                      assignTag(
                        value,
                        selection.map((entry) => entry.path),
                        tag.id,
                        count !== selection.length,
                      ),
                    true,
                  )
                }
              >
                {count === selection.length && selection.length
                  ? "Retirer de la sélection"
                  : "Ajouter à la sélection"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSearch(tag.id)}
              >
                Rechercher ce tag
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Supprimer le tag ${tag.name}`}
                onClick={() =>
                  void change((value) => {
                    const store = restoreTags(value);
                    return restoreTags({
                      ...store,
                      labels: store.labels.filter(
                        (label) => label.id !== tag.id,
                      ),
                      files: Object.fromEntries(
                        Object.entries(store.files).map(([path, ids]) => [
                          path,
                          ids.filter((id) => id !== tag.id),
                        ]),
                      ),
                    });
                  })
                }
              >
                <Trash2 size={16} />
                Supprimer le tag
              </button>
            </div>
          </article>
        );
      })}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

function TagEditor({
  tag,
  busy,
  onSave,
}: {
  tag: FileTag;
  busy: boolean;
  onSave: (name: string, color: FileTag["color"]) => void;
}) {
  const [name, setName] = useState(tag.name),
    [color, setColor] = useState(tag.color);
  useEffect(() => {
    setName(tag.name);
    setColor(tag.color);
  }, [tag.name, tag.color]);
  return (
    <details>
      <summary>Modifier {tag.name}</summary>
      <div className="organization-filters">
        <label>
          Nom du tag
          <input
            aria-label={`Renommer ${tag.name}`}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Couleur
          <select
            aria-label={`Couleur de ${tag.name}`}
            value={color}
            onChange={(e) => setColor(e.target.value as typeof color)}
          >
            {Object.entries(colorNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={
            busy || !name.trim() || (name === tag.name && color === tag.color)
          }
          onClick={() => onSave(name, color)}
        >
          Enregistrer le tag
        </button>
      </div>
    </details>
  );
}
