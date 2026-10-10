import { storageUpdate } from "./bridge";
import { safeURL } from "./types";
import { UPLOAD_FILE_LIMIT, UPLOAD_TOTAL_BYTES } from "./uploads";

export const insertionsKey = "fileInsertions";
export const INSERTION_LIMIT = 20;
export type Insertion = {
  version: 1;
  id: string;
  date: string;
  origin: string;
  field: string;
  files: { name: string; size: number }[];
  state: "uncertain" | "inserted" | "not-inserted";
};

export function restoreInsertions(value: unknown): Insertion[] {
  const invalid = () =>
    new Error(
      "Suivi des insertions illisible. Vous pouvez l’effacer depuis Insertions récentes.",
    );
  if (!Array.isArray(value) || value.length > INSERTION_LIMIT) throw invalid();
  const ids = new Set<string>();
  return value.map((raw) => {
    if (
      !raw ||
      raw.version !== 1 ||
      typeof raw.id !== "string" ||
      !raw.id.trim() ||
      raw.id.length > 80 ||
      ids.has(raw.id) ||
      typeof raw.date !== "string" ||
      raw.date.length > 40 ||
      !Number.isFinite(Date.parse(raw.date)) ||
      typeof raw.origin !== "string" ||
      raw.origin.length > 2048 ||
      !safeURL(raw.origin) ||
      new URL(raw.origin).origin !== raw.origin ||
      typeof raw.field !== "string" ||
      !raw.field.trim() ||
      raw.field.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(raw.field) ||
      !["uncertain", "inserted", "not-inserted"].includes(raw.state) ||
      !Array.isArray(raw.files) ||
      !raw.files.length ||
      raw.files.length > UPLOAD_FILE_LIMIT
    )
      throw invalid();
    let total = 0;
    const files = raw.files.map((file: any) => {
      if (
        !file ||
        typeof file.name !== "string" ||
        !file.name ||
        file.name.length > 255 ||
        /[\\/\u0000-\u001f\u007f]/.test(file.name) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0
      )
        throw invalid();
      total += file.size;
      return { name: file.name, size: file.size };
    });
    if (total > UPLOAD_TOTAL_BYTES) throw invalid();
    ids.add(raw.id);
    return {
      version: 1,
      id: raw.id,
      date: raw.date,
      origin: raw.origin,
      field: raw.field,
      files,
      state: raw.state,
    };
  });
}

export async function reserveInsertion(
  url: string,
  field: string,
  files: { name: string; size: number }[],
) {
  const [record] = restoreInsertions([
    {
      version: 1,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      origin: new URL(url).origin,
      field:
        field
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim()
          .slice(0, 160) || "Champ de fichiers",
      files,
      state: "uncertain",
    },
  ]);
  await storageUpdate<unknown>(insertionsKey, [], (value) => {
    const current = restoreInsertions(value);
    if (current.some((item) => item.id === record.id))
      throw new Error("Identité d’insertion déjà enregistrée.");
    return [record, ...current].slice(0, INSERTION_LIMIT);
  });
  return record;
}

export async function finishInsertion(
  id: string,
  state: "inserted" | "not-inserted",
) {
  await storageUpdate<unknown>(insertionsKey, [], (value) =>
    restoreInsertions(value).map((record) =>
      record.id === id ? { ...record, state } : record,
    ),
  );
}
