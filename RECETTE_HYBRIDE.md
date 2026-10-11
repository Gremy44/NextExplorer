# Recette des parcours hybrides — J3

Cette recette vérifie deux parcours utilisateur dans l’extension Chromium réelle avec le compagnon Windows installé. Elle complète les contrôles de captures, provenance, téléchargements, espaces, reprise des copies et refus d’insertion déjà présents dans `scripts/extension-test.mjs`.

**Validation du 10 octobre 2026 :** les deux parcours et la recette complète de l’extension avec le compagnon réel réussissent. Les fichiers synthétiques reçus sont identiques aux originaux ou à la copie WebP préparée, sans soumission automatique. 126 tests TypeScript et 98 assertions de diagnostic réussis. Cette validation clôt J3 au périmètre du prototype ; J1.7 reste ouvert.

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
