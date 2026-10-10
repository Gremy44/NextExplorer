import { storageGet, storageUpdate, type bridge } from "./bridge";
import {
  automaticDownloadSuggestion,
  downloadFilingKey,
  downloadRunsKey,
  restoreDownloadFiling,
  restoreDownloadRuns,
  verifyDownload,
  type DownloadRule,
  type DownloadRun,
} from "./downloads";
import { basename, type Entry, type Job } from "./types";
import { downloadedProvenance } from "./provenance";

// Manual confirmation and explicitly opted-in download events share one reservation.
export function startDownloadFiling(request: typeof bridge.request) {
  async function save(run: DownloadRun) {
    await storageUpdate<DownloadRun[]>(downloadRunsKey, [], (current) => {
      const runs = [
        run,
        ...restoreDownloadRuns(current).filter(
          (value) => value.key !== run.key,
        ),
      ];
      // ponytail: 100 finished attempts retained; pending reservations are never evicted or replayed.
      let finished = 0;
      return runs.filter(
        (value) =>
          ["reserved", "running", "uncertain"].includes(value.state) ||
          ++finished <= 100,
      );
    });
  }
  async function follow(run: DownloadRun, item: chrome.downloads.DownloadItem) {
    try {
      const deadline = Date.now() + 10 * 60 * 1000;
      let job: Job | undefined;
      while (Date.now() < deadline) {
        job = (await request<Job[]>("JOBS")).find(
          (value) => value.id === run.jobId,
        );
        if (!job)
          throw new Error(
            "Le résultat natif est introuvable ; vérifiez l’activité avant toute nouvelle opération.",
          );
        if (["completed", "error", "cancelled"].includes(job.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (job?.state !== "completed") {
        run.state =
          job && ["error", "cancelled"].includes(job.state)
            ? "error"
            : "uncertain";
        run.message =
          job?.error ||
          "Suivi interrompu ; le transfert peut continuer. Consultez l’activité.";
      } else {
        const result = job.audit?.entries.find(
          (entry) =>
            entry.source === item.filename &&
            ["moved", "copied"].includes(entry.status),
        );
        if (!result) {
          run.state = "error";
          run.message =
            "Aucun fichier rangé ; consultez le compte rendu du transfert.";
        } else {
          run.destination = result.destination;
          run.state = "completed";
          // Metadata failure never undoes or retries a successful transfer.
          try {
            const entry = await request<Entry>("FS_STAT", {
              path: result.destination,
            });
            if (
              entry.type !== "file" ||
              (item.fileSize >= 0 && entry.size !== item.fileSize)
            )
              throw new Error("Le fichier rangé a changé.");
            const name = basename(result.destination);
            await request("FS_WRITE", {
              path: result.destination.slice(0, -name.length),
              name: name + ".source.json",
              text: JSON.stringify(
                downloadedProvenance(item, name, entry.size),
                null,
                2,
              ),
            });
          } catch (error) {
            run.message = `Fichier rangé, provenance non enregistrée : ${(error as Error).message}`;
          }
        }
      }
      await save(run);
    } catch (error) {
      run.state = "uncertain";
      run.message = (error as Error).message;
      await save(run);
    }
  }
  async function file(
    payload: {
      download: chrome.downloads.DownloadItem;
      destination: string;
      mode?: string;
      conflict?: string;
    },
    automatic?: DownloadRule[],
  ) {
    if (
      !payload?.download ||
      !Number.isSafeInteger(payload.download.id) ||
      typeof payload.download.filename !== "string" ||
      !payload.download.filename ||
      typeof payload.download.startTime !== "string" ||
      !Number.isFinite(Date.parse(payload.download.startTime)) ||
      typeof payload.destination !== "string" ||
      !["move", "copy"].includes(payload.mode || "move") ||
      !["rename", "skip", "overwrite"].includes(payload.conflict || "rename")
    )
      throw new Error("Demande de rangement invalide.");
    return navigator.locks.request(
      `nextexplorer:download:${payload.download.id}`,
      async () => {
        const run: DownloadRun = {
          key: `${payload.download.id}/${payload.download.startTime}`,
          name: basename(payload.download.filename),
          source: payload.download.filename,
          destination: payload.destination,
          date: new Date().toISOString(),
          state: "reserved",
          ...(automatic ? { automatic: true } : {}),
        };
        const runs = restoreDownloadRuns(await storageGet(downloadRunsKey, []));
        if (
          runs.some(
            (value) =>
              value.key === run.key && (automatic || value.state !== "blocked"),
          )
        ) {
          if (automatic) return;
          throw new Error(
            "Ce téléchargement a déjà une tentative de rangement. Consultez le suivi et l’activité ; aucun transfert n’est rejoué.",
          );
        }
        let item: chrome.downloads.DownloadItem;
        try {
          if (
            automatic &&
            new Set(automatic.map((rule) => rule.destination)).size !== 1
          )
            throw new Error(
              "Plusieurs règles proposent des dossiers différents. Choisissez une destination avec Ranger…",
            );
          const folder = await request<Entry>("FS_STAT", {
            path: payload.destination,
          }).catch(() => {
            throw new Error(
              "Impossible d’accéder au dossier de destination. Vérifiez son emplacement et la connexion au compagnon.",
            );
          });
          if (folder.type !== "directory")
            throw new Error("La destination doit être un dossier accessible.");
          run.destination = folder.path;
          item = await verifyDownload(payload.download, request);
          await save(run);
          if (automatic) {
            const allowed = await chrome.permissions.contains({
              permissions: ["downloads"],
            });
            const current = automaticDownloadSuggestion(
              item,
              restoreDownloadFiling(await storageGet(downloadFilingKey, null))
                .rules,
            );
            if (
              !allowed ||
              !current.automatic ||
              current.ambiguous ||
              JSON.stringify(current.rules) !== JSON.stringify(automatic)
            )
              throw new Error(
                "Règle ou autorisation modifiée avant le transfert. Aucun fichier déplacé.",
              );
          }
        } catch (error) {
          if (!automatic) throw error;
          run.state = "blocked";
          run.message = `${(error as Error).message} Aucun transfert lancé ; vous pouvez ranger ce fichier manuellement.`;
          await save(run);
          return;
        }
        try {
          const job = await request<{ jobId: string }>("FS_TRANSFER", {
            paths: [item.filename],
            destination: run.destination,
            mode: automatic ? "move" : payload.mode || "move",
            conflict: automatic ? "rename" : payload.conflict || "rename",
            merge: false,
          });
          run.jobId = job.jobId;
          run.state = "running";
          await save(run);
          void follow(run, item).catch(console.error);
          return job;
        } catch (error) {
          run.state = "uncertain";
          run.message = (error as Error).message;
          await save(run);
          throw error;
        }
      },
    );
  }

  async function changed(delta: chrome.downloads.DownloadDelta) {
    if (delta.state?.current !== "complete") return;
    if (!(await chrome.permissions.contains({ permissions: ["downloads"] })))
      return;
    const [item] = await chrome.downloads.search({ id: delta.id });
    if (!item) return;
    const suggestion = automaticDownloadSuggestion(
      item,
      restoreDownloadFiling(await storageGet(downloadFilingKey, null)).rules,
    );
    if (!suggestion.automatic) return;
    await file(
      { download: item, destination: suggestion.rules[0].destination },
      suggestion.rules,
    );
  }
  const listener = (delta: chrome.downloads.DownloadDelta) =>
    changed(delta).catch(console.error);
  // Register synchronously at worker startup; never scan or replay past downloads.
  const listen = () => {
    if (
      globalThis.chrome?.downloads?.onChanged &&
      !chrome.downloads.onChanged.hasListener(listener)
    )
      chrome.downloads.onChanged.addListener(listener);
  };
  listen();
  globalThis.chrome?.permissions?.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes("downloads")) listen();
  });
  globalThis.chrome?.permissions?.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes("downloads"))
      chrome.downloads?.onChanged.removeListener(listener);
  });
  return (payload: Parameters<typeof file>[0]) => file(payload);
}
