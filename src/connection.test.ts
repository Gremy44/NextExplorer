import { afterEach, expect, it, vi } from "vitest";
import { connectCompanion } from "./connection";
import type { Hello } from "./types";

const hello = { protocolVersion: 1, tools: {} } as Hello;
afterEach(() => vi.useRealTimers());

it("retrouve un compagnon devenu disponible", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("Absent"))
    .mockResolvedValue(hello);
  const progress = vi.fn();
  const result = connectCompanion(
    request,
    new AbortController().signal,
    progress,
  );
  await vi.runAllTimersAsync();
  expect(await result).toBe(hello);
  expect(progress.mock.calls).toEqual([[1], [2]]);
  expect(request).toHaveBeenCalledTimes(2);
});

it("s’arrête après quatre échecs", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockRejectedValue(new Error("Absent"));
  const result = expect(
    connectCompanion(request, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Absent");
  await vi.runAllTimersAsync();
  await result;
  expect(request).toHaveBeenCalledTimes(4);
});

it.each([false, true])(
  "ne réessaie pas un protocole incompatible (refus natif : %s)",
  async (native) => {
    const request = native
      ? vi
          .fn()
          .mockRejectedValue(
            new Error(
              "Versions incompatibles (extension : protocole 1, compagnon : 2)",
            ),
          )
      : vi.fn().mockResolvedValue({ protocolVersion: 2 });
    await expect(
      connectCompanion(request, new AbortController().signal, vi.fn()),
    ).rejects.toThrow("Versions incompatibles");
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it("annule les tentatives restantes à la fermeture", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const request = vi.fn().mockRejectedValue(new Error("Absent"));
  const result = expect(
    connectCompanion(request, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.runAllTimersAsync();
  await result;
  expect(request).toHaveBeenCalledTimes(1);
});

it("ignore une réponse arrivée après annulation", async () => {
  const controller = new AbortController();
  const request = vi.fn(async () => {
    controller.abort();
    return hello;
  });
  await expect(
    connectCompanion(request, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ name: "AbortError" });
});
