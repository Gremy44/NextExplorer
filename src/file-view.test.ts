import { describe, expect, it } from "vitest";
import { restoreViewMode } from "./FileView";

describe("Affichage mémorisé", () => {
  it("migre la grille existante et garde les choix propres au panneau", () => {
    expect(restoreViewMode(undefined, true, "details")).toBe("medium-icons");
    expect(restoreViewMode(undefined, false, "details")).toBe("details");
    expect(restoreViewMode(undefined, false, "tiles")).toBe("tiles");
    expect(restoreViewMode("content", true, "details")).toBe("content");
  });
  it("ignore un mode invalide dans les préférences sauvegardées", () => {
    expect(restoreViewMode("unknown", false, "tiles")).toBe("tiles");
    expect(restoreViewMode({}, false, "details")).toBe("details");
  });
});
