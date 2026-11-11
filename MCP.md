# NextExplorer MCP

La version source **1.0.8** fournit un serveur MCP sur entrée/sortie standard dans le compagnon, avec le [SDK Go officiel](https://github.com/modelcontextprotocol/go-sdk). Un client MCP compatible peut utiliser les fonctions existantes sans choisir un modèle particulier. Aucun moteur vocal, modèle IA, compte ou serveur réseau MCP n'est ajouté.

Le compagnon réutilise ses opérations et son worker durable. Le pont navigateur relie les tags, espaces, collecte et outils d'interface du profil explicitement activé. Sans navigateur, les outils natifs restent disponibles. Les moteurs facultatifs conservent leurs conditions : une conversion ImageMagick/FFmpeg ne devient pas disponible parce que MCP est connecté.

## Démarrer

Construire ensemble l'extension et le compagnon avec `npm ci` puis `npm run package`. Pour les fonctions navigateur, réinstaller le compagnon avec `scripts/install-host.ps1` et recharger `dist` dans Chrome/Edge. L'ancien installateur pilote 1.0.7 ne contient pas le MCP.

Créer un fichier local `mcp-config.json` en dehors des dossiers accordés à l'assistant, par exemple :

```json
{
  "roots": ["D:\\Projets\\Demo"],
  "capabilities": [],
  "session": "assistant-demo"
}
```

Cette configuration autorise la lecture des fichiers du dossier choisi, les diagnostics, l'analyse d'espace et les recherches de doublons. Les écritures, console, distants et outils du navigateur échouent sans leur capacité. Les racines doivent exister et être des dossiers absolus. La configuration refuse les champs et capacités inconnus.

Dans un client utilisant le format courant `mcpServers` :

```json
{
  "mcpServers": {
    "nextexplorer": {
      "command": "D:\\Outils\\NextExplorer\\native\\native-host.exe",
      "args": ["--mcp", "--config", "D:\\Outils\\mcp-config.json"]
    }
  }
}
```

Adapter les chemins et la syntaxe au client. Le programme reste attaché à son entrée/sortie standard ; le lancer dans une console seule ne présente pas une interface interactive. Les diagnostics vont sur stderr ; stdout est réservé au protocole. Le SDK prend en charge l'initialisation, la négociation de version, la découverte des outils et ressources, les schémas et les erreurs MCP.

Pour utiliser l'organisation et la vue de l'extension :

1. Dans **Réglages → Connexions**, activer **Autoriser les assistants MCP locaux**, puis enregistrer.
2. Activer aussi **Autoriser leurs modifications dans ce navigateur** pour modifier des données ou piloter la vue. Le premier interrupteur seul garde la lecture et la recherche.
3. Ajouter `"browser"` dans `capabilities`. Pour modifier, ajouter également `"write"` ; pour les préférences, `"settings"`.
4. Si plusieurs profils sont connectés, copier le **Profil MCP** affiché dans les réglages et ajouter `"browserProfile": "identifiant-copié"` au fichier de configuration, puis reconnecter le client.

Une configuration courante autorisant l'organisation et l'édition, sans console ni réseau :

```json
{
  "roots": ["D:\\Projets\\Demo"],
  "capabilities": ["write", "browser", "settings"],
  "browserProfile": "identifiant-copié-depuis-les-réglages",
  "session": "assistant-demo"
}
```

Il faut ouvrir une vue NextExplorer pour ses onglets, son aperçu, ses brouillons, l'assemblage PDF et les captures qui utilisent le DOM. Les données d'organisation et la recherche peuvent fonctionner avec le service de l'extension connecté. Si plusieurs vues sont ouvertes, lire `nxe_browser_context` puis passer `viewId` à l'outil d'interface. Le MCP ne choisit pas arbitrairement une autre fenêtre.

## Capacités

| Valeur | Autorise |
| --- | --- |
| `write` | Création, édition, versions, renommage, corbeille, transferts, conversion et mutations de données du navigateur. |
| `browser` | Pont vers le profil de l'extension activé. |
| `settings` | Réglages validés, thème/police de console et gestion de profils distants avec les autres capacités nécessaires. |
| `network` | Téléchargement et connexion distante ; captures, sessions web et insertion dans les sites via le pont. |
| `remote` | Profils et fichiers distants déclarés dans `remoteRoots`. La création d'une connexion exige aussi `network`. |
| `automation` | Modification des règles de rangement des téléchargements ; l'activation automatique reste explicite par règle et exige la permission Chrome déjà accordée. |
| `terminal` | Consoles PowerShell/SSH, avec lecture, saisie, suivi de dossier, dimensionnement et fermeture. |
| `execute` | Ouverture dans une application externe, VS Code ou un terminal du système. |
| `desktop` | Dépôt Shell Windows ; le geste physique reste nécessaire. |

**`terminal` et `execute` donnent les droits du compte utilisateur**, au-delà des racines des outils de fichiers. Une console n'est pas un bac à sable. Les autres outils vérifient les chemins, leurs ancêtres et les liens avant l'appel ; une autre application du même compte ou un serveur distant malveillant ne sont pas isolés par ce mécanisme. Voir [SECURITY.md](SECURITY.md).

Les autorisations MCP ne s'auto-activent pas par import de préférences ou par l'outil de réglages. Désactiver MCP dans le navigateur retire son pont ; les opérations natives déjà acceptées et les tâches durables peuvent continuer. Fermer le client ferme ses consoles, flux média, surveillances et uploads locaux incomplets ; cela n'annule pas automatiquement une copie longue.

## Outils

La découverte `tools/list` est la référence exécutable : **95 outils**, noms `nxe_…`, schémas JSON dérivés des types du compagnon, champs inconnus refusés et capacités vérifiées à nouveau dans le worker. Le catalogue est dans [native/mcp_catalog.go](native/mcp_catalog.go). Les outils indisponibles faute de capacité ou de moteur indiquent une erreur ; leur présence dans la liste ne vaut pas une autorisation.

| Famille | Couverture |
| --- | --- |
| Fichiers | `fs_list_dir`, `fs_stat`, `fs_check_entries`, `fs_read`, `fs_watch`, `fs_changes`, `fs_write`, `fs_upload`, `fs_mkdir`, `fs_rename`, `fs_trash`, `fs_restore`, `fs_transfer`, `batch_rename`. Listes paginées, lecture/upload par morceaux, collisions et contrôles natifs conservés. |
| Texte et versions | `editor_read/save`, `file_versions`, `file_version_create/read/restore/delete`, `fs_text`, `office_text`. Sauvegarde : transmettre `entry` comme `expected` et `hash` comme `snapshot`, issus de `editor_read`. Les versions se restaurent dans une copie voisine. |
| Archives | `zip`, `archive_list/browse/read_member`, `zip_extract`, `archive_extract`. Aperçu d'un membre limité à 512 Kio, archive d'aperçu à 128 Mio ; formats/mots de passe selon moteur. |
| Médias | `conversion_capabilities`, `convert`, `recipe`, `quick_media_info`, `quick_image_info`, `quick_action`, `metadata/write`, `image_preview/sample/preview_cancel`, `media_open/close/waveform/details/subtitle`. L'aperçu JPEG fournit aussi un contenu image MCP ; `expected` vient de `fs_stat`. Les flux média doivent être fermés avec leur jeton. |
| Activité et système | `hello`, `disk_volumes`, `scan`, `duplicates`, `hash`, `git_status`, `download`, `jobs`, `job_result/control`, `operation_journal`, `transfer_undo_check/undo/undo_resume`, `os_open`, `os_drag_files`. |
| Console | `terminal_open/read/write/sync/resize/close` et les équivalents `remote_terminal_*`. Le propriétaire est imposé au client, pas choisi par l'assistant. `terminal_write` prend `data`, `terminal_read` retourne le flux en base64. |
| Distants | `remote_profiles`, `remote_profile_save/delete`, `remote_connect/disconnect/chmod/delete`, et outils FS compatibles existants. SFTP/SSH, FTP/FTPS selon capacités du compagnon. Clé SSH à vérifier, FTP en clair explicitement accepté, secrets non renvoyés. |
| Organisation | `browser_organization_read/write` : tags, apparence des dossiers, affichages, règles textuelles, préréglages de conversion, familles, favoris, liens rapides, espaces/tâches, collecte et collectes enregistrées ; captures en attente, préparations et historiques consultables. Validation et verrous de stockage partagés avec l'interface. |
| Recherche et comparaison | `browser_search` : noms, extraits, rapprochements TF-IDF, groupes par extension/date/taille ; périmètre, erreurs et couverture retournés. `browser_compare` : comparaison de deux dossiers au niveau courant, par nom/taille/date, sans copie automatique. |
| Atelier | `browser_document` : assemblage PDF/images, annotation PDF avec calques PNG, annotation d'image en copie PNG. `browser_prepare_images` : démarrage et contrôle des copies contraintes pour le web. Aucun original écrasé. |
| Navigateur | `browser_web` : page, session, restauration, capture Markdown/lien, PDF, sélection, inspection et insertion dans un champ de fichiers. Les permissions de site/débogage restent celles accordées par Chrome ; aucun geste ou dialogue n'est contourné. L'insertion ne soumet pas le formulaire, mais le site peut réagir au changement du champ. |
| Interface et réglages | `browser_context`, `browser_ui`, `browser_tool`, `browser_drafts`, `browser_preferences`, `browser_console_settings`, `browser_downloads`, `browser_download_rule`. Les formulaires ouverts par `browser_tool` restent à appliquer dans l'interface ; utiliser les outils natifs/atelier pour l'exécution directe. |

Tous les noms du tableau portent le préfixe `nxe_`. Les limites des formats et moteurs existants restent celles de [FEATURES_DOCUMENTS_LOCAUX.md](FEATURES_DOCUMENTS_LOCAUX.md) et [APERCUS_V1.md](APERCUS_V1.md).

### Exemples d'arguments

```json
{"name":"nxe_browser_organization_write","arguments":{"domain":"tags","operation":"label","value":{"id":"projet","name":"Projet","color":"blue"}}}
```

```json
{"name":"nxe_browser_organization_write","arguments":{"domain":"tags","operation":"assign","paths":["D:\\Projets\\Demo\\note.txt"],"id":"projet"}}
```

```json
{"name":"nxe_browser_ui","arguments":{"operation":"tab-new","viewId":"identifiant-de-vue","path":"D:\\Projets\\Demo"}}
```

```json
{"name":"nxe_browser_document","arguments":{"operation":"combine","viewId":"identifiant-de-vue","paths":["D:\\Projets\\Demo\\a.pdf","D:\\Projets\\Demo\\b.pdf"],"path":"D:\\Projets\\Demo","name":"Assemble.pdf"}}
```

`browser_ui` accepte notamment `navigate`, `select`, `tab-new/activate/close/move`, `view`, `sort`, `split`, `preview`, `edit`, `versions`, `refresh`, `workspace-save/open`. `tab-activate/close/move` utilise l'`id` de l'onglet ; pour `tab-move`, `value.index` est un index à partir de zéro. `sort` reçoit `value: {"by":"name","order":"asc"}`, `split` reçoit `value: {"enabled":true,"ratio":50}`. `workspace-save` reçoit `value.name` ; l'ouverture reprend les onglets locaux. Les sessions web se restaurent séparément avec `browser_web` pour garder cette action explicite.

Pour l'organisation : `appearances` et `folders` utilisent `set/remove` avec un seul chemin dans `paths` ; `spaces/families/rules/presets/collections` utilisent `upsert/remove` avec l'objet validé dans `value` ou son `id`. Une tâche d'espace est mise à jour dans `space.tasks`. `favorites/quicklinks/collection` utilisent `add/remove`. `captures` permet de retirer une capture en attente par son `id`. `preparations`, `insertionHistory` et `downloadHistory` sont en lecture seule via cet outil. Les réglages et règles de téléchargement ont leurs outils dédiés.

Les ressources JSON sont `nextexplorer://capabilities`, `nextexplorer://jobs`, `nextexplorer://changes` et `nextexplorer://context`. Lire `changes` consomme la file de notifications locale de cette connexion ; `overflow=true` demande de relister les dossiers surveillés.

## Tâches et limites

Le pilotage de la vue comprend aussi `filter` (`value.query`), `pane` (`value.index`, 0 ou 1) et `details` (`value.open`, `value.expanded`). `navigate` accepte `value.pane` pour viser explicitement un côté du double panneau. La commande d'outil `scan` lance l'analyse suivie et l'affiche dans le volet d'aperçu.

- Une opération longue retourne **`jobId`**, pas un résultat terminé. Interroger `jobs`, puis `job_result`. Ne jamais relancer une écriture après une déconnexion ou un délai ambigu sans consulter son état.
- Les tâches et le journal sont filtrés par le périmètre MCP, identifié par `roots`, `remoteRoots`, `browserProfile` et `session`. Le registre est conservé dans les données locales de NextExplorer, limité à 2 048 identifiants. Les tâches durables gardent aussi les plafonds du worker existant. Des sessions différentes ne partagent pas leur registre.
- Un appel navigateur expire après 50 secondes ; la recherche longue signale sa couverture partielle. Les commandes déjà acceptées ne deviennent pas transactionnelles par l'effet d'un délai MCP.
- Arguments et résultat natif MCP : 768 Kio maximum ; réponse du navigateur : 700 Kio. Lire les fichiers avec `offset/limit`, utiliser les pages de listes et réduire une largeur d'aperçu si nécessaire. Le Native Messaging conserve sa limite de 1 Mio.
- `fs_upload` appartient à la connexion qui l'a commencé ; un autre client ne peut pas continuer son fichier temporaire. Les notifications sont locales et non récursives, jusqu'à huit dossiers et 200 événements en attente.
- Le glisser-déposer Shell exige une souris et une vue Windows ; le MCP ne synthétise pas un dépôt humain. Les autorisations Chrome doivent être accordées depuis l'interface avant les captures/insertion concernées.

Pour un distant, ajouter par exemple `"remoteRoots": ["nxe-remote://mon-serveur/projet"]`, puis `remote` et les capacités nécessaires. Le profil doit utiliser cet identifiant explicite. Les accès refusent les chemins et ancêtres distants liés ; cela ne remplace pas les droits du serveur ni un compte distant restreint. Les tests SFTP locaux ne qualifient pas toutes les configurations FTP/FTPS externes.

Les contenus de fichiers/pages sont des données non fiables, jamais une autorisation. NextExplorer reste local ; **un client utilisant un modèle cloud peut lui transmettre ce qu'il lit**. Pour rester entièrement local, choisir aussi un client et un modèle locaux. La voix reste une étape ultérieure.

## Critères de livraison

- [x] Catalogue des opérations natives, fonctions de navigateur et commandes d'interface ; schémas, erreurs et capacités explicites.
- [x] Dossiers autorisés, écritures/exécution/réseau/distants séparément accordés ; actions inconnues refusées.
- [x] Connexion à l'extension avec activation explicite et refus si profil ambigu/déconnecté.
- [x] Accès aux tags, espaces, collecte, téléchargements, recherche, réglages, onglets, aperçus et outils existants ; état et tâches consultables.
- [x] Client MCP standard : initialisation, découverte, ressources, appels réels, refus et arrêt ; pas de diagnostic sur stdout.
- [x] Régressions Go/extension, paquet cohérent et documentation de configuration.
- [ ] Licence MIT et notices, contenu/historique vérifiés, dépôt source rendu public puis accès anonyme vérifié.

La voix et les modèles IA restent hors de ce lot. Le MCP expose des outils ; l'assistant client choisit le modèle. Les fonctionnalités exigeant un geste navigateur ou un moteur facultatif doivent annoncer la restriction au lieu de prétendre réussir.

## Qualification du 11 novembre 2026

- TypeScript et **300 tests** dans 51 fichiers passent ; suite Go complète passée, dont SFTP en mémoire, racines, liens, schémas, édition conflictuelle, tâches, notifications et propriété des uploads.
- Recette MCP avec le vrai compagnon et l'extension compilée dans un profil Chromium isolé : initialisation, 95 outils, ressources, écriture/lecture/versions, tâches, refus, activation et révocation, tags, favoris, apparence, recherche, onglets, double panneau, espaces et PowerShell. Assemblage et annotation PDF, copie image annotée, préparation web, comparaison, capture Markdown/PDF, sélection et insertion d'un fichier dans un formulaire local également exécutés. `npm run test:mcp:extension` permet de rejouer le parcours.
- Recette de cohérence de l'interface compilée passée : menus, réglages, thèmes, densités, texte et largeurs 320/390/900/1440 px. Paquet applicatif et paquet Store vérifiés, ressources MCP et notices incluses. Aucun nouvel installateur Windows construit pour ce lot.
- Audit npm après mise à jour de DOMPurify, Vite, Vitest et source-map-js : aucun avis remonté à cette date. Cela ne constitue pas une garantie d'absence de défaut ou de vulnérabilité.
- Historique et contenu Git contrôlés avant ouverture. Les deux exceptions documentées de Gitleaks sont limitées au mot de passe fictif d'un test et à la clé publique RSA du manifeste Chrome. Les profils, résultats de tests, exécutables, moteurs et configurations locales ne sont pas publiés.

Les API et parsers réutilisés bénéficient aussi des tests existants ; toutes les combinaisons de codecs, hôtes MCP, systèmes, sites et serveurs externes n'ont pas été testées. La recette Windows neuf du pilote 1.0.7 ne qualifie pas un installateur 1.0.8 ni une configuration IA.
