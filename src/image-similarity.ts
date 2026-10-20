import { checkCollection, COLLECTION_CHECK_LIMIT } from "./collection";
import { familyFile, fileKey, sameFamilyFile } from "./file-families";
import { GROUP_ENTRY_LIMIT } from "./file-groups";
import { preparableImage } from "./prepare-images";
import type { CollectionEntry, Entry } from "./types";

export const SIMILAR_IMAGE_LIMIT = 60;
export const SIMILAR_IMAGE_BYTES = 256 * 1024 * 1024;
export const SIMILAR_READ_BUDGET = 512 * 1024 * 1024;
export type ImageSample = {
  entry: Entry;
  width: number;
  height: number;
  pixels: string;
};

export function readImageSample(value: unknown, expected: Entry): ImageSample {
  const sample = value as ImageSample;
  if (
    !sample ||
    !sample.entry ||
    !Number.isSafeInteger(sample.width) ||
    !Number.isSafeInteger(sample.height) ||
    sample.width < 1 ||
    sample.height < 1 ||
    sample.width * sample.height > 100000000 ||
    !/^[0-9a-f]{432}$/.test(sample.pixels)
  )
    throw new Error("Échantillon d’image invalide.");
  familyFile(sample.entry);
  if (
    !sameFamilyFile(expected, sample.entry) ||
    expected.stamp !== sample.entry.stamp
  )
    throw new Error("Image modifiée pendant l’analyse.");
  return sample;
}

function signature(sample: ImageSample) {
  const pixels = Uint8Array.from(sample.pixels.match(/../g)!, (v) =>
    parseInt(v, 16),
  );
  const gray = Array.from(
    { length: 72 },
    (_, i) =>
      0.299 * pixels[i * 3] +
      0.587 * pixels[i * 3 + 1] +
      0.114 * pixels[i * 3 + 2],
  );
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits.push(gray[y * 9 + x] > gray[y * 9 + x + 1]);
  return { pixels, bits, contrast: Math.max(...gray) - Math.min(...gray) };
}

export function compareImageSamples(a: ImageSample, b: ImageSample) {
  const left = signature(a),
    right = signature(b);
  const ratio = Math.abs(a.width / a.height / (b.width / b.height) - 1);
  const distance = left.bits.filter(
    (bit, index) => bit !== right.bits[index],
  ).length;
  const color =
    left.pixels.reduce(
      (sum, value, index) => sum + Math.abs(value - right.pixels[index]),
      0,
    ) / 216;
  // shortcut: conservative sample comparison; a personal corpus is needed before widening thresholds.
  return {
    similar:
      left.contrast >= 12 &&
      right.contrast >= 12 &&
      ratio <= 0.03 &&
      ((distance <= 4 && color <= 18) || (distance <= 8 && color <= 6)),
    distance,
    color,
  };
}

export async function groupSimilarImages(
  entries: CollectionEntry[],
  io: {
    stat: (path: string) => Promise<Entry>;
    sample: (entry: Entry) => Promise<unknown>;
  },
  signal: AbortSignal,
  progress: (count: number) => void,
) {
  signal.throwIfAborted();
  const seen = new Set<string>(),
    notes = new Map<string, string>();
  const files = entries
    .slice(0, GROUP_ENTRY_LIMIT)
    .filter((entry): entry is Entry => {
      if (entry.type !== "file" || !preparableImage(entry)) return false;
      try {
        familyFile(entry);
      } catch {
        return false;
      }
      const key = fileKey(entry.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const samples: ImageSample[] = [],
    current = new Map<string, Entry>();
  await checkCollection(
    files.slice(0, COLLECTION_CHECK_LIMIT),
    io.stat,
    signal,
    (check) => {
      if (
        check.current &&
        check.status === "present" &&
        sameFamilyFile(check.entry as Entry, check.current) &&
        check.current.stamp &&
        (!(check.entry as Entry).stamp ||
          (check.entry as Entry).stamp === check.current.stamp)
      )
        current.set(fileKey(check.entry.path), check.current);
      else
        notes.set(
          check.entry.path,
          "Référence absente ou modifiée ; actualisez la source.",
        );
    },
  );
  let budget = 0,
    attempted = 0;
  const deadline = Date.now() + 90000;
  for (const original of files) {
    signal.throwIfAborted();
    const file = current.get(fileKey(original.path));
    if (!file) {
      if (!notes.has(original.path))
        notes.set(original.path, "Limite de 200 références contrôlées.");
      continue;
    }
    if (attempted >= SIMILAR_IMAGE_LIMIT || Date.now() > deadline) {
      notes.set(file.path, "Limite de 60 images ou de 90 secondes atteinte.");
      continue;
    }
    if (
      file.size <= 0 ||
      file.size > SIMILAR_IMAGE_BYTES ||
      budget + file.size > SIMILAR_READ_BUDGET
    ) {
      notes.set(
        file.path,
        "Image vide, plus de 256 Mio ou budget de 512 Mio atteint.",
      );
      continue;
    }
    budget += file.size;
    attempted++;
    try {
      const raw = await io.sample(file);
      signal.throwIfAborted();
      samples.push(readImageSample(raw, file));
    } catch (error) {
      signal.throwIfAborted();
      notes.set(file.path, (error as Error).message.slice(0, 1024));
    }
    progress(attempted);
  }
  const valid = new Set<string>();
  await checkCollection(
    samples.map((s) => s.entry),
    io.stat,
    signal,
    (check) => {
      const expected = check.entry as Entry;
      if (
        check.current &&
        sameFamilyFile(expected, check.current) &&
        expected.stamp === check.current.stamp
      )
        valid.add(fileKey(expected.path));
      else notes.set(expected.path, "Image modifiée pendant l’analyse.");
    },
  );
  signal.throwIfAborted();
  const buckets: ImageSample[][] = [];
  for (const sample of samples.filter((s) =>
    valid.has(fileKey(s.entry.path)),
  )) {
    const bucket = buckets.find(
      (bucket) => compareImageSamples(bucket[0], sample).similar,
    );
    if (bucket) bucket.push(sample);
    else buckets.push([sample]);
  }
  const groups = buckets
    .filter((bucket) => bucket.length > 1)
    .map((bucket, index) => ({
      id: `similar:${index}`,
      name: `Images similaires · groupe ${index + 1}`,
      entries: bucket.map((s) => s.entry),
      reason:
        "Composition et couleurs proches, proportions à 3 % près. Tolérance renforcée pour les recompressions dont les couleurs restent très proches. Comparaison à la première image du groupe, sans rapprochement par chaîne. Ce n’est pas une preuve de copie identique.",
    }));
  const matched = new Set(
    groups.flatMap((g) => g.entries.map((e) => fileKey(e.path))),
  );
  const distinct = samples
    .filter(
      (s) =>
        valid.has(fileKey(s.entry.path)) && !matched.has(fileKey(s.entry.path)),
    )
    .map((s) => s.entry);
  groups.push({
    id: "distinct",
    name: "Sans variante visuelle trouvée",
    entries: distinct,
    reason:
      "Aucun rapprochement assez fiable dans ce périmètre. Les aplats et images peu contrastées sont écartés du rapprochement.",
  });
  const compared = new Set([
    ...matched,
    ...distinct.map((e) => fileKey(e.path)),
  ]);
  const unexamined = files.filter((e) => !compared.has(fileKey(e.path)));
  groups.push({
    id: "unexamined",
    name: "Non comparées",
    entries: unexamined,
    reason:
      "Référence périmée, format illisible ou limite atteinte. Le motif est indiqué sous chaque image.",
  });
  return {
    groups,
    notes,
    excluded: Math.min(entries.length, GROUP_ENTRY_LIMIT) - files.length,
    unexamined: unexamined.length,
    similar: matched.size,
    examined: attempted,
  };
}
