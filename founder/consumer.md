# Panel simulé : tester les objections, pas prédire les ventes

11 novembre 2026. Deux passages de 20 profils fictifs, graine 7 ; **mêmes cartes vérifiées à l'identique**. Chaque réponse vient d'un agent distinct et a été contrôlée avec l'outil du skill. Les agents représentent des scénarios, pas des personnes réelles ni des avis statistiquement indépendants.

| Présentation | Intentions conditionnelles | Refus | Réponses valides |
| --- | ---: | ---: | ---: |
| [Concept initial](pitch-v1.md) | 0 | 20 | 20/20 |
| [Présentation clarifiée](pitch.md) | 0 | 20 | 20/20 |

**Aucune hausse constatée** après clarification. Elle explique mieux les limites et l'essai futur mais ne rend pas l'IA disponible, ne signe pas l'EXE et ne démontre aucun gain. On ne peut pas résoudre ces objections uniquement par de meilleurs mots.

Dans le deuxième passage : confiance 13/20, commodité 4/20, besoin 2/20, habitude 1/20. Les variations de codage sont faibles et ne permettent pas d'attribuer un effet au texte.

Le produit évalué est le **concept Pro futur à 49 €**, avec son incertitude actuelle. L'étude ne mesure ni l'adoption du gratuit, ni la qualité technique de l'application, ni la volonté de payer après une fonction Pro démontrée. Le fait d'insister sur la non-disponibilité et les risques dans le pitch peut favoriser le refus ; c'est un biais du protocole, pas une découverte sur toute la population Windows.

## Segments et objections

Premier passage : 8 profils administratifs, 6 créatifs, 6 personnels ; aucun groupe acheteur. Tous les groupes sont très petits et leurs parts ont été choisies par l'agent : aucune recommandation démographique ne doit en être déduite.

Motifs dominants du premier passage : confiance 13/20, commodité 3/20, besoin 2/20, habitude 1/20, qualité 1/20. Chaque réponse a un seul code principal ; les raisons se chevauchent dans les textes. Trois exemples **simulés**, à ne jamais transformer en témoignages publicitaires :

- P004, confiance : « Je cherche souvent des fichiers, mais je ne paierais pas 49 € sans pouvoir vérifier la provenance du compagnon et ce qu'il fait de mes documents. »
- P010, commodité : « Je veux gagner du temps pour préparer mes pièces jointes, mais je ne veux pas passer ma soirée à installer une extension, un compagnon et un modèle. »
- P002, besoin : « Pour adapter mes images avant de les déposer, mes outils gratuits suffisent. »

Demandes revenant dans les réponses : essai utile sur ses fichiers, installation compréhensible, informations vérifiables sur les données et les permissions. Plusieurs agents réclament une version signée. **Cela ne devient pas une obligation d'achat de certificat** : le propriétaire a choisi de ne pas payer la distribution. Il faut mesurer auprès de vraies personnes si cette contrainte exclut le segment ou peut être acceptée dans un pilote transparent.

## Limites de méthode

- Aucun recrutement réel, aucune enquête représentative, aucune transaction, aucune mesure de rétention.
- Le choix de 20 profils limite les appels pour cette première étude ; le second passage teste la présentation, soit 40 réponses au total. Ce n'est pas un panel de 100.
- Profils, revenus et parts sont des hypothèses. Le gabarit du skill affiche un dollar dans les revenus et les tableaux ; les prix du pitch sont en euros. Les tranches de revenu ne sont donc pas utilisées pour tirer des conclusions économiques.
- Les mêmes modèles et leurs instructions peuvent produire des biais communs. L'exécution séparée n'est pas une indépendance statistique.
- « Buys » signifie ici intention conditionnelle déclarée envers un concept ; zéro ne prédit pas zéro vente d'une future offre fonctionnelle.
- Les courbes de prix sont calculées sur réponses synthétiques, sans précision statistique ; elles ne décident pas du tarif.
- Quatre réponses V2 avaient une marque d'encodage UTF-8 BOM ajoutée par le transport Windows. Elles ont été réenregistrées via `panel.save`, avec égalité des objets JSON vérifiée ; aucun contenu ou avis n'a été réécrit.

Conserver les deux ensembles de réponses et rapports bruts : [V1](panel/results.md), [V2](panel-v2/results.md), [prix](pricing.md). Changer d'abord la preuve terrain et le parcours, puis refaire une étude si le concept devient concret. La prochaine décision utile reste un pilote gratuit observé, pas un achat publicitaire.
