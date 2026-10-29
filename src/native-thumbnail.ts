import { bridge } from "./bridge";
import type { Entry } from "./types";
import { imagePreviewError, readImagePreview } from "./image-preview";

const waiting: {
  run: () => void;
  signal: AbortSignal;
  reject: (e: unknown) => void;
}[] = [];
const cache = new Map<string, string>();
let active = 0,
  bytes = 0;
function drain() {
  while (active < 2 && waiting.length) {
    const next = waiting.shift()!;
    if (next.signal.aborted) {
      next.reject(new DOMException("Annulé", "AbortError"));
      continue;
    }
    active++;
    next.run();
  }
}
export function nativeThumbnail(
  entry: Entry,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Annulé", "AbortError"));
  const error = imagePreviewError(entry);
  if (error) return Promise.reject(new Error(error));
  if (waiting.length >= 40)
    return Promise.reject(
      new Error("Miniatures en attente : réessayez après défilement."),
    );
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = waiting.indexOf(item);
      if (index >= 0) {
        waiting.splice(index, 1);
        reject(new DOMException("Annulé", "AbortError"));
      }
    };
    const item = {
      signal,
      reject,
      run: () => {
        signal.removeEventListener("abort", abort);
        void (async () => {
          const expected = await bridge.request<Entry>(
            "FS_STAT",
            {
              path: entry.path,
            },
            5000,
          );
          signal.throwIfAborted();
          const key = `${expected.path}:${expected.size}:${expected.stamp}`;
          const saved = cache.get(key);
          if (saved) return saved;
          const url = await readImagePreview(expected, 256, signal);
          signal.throwIfAborted();
          while (
            cache.size &&
            (cache.size >= 64 || bytes + url.length > 2 * 1024 * 1024)
          ) {
            const [key, value] = cache.entries().next().value!;
            cache.delete(key);
            bytes -= value.length;
          }
          cache.set(key, url);
          bytes += url.length;
          return url;
        })()
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      },
    };
    waiting.push(item);
    signal.addEventListener("abort", abort, { once: true });
    drain();
  });
}
