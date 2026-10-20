import { bridge } from "./bridge";
import type { Entry } from "./types";

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
  if (waiting.length >= 40)
    return Promise.reject(
      new Error("Miniatures en attente : réessayez après défilement."),
    );
  return new Promise((resolve, reject) => {
    waiting.push({
      signal,
      reject,
      run: () => {
        void (async () => {
          const expected = await bridge.request<Entry>("FS_STAT", {
            path: entry.path,
          });
          signal.throwIfAborted();
          const key = `${expected.path}:${expected.size}:${expected.stamp}`;
          const saved = cache.get(key);
          if (saved) return saved;
          const result = await bridge.request<{ data: string }>(
            "IMAGE_PREVIEW",
            { path: entry.path, expected, width: 256 },
            12000,
          );
          signal.throwIfAborted();
          if (
            !/^[A-Za-z0-9+/]+=*$/.test(result.data) ||
            result.data.length > 956000
          )
            throw new Error("Miniature invalide.");
          const url = `data:image/jpeg;base64,${result.data}`;
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
    });
    drain();
  });
}
