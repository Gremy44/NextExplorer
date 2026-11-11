# Économie : marge possible, revenu non démontré

**Chiffres réels insuffisants pour un verdict financier sur le projet.** Les calculs ci-dessous viennent du moteur `founder-cfo`, sur hypothèses explicites et reproductibles, sans projection issue du panel. [Sources et limites](cfo-sources.md), [générateur](scenarios/generate.py), [résultats détaillés](scenarios/results.json).

À ticket client hypothétique de 49 €, revenu net illustratif de 40,8333 €, coûts variables de 12,7083 € : **28,125 € de contribution par nouvelle licence**, soit 68,88 % du net. Il reste ensuite les frais fixes et le temps de maintenance. La contribution n'est pas du salaire net.

| Scénario illustratif | Licences année 1 | Résultat annuel après temps valorisé | Équivalent du creux cumulé, pas besoin bancaire |
| --- | ---: | ---: | ---: |
| Prudent | 75 | −7 970,62 € | 7 970,62 € |
| Central | 275 | −2 345,62 € | 3 770,62 € |
| Traction | 835 | +13 404,38 € | 2 516,25 € |

Coûts fixes hypothétiques : 840 €/mois dont 800 € de travail valorisé. Seuil d'équilibre : **29,87 nouvelles licences/mois**, donc environ 30. Un achat unique demande de trouver de nouveaux acheteurs ; il ne crée pas automatiquement une rente. La marge au rythme final central de 50 licences/mois est de 27,74 % du revenu net, mais **l'année centrale perd quand même de l'argent**, à cause de la montée progressive des ventes.

La capacité n'est pas connue : le mois final du scénario traction implique environ 96,7 heures de travail (40 h fixes et 56,7 h d'assistance). Il ne faut pas le qualifier de réalisable sans connaître le temps du créateur. Développement IA, évolution des formats et coût d'assistance des utilisateurs gratuits peuvent dépasser ces hypothèses. Le coût d'opportunité des développements antérieurs n'est pas récupéré par ce tableau.

## Sensibilités calculées, même trajectoire centrale

| Levier purement hypothétique | Contribution/licence | Seuil mensuel | Résultat annuel |
| --- | ---: | ---: | ---: |
| Support 20 → 5 min, gain de 5 €/licence | 33,125 € | 25,36 | −970,62 € |
| Ticket 49 → 59 €, réserve de remboursement recalculée | 36,0417 € | 23,31 | −168,54 € |
| Volume −20 % | 28,125 € | 29,87 | −3 892,50 € |

Troisième levier : réduire le temps fixe de maintenance/gestion de 40 à 20 h/mois libérerait 400 €/mois, soit 4 800 €/an à mêmes ventes et service. Ce calcul doit devenir une mesure du travail, pas une réduction fictive du support. L'installation autonome est donc un levier économique autant qu'ergonomique.

**Ligne à surveiller : minutes d'assistance par utilisateur gratuit et par acheteur**, puis nombre de nouvelles licences atteignable sans achat publicitaire. La réserve de remboursements ne suffit pas à promettre une garantie sur un logiciel non livré ; aucune garantie payante n'est publiée.

Les conditions économiques du board restent ouvertes : budget et heures réels, premiers usages répétés, coût d'acquisition, paiement et fiscalité, disponibilité effective de Pro. Aucun besoin de payer un service maintenant. Le verdict du plan principal doit rester **Incomplete**, car les scénarios ne remplacent pas ces entrées.
