import type { Job } from "./types";
type Event = { event: string; data: any };
class Bridge {
  private port: chrome.runtime.Port | null = null;
  private pending = new Map<
    string,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<(e: Event) => void>();
  connect() {
    if (this.port) return;
    if (!globalThis.chrome?.runtime?.id)
      throw new Error(
        "Ouvrez NextExplorer depuis son extension Chrome pour accéder aux fichiers.",
      );
    this.port = chrome.runtime.connect({ name: "explorer" });
    this.port.onMessage.addListener((m) => {
      if (m.event) {
        this.listeners.forEach((fn) => fn(m));
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      m.status === "SUCCESS"
        ? p.resolve(m.data)
        : p.reject(new Error(m.error || "Erreur native"));
    });
    this.port.onDisconnect.addListener(() => {
      this.port = null;
      const message =
        chrome.runtime.lastError?.message || "Connexion interrompue";
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(message));
      }
      this.pending.clear();
      this.listeners.forEach((f) =>
        f({ event: "DISCONNECTED", data: message }),
      );
    });
  }
  request<T = any>(
    action: string,
    payload: unknown = {},
    timeoutMs = 120000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        this.connect();
        const id = crypto.randomUUID();
        if (
          new TextEncoder().encode(JSON.stringify({ id, action, payload }))
            .length >
          1024 * 1024
        )
          throw new Error(
            "Sélection ou contenu trop volumineux pour une seule opération. Réduisez la sélection.",
          );
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(
            new Error(
              "Le compagnon ne répond pas. Réessayez ou vérifiez son installation.",
            ),
          );
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.port!.postMessage({ id, action, payload });
      } catch (e) {
        reject(e);
      }
    });
  }
  subscribe(fn: (e: Event) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  async bytes(
    path: string,
    max = 128 * 1024 * 1024,
    signal?: AbortSignal,
    progress?: (done: number, total: number) => void,
  ) {
    let offset = 0;
    let expectedSize: number | undefined,
      received = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const r = await this.request<{
        data: string;
        size: number;
        nextOffset: number;
        eof: boolean;
      }>("FS_READ", { path, offset, limit: 384 * 1024 });
      if (
        !Number.isSafeInteger(r.size) ||
        r.size < 0 ||
        (expectedSize !== undefined && r.size !== expectedSize)
      )
        throw new Error(
          "Le fichier a changé pendant la lecture. Actualisez le dossier puis réessayez.",
        );
      expectedSize = r.size;
      if (r.size > max)
        throw new Error(
          `Aperçu limité à ${Math.round(max / 1048576)} Mo. Ouvrez ce fichier dans son application.`,
        );
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const raw = atob(r.data);
      if (
        r.nextOffset !== offset + raw.length ||
        r.nextOffset > r.size ||
        typeof r.eof !== "boolean" ||
        (r.eof && r.nextOffset !== r.size) ||
        received + raw.length > max
      )
        throw new Error("Lecture interrompue ou fichier modifié.");
      const decoded = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) decoded[i] = raw.charCodeAt(i);
      chunks.push(decoded);
      received += decoded.length;
      progress?.(received, r.size);
      if (r.eof) break;
      if (r.nextOffset <= offset) throw new Error("Lecture interrompue");
      offset = r.nextOffset;
    }
    const b = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let pos = 0;
    for (const c of chunks) {
      b.set(c, pos);
      pos += c.length;
    }
    return b;
  }
  async text(path: string, signal?: AbortSignal) {
    return new TextDecoder().decode(
      await this.bytes(path, 4 * 1024 * 1024, signal),
    );
  }
  async textPrefix(path: string, limit: number, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const result = await this.request<{ data: string; size: number }>(
      "FS_READ",
      { path, offset: 0, limit: Math.min(384 * 1024, Math.max(1, limit)) },
    );
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const raw = atob(result.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { bytes, size: result.size };
  }
  control(job: Job, command: string) {
    return this.request("JOB_CONTROL", { jobId: job.id, command });
  }
}
export const bridge = new Bridge();
export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (globalThis.chrome?.storage) {
    const data = await chrome.storage.local.get(key);
    return data[key] ?? fallback;
  }
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export async function storageSet(key: string, value: unknown) {
  if (globalThis.chrome?.storage)
    await chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(key, JSON.stringify(value));
}

// Same-origin Web Locks serialize read/modify/write across extension views.
export async function storageUpdate<T>(
  key: string,
  fallback: T,
  update: (value: T) => T,
) {
  return navigator.locks.request(`nextexplorer:${key}`, async () => {
    const next = update(await storageGet(key, fallback));
    await storageSet(key, next);
    return next;
  });
}

export function storageSubscribe(keys: string[], refresh: () => void) {
  if (globalThis.chrome?.storage?.onChanged) {
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && keys.some((key) => key in changes)) refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }
  const changed = (event: StorageEvent) => {
    if (event.key === null || keys.includes(event.key)) refresh();
  };
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}
