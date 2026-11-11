# Provenance des chiffres et limites économiques

Le prix candidat de 49 € provient du plan historique du propriétaire. Il n'est pas validé ; HT/TTC, pays du vendeur, régime fiscal, temps disponible, charges et objectif de revenu ne sont pas renseignés. Le refus de dépenses de distribution ne signifie pas absence de coût de travail.

Les trois trajectoires de ventes dans `scenarios/generate.py` sont des **scénarios de sensibilité inventés pour le calcul**, pas des prévisions. Elles ne proviennent pas des taux du panel. Deux mois à zéro illustrent un début sans offre vendable ; ce n'est pas une date de livraison Pro. Renouvellements, abonnements, dons et valeur terminale sont exclus.

Hypothèses : ticket client 49 €, réserve arithmétique de taxe à 20 % donnant 40,8333 € de revenu net, 4 € de paiement/change/suppléments par vente, 5 % du net en réserve de remboursements, 20 minutes de support à 20 €/h, 40 h mensuelles de maintenance/acquisition/gestion à 20 €/h, 40 € de réserve d'outils. **Ces montants ne sont ni un budget approuvé ni une détermination des taxes applicables à La Réunion, en métropole ou ailleurs.** Les chiffres doivent être remplacés par les données du vendeur et du prestataire. Les heures passées à développer et le futur travail IA restent non chiffrés : le modèle n'établit pas le retour sur investissement total.

La [page de frais Lemon Squeezy](https://docs.lemonsqueezy.com/help/getting-started/fees), consultée le 11/11/2026, indique 5 % + 0,50 USD avec suppléments possibles. C'est un candidat, pas une sélection. La réserve 4 € n'est pas une conversion certifiée de cette grille. [Paddle](https://www.paddle.com/pricing) est un autre candidat à vérifier avant choix ; aucun compte ni paiement créé.

Le moteur du skill affiche un symbole dollar en dur : les rapports bruts conservés sous `scenarios/` utilisent ce symbole, mais tous leurs **inputs sont en EUR**. Les tableaux français expriment ces mêmes montants en EUR, sans conversion monétaire. Les équivalents de trésorerie produits par le moteur incluent le temps valorisé ; ils ne sont pas des besoins bancaires réels. La capacité de support n'est pas validée.

À demander au propriétaire : heures/semaine, coût réel des outils et du temps, situation fiscale, revenu complémentaire visé, charge d'assistance, définition de la maintenance incluse et dépenses de développement futur. Faire confirmer structure, comptabilité et taxes par un professionnel avant vente : ceci est une étude, pas un conseil financier, fiscal ou juridique.

On ne crée pas de `founder/numbers.json` de référence à partir de ces hypothèses : le compilateur principal doit rester **Incomplete**, même si un scénario arbitraire dégage un excédent.
