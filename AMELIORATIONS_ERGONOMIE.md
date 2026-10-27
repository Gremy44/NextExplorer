# Interface compacte — checklist de recette

Demandes du 26 octobre 2026. Les cases « réalisé » concernent le code ; les cases de recette restent à cocher après essai utilisateur. Ne pas reconstruire l’installateur EXE pour ce lot.

## Réglages

- [x] Réalisé : remplacer le long panneau par des sections, avec navigation à droite et adaptation aux petits écrans.
- [x] Réalisé : régler indépendamment la densité de l’interface, la taille des textes et la taille du menu contextuel ; conserver ces choix.
- [ ] Recette : ouvrir chaque section, chercher un réglage, enregistrer puis rouvrir l’extension.
- [ ] Recette : essayer les petites tailles et les grands textes, sur un petit et un grand affichage.

## Onglets

- [x] Réalisé : réordonner les onglets par glisser-déposer, en conservant l’onglet actif et ses dossiers.
- [x] Réalisé : ajouter des icônes aux actions et replacer la fermeture à droite de chaque onglet.
- [ ] Recette : déplacer un onglet actif puis inactif, vérifier le split, les déplacements par boutons et la fermeture.

## Panneaux et navigation

- [x] Réalisé : redimensionner la navigation de gauche avec le curseur adapté, conserver la largeur et les traits fins.
- [x] Réalisé : vérifier le redimensionnement existant du volet de droite (aperçu, détails, espace disque, console).
- [x] Réalisé : replier/déplier indépendamment Accès rapide, Emplacements, Organisation et Outils ; mémoriser les états.
- [ ] Recette : glisser les séparations, utiliser les flèches clavier, redimensionner la fenêtre et rouvrir l’application.
- [ ] Recette : replier les catégories puis vérifier leur état après rechargement.

## Explications et infobulles

- [x] Réalisé : remplacer les explications d’aide des principaux outils par des infobulles au survol et au clavier.
- [x] Réalisé : ajouter un réglage pour désactiver les infobulles.
- [ ] Recette : vérifier les aides dans les réglages, outils de fichiers et panneau navigateur ; les erreurs, confirmations et avertissements doivent rester lisibles.

## Dossiers distants — socle du 26 octobre 2026

- [x] Rechercher les parcours FileZilla, GNOME Files, Dolphin et Krusader ; documenter les adaptations et les limites dans [DOSSIERS_DISTANTS.md](DOSSIERS_DISTANTS.md).
- [x] Activation facultative dans **Réglages → Connexions**, catégorie **Serveurs** repliable et profils enregistrés par le compagnon.
- [x] Navigation SFTP dans les onglets, fil d’Ariane, double panneau et copies vérifiées dans l’Activité, sans écrasement de l’existant.
- [x] Empreinte SSH explicite avant authentification, mot de passe/clé privée et mémorisation facultative protégée par Windows.
- [x] Comparer le niveau affiché avant de préparer une copie ; clic droit distant, permissions SFTP et suppression explicite.
- [x] Console **SSH · serveur**, ouverte uniquement à la demande, séparée de PowerShell ; SFTP seul peut refuser un shell.
- [ ] Recette utilisateur sur un serveur SFTP/SSH réel, qualification FTP/FTPS externe et revue des gros transferts après coupure.
- [x] Compagnon recompilé le 27 octobre 2026 et joint avec l’extension à la préversion privée ; **Setup existant inchangé**.

La proposition de connecteur vers l’autre dépôt a été retirée à ta demande. Les fonctionnalités avancées restantes sont distinguées du socle réalisé dans le guide dédié.

## Actions rapides — atelier du 26 octobre 2026

- [x] Réalisé : ouvrir directement l’outil adapté depuis le bouton de sélection, la palette ou le clic droit ; changer d’outil dans la même fenêtre.
- [x] Réalisé : aperçu central et réglages latéraux, adaptés aux petits écrans, au thème et aux tailles d’interface.
- [x] Réalisé : prévisualiser la rotation à gauche ou à droite et appliquer le traitement à la sélection.
- [x] Réalisé : conserver les annotations lors d’un aller-retour vers un autre outil ; ajuster la page à la zone disponible.
- [x] Réalisé : assembler un PDF avec réordonnancement par glisser-déposer ou flèches et retrait d’une source.
- [x] Réalisé : choisir les bornes d’un extrait au curseur ou avec « Début ici / Fin ici », afficher sa durée et écouter/lire l’extrait.
- [x] Réalisé : proposer le dossier courant et un nom de copie, replier les options de destination, maintenir la commande d’export accessible et afficher le nom réellement enregistré.
- [x] Réalisé : numéroter les sorties PDF/annotations si leur nom existe déjà, en préservant le fichier existant.
- [ ] Recette : sélectionner une image, ouvrir Actions rapides, choisir un sens et enregistrer sans saisir de chemin.
- [ ] Recette : annoter une image ou un PDF, changer d’outil puis revenir ; vérifier que le dessin reste présent et que l’original reste intact.
- [ ] Recette : sélectionner plusieurs images/PDF, changer leur ordre, retirer une source et créer le document.
- [ ] Recette : lire une vidéo ou un audio, poser les bornes puis enregistrer l’extrait ; essayer aussi un autre dossier de sortie.

Les formats, limites et moteurs requis restent ceux des outils existants. La rotation traite un quart de tour ; les aperçus d’images utilisent une miniature bornée. Le convertisseur est intégré dans le même atelier.

Validation de ce lot : typage et **250 tests** réussis. Recette navigateur avec les moteurs locaux existants : rotation PNG et dimensions vérifiées, annotation conservée entre outils et exportée, ordre réel des pages du PDF contrôlé après glisser-déposer, collision numérotée sans écrasement, durée MP4 mesurée, annotation PDF enregistrée dans un autre dossier. Empreintes des originaux et du PDF préexistant inchangées. Commandes accessibles à 390 × 640 et 800 × 480, texte à 150 %. Captures : `test-results/quick-action-*.png`. Ces vérifications ne remplacent pas les essais utilisateur audio et sur vos fichiers réels.

## Convertisseur intégré et transitions — 26 octobre 2026

- [x] Réalisé : Convertir reste dans l’atelier, y compris depuis son accès direct ; revenir aux autres outils sans fermer la modale.
- [x] Réalisé : conserver les annotations et les choix de conversion pendant les allers-retours ; bloquer le changement d’outil pendant un lancement.
- [x] Réalisé : transitions de 140 à 180 ms à l’ouverture des modales, menus et infobulles, au changement d’outil et à l’affichage des sections.
- [x] Réalisé : repère de dépôt pour les onglets, déplacement animé des voisins, annulation sans modifier l’ordre, déplacements par boutons également animés.
- [x] Réalisé : respecter la préférence système « Réduire les animations » pour les transitions CSS et JavaScript.
- [ ] Recette : annoter une image, passer dans Convertir, changer le format et la qualité, revenir à Annoter puis à Convertir ; vérifier les deux travaux conservés.
- [ ] Recette : ouvrir directement Convertir, passer en rotation puis revenir et lancer la conversion.
- [ ] Recette : déplacer plusieurs onglets, annuler un déplacement avec Échap et essayer les déplacements par boutons ; vérifier aussi avec une barre d’onglets qui défile.
- [ ] Recette : essayer l’ouverture des fenêtres et les changements d’outil, puis refaire l’essai avec les animations système réduites.

Validation : **253 tests** réussis. Recettes navigateur : modale et réglages de conversion conservés, export WebP réel après changement d’outil, annotations exportées intactes après passage dans Convertir ; dépôt et annulation d’onglet, identité de l’onglet actif et réduction des animations vérifiés. Captures locales : `test-results/quick-action-conversion.png` et `test-results/motion-tabs-drag.png`. Aucun EXE reconstruit.

## Où essayer les changements

Dans **Réglages → Apparence** : taille de l’interface (compacte, standard ou confortable), texte (85 à 150 %), taille du clic droit et activation des infobulles. Enregistrer pour appliquer. **Menus** permet aussi de choisir les actions visibles.

Dans la navigation : glisser sa bordure droite, double-cliquer pour réinitialiser, ou utiliser les flèches clavier sur la séparation. La bordure conserve son trait fin. Les chevrons des catégories mémorisent leur état. Le volet Aperçu / Détails conserve son réglage de largeur existant ; sur un espace étroit, il se place sous les fichiers.

Les aides `ⓘ` s’ouvrent au survol ou au focus clavier ; Échap les referme. Les erreurs, confirmations, limites pouvant entraîner une perte et autorisations restent affichées. La console conserve son propre réglage de police.

## Vérifications techniques

- [x] Typage et 246 tests TypeScript réussis, dont migration des anciennes préférences, bornes des tailles et conservation de l’onglet actif pendant tous les réordonnancements.
- [x] Recette navigateur dédiée : sections/recherche, réglages persistants, survol/focus/Échap, désactivation des aides, largeur et catégories mémorisées, onglets glissés et volet de droite redimensionné.
- [x] Fenêtres 390/800/1 440 px, texte à 150 %, commandes accessibles à 800 × 480 et 390 × 568 ; panneau navigateur à 320/390/700/1 200 px et texte à 85 %.
- [x] Recettes de disposition et d’espace disque : activité et aperçu redimensionnables, carte et infobulles au clavier, navigation sans fermer l’analyse.
- [x] Parcours navigateur complet : huit affichages, tris et clic droit, sélection et aperçus, captures, navigation du panneau, transferts/archives et regroupements de fichiers, sans modification des originaux du corpus de test.

Captures locales : `test-results/ergonomics-*.png`. Les cases **Recette** plus haut sont réservées à la validation utilisateur.

Les EXE existants sont inchangés. Le build web est dans `dist` ; l’installation issue de l’ancien EXE ne reçoit pas ces changements automatiquement.
