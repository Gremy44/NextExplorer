import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { relatedFileName } from "./file-groups";
import type { Entry } from "./types";

// Synthetic labels express specific filing tasks; they do not measure real-user accuracy.
const pairs: [string, string, boolean][] = [
  ["Été Atlas-v1.PDF", "ete atlas version 2.docx", true],
  ["Voyage Martin copie.jpg", "voyage-martin.png", true],
  ["Etude solaire nord.pdf", "Etude solaire nord résumé.txt", true],
  [
    "Dossier rénovation cuisine.pdf",
    "Dossier rénovation cuisine devis.docx",
    true,
  ],
  ["Projet Atlas budget.pdf", "Projet Atlas budget bilan.docx", true],
  ["Plan jardin terrasse.pdf", "Plan jardin terrasse copie.png", true],
  ["Projet Atlas facture 001.pdf", "Projet Atlas facture 002.pdf", false],
  ["Rapport annuel Atlas 2025.pdf", "Rapport annuel Atlas 2026.pdf", false],
  ["Dossier mission Lyon 2026.pdf", "Dossier mission Lyons 2026.pdf", false],
  ["Transfert Paris Lyon.pdf", "Transfert Lyon Paris.pdf", false],
  [
    "Transfert Paris Lyon facture.pdf",
    "Transfert Lyon Paris facture.pdf",
    false,
  ],
  ["Facture voiture Martin.pdf", "Facture maison Martin.pdf", false],
  ["Attestation Marc Dupont.pdf", "Attestation Marie Dupont.pdf", false],
  ["Permis Alice Martin.pdf", "Permis Alain Martin.pdf", false],
  ["IMG 0001.jpg", "IMG 0002.jpg", false],
  ["Contrat client Orion signé.pdf", "Contrat client Orion refusé.pdf", false],
  ["Album séjour Portugal.pdf", "Facture chaudière Dupuis.pdf", false],
  ["Projet Atlas appartement A1.pdf", "Projet Atlas appartement A2.pdf", false],
  [
    "Facture location bureau 2026.pdf",
    "Facture location bureau 2025.pdf",
    false,
  ],
  ["Document confidentiel famille.pdf", "Recette cuisine dessert.pdf", false],
];
const normalize = (name: string) => relatedFileName({ name } as Entry);
function jaccard(a: string, b: string) {
  const first = new Set(a.split(" ")),
    second = new Set(b.split(" "));
  return (
    [...first].filter((word) => second.has(word)).length /
    new Set([...first, ...second]).size
  );
}
function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
it("mesure Jaccard et Levenshtein et conserve l’égalité explicite quand des noms voisins changent le sens", () => {
  const metrics = Object.entries({ jaccard, levenshtein }).flatMap(
    ([algorithm, score]) =>
      [0.5, 0.65, 0.8, 0.9].map((threshold) => {
        let truePositives = 0,
          falsePositives = 0,
          falseNegatives = 0;
        for (const [a, b, related] of pairs) {
          const accepted = score(normalize(a), normalize(b)) >= threshold;
          if (accepted && related) truePositives++;
          if (accepted && !related) falsePositives++;
          if (!accepted && related) falseNegatives++;
        }
        return {
          algorithm,
          threshold,
          truePositives,
          falsePositives,
          falseNegatives,
          precision: truePositives / (truePositives + falsePositives),
          recall: truePositives / (truePositives + falseNegatives),
        };
      }),
  );
  expect(metrics).toHaveLength(8);
  expect(metrics.every((metric) => metric.falsePositives > 0)).toBe(true);
  for (const [a, b, related] of pairs)
    if (!related) expect(normalize(a)).not.toBe(normalize(b));
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/c1-name-evaluation.json",
    JSON.stringify(
      {
        date: "2026-10-17",
        corpus: "20 paires synthétiques étiquetées",
        metrics,
        decision:
          "Ne pas proposer de rapprochement approximatif. Tous les seuils évalués produisent des faux positifs ; conserver les noms normalisés exacts et les liens manuels.",
      },
      null,
      2,
    ),
  );
});
