import { bridge, storageUpdate } from "./bridge";
import {
  checkPreparedImage,
  imageConstraints,
  type ImageConstraints,
} from "./prepare-images";
import { basename, type Entry, type Job } from "./types";
import { uploadIssue } from "./uploads";
import { sendFiles, type UploadTarget } from "./web";
import { familyFile, fileKey } from "./file-families";

export const imagePreparationsKey = "imagePreparations";
export const IMAGE_PREPARATION_LIMIT = 20;
export type ImagePreparation = {
  version: 1;
  id: string;
  date: string;
  destination: string;
  count: number;
  constraints: ImageConstraints;
  jobId?: string;
  paths?: string[];
  sources?: Entry[];
  copies?: Entry[];
};
export type PreparedCopy = {
  entry: Entry;
  check: ReturnType<typeof checkPreparedImage>;
};

function localPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    value.includes("\0") ||
    !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value) ||
    value.split(/[\\/]/).some((part) => part === "." || part === "..")
  )
    throw new Error("Chemin de préparation invalide.");
  return value;
}
function folderKey(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:|^\/\//i.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}
function outputPaths(value: unknown, preparation: ImagePreparation): string[] {
  if (
    !Array.isArray(value) ||
    value.length !== preparation.count ||
    new Set(value).size !== value.length
  )
    throw new Error(
      "Résultat de préparation incomplet. Vérifiez le dossier des copies.",
    );
  return value.map((value) => {
    const path = localPath(value);
    if (
      folderKey(
        path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))),
      ) !== folderKey(preparation.destination)
    )
      throw new Error("Copie située hors du dossier de préparation.");
    return path;
  });
}
export function restoreImagePreparations(value: unknown): ImagePreparation[] {
  if (!Array.isArray(value) || value.length > IMAGE_PREPARATION_LIMIT)
    throw new Error(
      "Suivi des préparations invalide (20 préparations maximum).",
    );
  const ids = new Set<string>();
  return value.map((raw) => {
    if (
      !raw ||
      raw.version !== 1 ||
      typeof raw.id !== "string" ||
      !raw.id ||
      raw.id.length > 80 ||
      ids.has(raw.id) ||
      typeof raw.date !== "string" ||
      raw.date.length > 40 ||
      !Number.isFinite(Date.parse(raw.date)) ||
      !Number.isInteger(raw.count) ||
      raw.count < 1 ||
      raw.count > 20 ||
      !raw.constraints ||
      typeof raw.constraints !== "object" ||
      (raw.jobId !== undefined &&
        (typeof raw.jobId !== "string" || !raw.jobId || raw.jobId.length > 100))
    )
      throw new Error("Préparation enregistrée invalide.");
    ids.add(raw.id);
    const preparation: ImagePreparation = {
      version: 1,
      id: raw.id,
      date: raw.date,
      count: raw.count,
      destination: localPath(raw.destination),
      constraints: imageConstraints(raw.constraints),
      ...(raw.jobId !== undefined ? { jobId: raw.jobId } : {}),
    };
    if (raw.paths !== undefined)
      preparation.paths = outputPaths(raw.paths, preparation);
    for (const key of ["sources", "copies"] as const) {
      if (raw[key] === undefined) continue;
      if (!Array.isArray(raw[key]) || raw[key].length !== preparation.count)
        throw new Error("Liens de préparation incomplets.");
      const files: Entry[] = raw[key].map(familyFile);
      if (
        new Set(files.map((file) => fileKey(file.path))).size !== files.length
      )
        throw new Error("Références de préparation en double.");
      preparation[key] = files;
    }
    if (
      preparation.copies &&
      (!preparation.sources ||
        !preparation.paths ||
        preparation.copies.some(
          (copy) =>
            !preparation.paths!.some(
              (path) => fileKey(path) === fileKey(copy.path),
            ),
        ))
    )
      throw new Error("Copies sans sources ou hors du résultat enregistré.");
    return preparation;
  });
}
async function updatePreparation(id: string, patch: Partial<ImagePreparation>) {
  const records = await storageUpdate<unknown>(
    imagePreparationsKey,
    [],
    (value) => {
      const current = restoreImagePreparations(value);
      if (!current.some((preparation) => preparation.id === id))
        throw new Error(
          "Cette préparation a été retirée du suivi. Elle ne sera pas recréée.",
        );
      return restoreImagePreparations(
        current.map((preparation) =>
          preparation.id === id ? { ...preparation, ...patch } : preparation,
        ),
      );
    },
  );
  return restoreImagePreparations(records).find(
    (preparation) => preparation.id === id,
  )!;
}
export async function startImagePreparation(
  paths: string[],
  destination: string,
  constraints: ImageConstraints,
  sources?: Entry[],
  request = bridge.request.bind(bridge),
) {
  const [preparation] = restoreImagePreparations([
    {
      version: 1,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      destination,
      count: paths.length,
      constraints,
      ...(sources ? { sources } : {}),
    },
  ]);
  paths.forEach(localPath);
  if (
    preparation.sources?.some(
      (source, index) => fileKey(source.path) !== fileKey(paths[index]),
    )
  )
    throw new Error("Sources différentes de la sélection de préparation.");
  // Reserve the receipt before starting a mutation; never restart an uncertain launch.
  await storageUpdate<unknown>(imagePreparationsKey, [], (value) => {
    const current = restoreImagePreparations(value);
    if (current.length >= IMAGE_PREPARATION_LIMIT)
      throw new Error(
        "20 préparations conservées. Retirez une entrée du suivi avant de créer de nouvelles copies.",
      );
    return [preparation, ...current];
  });
  let started: { jobId: string };
  try {
    started = await request<{ jobId: string }>("CONVERT", {
      paths,
      destination: preparation.destination,
      format: preparation.constraints.format,
      width: preparation.constraints.width,
      quality: preparation.constraints.quality,
      strip: preparation.constraints.strip,
    });
  } catch {
    throw new Error(
      "Lancement non confirmé. Vérifiez l’activité et le dossier des copies avant toute nouvelle tentative ; aucune relance automatique.",
    );
  }
  if (
    typeof started?.jobId !== "string" ||
    !started.jobId ||
    started.jobId.length > 100
  )
    throw new Error(
      "Lancement non confirmé. Vérifiez l’activité et le dossier ; aucune relance automatique.",
    );
  try {
    return await updatePreparation(preparation.id, { jobId: started.jobId });
  } catch {
    throw new Error(
      "Conversion lancée, mais suivi non enregistré. Consultez l’activité et le dossier des copies avant toute nouvelle tentative.",
    );
  }
}
export async function readImagePreparation(
  preparation: ImagePreparation,
  signal: AbortSignal,
  request = bridge.request.bind(bridge),
): Promise<PreparedCopy[] | null> {
  const checkAbort = () => {
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
  };
  checkAbort();
  [preparation] = restoreImagePreparations([preparation]);
  if (!preparation.paths) {
    if (!preparation.jobId)
      throw new Error(
        "Lancement non confirmé. Vérifiez l’activité et le dossier des copies ; aucune relance automatique.",
      );
    const job = (await request<Job[]>("JOBS")).find(
      (job) =>
        job.id === preparation.jobId && job.kind === "convert" && !job.archived,
    );
    checkAbort();
    if (!job)
      throw new Error(
        "Le compagnon ne connaît plus cette préparation. Vérifiez le dossier des copies ; aucune conversion relancée.",
      );
    if (["queued", "running", "paused"].includes(job.state)) return null;
    if (job.state !== "completed")
      throw new Error(
        "Préparation arrêtée ou en échec. Des copies partielles peuvent exister ; vérifiez le dossier. Aucune conversion relancée.",
      );
    const paths = outputPaths(
      await request("JOB_RESULT", { jobId: preparation.jobId }),
      preparation,
    );
    checkAbort();
    preparation = await updatePreparation(preparation.id, { paths });
  }
  const checked: PreparedCopy[] = [];
  for (const path of preparation.paths!) {
    checkAbort();
    try {
      const entry = await request<Entry>("FS_STAT", { path }, 5000);
      checkAbort();
      if (
        entry?.type !== "file" ||
        !Number.isSafeInteger(entry.size) ||
        entry.size <= 0 ||
        !Number.isFinite(entry.mtime)
      )
        throw new Error("Copie indisponible.");
      const metadata = await request("METADATA", { path });
      checkAbort();
      const current = await request<Entry>("FS_STAT", { path }, 5000);
      checkAbort();
      if (
        current?.type !== "file" ||
        current.size !== entry.size ||
        current.mtime !== entry.mtime
      )
        throw new Error("Copie modifiée.");
      checked.push({
        entry,
        check: checkPreparedImage(entry, metadata, preparation.constraints),
      });
    } catch {
      checkAbort();
      throw new Error(
        `${basename(path)} : copie inaccessible, modifiée ou non vérifiable. Vérifiez le fichier et le compagnon, puis recommencez le contrôle.`,
      );
    }
  }
  if (preparation.sources && !preparation.copies) {
    checkAbort();
    await updatePreparation(preparation.id, {
      copies: checked.map((copy) => copy.entry),
    });
    checkAbort();
  }
  return checked;
}

export async function insertImagePreparation(
  preparation: ImagePreparation,
  target: UploadTarget,
  signal: AbortSignal,
) {
  const copies = await readImagePreparation(preparation, signal);
  if (!copies || copies.some((copy) => !copy.check.compatible))
    throw new Error(
      "Les copies ne sont pas toutes prêtes ou compatibles. Revérifiez la préparation.",
    );
  const entries = copies.map((copy) => copy.entry);
  const issue = uploadIssue(entries, target.field);
  if (issue) throw new Error(issue);
  await sendFiles(
    entries.map((entry) => entry.path),
    target,
    {
      expected: entries,
      signal,
    },
  );
}
