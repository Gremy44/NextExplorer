import { expect, it, vi } from "vitest";
import { nativeThumbnail } from "./native-thumbnail";
import { bridge } from "./bridge";
import type { Entry } from "./types";

it("bounds thumbnail requests, skips cancelled work and reuses only precise snapshots", async () => {
  const entries = Array.from(
    { length: 4 },
    (_, i) =>
      ({
        path: `C:\\${i}.png`,
        name: `${i}.png`,
        ext: ".png",
        type: "file",
        size: 1,
        mtime: 1,
        stamp: "100",
      }) as Entry,
  );
  const releases: (() => void)[] = [];
  let active = 0,
    max = 0,
    reads = 0;
  const request = vi
    .spyOn(bridge, "request")
    .mockImplementation(async (action, payload: any) => {
      const entry = entries.find((entry) => entry.path === payload.path)!;
      if (action === "FS_STAT") return entry;
      active++;
      max = Math.max(active, max);
      reads++;
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return { data: "/9j/" };
    });
  try {
    const controller = new AbortController();
    const first = nativeThumbnail(entries[0], new AbortController().signal),
      second = nativeThumbnail(entries[1], new AbortController().signal),
      third = nativeThumbnail(entries[2], controller.signal).catch(
        (error) => error,
      ),
      fourth = nativeThumbnail(entries[3], new AbortController().signal);
    await vi.waitFor(() => expect(releases.length).toBe(2));
    controller.abort();
    releases[0]();
    releases[1]();
    await Promise.all([first, second]);
    await vi.waitFor(() => expect(releases.length).toBe(3));
    releases[2]();
    await fourth;
    expect((await third).name).toBe("AbortError");
    expect(max).toBe(2);
    expect(reads).toBe(3);
    await nativeThumbnail(entries[0], new AbortController().signal);
    expect(reads).toBe(3);
    entries[0] = { ...entries[0], stamp: "200" };
    const changed = nativeThumbnail(entries[0], new AbortController().signal);
    await vi.waitFor(() => expect(releases.length).toBe(4));
    releases[3]();
    await changed;
    expect(reads).toBe(4);
  } finally {
    request.mockRestore();
  }
});
