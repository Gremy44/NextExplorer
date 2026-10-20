# NextExplorer

**Vos fichiers locaux et vos projets web dans un même espace.**

**Téléchargements publics :** [NextExplorer-Downloads](https://github.com/Gremy44/NextExplorer-Downloads) — [préversion technique 1.0.1](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.1), gratuite et non signée, pour essais sur fichiers fictifs. Le code applicatif reste privé ; la [licence](LICENSE) autorise l’utilisation des versions compilées. Aucun paiement requis pour cette distribution.

**Présentation publique :** [usages et captures grand format](distribution/README.md), [guide détaillé des fonctionnalités](distribution/FONCTIONNALITES.md). Six captures réelles de démonstration, dont le panneau Chrome recevant un dépôt Windows et Codex CLI ouvert dans la console du dossier actif.

NextExplorer associe une extension Chrome à un compagnon natif pour explorer, préparer et utiliser ses fichiers pendant la navigation. Le panneau latéral garde les fichiers à portée de main ; la vue complète propose un explorateur à onglets et à double panneau.

L’interface est en français, avec des thèmes clair et sombre inspirés de Material 3. Le fonctionnement repose sur le navigateur et le compagnon local, sans compte NextExplorer ni serveur applicatif distant.

> **Projet en développement.** La cible actuellement testée est Windows avec Chrome/Chromium. La recette complète de l’installateur sur une machine Windows propre reste à effectuer. L’IA locale figure dans les pistes futures ; aucun modèle d’IA n’est actuellement intégré.

**Distribution J7 :** [dossier Chrome Web Store](store/README.md), ZIP de l’extension et textes/visuels préparés localement. `npm run package:store` produit l’archive séparée du compagnon Windows ; aucun élément publié. Identité Store, URLs, premier parcours d’installation et recette Windows propre restent à finaliser.

## Fonctionnalités

**Console intégrée :** **Aperçu → Console** ouvre un vrai PowerShell dans le dossier actif, avec suivi désactivable, saisie/commande en cours préservées et session conservée quand le volet est masqué. Windows et compagnon mis à jour requis. [Guide et limites](CONSOLE_INTEGREE.md).

**Nouveautés du 18 octobre :** tags à sept couleurs et recherche dans tous les dossiers, personnalisation des dossiers, actions rapides (rotation, annotation, PDF, découpe), analyse d’espace dans l’aperçu et vue **Ce PC** avec les capacités des lecteurs. [Guide et limites](AMELIORATIONS_FINDER.md).

**Revue ergonomique :** espace disque agrandissable, noms et détails des blocs au survol/clavier, couleurs plus contrastées. [Liste des 47 parcours à vérifier ensemble](REVUE_ERGONOMIE_OUTILS.md).

**Aperçus de fichiers :** [audit des 100 formats](APERCUS_100_FORMATS.md), avec prise en charge actuelle, formats ouverts ou d’éditeur, limites et pistes d’aperçus locaux. Cette étude n’ajoute pas encore de lecteur.

| Usage | Disponible aujourd’hui |
| --- | --- |
| Explorer | Onglets de dossiers, double panneau ajustable, navigation par chemin, favoris, neuf modes d’affichage dont colonnes de dossiers, filtres, tags et tri. Menu du clic droit avec icônes et groupes d’actions. |
| Examiner | Volet aperçu et détails redimensionnable ; images/TIFF réduits par le compagnon, audio/vidéo compatible par lecture locale progressive, texte/PDF et métadonnées. Limites de taille/décodage visibles. |
| Manipuler | Copie, déplacement, renommage, corbeille locale, conflits et fusion de dossiers, transferts vérifiés et annulation sous conditions. |
| Préparer | Convertisseur réservé aux images et vidéos, réglages/préréglages adaptés, lots mixtes séparés et copies sans écrasement. Recette conversion → ZIP, préparation web, création ZIP/7z et extraction ZIP/7z/RAR. Moteurs optionnels selon les opérations. |
| Utiliser sur le web | Glisser-déposer natif Windows, collecte de fichiers et de liens, capture de pages et insertion dans les champs de fichiers. Suivi local des 20 dernières tentatives d’insertion. |
| Organiser un projet | Espaces hybrides enregistrés, dossiers et pages associés, tâches manuelles, export/import et espace suivi par vue. |
| Regrouper les fichiers | Neuf modes : format, nom apparenté, mois, taille, relations enregistrées, origine web, destination, copies identiques et images similaires. Comparaisons bornées, progression et arrêt, aucune suppression automatique. Familles manuelles, liens avec les copies préparées et brouillons H07 à confirmer. Transferts examinés de 20 fichiers, copie par défaut et revalidation. |
| Retrouver | Index lexical TXT/Markdown borné sur un dossier choisi et ses sous-dossiers, mots-clés et vocabulaire proche ; recherche commune avec liens et espaces enregistrés. |
| Personnaliser | Accueil, démarrage, thèmes système/clair/sombre, colonnes, raccourcis et préférences par dossier ; tags et réglages exportables. |
| Ranger les téléchargements | Règles de destination et rangement en arrière-plan uniquement pour les règles explicitement activées. |
| Suivre les traitements | Worker local indépendant, file séquentielle et états durables. Les tâches autorisées continuent quand Chrome ferme ; reprise explicite après interruption, uniquement aux étapes sûres. |

Le [guide J4](J4_ORGANISATION_RECHERCHE.md) détaille la recherche, les tags et les préférences ; le moteur PDF textuel est optionnel et absent du paquet actuel.

Le [guide des copies identiques C2](C2_COPIES_IDENTIQUES.md) détaille les empreintes et le cache. Le [guide J5](J5_MEDIAS_TACHES.md) décrit les ressemblances visuelles indicatives, les gros médias, les recettes et la récupération des tâches.

Les périmètres exacts et les limites sont décrits dans [la matrice des fonctionnalités](FEATURES.md) et [le guide d’utilisation](GUIDE_UTILISATION.md).

## Installer depuis les sources — Windows

### Prérequis

- Windows 64 bits et Chrome/Chromium 116 ou supérieur.
- Git et accès à ce dépôt privé.
- Node.js 22 ou supérieur, avec npm.
- Go 1.24 ou supérieur. Le compagnon compilé ne nécessite ensuite aucune installation de Go.

### Construire et connecter l’extension

Dans PowerShell :

```powershell
git clone https://github.com/Gremy44/NextExplorer.git
cd NextExplorer
npm.cmd ci
npm.cmd run package
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-host.ps1
```

Si Go est absent, le script `scripts/setup-go.ps1` peut préparer le compilateur officiel dans `.tools/`, avec vérification SHA256.

Ensuite :

1. Ouvrir `chrome://extensions` et activer **Mode développeur**.
2. Choisir **Charger l’extension non empaquetée**, puis sélectionner le dossier `dist` du projet.
3. Épingler NextExplorer et cliquer sur son icône. **Alt+E** ouvre le panneau ; **Alt+Maj+E** ouvre la vue complète.

Le script installe le compagnon dans un dossier stable de l’utilisateur et enregistre le Native Messaging pour les navigateurs pris en charge, sans droits administrateur. Chrome demande toujours de charger l’extension manuellement.

La clé publique du manifeste et `extension-id.txt` conservent un identifiant stable : ce sont des données publiques nécessaires à la connexion native. Après reconstruction, actualiser l’extension dans Chrome ; si le compagnon a changé, relancer le script d’installation puis désactiver et réactiver l’extension.

Les fichiers `dist/`, `release/` et les exécutables sont générés localement et ne sont pas versionnés. `npm run package` prépare `release/NextExplorer`. La construction de l’assistant Windows, les moteurs optionnels, le diagnostic, la réparation et la désinstallation sont détaillés dans [le guide](GUIDE_UTILISATION.md).

## Développement et vérifications

L’extension utilise React, TypeScript et Vite ; le compagnon est écrit en Go. Les commandes passent par Native Messaging puis un canal nommé privé vers le worker Windows. La lecture audio/vidéo utilise un serveur temporaire limité à `127.0.0.1`, avec URL secrète et révocation à la fermeture de l’aperçu. Aucun serveur distant NextExplorer.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Interface de développement sur `127.0.0.1`. Une page web ordinaire n’a pas accès au disque. |
| `npm run check` | Vérification TypeScript et tests unitaires de l’extension. |
| `npm run native:test` | Tests du compagnon Go. Les moteurs installés permettent des vérifications supplémentaires. |
| `npm run test:browser` | Parcours d’interface avec un transport de test et le vrai compagnon. |
| `npm run test:extension` | Recette de l’extension dans un profil Chromium temporaire, préparé avec Playwright. |
| `npm run test:j5:worker` | File durable, fermeture du proxy, arrêt du worker et récupération sans doublon. |
| `npm run test:j5:extension` | Variantes visuelles, gros médias, préréglages et continuité des tâches/tags hors navigateur. |
| `npm run package` | Construction de l’extension, du compagnon et du paquet, puis vérification du paquet. |
| `npm run setup:build` | Construction de l’assistant Windows ; Inno Setup doit être préparé au préalable. |
| `npm run setup:acceptance` | Préparation du kit de recette Windows isolée ; cette commande n’exécute pas la recette. |

La configuration complète des recettes et leurs prérequis figurent dans [le guide](GUIDE_UTILISATION.md) et [la recette de l’installateur](RECETTE_INSTALLATEUR.md). Les adaptations Linux/macOS existent dans le code, mais n’ont pas été validées dans l’environnement Windows utilisé pour développer ce projet.

## Données et limites

- Les réglages, collectes et suivis sont conservés dans le profil du navigateur ; les journaux du compagnon restent sur la machine. Certains suivis et exports contiennent des chemins locaux.
- Les actions de capture, téléchargement ou insertion peuvent communiquer avec les sites choisis. L’installation des moteurs télécharge leurs distributions officielles.
- Le compagnon travaille avec les droits de l’utilisateur. Il ne contourne ni les permissions Windows ni l’UAC.
- Les insertions sont limitées à 20 fichiers et 20 Mio au total. Le suivi confirme le remplissage du champ, pas la réception des fichiers par le site ; certains sites commencent l’envoi dès ce remplissage.
- Le worker continue les tâches validées après fermeture de Chrome. Après arrêt du worker ou du PC, aucun rejeu automatique ; les étapes sûres se reprennent explicitement et les états ambigus demandent une vérification manuelle. Annuler ne défait pas les écritures terminées.
- L’assistant Windows de développement est non signé. La validation sur une machine propre reste ouverte.

## Structure du dépôt

```text
src/          Interface, état local, actions web et tests TypeScript
public/       Manifeste MV3, service worker et icônes
native/       Compagnon Go, sécurité et fixtures de test documentées
scripts/      Construction, installation, diagnostic et recettes
installer/    Définition de l’assistant Windows
*.md          Guides, spécifications, suivi du projet et pistes futures
```

Le `.gitignore` exclut les dépendances, outils téléchargés, builds, profils de test, journaux, captures locales et fichiers de secrets usuels. Le manifeste natif contenant le chemin absolu de la machine est recréé lors du packaging.

## Documentation

- [Guide d’installation et d’utilisation](GUIDE_UTILISATION.md)
- [Fonctionnalités et périmètres](FEATURES.md)
- [Parcours du panneau latéral](PANNEAU_LATERAL.md)
- [Médias, recettes et tâches durables J5](J5_MEDIAS_TACHES.md)
- [Direction visuelle Material 3](DESIGN.md)
- [Glisser-déposer vers le web](GLISSER_DEPOSER_WEB.md)
- [Recette Windows isolée](RECETTE_INSTALLATEUR.md)
- [Recette des deux parcours hybrides](RECETTE_HYBRIDE.md)
- [Composants tiers et licences](THIRD_PARTY.md)

Les documents de planification présents dans le dépôt décrivent des objectifs futurs ; ils ne garantissent pas leur disponibilité dans le prototype.

## Licence

Le dépôt est privé. Aucune licence de redistribution du code NextExplorer n’est accordée dans ce dépôt. Les dépendances et les fixtures de test conservent leurs propres licences, recensées dans [THIRD_PARTY.md](THIRD_PARTY.md).
