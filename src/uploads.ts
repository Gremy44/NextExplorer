import { fileMime } from "./file-mime";
import type { Entry } from "./types";

export const UPLOAD_FILE_LIMIT = 20;
export const UPLOAD_TOTAL_BYTES = 20 * 1024 * 1024;

export function acceptsFile(name: string, accept: string) {
  if (!accept.trim()) return true;
  const mime = fileMime(name);
  return accept.split(",").some((value) => {
    const token = value.trim().toLowerCase();
    if (token.startsWith(".")) return name.toLowerCase().endsWith(token);
    if (["image/*", "audio/*", "video/*"].includes(token))
      return mime.startsWith(token.slice(0, -1));
    return !!mime && mime === token;
  });
}

export function uploadIssue(
  files: Pick<Entry, "name" | "type" | "size">[],
  field?: { accept: string; multiple: boolean; disabled: boolean },
): string | null {
  if (!files.length) return "Ajoutez au moins un fichier à la collecte.";
  if (files.length > UPLOAD_FILE_LIMIT)
    return "Sélectionnez au maximum 20 fichiers pour cette insertion.";
  if (field?.disabled) return "Ce champ de fichiers est désactivé.";
  if (field && !field.multiple && files.length > 1)
    return "Ce formulaire accepte un seul fichier.";
  let total = 0;
  for (const file of files) {
    if (file.type !== "file")
      return `${file.name} : choisissez un fichier ordinaire, sans dossier ni lien symbolique.`;
    if (!Number.isSafeInteger(file.size) || file.size < 0)
      return `${file.name} : taille non vérifiable. Actualisez la collecte.`;
    total += file.size;
    if (total > UPLOAD_TOTAL_BYTES)
      return "La sélection dépasse 20 Mo au total. Réduisez-la ou utilisez le sélecteur du site.";
    if (field && !acceptsFile(file.name, field.accept))
      return `${file.name} : format non reconnu parmi ceux demandés (${field.accept}). Retirez-le de la sélection ou utilisez le sélecteur du site.`;
  }
  return null;
}
