import { afterEach, expect, it, vi } from "vitest";
import { reveal } from "./motion";

afterEach(() => vi.unstubAllGlobals());
it("anime le contenu sans le recréer et permet d’arrêter la transition", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const cancel = vi.fn(),
    animate = vi.fn(() => ({ cancel }));
  const cleanup = reveal({ animate } as unknown as HTMLElement);
  expect(animate).toHaveBeenCalledOnce();
  cleanup?.();
  expect(cancel).toHaveBeenCalledOnce();
});
it("respecte la réduction des animations et l’absence d’un panneau", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const animate = vi.fn();
  expect(reveal({ animate } as unknown as HTMLElement)).toBeUndefined();
  expect(reveal(null)).toBeUndefined();
  expect(animate).not.toHaveBeenCalled();
});
