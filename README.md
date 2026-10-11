# NextExplorer

**Vos fichiers locaux et vos projets web dans un même espace.**

NextExplorer associe une extension Chrome à un compagnon natif pour explorer, préparer et utiliser ses fichiers pendant la navigation. Le panneau latéral garde les fichiers à portée de main ; la vue complète propose un explorateur à onglets et à double panneau.

L’interface est en français, avec des thèmes clair et sombre inspirés de Material 3. Le fonctionnement repose sur le navigateur et le compagnon local, sans compte NextExplorer ni serveur applicatif distant.

> **Projet en développement.** La cible actuellement testée est Windows avec Chrome/Chromium. La recette complète de l’installateur sur une machine Windows propre reste à effectuer. L’IA locale figure dans les pistes futures ; aucun modèle d’IA n’est actuellement intégré.

## Fonctionnalités

| Usage | Disponible aujourd’hui |
| --- | --- |
| Explorer | Onglets de dossiers, double panneau ajustable, navigation par chemin, favoris, huit modes d’affichage, filtres et tri. Menu du clic droit avec icônes et groupes d’actions. |
| Examiner | Volet aperçu et détails redimensionnable, aperçu texte, image, audio, vidéo et PDF, métadonnées. Les gros TIFF proposent une ouverture locale ou une copie de prévisualisation. |
| Manipuler | Copie, déplacement, renommage, corbeille locale, conflits et fusion de dossiers, transferts vérifiés et annulation sous conditions. |
| Préparer | Archives ZIP/7z/RAR, conversion de médias et préparation de copies d’images pour le web avec formats, dimensions et poids cibles. Certaines opérations nécessitent des moteurs optionnels. |
| Utiliser sur le web | Glisser-déposer natif Windows, collecte de fichiers et de liens, capture de pages et insertion dans les champs de fichiers. Suivi local des 20 dernières tentatives d’insertion. |
| Organiser un projet | Espaces hybrides enregistrés, dossiers et pages associés, tâches manuelles, export/import et espace suivi par vue. |
| Regrouper les fichiers | Catégories par extension, familles par nom normalisé, mois de modification et sites d’origine déclarés et destinations proposées par vos règles d’extension et, sur option explicite, de site ; motifs et cas incertains séparés. Sélection, dossier ou références de l’espace suivi, aucun déplacement au regroupement. Transfert examiné de 20 fichiers maximum, copie par défaut et confirmation avec revalidation ; règles avec site disponibles sur option explicite et provenance revérifiée avant transfert, métadonnées voisines non transférées. Origine : 20 fichiers, seuls les JSON de provenance de 64 Kio maximum sont lus, métadonnées contrôlées ; aucune source authentifiée. |
| Ranger les téléchargements | Règles de destination et rangement en arrière-plan uniquement pour les règles explicitement activées. |

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

L’extension utilise React, TypeScript et Vite ; le compagnon est écrit en Go. La communication native passe par l’entrée et la sortie standard, sans port HTTP ouvert par le compagnon.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Interface de développement sur `127.0.0.1`. Une page web ordinaire n’a pas accès au disque. |
| `npm run check` | Vérification TypeScript et tests unitaires de l’extension. |
| `npm run native:test` | Tests du compagnon Go. Les moteurs installés permettent des vérifications supplémentaires. |
| `npm run test:browser` | Parcours d’interface avec un transport de test et le vrai compagnon. |
| `npm run test:extension` | Recette de l’extension dans un profil Chromium temporaire, préparé avec Playwright. |
| `npm run package` | Construction de l’extension, du compagnon et du paquet, puis vérification du paquet. |
| `npm run setup:build` | Construction de l’assistant Windows ; Inno Setup doit être préparé au préalable. |
| `npm run setup:acceptance` | Préparation du kit de recette Windows isolée ; cette commande n’exécute pas la recette. |

La configuration complète des recettes et leurs prérequis figurent dans [le guide](GUIDE_UTILISATION.md) et [la recette de l’installateur](RECETTE_INSTALLATEUR.md). Les adaptations Linux/macOS existent dans le code, mais n’ont pas été validées dans l’environnement Windows utilisé pour développer ce projet.

## Données et limites

- Les réglages, collectes et suivis sont conservés dans le profil du navigateur ; les journaux du compagnon restent sur la machine. Certains suivis et exports contiennent des chemins locaux.
- Les actions de capture, téléchargement ou insertion peuvent communiquer avec les sites choisis. L’installation des moteurs télécharge leurs distributions officielles.
- Le compagnon travaille avec les droits de l’utilisateur. Il ne contourne ni les permissions Windows ni l’UAC.
- Les insertions sont limitées à 20 fichiers et 20 Mio au total. Le suivi confirme le remplissage du champ, pas la réception des fichiers par le site ; certains sites commencent l’envoi dès ce remplissage.
- Les tâches en cours ne reprennent pas automatiquement après redémarrage du compagnon. Une annulation ou une interruption peut demander une vérification manuelle des fichiers.
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
- [Direction visuelle Material 3](DESIGN.md)
- [Glisser-déposer vers le web](GLISSER_DEPOSER_WEB.md)
- [Recette Windows isolée](RECETTE_INSTALLATEUR.md)
- [Recette des deux parcours hybrides](RECETTE_HYBRIDE.md)
- [Composants tiers et licences](THIRD_PARTY.md)

Les documents de planification présents dans le dépôt décrivent des objectifs futurs ; ils ne garantissent pas leur disponibilité dans le prototype.

## Licence

Le dépôt est privé. Aucune licence de redistribution du code NextExplorer n’est accordée dans ce dépôt. Les dépendances et les fixtures de test conservent leurs propres licences, recensées dans [THIRD_PARTY.md](THIRD_PARTY.md).
