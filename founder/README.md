# Étude Founder de NextExplorer

11 novembre 2026 · branche `research/founder-review`. Rapport interne de travail ; aucune application, release, identité commerciale ou publication modifiée.

**À lire d'abord : [la synthèse](summary.md) ou [la note d'une page](one-pager.md).** Le [plan complet](business-plan.md) est assemblé par l'outil officiel du skill. Son verdict **Incomplete** reflète l'absence d'entrées économiques réelles : on ne remplit pas ces champs par des zéros ou des prévisions inventées.

## Les onze étapes appliquées

| Skill | Livrable | Portée |
| --- | --- | --- |
| founder-board | [Board](board.md), trois mémos indépendants | Jugement sur brief, pas décision d'investissement |
| founder-competitors | [Comparaison](competitors.md), [CSV](competitors.csv) | Huit alternatives, sources publiques ; avis clients encore minces |
| founder-consumer | [Analyse](consumer.md), réponses V1/V2 | 20 profils fictifs, re-test sur mêmes cartes, 40 réponses |
| founder-pricing | [Prix](pricing.md), courbes V1/V2 | Sensibilité synthétique, pas tarif validé |
| founder-offer | [Offre](offer.md), pitch initial/clarifié | Réduction de l'incertitude ; pas de garantie inventée |
| founder-cfo | [Économie](cfo.md), [sources](cfo-sources.md), scénarios | Calculs reproductibles isolés des données réelles manquantes |
| founder-marketing | [Marketing](marketing.md) | Dix accroches et calendrier candidat de 30 jours |
| founder-brand | [Marque](brand.md) | Noms exploratoires, contrôles publics partiels ; aucune disponibilité juridique garantie |
| founder-ops | [Opérations](ops.md) | Routines, risques, coûts et formalités à confirmer |
| founder-launch | [Lancement](launch.md) | Expérience réelle gratuite et décisions conditionnelles |
| founder-plan | [Synthèse](summary.md), [plan](business-plan.md), [note](one-pager.md) | Verdict calculé par compile.py |

## Provenance et contrôles

Suite [Jakeschincariol/founder-skill](https://github.com/Jakeschincariol/founder-skill), version source `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d`, MIT ; installée dans `~/.codex/skills/founder-*`. Grilles : synthèses de cadres publiés, jamais avis personnels des auteurs cités. Sources internes : [V1](../V1_GRATUITE.md), [plan antérieur](../PLAN_RENTABILISATION.md), [distribution](../STRATEGIE_DISTRIBUTION.md). Le dossier développe une évaluation ; il ne remplace pas ces décisions par une nouvelle stratégie approuvée.

Trois agents pour le board, 20 agents pour le premier panel et 20 autres pour le re-test, avec trois exécutions simultanées maximum. Cartes/graine identiques vérifiées ; aucun avis rédigé par le modérateur. Le générateur conserve un symbole dollar dans certains gabarits : voir les réserves de devise dans [consumer.md](consumer.md) et [cfo-sources.md](cfo-sources.md).

Les commandes suivantes s'exécutent depuis la racine du projet sous PowerShell avec Python 3 ; elles lisent les réponses existantes, elles ne relancent pas les agents. Activer l'UTF-8 pour les sorties console :

```powershell
$env:PYTHONUTF8 = '1'
py -3 "$env:USERPROFILE/.codex/skills/founder-consumer/panel.py" check
py -3 "$env:USERPROFILE/.codex/skills/founder-consumer/panel.py" --dir founder/panel-v2 check
py -3 founder/scenarios/generate.py
py -3 "$env:USERPROFILE/.codex/skills/founder-plan/compile.py" --dir founder --check
py -3 "$env:USERPROFILE/.codex/skills/founder-plan/compile.py" --dir founder
```

`compile --check` retourne intentionnellement un statut non nul tant que le dossier reste Incomplete. Ne pas transformer ce contrôle en test vert en ajoutant des chiffres non confirmés. Le générateur de scénarios possède des assertions de cohérence des calculs ; ses entrées sont toutes des hypothèses déclarées. Les tests amont de la suite avaient passé 29 cas à l'installation ; ils ne valident pas le marché.

Reste à obtenir : profil/cible confirmé par terrain, heures et coûts du propriétaire, observations réelles, statut du Store et contrôles marque/vente complets. Aucun prospect contacté, aucun paiement ni achat, aucun modèle téléchargé pour le produit. La simulation et l'étude peuvent éclairer les questions ; elles ne remplacent pas le pilote.
