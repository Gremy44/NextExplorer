import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { storageGet, storageSubscribe, storageUpdate } from "./bridge";
import { imageFormats, videoFormats, type MediaKind } from "./media-conversion";
import {
  conversionPresetsKey,
  defaultConversionPresets,
  presetFormValues,
  restoreConversionPresets,
  type ConversionPreset,
} from "./conversion-presets";

export function ConversionPresets({
  context,
  mediaKind,
  encoders,
  onApply,
}: {
  context: ConversionPreset["context"];
  mediaKind?: MediaKind;
  encoders?: string[];
  onApply?: (values: ConversionPreset["values"]) => void;
}) {
  const [records, setRecords] = useState<ConversionPreset[]>([]),
    [ready, setReady] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    const read = () =>
      storageGet(conversionPresetsKey, [])
        .then((raw) => {
          const data = restoreConversionPresets(raw);
          if (live) {
            setRecords(data);
            setReady(true);
          }
        })
        .catch((e) => {
          if (live) {
            setReady(false);
            setError(e.message);
          }
        });
    void read();
    const off = storageSubscribe([conversionPresetsKey], read);
    return () => {
      live = false;
      off();
    };
  }, []);
  const compatible = (p: ConversionPreset) =>
    p.context === context &&
    !(
      mediaKind === "video" &&
      encoders &&
      p.values.mode !== "remux" &&
      p.values.codec &&
      !encoders.includes(String(p.values.codec))
    ) &&
    (!mediaKind ||
      (mediaKind === "image" ? imageFormats : videoFormats).includes(
        p.values.format === "jpeg" ? "jpg" : String(p.values.format),
      ));
  const choices = [
    ...defaultConversionPresets
      .filter(compatible)
      .map((p, i) => ({ id: `default:${i}`, preset: p })),
    ...records
      .filter(compatible)
      .map((p) => ({ id: `user:${p.name}`, preset: p })),
  ];
  return (
    <details className="group-help">
      <summary>Préréglages et recettes</summary>
      <label className="field">
        Choisir un préréglage
        <select
          value={selected}
          onChange={(event) => {
            setError("");
            setMessage("");
            const preset = choices.find(
              (item) => item.id === event.target.value,
            )?.preset;
            const form = event.currentTarget.closest("form");
            if (!preset || !form) {
              setSelected("");
              return;
            }
            if (onApply) onApply(preset.values);
            else {
              for (const [key, value] of Object.entries(preset.values)) {
                const field = form.elements.namedItem(key);
                if (
                  field instanceof HTMLSelectElement &&
                  ![...field.options].some(
                    (option) => option.value === value && !option.disabled,
                  )
                ) {
                  setError("Ce format n’est pas accepté par le champ choisi.");
                  return;
                }
              }
              for (const [key, value] of Object.entries(preset.values)) {
                const field = form.elements.namedItem(key);
                if (
                  field instanceof HTMLInputElement &&
                  field.type === "checkbox"
                )
                  field.checked = value === true;
                else if (
                  field instanceof HTMLInputElement ||
                  field instanceof HTMLSelectElement
                )
                  field.value = String(value);
              }
            }
            setSelected(event.target.value);
            setMessage(
              "Options appliquées. Vérifiez les fichiers, la destination et les contraintes avant de lancer.",
            );
          }}
        >
          <option value="">Options personnalisées</option>
          {choices.map(({ id, preset }) => (
            <option key={id} value={id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <div className="group-actions">
        <label className="field">
          Nom du nouveau préréglage
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!ready || !name.trim()}
          onClick={async (event) => {
            const form = event.currentTarget.closest("form");
            if (!form) return;
            try {
              setError("");
              const [next] = restoreConversionPresets([
                { name, context, values: presetFormValues(form, context) },
              ]);
              await storageUpdate<unknown>(conversionPresetsKey, [], (raw) =>
                restoreConversionPresets([
                  ...restoreConversionPresets(raw),
                  next,
                ]),
              );
              setName("");
              setMessage(
                "Préréglage enregistré dans ce profil ; aucun fichier traité.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Save size={16} aria-hidden="true" />
          Enregistrer les options
        </button>
        <button
          type="button"
          disabled={
            !ready ||
            !records.some(
              (p) => p.context === context && `user:${p.name}` === selected,
            )
          }
          onClick={async () => {
            try {
              await storageUpdate<unknown>(conversionPresetsKey, [], (raw) =>
                restoreConversionPresets(raw).filter(
                  (p) => p.context !== context || `user:${p.name}` !== selected,
                ),
              );
              setSelected("");
              setMessage("Préréglage retiré. Aucun fichier supprimé.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          Retirer le préréglage
        </button>
      </div>
      <p className="muted">
        30 préréglages maximum. Seules les options sont conservées ; fichiers et
        destination sont choisis à chaque lancement.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
