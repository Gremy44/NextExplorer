# Recette des parcours hybrides — J3

## Distribution publique 1.0.1 — 19 octobre

Build et typage/233 tests réussis (`build-public-distribution.log`, `check-public-distribution.log`), contrôles du Store et recette archive/compagnon installés validés (`store-public-distribution.log`, `extension-public-distribution.log`). Paquet public audité sur 269 fichiers : aucune carte de sources, document interne, chemin personnel ou clé privée détecté ; notices complètes et ID de développement cohérent. Injection de carte et modification documentaire rejetées. Compagnon inchangé.

[Dépôt public](https://github.com/Gremy44/NextExplorer-Downloads) et [release](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.1) publiés. Les quatre fichiers ont été téléchargés anonymement et comparés par taille/SHA256 ; documents et visuels accessibles, source inaccessible anonymement (`public-distribution-anonymous.json`). Aucun achat, envoi Store ou validation Windows propre ; préversion technique non signée, fichiers de démonstration uniquement.

## J7.1 — paquet et dossier Chrome Web Store, 19 octobre

Typage et 233 tests réussis (`check-j7-store.log`), build (`build-j7-store.log`) et tests d’archive (`test-j7-store.log`) validés : manifeste racine, ressources locales, clé de développement/cartes de sources retirées, refus EXE/fichier sensible, build périmé, fichiers obligatoires et version immuable. Répertoire de sortie imbriqué dans la source refusé, y compris avec séparateur final.

Recette réelle de l’archive décompressée avec compagnon installé (`extension-j7-store.log`) : clé publique adaptée uniquement dans la copie de test, profils/données isolés, vrais fichiers/PowerShell, ressources embarquées, sessions protégées et fermeture correcte. Captures 1280 × 800 de fichiers synthétiques, icône et vignette 440 × 280 dans `release/store/visuels`. [Dossier et champs manquants](store/README.md). Ni véritable ID Store testé, ni publication, ni validation de J1.7 sur Windows propre.

## Console LCD rétro — 19 octobre

Fond gris-vert/encre sombre, 16 couleurs ANSI dans des nuances d’encre discrètes, sélection inversée et Cascadia Mono par défaut. Contraste minimum de la palette avec le fond : 4,69:1 ; sélection également supérieure à 4,5:1. Typage et 233 tests réussis (`check-console-lcd.log`). Le parcours de la véritable extension avec compagnon installé couvre aussi ce preset, le changement de police sans relance et la conservation de la session (`extension-console-lcd.log`). Capture `console-theme-lcd.png` inspectée. Aucun changement natif.

## Thèmes et polices de la console — 19 octobre

Menu **Apparence du terminal** : Ubuntu, Dracula, Nord, Solarized sombre/clair ; palettes ANSI complètes, police du thème ou choix indépendant, taille 10–24 px et interligne. Trois polices embarquées et chargées dans la véritable extension, sans appel à un service de polices. Message Ubuntu visible précisant **PowerShell, pas Bash**. Migration des anciens réglages sans perdre les couleurs personnalisées.

Typage et **233 tests** (`check-console-themes.log`), recette avec le compagnon installé (`extension-console-themes.log`) réussis : thèmes/polices en direct, taille/interligne, session/variable conservées, réglages après rechargement, clavier et 320/390 px. Captures `console-theme-ubuntu.png` et `console-colors-*.png` inspectées. Aucun changement natif ; Windows propre J1.7 reste distinct.

## Couleurs de la console — 19 octobre

Bouton **Couleurs du terminal** : suivi de l’interface, sombre, clair, bleu PowerShell et mode personnalisé pour fond/texte par défaut. Le changement conserve la session et sa variable de test, s’applique sans commande PowerShell et persiste après rechargement ; les colorations propres aux programmes restent distinctes. Contraste minimal de 4,5 conservé. Menu utilisable au clavier/Échap et sur volets 320/390 px, fermé au changement d’outil et au redimensionnement.

Typage et 229 tests (`check-console-colors-final.log`), parcours Chrome (`browser-console-colors.log`) et extension réelle avec le compagnon installé (`extension-console-colors.log`) réussis. Captures `console-colors-*.png` inspectées. Aucun changement natif ; paquet, EXE et kit remis à jour pour conserver un ensemble cohérent. Recette Windows propre J1.7 toujours distincte.

## Correctif de mise à jour du compagnon — 19 octobre

L’EXE copiait le nouveau paquet mais conservait un compagnon actif plus ancien dès que sa structure et son enregistrement étaient valides. Le test de reproduction échouait avec « Healthy installation with older companion not scheduled for upgrade » (`setup-upgrade-before.log`). L’assistant compare désormais le binaire et sa politique au paquet par SHA256 ; la réparation seule reste sans mise à jour d’une installation saine.

`npm run test:setup` passe avec le scénario de mise à jour d’un exécutable valide mais différent, conservation des moteurs, changement de politique, sauvegarde/retour arrière, refus d’un paquet changé après l’aperçu, réinstallation identique sans modification et préservation des autres enregistrements (`setup-upgrade-final.log`). La correction a été appliquée à l’installation existante du poste, sans écraser l’ancienne copie. La recette `node scripts/console-extension-test.mjs --installed` passe en utilisant le véritable enregistrement Native Messaging de Chromium, sans le remplacer (`console-installed-extension.log`). Les données et le profil de cette recette restent temporaires ; la session Chrome déjà ouverte doit encore être reconnectée en désactivant/réactivant l’extension. EXE, paquet et kit reconstruits ; Windows propre J1.7 toujours à valider.

## Console intégrée du 19 octobre

[Guide et limites](CONSOLE_INTEGREE.md) : vrai PowerShell dans **Aperçu → Console**, suivi du dossier actif désactivable, navigation différée pendant les commandes/saisies, session conservée en masquant le volet. Onglets et double panneau partagent la session de la page ; les autres pages restent isolées. Les commandes sont hors journal/annulation de NextExplorer.

Typage et 227 tests TypeScript, suite Go complète et recette de l’extension/compagnon réels réussis : variables conservées après masquage, onglets/panneaux actifs, chemin Unicode/apostrophe/crochets, saisie préservée, commande longue, Ctrl+C, fermeture/reprise de session, propriétaire imposé et fermeture de page arrêtant PowerShell. Côté natif : arrêt des enfants et fermeture malgré une entrée bloquée ; mémoire et files bornées. Captures clair/sombre à 320/390/900/1440 px inspectées. Non-régression espace disque réussie. Logs : `check-console-complete.log`, `native-console-complete.log`, `extension-console-complete.log`, `space-console-regression.log`. Données/profils temporaires ; enregistrement Chromium restauré après la recette, celui de Chrome conservé.

Paquet, installateur Windows et kit reconstruits avec les notices xterm.js. Cohérence des copies et empreintes dans `verify-console-artifacts.json`. Kit préparé uniquement ; recette Windows propre J1.7 toujours ouverte.

## Historique des activités du 18 octobre — icônes par opération

Icône devant les dix libellés de tâches, réutilisée pour les activités déjà enregistrées et celles en cours ; type inconnu avec pictogramme générique. Décoration masquée aux lecteurs d’écran, libellés et états textuels conservés. Surface tonale et contraste issus des rôles Material 3, sans couleur ajoutée pour catégoriser les opérations.

`npm.cmd run check` : compilation et 224 tests réussis (`test-results/check-activity-icons.log`). Recette Chrome ponctuelle utilisant le parcours de disposition existant avec onze entrées historiques simulées : dix types connus, un inconnu au nom long, états terminé/erreur/annulé. Redimensionnement souris/clavier, mémorisation et thèmes à 320/390/900/1440 px réussis ; captures inspectées. Preuves : `test-results/browser-activity-icons.log`, `activity-icons-{light|dark}-{largeur}.png`. Les entrées simulées ne déclenchent aucune opération native.

Paquet, EXE et kit actualisés avec les icônes et l’audit des formats conservé pour la suite : `package-activity-icons.log`, `setup-activity-icons.log`, `acceptance-activity-icons.log`. Chargement du build dans Chrome et connexion au compagnon : `extension-activity-icons.log`. Cohérence des assets, documents, compagnon et empreintes EXE/kit : `verify-activity-icons-artifacts.json`. Kit préparé uniquement ; J1.7 reste ouvert.

## Revue ergonomique du 18 octobre — espace disque

Périmètre choisi : **espace disque + liste complète**. [Inventaire des 47 parcours](REVUE_ERGONOMIE_OUTILS.md) et références de conception ; les autres outils restent à valider avec l’utilisateur.

`npm.cmd run check` : compilation et **224 tests / 36 fichiers** réussis (`test-results/check-space-ux.log`). Tests ciblés sur le contraste des six couleurs avec le texte blanc et les pourcentages non nuls inférieurs à 0,1 %.

`npm.cmd run test:space` : Chrome réel et compagnon isolé, analyse de 94 éléments. Infobulles sur les petits blocs au survol et au focus, nom/chemin complets, pourcentage et Échap ; largeur supérieure à 640 px, bornes dynamiques souris/clavier, mémorisation et double-clic ; agrandissement puis navigation retrouvant les fichiers avec résultat conservé. Pagination 80 → 94, actualisation, rechargement, thèmes clair/sombre et 320/390/900/1440 px. Infobulles contenues dans la fenêtre et chemins longs lisibles. Aucun `FS_READ` demandé par Chrome pendant ce parcours ; empreintes SHA256 et nombre de fichiers du jeu d’essai conservés.

Preuves : `test-results/browser-space-ux.log`, `space-expanded-dark.png`, `space-tooltip-small.png`, `space-{light|dark}-{largeur}.png`. Ces contrôles ne remplacent pas la recette sur les dossiers réels de l’utilisateur ni J1.7 sur Windows propre.

Distribution actualisée : `package-space-ux.log`, `setup-space-ux.log` et `acceptance-space-ux.log`. Le paquet et le kit contiennent l’inventaire de revue. `extension-space-ux-smoke.log` valide le chargement de l’extension compilée, le service worker et la connexion au compagnon réel. Comparaison des fichiers du paquet, du compagnon et des empreintes de l’installateur/kit : `verify-space-ux-artifacts.json`. Kit préparé uniquement ; installateur non signé et recette Windows vierge non exécutée.

## Ajustements du 18 octobre — disposition et attribution directe des tags

`npm run test:layout` : poignée de l’activité à la souris et au clavier, bornes, mémorisation après fermeture/rechargement, adaptation sans perdre la largeur choisie ; filtres repliés sans ligne vide, compteur actif, réinitialisation, Échap et critères indépendants par panneau. Thèmes clair/sombre et 320/390/900/1440 px. Les options ouvertes défilent sur petit écran pour garder leurs actions accessibles. Preuves : `test-results/browser-layout.log`, captures `layout-*.png`.

`npm run test:tags` : Chrome réel avec pont RPC vers le compagnon isolé, sept pastilles disponibles sur profil neuf, création de la couleur choisie sans dialogue, retrait, états mixtes, sélection multiple et clavier ; sélecteur compact, création appliquée, renommage réutilisé sans doublon, références de plusieurs dossiers, échec de stockage sans mutation et retrait ciblé. Rechargement, dossier de travail du panneau, clair/sombre et 320/390/1440 px ; empreintes des trois originaux conservées. Preuves : `test-results/browser-quick-tags.log`, captures `quick-tags-*.png`.

Les tests unitaires ajoutés couvrent les homonymes de couleurs, noms normalisés, plafonds, associations invalides, métadonnées périmées et refus du lot avant écriture. Les tags restent propres au profil ; ce changement porte sur le parcours utilisateur et ne les inscrit pas dans les métadonnées du système de fichiers.

## Complément du 18 octobre 2026 — organisation, actions rapides et EXE Windows

[Guide du lot et limites](AMELIORATIONS_FINDER.md). `npm run check` : compilation et **214 tests / 35 fichiers** réussis. Suite Go complète réussie avec un dossier temporaire sous `test-results/native-temp` ; les premières exécutions dans le répertoire temporaire système étaient refusées par le bac à sable Windows. Preuves finales : `test-results/check-finder.log`, `native-finder-final.log`.

`npm run test:finder:extension`, Chromium réel et compagnon installé, profil/appdata isolés :

- création de sept tags, attribution à un dossier, renommage sans perte d’association, consultation tous dossiers sans index ; couleur/symbole synchronisés après déplacement natif ;
- capacités Windows réelles, vue Ce PC et résultat d’analyse dans l’aperçu sans dialogue ; navigation dans un sous-dossier avec résultat conservé ;
- rotation PNG et extrait MP4 H.264 réellement produits, dimensions/durée contrôlées ;
- assemblage de sélection image/PDF en trois pages ; annotation d’une image au clavier, différence de pixels vérifiée ; PDF à deux pages avec page tournée annotée, ressource graphique ajoutée et rotation conservée ;
- outil PDF utilisé hors connexion, thèmes clair/sombre et 320/390/1100 px sans débordement horizontal ; accès à la personnalisation depuis le panneau ; empreintes SHA256 des originaux conservées.

Preuves : `test-results/extension-finder-final.log`, dossier isolé `test-results/j5-extension-bV1fl1`, captures `finder-drives.png`, `finder-space-preview.png`, `finder-markup-*.png`. Les tests unitaires couvrent aussi les anciens tags, exports de préférences antérieurs, déplacements/permutations de dossiers, tailles de carte proportionnelles, PDF corrompus/surdimensionnés/avec champ de signature et plafonds de pages.

Contrôles de distribution : `package-finder-final.log`, `setup-build-finder.log`, `setup-workflow-finder.log`, `setup-controller-finder.log`, `setup-ui-finder.log`. Installation/réparation : fichiers et HELLO réels avec registre simulé. Assistant graphique : accueil, navigateur, connexion et aperçu atteints dans une copie interdisant l’installation et les écritures du registre ; **Install n’a pas été cliqué**. Paquet final et kit Windows incluent les ressources PDF et leurs licences. Ces preuves ne clôturent pas J1.7 sur Windows propre.

Non-régression complémentaire : `browser-finder-final.log` et `extension-native-finder.log` (compagnon obligatoire avec `NEXTEXPLORER_REQUIRE_NATIVE=1`). Les comptages du test de menu contextuel intègrent les trois nouvelles actions. Le test du téléchargement déjà déplacé accepte l’invalidation asynchrone de son existence par Chrome entre vérification et clic, en contrôlant l’absence de second déplacement.

Cette recette vérifie deux parcours utilisateur dans l’extension Chromium réelle avec le compagnon Windows installé. Elle complète les contrôles de captures, provenance, téléchargements, espaces, reprise des copies et refus d’insertion déjà présents dans `scripts/extension-test.mjs`.

**Validation du 10 octobre 2026 :** les deux parcours et la recette complète de l’extension avec le compagnon réel réussissent. Les fichiers synthétiques reçus sont identiques aux originaux ou à la copie WebP préparée, sans soumission automatique. 126 tests TypeScript et 98 assertions de diagnostic réussis. Cette validation clôt J3 au périmètre du prototype ; J1.7 reste ouvert.

## J5 — médias, recettes et worker durable

### Convertisseur contextuel — 17 octobre

Le moteur fourni ne contient pas `libsvtav1` : la recette compare les options visibles avec la détection native et vérifie que cet encodeur absent n’est pas proposé. Tests Go supplémentaires : lecture de la liste d’encodeurs, refus d’un encodeur absent sans fichier produit, H.265 réel, conteneurs MKV/MOV et cible de poids ; les encodeurs non installés sont refusés. AV1 n’est pas qualifié sur ce poste.

La recette navigateur complète réussit dans `browser-converter.log`. Le dernier build est revérifié par `extension-converter.log` et `worker-converter.log` après ajout de la détection des encodeurs ; les scénarios J5 restent réussis. Paquet et installateur actualisés avec le compagnon correspondant ; kit Windows préparé uniquement, J1.7 non exécuté. La comparaison des assets et binaires est consignée dans `verify-converter-artifacts.log`.

`scripts/converter-journey.mjs` est exécuté par `npm.cmd run test:j5:extension`. Dans une extension Chromium isolée et avec le compagnon installé : document non convertible et action désactivée, refus natif du document, sélection image/vidéo/texte avec lot choisi explicitement, préréglages filtrés, absence d’options vidéo/audio sur les images, PNG sans réglage de qualité, transparence JPEG expliquée, encodeurs WebM compatibles uniquement, remux masquant le réencodage, puis création WebM réelle sans agrandissement et original inchangé. Captures clair/sombre à 320/390/1024 px : `converter-images-*.png` et `converter-video-390.png`.

Preuves : `check-converter.log` (204 tests), `native-converter.log` (suite Go, rejets avant mise en file, JPEG sans écrasement, précontrôle du lot, MP4/H.264/AAC et WebM/VP9/Opus réels, faux MP4 audio refusé), `extension-converter.log` (parcours ciblé et recette J5 réussis). Les scènes sont synthétiques ; elles ne qualifient pas tous les décodeurs/encodeurs installables. Pas de conversion audio seule, SVG ou sous-titres/pièces jointes ; première image des animations/multipages.

Lot du 17 octobre 2026. [Usage et limites](J5_MEDIAS_TACHES.md).

| Contrôle | Preuve locale |
| --- | --- |
| TypeScript et tests unitaires | `test-results/check-j5-final.log` : 198 tests / 32 fichiers, compilation réussie ; corpus synthétique ImageMagick de variantes et images distinctes |
| Compagnon Go | `test-results/native-j5-final.log` : suite réussie ; points de reprise et états ambigus, annulation en attente, secrets exclus des états, images modifiées/invalides, plages médias, archives chiffrées et historique des déplacements |
| Worker Windows compilé | `test-results/worker-j5-final.log` : proxy fermé puis reconnecté, même worker, file séquentielle, tâche en pause, arrêt forcé du seul worker de test, navigation disponible puis reconnexion/récupération explicite, résultat conservé, aucune copie doublée et SHA256 original intact |
| Extension Chromium et compagnon installé | `test-results/extension-j5-final.log` : PNG/JPEG/TIFF rapprochés, motif distinct exclu ; TIFF 28 Mio décodé et vidéo 512 Mio avec recherche temporelle sans `FS_READ` ; préréglage enregistré et conservé après réouverture, recette conversion → ZIP réelle ; même worker après fermeture complète de Chrome ; déplacement terminé hors navigateur, tags rattrapés à la réouverture puis annulation ; originaux intacts |
| Mise en page | Captures `j5-similar-320.png`, `j5-similar-390.png`, `j5-similar-1024.png`, `j5-presets-320.png`, `j5-large-tiff.png` ; contrôles de débordement 320/390/1024 px |
| Non-régression complète de l’extension | `test-results/extension-regression-j5-final.log` : parcours J3 administratif et images reçus en HTTP avec octets exacts, collectes et originaux intacts ; J4 et C0/C1/C2, puis H07 automatique toutes vues fermées, collisions, provenance, règle en pause et destination absente : réussis avec le compagnon final |
| Paquet et distribution | `test-results/package-j5-final.log`, `setup-j5-final.log`, `acceptance-j5-final.log`, `verify-j5-artifacts.log` : paquet vérifié, assistant reconstruit et kit Windows préparé. Assets identiques au build J5 réellement testé et au paquet ; binaire compilé, installé et empaqueté identique ; guide J5 inclus. J1.7 non exécuté |

Le dernier build est revérifié par la recette J5 réelle après correction des messages, du démarrage avec worker indisponible et des verrous : un worker de test lancé depuis un autre exécutable reste actif, l’explorateur affiche les fichiers et l’explication du conflit, et tout nouveau transfert est refusé. Le manifeste installé n’est pas modifié par cette simulation. Les actions directes sont refusées pendant une tâche en pause et redeviennent disponibles dès sa fin annoncée ; aucun ordre différé derrière cette pause. La recette complète navigateur réussit dans `test-results/browser-j5-final.log` ; les changements finaux sont couverts par les suites natives et la recette J5 ciblée.

Commandes dédiées : `npm.cmd run test:j5:worker` et `npm.cmd run test:j5:extension`. Construire l’extension et installer le compagnon correspondant avant la recette réelle. Les profils, fichiers et `%APPDATA%` de recette sont isolés ; le nettoyage ne termine qu’un worker dont le chemin d’état privé a été vérifié.

Les corpus synthétiques ne garantissent ni la justesse des ressemblances sur un dossier personnel ni tous les codecs. Les tâches interrompues ne reprennent jamais seules ; une publication ambiguë reste à examiner manuellement. J1.7 sur Windows propre et la qualification globale J7 ne sont pas clôturées par ces tests.

## Exécuter

Prérequis : extension construite, compagnon correspondant installé, Chromium de test disponible dans `.tools/browsers`, moteurs ImageMagick et ExifTool accessibles au compagnon. Exécuter sous l’utilisateur Windows qui a installé le compagnon.

```powershell
npm.cmd run package
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\browsers"
npx.cmd playwright install chromium
$env:NEXTEXPLORER_REQUIRE_NATIVE = '1'
npm.cmd run test:extension
```

Le profil Chromium, les fichiers synthétiques et la copie de l’extension sont créés dans `test-results/`. La permission du site local et les permissions optionnelles sont accordées dans cette copie de test uniquement. La recette ne charge pas le profil Chrome personnel. Le compagnon installé travaille avec ses droits usuels et peut conserver ses journaux d’opérations ; les fichiers manipulés par la recette sont des fichiers temporaires.

Le serveur témoin écoute seulement sur `127.0.0.1`, avec un port temporaire. Aucun document personnel n’est utilisé. Les noms, types MIME et octets reçus sont comparés aux fichiers attendus. Les fichiers synthétiques ne servent pas à tester les exigences métier d’un portail administratif réel.

## Parcours 1 — déposer un dossier administratif

1. Choisir un dossier Documents et collecter une demande texte.
2. Choisir un autre dossier Justificatifs et collecter une image PNG.
3. Enregistrer un espace comprenant la collecte, les dossiers ouverts et la page du formulaire.
4. Recharger la vue : retrouver l’espace suivi et la collecte sans modifier les originaux.
5. Repérer les champs du site, choisir **Pièces du projet**, puis insérer les deux fichiers.
6. Vérifier que l’autre champ reste vide, que le suivi indique les bons noms/tailles et qu’aucun formulaire n’a été soumis.
7. Cliquer sur **Envoyer au site témoin** dans la page web. Vérifier la réception HTTP des deux fichiers, leurs noms, MIME et contenus exacts ; conserver les originaux et la collecte.

## Parcours 2 — préparer un visuel pour un site

1. Choisir Sources et collecter l’image PNG originale.
2. Enregistrer le projet avec sa page web, puis retrouver le projet et la collecte au rechargement.
3. Repérer le champ simple qui accepte seulement WebP : l’insertion directe du PNG est refusée ; la préparation pour ce champ reste disponible.
4. Créer une copie WebP dans Exports, avec une largeur de 64 px et un plafond de 0,25 Mio. Vérifier format, dimensions et poids ; cette préparation ne transmet rien et conserve l’original et la collecte.
5. Insérer explicitement la copie revérifiée. Contrôler le champ choisi, l’autre champ vide, le suivi et l’absence de soumission automatique.
6. Cliquer sur **Envoyer au site témoin**. Comparer le fichier reçu à la copie locale, puis revérifier que l’original et la collecte sont intacts.

## Preuves

- Les parcours sont intégrés à la recette complète, après les contrôles des espaces et avant le rangement automatique avec toutes les vues fermées. `scripts/hybrid-journeys.mjs` réutilise son profil, sa connexion native et ses fichiers temporaires.
- La commande échoue si un contrôle ou un parcours échoue ; la simple production de captures ne signifie pas une réussite.
- Après réussite des deux parcours, `test-results/j3-journeys.json` contient leur date, les noms/MIME/tailles et les empreintes SHA256 des fichiers synthétiques reçus.
- `test-results/j3-admin.png` et `j3-images.png` montrent la vue avant validation du formulaire ; le contrôle du débordement horizontal passe à 320, 390 et 1024 px.
- `test-results/j3-journey-failure.png` aide au diagnostic d’un échec.

La recette exige `NEXTEXPLORER_REQUIRE_NATIVE=1` : sans cette variable, les parcours nécessitant le compagnon ne sont pas exécutés et ne constituent aucune validation J3.

## Limites de cette validation

La vue du panneau est chargée depuis sa véritable page d’extension dans Chromium sans fenêtre ; cette recette n’interagit pas avec les contrôles du panneau latéral de Chrome. Le glisser-déposer Windows possède sa [recette distincte](GLISSER_DEPOSER_WEB.md). La réception vérifiée concerne ces formulaires témoins : chaque site réel peut imposer ses propres widgets, autorisations ou exigences.

Le suivi produit reste un suivi de remplissage du champ. NextExplorer ne déduit pas la réception par un site ; le serveur de cette recette fournit une preuve indépendante après le clic de validation. Les sites qui envoient sur `input`/`change` peuvent commencer leur transfert dès l’insertion.

La validation de J3 ne remplace pas [J1.7 : installation et désinstallation sur un Windows propre](RECETTE_INSTALLATEUR.md). Recherche commune et indexation relèvent de J4 ; traitements durables et recettes enregistrées relèvent de J5. L’IA locale reste ultérieure.

## Complément J4 / C0 — groupes virtuels

`scripts/file-group-journey.mjs`, intégré à `test:browser` et à la partie native de `test:extension`, crée un corpus français synthétique isolé : documents/images, noms ambigus, fichier sans extension, sous-dossier et fichier de 24 Mio nommé TIFF. Il vérifie sélection, dossier et références de l’espace suivi, classement par suffixe, filtre de recherche ignoré, catégories modifiées puis retrouvées après rechargement, et refus d’un brouillon dépassé par une sauvegarde dans une autre vue.

Un second dossier de 1 003 fichiers vérifie le plafond de 1 000 et l’annonce de la vue partielle. Les messages envoyés par la page sont instrumentés : lecture de dossier présente, aucune `FS_READ` pendant le regroupement. Noms, tailles, dates et SHA256 du corpus mixte sont inchangés. Le retour au dossier déjà ouvert conserve la liste. Les deux vues et les largeurs 320/390/1024 px sont contrôlées ; captures `file-groups-results.png`, `file-groups-light.png` et `file-groups-editor.png` dans `test-results/`.

Le temps affiché dans le log va du clic sur Regrouper au résultat visible pour ce petit corpus local. Il ne mesure ni un parcours humain, ni un volume de production, ni la compréhension des contenus. Le fichier nommé TIFF n’est pas décodé ou validé comme image ; cette recette démontre le classement par nom sans lecture. L’énumération native initiale parcourt encore tout le dossier, malgré le plafond de résultats. Les recettes J3 et C0 sont des validations fonctionnelles distinctes.

## Complément J4 / C1 — familles par nom

La même recette ajoute neuf fichiers et un sous-dossier synthétiques : accents, variantes de séparateurs, suffixes de version/copie, formats différents et un fichier de 24 Mio nommé TIFF. Trois noms « Été Atlas » proposent une seule famille avec motif ; factures 001/002, noms génériques et Lyon/Lyons restent séparés. Les tests unitaires ajoutent dates distinctes, fichiers sans extension, ordre des mots, liens exclus et plafond de 1 000.

La recette vérifie les modes Format/Nom sur le même instantané, catégories conservées, absence de résultats après changement de source, sélection/dossier/espace, panneau/vue complète, clavier et largeurs 320/390/1024 px. La référence C0 au nom générique reste sans famille inventée, même lorsque l’espace contient déjà d’autres pièces. Aucune `FS_READ` demandée ; noms, dates, tailles et SHA256 sont inchangés. Captures sombre/claire : `file-names-results.png` et `file-names-light.png` dans `test-results/`.

Ce premier C1 mesure l’égalité des noms normalisés seulement ; il ne prouve ni les contenus, ni une relation d’export, ni un doublon. Le temps du log concerne ce petit corpus synthétique, sans comparaison humaine ni taux de justesse sur des fichiers personnels. Le lot Origine ci-dessous ajoute un premier usage des provenances ; rapprochements approximatifs, autres métadonnées et propositions de rangement restent à développer. J1.7 reste une recette séparée.

## Complément J4 / C1 — mois de modification

Le corpus C0 utilise sept fichiers dont les dates de modification sont fixées en janvier/février 2026 et décembre 2025, avant l’état de référence. Les groupes distinguent mois et années, du plus récent au plus ancien ; les dates locales sont affichées sous chaque fichier, y compris le TIFF synthétique de 24 Mio. Les tests unitaires contrôlent aussi les limites de mois, dates invalides et exclusion des dossiers/liens, avec 1 000 entrées maximum.

La recette vérifie sélection/dossier/références d’espace, panneau/vue complète, réutilisation de l’instantané Format/Date sans demande de fichier supplémentaire et effacement après changement de source. Un espace déjà rempli reste accepté : le fichier de référence doit être dans son mois attendu, sans supposer que la collecte est vide. Un dossier de 1 003 fichiers annonce 1 000 regroupés et 3 omis. Aucune `FS_READ` ; noms, tailles, dates et SHA256 du corpus restent intacts. Clavier, thèmes et largeurs 320/390/1024 px ; captures `file-dates-results.png` et `file-dates-light.png`.

Ces mois proviennent uniquement de la date de modification du système de fichiers et du fuseau horaire du navigateur. Aucune date de création, prise de vue ou contenu déduite ; références d’espace non revérifiées dans ce mode, aucun sujet commun ou lien d’export prouvé. L’énumération initiale du dossier garde la limite native décrite dans C0 ; J1.7 reste distinct.

## Complément J4 / C1 — origines web

La même recette crée huit fichiers, sept provenances et un sous-dossier isolés : deux fichiers du même site, un autre site, provenance absente, taille incompatible, JSON invalide, URL avec identifiants interdits et JSON dépassant 64 Kio. Le fichier nommé TIFF de 24 Mio reste associé par métadonnées, sans décodage. Les tests unitaires ajoutent protocoles/ports distincts, liens symboliques et changements de fichier ou de provenance pendant le contrôle.

Le regroupement exige un clic explicite ; sélection et dossier, panneau et vue complète sont contrôlés. Cinq cas restent sans origine vérifiable ; les huit exclusions sont les sept JSON et le dossier. Les demandes `FS_READ` portent exclusivement sur `.source.json` avec une limite de 64 Kio, aucun JSON trop volumineux n’est demandé et aucune adresse d’origine n’est visitée. Sources épurées et motifs visibles, changement de mode sans nouvelle lecture, arrêt sans résultat tardif et fichiers/métadonnées intacts (noms, tailles, dates et SHA256). Pour l’arrêt, le test retarde les lectures JSON de deux secondes : après réponse tardive, aucun groupe réaffiché et aucun `FS_STAT` supplémentaire. Un dossier de 1 003 fichiers vérifie 20 analysés, 980 non analysés et 3 omis. Les tests unitaires contrôlent quatre demandes simultanées maximum et arrêt des demandes suivantes.

Clavier et largeurs 320/390/1024 px contrôlés ; captures `file-origins-results.png` et `file-origins-light.png` dans `test-results/`. Le temps du log mesure uniquement ce corpus local synthétique. La provenance reste déclarative : nom, taille et stabilité des métadonnées ne prouvent ni l’authenticité du site, ni l’intégrité du contenu, ni une relation d’export. Les modes Format/Nom gardent leur validation sans lecture ; ce mode lit les seuls JSON voisins. J1.7 et le reste de C1 restent séparés.

## Complément UI — menu du clic droit

La recette commune ouvre le menu sur une sélection multiple : les deux pièces restent sélectionnées et Copier au clavier agit sur les deux, sans écrire de fichier. Un clic droit sur une autre pièce remplace la sélection. Douze actions de fichier, treize pour un dossier avec l’ouverture en nouvel onglet ; cinq groupes nommés, quatre séparateurs et icône pour chaque action.

Shift+F10, Début/Fin, flèches avec retour au début, Entrée, Échap/focus, Tab et clic extérieur contrôlés. Ctrl+C ferme le menu et conserve la sélection ; F2 et Suppr ouvrent les confirmations existantes, annulées dans ce contrôle. Le menu reste dans la fenêtre à 320×480, 390×844 et 1024×844 px ; la dernière action est accessible par défilement/focus. La couleur de la corbeille reste distincte du fond dans les deux thèmes. Captures `file-context-menu.png` et `file-context-menu-light.png`, inspectées ; le parcours navigateur existant exerce aussi l’ouverture d’onglet et les archives ZIP/7z/RAR depuis le menu. Aucun effacement déclenché pour la simple vérification des icônes ; les confirmations existantes restent applicables.

## Complément J4 / C1 — destinations proposées

Le parcours partagé `scripts/file-destination-journey.mjs`, appelé par la recette des groupes, ajoute un dossier isolé de 26 fichiers ordinaires dont un TIFF de 24 Mio, un JSON voisin, un sous-dossier et deux destinations. Les règles sont sauvegardées puis restaurées dans le profil de test ; seules les règles d’extension actives sans site participent. Deux règles ZIP contradictoires sont signalées ; une règle désactivée et la règle TIFF liée à un site ne proposent rien. Le groupe de plus de 20 fichiers ne peut pas être transféré. Mise à jour entre vues, espace suivi, réutilisation de l’instantané et plafond de 1 000/1 003 contrôlés.

Avant confirmation et après annulation, aucune demande `FS_TRANSFER` ou `FS_READ`, noms/tailles/dates/SHA256 intacts. Une note modifiée après aperçu bloque tout le lot avant le lancement ; un dossier absent est refusé. Puis copie confirmée de deux fichiers avec collision conservant l’ancien PDF, octets exacts des copies et sources intactes. Déplacement explicitement choisi de la seule image, source retirée et octets conservés ; le TIFF et les métadonnées voisines ne sont pas lus/transférés. Les fichiers du dossier cible sont ensuite dans Déjà à destination sans action.

Thèmes clair/sombre, clavier et absence de débordement à 320/390/1024 px ; captures `file-destinations-results.png` et `file-destinations-light.png` dans `test-results/`. Tests unitaires : conflits et même destination, règles invalides restaurées, plafonds, chemins Windows/UNC/POSIX, refus des fichiers changés/liens, doublons et destinations non dossiers. Les contrôles de taille/date ne prouvent pas l’identité du contenu et ne verrouillent pas le disque ; contrôles/journal natifs J2 conservés. Association des JSON voisins après transfert hors de ce lot. J1.7 reste une recette séparée, non exécutée.

Validation du 11 octobre 2026 : 147 tests TypeScript et compilation, parcours navigateur complet et recette complète de l’extension/compagnon réels réussis. Logs `check-c1-destinations-final.log`, `browser-c1-destinations-final.log`, `destinations-native-focused.log` et `extension-c1-destinations-verified.log`. Les parcours J3 et H07 toutes vues fermées restent réussis ; ces fichiers isolés ne remplacent pas J1.7.

## Complément J4 / C1 — destinations selon l’origine web

Parcours durable `scripts/origin-destination-journey.mjs`, appelé par les recettes navigateur et extension. Corpus isolé : 28 fichiers dont un TIFF de 24 Mio ; provenance valide, autre domaine, absence, JSON invalide, JSON de 65 537 octets et conflit de règles site/extension. Option décochée initialement, 20 fichiers examinés/8 non analysés ; trois origines non vérifiables sans action. Adresses épurées, règle et motif visibles ; aucun site source visité. Deux vues et 320/390/1024 px, changement de mode exigeant une nouvelle analyse.

Aperçu en copie et annulation sans mutation. Après modification de l’origine d’un seul fichier, confirmation refusée avant tout `FS_TRANSFER`. Après réanalyse, copie confirmée de 15 fichiers, octets du dossier d’arrivée vérifiés ; SHA256 de tous les originaux et JSON voisins conservés. Seuls les .source.json bornés sont demandés en `FS_READ` ; JSON trop lourd refusé avant lecture, TIFF non lu.

Validation : compilation et **150 tests TypeScript** (`check-c1-sites.log`), recette ciblée Chromium/compagnon réels (`origin-destinations-focused.log`). Captures `origin-destinations-dark.png` et `origin-destinations-light.png` inspectées. Les logs et corpus restent dans `test-results/` et sont exclus de Git.

Limites : origine déclarée et métadonnées contrôlées, sans authenticité ni identité du contenu prouvée ; comparaison des champs de provenance épurés, aucune serrure sur le fichier. Domaine exact des règles H07, protocole et port ignorés ; JSON voisins non transférés et association non maintenue. C1 reste partiel ; J1.7 sur Windows propre non exécuté.

Parcours navigateur complet (`browser-c1-sites.log`) et recette complète extension/compagnon réels avec `NEXTEXPLORER_REQUIRE_NATIVE=1` (`extension-c1-sites-complete.log`) réussis sur le même code ; parcours J3 et H07 automatique avec toutes les vues fermées conservés. Paquet, installateur et kit Windows reconstruits ; kit préparé seulement, sans clôture de J1.7.

## Complément J4 / C1 — organisation réutilisable

Palier du 17 octobre : parcours durable `scripts/file-family-journey.mjs`, appelé par les recettes navigateur et extension. Six originaux isolés (documents, PNG, texte, fichier vide et TIFF synthétique de 24 Mio) ; un dossier pour les copies et un autre pour une règle manuelle.

Taille en trois groupes, famille de deux documents créée depuis la sélection après vérification et focus dans son formulaire. Une source changée après aperçu empêche le stockage d’une nouvelle famille ; après regroupement, lien périmé séparé et 1/2 références concordantes affichées. Source restaurée pour la suite. Conversion réelle PNG → JPEG 64 px ; sources et copies enregistrées, retrouvées par Relations depuis le dossier des copies, avec l’original hors dossier. Métadonnées seulement pendant le regroupement.

Brouillon .jpg ouvert puis annulé sans règle créée ; second brouillon enregistré en règle manuelle, automatique décoché, destination contrôlée et suggestion retrouvée. Aucun `FS_TRANSFER`, dossier de rangement vide. Synchronisation entre vues et retrait de la famille effaçant les résultats de l’autre vue, sans suppression de fichier. 200 contrôles/1 000 références sur 1 003 ; arrêt avec FS_STAT retardés, aucune demande suivante et aucun résultat tardif. Originaux vérifiés par taille, date en secondes et SHA256 ; seule la copie JPEG attendue existe. Clavier, 320/390/1024 px et thèmes inspectés.

Compilation et 161 tests TypeScript ; recette ciblée Chromium/compagnon réel réussie (`families-focused.log`). Captures `file-families-dark.png` et `file-families-light.png`. [Évaluation et décision des noms approchants](EVALUATION_CLASSEMENT.md) : 20 paires synthétiques, huit combinaisons algorithme/seuil et faux positifs à chaque seuil.

Limites : familles et suivi locaux au profil, non exportés avec les espaces ; anciens suivis sans sources non rattachés. Chemins, noms, tailles et dates enregistrés, sans authentification du contenu ou verrouillage. Références ne suivant pas les déplacements/renommages ; copies reliées à leur lot entier, aucune filiation individuelle supposée. J1.7 et mesures sur utilisateurs restent distinctes ; C3/index, tags et J4 global ne sont pas terminés.

Parcours navigateur complet (`browser-c1-pallier-final.log`) et recette complète extension/compagnon avec `NEXTEXPLORER_REQUIRE_NATIVE=1` (`extension-c1-pallier.log`) réussis, y compris J3 et H07 automatique toutes vues fermées. Simulation navigateur complétée avec get multiple/remove et contains des permissions, équivalents aux API réellement utilisées. Dernier build revérifié par recette native ciblée après les ajustements des libellés/focus (`families-focused-final.log`), avec focus maintenu dans le dialogue après sauvegarde et annulation. Paquet, installateur et kit Windows reconstruits ; kit préparé seulement. Palier C1 du prototype validé localement ; J4/C3, J5/C2, J7 et la recette Windows propre J1.7 restent distincts.


## Complément J4 — organisation et recherche

17 octobre 2026. Prototype J4 validé localement. Parcours durable dans **scripts/organization-journey.mjs**, appelé par la recette de l’extension réelle.

- Index choisi TXT/Markdown, sous-dossier, recherche sans accents, TF-IDF et règle de mots-clés nommée ; reconstruction après ajout, modification et suppression.
- Liens collectés et espaces retrouvés sans visite web. Modifier le chemin pendant une actualisation différée ne lance aucune lecture du nouveau dossier avant un clic explicite sur Indexer.
- TIFF 24 Mio sans lecture par l’index et SHA256 conservé ; métadonnées de provenance seules lues sur les formats non textuels.
- Tag créé/attribué, renommage réel puis déplacement réel avec suivi par le service worker ; synchronisation dans le panneau.
- Thème synchronisé, raccourci en collision refusé puis raccourci valide exécuté ; export/import explicite contenant tags, règles et vues, sans contenu indexé.
- Affichage en colonnes et accueil ; 320/390/1024 px ; arrêt de l’indexation et effacement entre vues sans réapparition tardive ; totaux de dossiers dans la liste.
- Tests Go : limite native de 10 000 résultats et filtre retrouvant un nom au-delà des premiers résultats ; sorties partielles explicites. Tests TypeScript : plafonds/budget, cache malformé, dates précises, annulation, changements, règles/imports et collisions.

Compilation et **176 tests TypeScript** réussis (`check-j4-release.log`), suite Go complète (`native-j4-final.log`) et parcours navigateur complet (`browser-j4-complete.log`). Recette J4 sur le dernier build (`j4-final-responsive.log`), puis avec la permission téléchargements et la configuration Chrome de la suite complète (`j4-native-downloads.log`) : réussites. Corpus synthétique de 1 003 fichiers : 1 000 indexés, 3 omis, environ 3,3 s et plus de 200 événements d’interface pendant l’analyse ; mesure locale, sans garantie sur les dossiers personnels.

Le contrôle étroit vérifie le dialogue, sa zone défilante et la grille intérieure ; la première assertion sur le seul dialogue ne détectait pas les chemins qui débordaient. Cartes et titres corrigés, captures inspectées en clair/sombre à 320/1024 px (`j4-visual-complete.log`) ; recherche et réglages contrôlés aussi à 390 px dans le parcours durable.

La recette globale a validé les parcours antérieurs jusqu’au palier C1 (`extension-j4-final-native.log`), puis a échoué dans le contrôle de récupération de l’export. Le fichier téléchargé est désormais retrouvé via l’API Chrome quand la recette impose son nom réel, avec attente bornée de la fin et contrôle du chemin ; le profil standard garde `download.saveAs`. La validation ciblée avec cette configuration a réussi. Les logs, captures et profils de recette restent exclus de Git.

Reprise réussie dans le profil conservé après correction du contrôle d’export (`extension-j4-resumed-complete.log`, code de sortie 0) : J4, réception HTTP des deux parcours J3 avec octets exacts, puis H07 automatique avec toutes les vues fermées. Le nouveau corpus et les téléchargements restent isolés dans le dossier de recette. La couverture de l’extension est donc validée en deux segments ; aucun lancement unique complet après cette dernière correction n’est revendiqué.

PDF textuel réel non testé : moteur **pdftotext** absent ; refus de PDF invalide/trop gros testés en Go. Aucun modèle, OCR, scan global autonome ou qualification utilisateurs/machine propre ; ces limites figurent dans [le guide J4](J4_ORGANISATION_RECHERCHE.md).

## Complément J5 — C2 — copies identiques

Premier lot du 17 octobre 2026. Parcours durable `scripts/file-copies-journey.mjs`, appelé après les familles par la recette commune des groupes, dans le navigateur et l’extension réelle.

- Sélection de deux fichiers, dossier sans ses sous-dossiers, puis références d’un espace suivi dans le panneau ; référence absente et lien web séparés. Un changement de mode ne lance pas de lecture.
- Noms/extensions différents avec contenu commun, même taille avec contenu différent, taille unique, fichiers vides et deux fichiers nommés TIFF de 24 Mio. Ces derniers passent par BLAKE3 natif, sans décodage ni `FS_READ` dans Chrome.
- Deux fichiers temporaires de 65 Mio refusés avant demande de hash, JSON de provenance et sous-dossier exclus. Aucune demande de transfert, écriture, conversion ou corbeille par le mode ; aucune image chargée dans son résultat.
- Réanalyse réutilisant les sept empreintes du petit corpus après contrôles précis. Modification externe de même taille invalidant résultat/cache, nouveau résultat à sept fichiers en copies ; restauration explicite des octets du fichier de recette modifié.
- Arrêt pendant un `HASH` retenu par la recette jusqu’au clic d’arrêt, puis libération et réception réelle de sa réponse ; aucune demande suivante ni résultat remis, nouvelle analyse recalculant les sept empreintes sans cache tardif. Ce contrôle remplace un délai fixe trop sensible au rythme des vues de test. Fermeture écartant le cache.
- Cartes dépliées et longs chemins à 320/390/1024 px ; thèmes clair/sombre et panneau à 390 px. Originaux vérifiés par SHA256 et taille, dates inchangées sauf le fichier volontairement modifié/restauré pour le contrôle de notification.
- Dossier synthétique de 1 003 fichiers : 1 000 références dans l’instantané, 200 contrôlées, 100 empreintes, 900 non comparées et 3 omissions visibles ; battements d’interface pendant l’analyse et mesure dans `c2-copies-performance.json`.

Compilation et **185 tests TypeScript** (`check-c2-copies-final.log`) ; suite Go complète (`native-c2-copies-final.log`) avec valeurs de référence, fichier vide, type/taille/horodatage refusés, contexte annulé et ancienne réponse `HASH` préservée. Tests de logique pour budget cumulé 256 Mio, plafond de quatre contrôles simultanés, cache, références modifiées en cours de lot et réponses natives incompatibles. Recette ciblée Chromium/compagnon réussie (`c2-copies-native.log`) : corpus 1 003 entrées traité en 2 232 ms avec 134 battements d’interface, mesure locale synthétique. Captures `file-copies-320.png`, `file-copies-390.png`, `file-copies-1024.png` et `file-copies-light.png` inspectées.

Le premier lancement a correctement désactivé le mode avec l’ancien compagnon installé. Mise à jour par le script existant, avec version précédente conservée, puis validation Native Messaging réelle. La simulation navigateur distribue désormais les événements natifs à chaque vue par curseur, au lieu de les retirer au premier lecteur ; elle reproduit la diffusion du service worker. Le parcours réel ne dépend pas de cette simulation.

La recette navigateur globale a validé les parcours existants jusqu’aux familles C1 (`browser-c2-copies-final.log`), puis son contrôle C2 à délai fixe a laissé terminer des empreintes avant l’arrêt et échoué sur un compteur trop strict. Après remplacement par la barrière explicite décrite ci-dessus : parcours C2 ciblé avec le même pont RPC réussi (`browser-c2-copies-focused.log`, code 0), puis extension Chromium/compagnon réels réussis (`c2-copies-native-barrier.log`, code 0). Sur cette dernière recette, 1 003 entrées : 2 293 ms et 137 battements d’interface ; aucune généralisation à un dossier personnel. La couverture navigateur est validée en deux segments ; aucun lancement global unique après cet ajustement de recette n’est revendiqué.

Limites : comparaison d’empreintes à un instant, sans verrou sur le disque ni recherche visuelle. Cache en mémoire seulement, revérification par métadonnées avant réutilisation ; métadonnées volontairement préservées non détectées par déduction. Lecture native déjà lancée pouvant finir après l’arrêt dans son échéance ; aucune tâche durable ou reprise automatique livrée. Variantes visuelles et reste de J5 à développer, J1.7 sur Windows propre non exécuté. Voir [le guide C2](C2_COPIES_IDENTIQUES.md).
