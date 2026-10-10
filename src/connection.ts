import { validateHello } from "./protocol";
import type { Hello } from "./types";

export const CONNECTION_ATTEMPTS = 4;
export const HELLO_TIMEOUT_MS = 5000;

function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Annulé", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 2000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// Only HELLO is retried. File operations are never replayed here.
export async function connectCompanion(
  requestHello: () => Promise<Hello>,
  signal: AbortSignal,
  onAttempt: (attempt: number) => void,
  attempts = CONNECTION_ATTEMPTS,
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal.throwIfAborted();
    onAttempt(attempt);
    let hello: Hello;
    try {
      hello = await requestHello();
    } catch (error) {
      signal.throwIfAborted();
      if (
        attempt === attempts ||
        (error instanceof Error &&
          error.message.startsWith("Versions incompatibles"))
      )
        throw error;
      await wait(signal);
      continue;
    }
    signal.throwIfAborted();
    return validateHello(hello);
  }
  throw new Error("Connexion interrompue");
}
