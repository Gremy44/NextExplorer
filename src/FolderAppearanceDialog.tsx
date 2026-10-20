import { useState } from "react";
import { bridge, storageUpdate } from "./bridge";
import { useOrganization } from "./OrganizationContext";
import { FileIcon } from "./Preview";
import {
  folderAppearanceKey,
  restoreFolderAppearances,
  type FolderAppearance,
} from "./folder-appearance";
import { colorNames, finderColors } from "./tags";
import { fileKey, sameFamilyFile } from "./file-families";
import type { Entry } from "./types";

export function FolderAppearanceDialog({
  entries,
  onClose,
}: {
  entries: Entry[];
  onClose: () => void;
}) {
  const { appearances } = useOrganization();
  const original = appearances[fileKey(entries[0]?.path || "")];
  const [color, setColor] = useState<FolderAppearance["color"]>(
    original?.color || "default",
  );
  const [symbol, setSymbol] = useState(original?.symbol || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(reset = false) {
    setBusy(true);
    setError("");
    try {
      if (
        !entries.length ||
        entries.length > 200 ||
        entries.some((e) => e.type !== "directory")
      )
        throw new Error("Choisissez de 1 à 200 dossiers");
      for (const entry of entries) {
        const current = await bridge.request<Entry>(
          "FS_STAT",
          { path: entry.path },
          5000,
        );
        if (current.type !== "directory" || !sameFamilyFile(entry, current))
          throw new Error("Un dossier a changé : actualisez la sélection");
      }
      await storageUpdate(folderAppearanceKey, {}, (value) => {
        const next = restoreFolderAppearances(value);
        for (const entry of entries) {
          if (reset || (color === "default" && !symbol.trim()))
            delete next[fileKey(entry.path)];
          else next[fileKey(entry.path)] = { color, symbol };
        }
        return restoreFolderAppearances(next);
      });
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="organization-dialog folder-appearance-dialog">
      <div
        className="folder-style-preview"
        style={{
          color:
            color === "default"
              ? "var(--folder-color)"
              : `var(--label-${color})`,
        }}
      >
        <svg width="104" height="88" viewBox="0 0 104 88" aria-hidden="true">
          <path
            d="M8 22V14a6 6 0 0 1 6-6h26l12 12h38a6 6 0 0 1 6 6v48a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6Z"
            fill="currentColor"
            opacity=".22"
          />
          <path
            d="M8 22V14a6 6 0 0 1 6-6h26l12 12h38a6 6 0 0 1 6 6v48a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>
        <span aria-hidden="true">{symbol}</span>
      </div>
      <p>
        {entries.length === 1 ? entries[0].name : `${entries.length} dossiers`}{" "}
        · Apparence propre à NextExplorer, conservée dans ce profil.
      </p>
      <label className="field">
        Couleur du dossier
        <select
          aria-label="Couleur du dossier"
          value={color}
          onChange={(e) => setColor(e.target.value as typeof color)}
        >
          <option value="default">Par défaut</option>
          {Object.entries(colorNames)
            .filter(
              ([id]) =>
                finderColors.includes(id as (typeof finderColors)[number]) ||
                id === color,
            )
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </label>
      <div className="color-swatches" aria-label="Palette du dossier">
        {finderColors.map((id) => (
          <button
            type="button"
            key={id}
            aria-label={colorNames[id]}
            aria-pressed={color === id}
            style={{ "--swatch": `var(--label-${id})` } as React.CSSProperties}
            onClick={() => setColor(id)}
          >
            <span />
          </button>
        ))}
      </div>
      <label className="field">
        Symbole ou emoji
        <input
          aria-label="Symbole du dossier"
          value={symbol}
          maxLength={24}
          placeholder="📁, 📷, ★…"
          onChange={(e) => setSymbol(e.target.value)}
        />
      </label>
      <div className="organization-actions">
        {["📄", "📷", "🎬", "💼", "🎵", "★", "🔥", "✓"].map((s) => (
          <button
            type="button"
            key={s}
            aria-label={`Symbole ${s}`}
            onClick={() => setSymbol(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="organization-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Appliquer aux dossiers
        </button>
        <button disabled={busy} onClick={() => void save(true)}>
          Réinitialiser l’apparence
        </button>
        <button disabled={busy} onClick={onClose}>
          Annuler
        </button>
      </div>
    </section>
  );
}
