# Évaluation C1 — noms approchants

17 octobre 2026. Évaluation classique locale, sans IA. Code reproductible dans `src/file-name-evaluation.test.ts`, données générées sous `test-results/c1-name-evaluation.json` (non publiées avec les profils et fichiers de recette).

## Corpus et mesure

20 paires synthétiques étiquetées : 6 liées pour la tâche choisie et 14 distinctes. Versions/copies explicites, accents, suffixes de résumé/devis, numéros de facture, années, personnes et trajets inversés. Noms normalisés avec la même fonction que l’application ; Jaccard compare les ensembles de mots, Levenshtein le nombre normalisé de modifications de caractères.

Une précision de 75 % signifie que trois propositions sur quatre sont liées dans ce petit corpus. Le rappel mesure la part des six liens retrouvés. Ce ne sont ni une mesure sur fichiers personnels, ni une estimation de gain utilisateur.

| Algorithme | Seuil | Vrais positifs | Faux positifs | Faux négatifs | Précision | Rappel |
| --- | --- | --- | --- | --- | --- | --- |
| jaccard | 0.5 | 6 | 11 | 0 | 35.3 % | 100.0 % |
| jaccard | 0.65 | 6 | 2 | 0 | 75.0 % | 100.0 % |
| jaccard | 0.8 | 3 | 2 | 3 | 60.0 % | 50.0 % |
| jaccard | 0.9 | 3 | 2 | 3 | 60.0 % | 50.0 % |
| levenshtein | 0.5 | 6 | 12 | 0 | 33.3 % | 100.0 % |
| levenshtein | 0.65 | 6 | 10 | 0 | 37.5 % | 100.0 % |
| levenshtein | 0.8 | 4 | 9 | 2 | 30.8 % | 66.7 % |
| levenshtein | 0.9 | 3 | 6 | 3 | 33.3 % | 50.0 % |

## Décision

Tous les seuils testés produisent des faux positifs. Jaccard ignore l’ordre et confond notamment Transfert Paris Lyon avec Transfert Lyon Paris ; Levenshtein rapproche des années ou numéros voisins qui doivent rester distincts. Aucun de ces scores n’est proposé comme classement dans l’application. Conserver les noms normalisés exacts, les motifs visibles et les familles que l’utilisateur crée explicitement.

Un rapprochement approximatif demanderait un corpus représentatif consenti, des tâches et erreurs acceptables explicites, puis une nouvelle mesure. Cette étude termine la décision technique du palier C1 ; elle ne certifie pas tous les classements exacts. Les relations de préparations sont des références de lot, contrôlées par métadonnées, sans preuve du contenu ni correspondance individuelle déduite.
