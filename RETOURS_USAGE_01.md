# Retours d’usage 01 — 27 octobre 2026

Source : PDF fourni localement dans `test-results/retour-usage-01`.
Ce document reprend uniquement les demandes produit ; le PDF, ses coordonnées
personnelles et les captures de recette restent hors du dépôt.

## Corrections réalisées

- [x] Réduire la hauteur au-dessus des fichiers : chemin, titre du dossier,
  filtre et en-tête de colonnes plus compacts, avec adaptation aux petites
  fenêtres. Les réglages de densité et de taille du texte restent indépendants.
- [x] Retirer la rangée « compagnon / cachés / double panneau / aperçu / … ».
  **Cachés** reste dans **Réglages → Apparence** ; **Double panneau** et
  **Volet d’aperçu** sont à droite des onglets. L’état du compagnon rejoint
  la barre du bas, près de la plateforme et de la version.
- [x] Réorganiser le clic droit : ouvrir, rangée d’icônes couper/copier/renommer/
  corbeille, organisation, transformation, tags. Les outils incompatibles avec
  la sélection sont retirés du menu. Les groupes restent séparés et accessibles
  au clavier ; les tailles du menu et les infobulles suivent les préférences.
- [x] Rendre les tags plus discrets : pastilles de couleur plus petites dans
  un groupe dédié, état sélectionné ou mixte conservé, accès **Tags…** pour
  nommer et gérer les tags.
- [x] Remplacer le masquage total de la navigation par une barre de 52 px,
  avec les mêmes destinations et outils sous forme d’icônes nommées. Elle
  défile si nécessaire ; son bouton d’extension reste accessible.
- [x] Ordonner la navigation : accès de l’**Explorateur**, **Emplacements**,
  **Accès rapide**, **Outils**. Le gestionnaire de tags rejoint les accès de
  l’explorateur ; les tags enregistrés gardent une catégorie repliable ensuite.
- [x] Conserver les largeurs et les catégories repliées en revenant du mode
  icônes au mode complet. Les outils restent accessibles en mode icônes même
  lorsque leur catégorie est repliée dans la navigation complète.
- [x] Ajouter dans **Outils** : renommage par lot, conversion, création et
  extraction d’archives, calcul d’empreinte, via les outils existants.
- [x] Retirer **Calculer une empreinte** du clic droit ; conserver son accès
  dans **Outils** et son réglage de visibilité.
- [x] Renommer directement dans la liste au second clic lent sur un nom déjà
  sélectionné, à F2 ou par le clic droit. L’extension du fichier reste hors de
  la sélection initiale. Entrée ou sortie du champ valide ; Échap annule.
  Le double-clic continue d’ouvrir le fichier ou le dossier. Un conflit de nom
  affiche une erreur sans écraser le fichier existant. SFTP conserve le contrôle
  de l’état attendu ; FTP/FTPS ne proposent pas le renommage.
- [x] Reprendre l’analyse disque des gros volumes : suppression des plafonds de
  parcours (20 000 puis 1 000 000 fichiers) et de l’affichage à 2 000 résultats.
  Lecture des répertoires par lots, inclusion des dossiers vides et de la
  corbeille, résultats conservés localement et transmis par pages ; 80 lignes
  rendues à la fois. Les refus d’accès et liens non suivis restent signalés.
  Protection : 60 Mio de métadonnées et 512 niveaux ; les éventuelles lignes
  omises restent comptées dans la taille totale. Le cache local est borné à
  64 Mio. Les limites des doublons restent distinctes.
- [x] Mettre directement à la corbeille au clic droit et avec Suppr, sans modale.
  Historique sauvegardé et restauration conservée, répétitions simultanées
  bloquées. L’analyse disque ne monopolise plus le verrou des mutations.

## Vérifications

- [x] Typage, compilation web et 269 tests TypeScript.
- [x] Tests Go du compagnon et test d’une arborescence de 4 050 fichiers :
  total exact, agrégation correcte et 551 résultats complets.
- [x] Parcours Chrome dédié : navigation complète et réduite, outils, réglage
  des fichiers cachés, renommage lent/F2/clic droit, annulation, collision sans
  écrasement et double-clic. Captures sombre/clair à 320/390/800/1024/1366 px.
- [x] Recettes tags, ergonomie et espace disque : tags multiples, échec de
  stockage, texte agrandi, tailles du clic droit, onglets glissés, largeur des
  panneaux et conservation de l’analyse pendant la navigation.
- [x] Disposition et dossiers distants : filtres, activité, double panneau,
  connexion SFTP, menus et console SSH. Réseau distant simulé pour cette
  recette d’interface ; moteur SFTP contrôlé séparément dans les tests Go.
- [x] Recette étendue des menus, regroupements et copies : sélection multiple,
  clavier, règles de destination, fichiers modifiés, conflits, contrôle BLAKE3,
  annulation et originaux du corpus vérifiés par SHA-256.
- [x] Pagination native au-delà de 2 000 résultats, cache de 20 000 lignes plus gros que le registre de tâche et restauration du cache.
- [x] Corbeille directe : clic droit, sélection multiple, Suppr répété, historique après rechargement et contenus restaurés à l’identique.
- [ ] Validation utilisateur sur les fichiers et la résolution habituels.
- [ ] Mesure de performance sur un disque réel proche du million d’entrées.

## Essayer ce lot

Glisser-déposer simplifié après retour utilisateur : un dépôt interne ouvre
désormais deux choix au curseur, **Déplacer** et **Dupliquer**, puis lance le
transfert au clic, sans le grand dialogue. La sélection et la destination sont
figées au dépôt. Les noms en conflit sont numérotés, sans écrasement ni fusion.
Les contrôles natifs, vérifications de copie et suivi dans l’Activité restent
actifs. Un transfert distant conserve son mode copie uniquement. Échap, Tab,
clic extérieur, changement d’onglet ou redimensionnement referment le menu
sans lancer l’opération. Copier/couper-coller garde les réglages avancés.
Le raccourci nécessite un glisser commencé dans les panneaux de cette vue :
un dépôt externe portant simplement le même type MIME conserve la confirmation.
Recette dédiée : `node scripts/browser-test.mjs --drop-transfer-only` ; copie,
déplacement, conflit, plusieurs fichiers vers un sous-dossier, annulation et
bords de fenêtre à 320/390/1440 px. Le parcours SFTP vérifie le refus du déplacement.

Correctif après retour utilisateur : revenir sur un onglet **Ce PC**, en créer
un depuis cette vue ou restaurer la session pouvait vider toute l’interface.
L’observateur de largeur essayait de surveiller une liste de fichiers absente.
Il s’attache désormais uniquement à une liste existante et se réinitialise en
revenant de **Ce PC** vers un dossier. Recette Chrome reproduite avant correction,
puis réussie : changements d’onglet entre dossiers et lecteurs, création et
fermeture d’onglet, double panneau et rechargement de session, sans erreur JavaScript.
Commande : `node scripts/browser-test.mjs --tabs-only`.

L’interface compilée est dans `dist` et `release/NextExplorer/dist`. Le paquet
local `release/NextExplorer` contient aussi le compagnon recompilé pour la
nouvelle capacité d’analyse. Le compagnon de ce PC a été réinstallé à l’issue
de ce correctif, sans arrêter les processus déjà ouverts. Terminer les tâches,
puis désactiver l’extension pendant une minute avant de la réactiver : l’ancien
worker doit libérer sa connexion. L’installateur Setup reste inchangé. Ces
corrections locales ne sont pas encore dans la préversion GitHub déjà publiée.

Recharger l’extension qui utilise `release/NextExplorer/dist` (ou `dist`). Pour
installer le nouveau compagnon sur une autre installation depuis la racine du projet :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\release\NextExplorer\scripts\install-host.ps1
```

Désactiver puis réactiver l’extension si elle conserve une ancienne connexion
au compagnon. Aucun nouvel installateur Setup n’est nécessaire pour cet essai.

Captures de vérification : `test-results/retour-usage-01/applied-*.png` et
`test-results/retour-usage-01/rail-menu-*.png`.
