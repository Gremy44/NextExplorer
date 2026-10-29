import { expect, it } from "vitest";
import { readSpaceResult, type SpaceResultPage } from "./disk-space";

const page = (
  paths: string[],
  extra: Partial<SpaceResultPage> = {},
): SpaceResultPage => ({
  path: "C:/",
  total: 30,
  skipped: 0,
  items: paths.map((path) => ({ path, size: 10 })),
  ...extra,
});
it("lit tous les résultats paginés sans confondre leur nombre avec la taille disque", async () => {
  const offsets: number[] = [];
  const result = await readSpaceResult(async (offset) => {
    offsets.push(offset);
    return offset === 0
      ? page(["a", "b"], { itemCount: 3, nextOffset: 2 })
      : page(["c"], { itemCount: 3 });
  });
  expect(offsets).toEqual([0, 2]);
  expect(result.items.map((item) => item.path)).toEqual(["a", "b", "c"]);
  expect(result.total).toBe(30);
});
it("accepte le résultat d’un ancien compagnon sans pagination", async () => {
  expect(
    (await readSpaceResult(async () => page(["a"], { truncated: true })))
      .truncated,
  ).toBe(true);
});
it("refuse une pagination bloquée, incomplète ou modifiée", async () => {
  await expect(
    readSpaceResult(async () => page(["a"], { itemCount: 3, nextOffset: 0 })),
  ).rejects.toThrow("Pagination");
  await expect(
    readSpaceResult(async () => page(["a"], { itemCount: 3 })),
  ).rejects.toThrow("incomplet");
  await expect(
    readSpaceResult(async (offset) =>
      offset === 0
        ? page(["a"], { itemCount: 2, nextOffset: 1 })
        : page(["b"], { itemCount: 2, total: 99 }),
    ),
  ).rejects.toThrow("modifié");
});
