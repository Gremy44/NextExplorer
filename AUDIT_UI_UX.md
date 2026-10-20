# Audit UI/UX — NextExplorer, 3 octobre 2026

## Espace disque et inventaire des outils — complément du 18 octobre 2026

Périmètre choisi : **espace disque amélioré + liste complète**, avant une revue outil par outil. Le volet d’aperçu dépasse désormais 640 px selon la place disponible et peut occuper toute la zone centrale. Survol et focus affichent nom complet, chemin, taille et pourcentage des blocs, même minuscules. Six couleurs contrastées, séparations blanches et texte lisible remplacent les trois teintes peu distinctes. Un clic sur un résultat remet les fichiers à l’écran sans perdre l’analyse.

Compilation et **224 tests / 36 fichiers** réussis ; parcours Chrome/compagnon dédié avec souris, clavier, mémorisation, navigation, pagination et thèmes à 320/390/900/1440 px. Contraste du texte vérifié, fichiers d’essai intacts. Preuves dans [la recette hybride](RECETTE_HYBRIDE.md). Ces contrôles ne constituent pas une étude avec utilisateurs.

[La revue des 47 parcours](REVUE_ERGONOMIE_OUTILS.md) donne leurs accès, un essai court pour chacun, les références aux logiciels existants et les premiers points à retravailler. Les autres outils restent à valider avec l’utilisateur ; ils n’ont pas été refondus dans ce lot.

## Menus d’affichage et de tri — complément du 6 octobre 2026

Demande utilisateur : rendre l’icône d’affichage cliquable et illustrer les options d’affichage et de tri dans les deux interfaces. Deux boutons près de la recherche ouvrent des menus superposés au contenu. Le mode et le tri courants restent visibles avec leur icône ; les huit affichages et les six tris possèdent un pictogramme distinct, avec une coche sur l’option active. Surfaces tonales, formes et focus suivent Material 3. Dans le panneau, le tri quitte les filtres repliés pour devenir directement accessible. Dans Détails, les flèches des colonnes indiquent le critère et le sens actuels.

Validation : 42 tests TypeScript ; Chrome avec ouverture sur l’icône, flèches/Début/Fin/Entrée, Échap et focus restitué, Tab et clic extérieur. Six tris sur de vrais fichiers en Grandes icônes, préférence restaurée après rechargement ; tri par taille vérifié aussi dans le panneau. Extension réelle : menus illustrés à 320/390/1024 px, limites de la fenêtre respectées, choix actif unique et préférence de tri du panneau indépendante de la page. Vrai glissement Windows texte/TIFF de 24 Mio conservé. Captures `test-results/explorer-view-menu.png`, `explorer-sort-menu.png` et `companion-*-menu-*.png`. Ces contrôles ne constituent pas une étude avec utilisateurs.

## Affichage des fichiers — complément du 6 octobre 2026

Demande utilisateur : retrouver les choix d’affichage de Windows dans le panneau et l’explorateur. Le menu natif propose désormais huit modes avec leur nom visible : très grandes, grandes, moyennes et petites icônes, liste, détails, mosaïques et contenu. Il réutilise les couleurs et le focus Material 3. Les colonnes s’adaptent à la largeur ; les dates du mode Détails se masquent dans le panneau étroit. Le choix reste mémorisé par volet et onglet, avec des préférences indépendantes pour le panneau et la page. Filtres, tri, sélection, aperçu, collecte et glisser-déposer sont conservés.

Validation : 42 tests TypeScript ; huit modes inspectés en Chrome, panneau à 390/1024 px sans débordement, navigation clavier, sélection conservée et mémorisation après rechargement. Les miniatures se chargent à l’écran avec annulation des lectures hors zone ; aucun décodage automatique des TIFF. Extension réelle et glissement Windows en Mosaïques, Grandes icônes et Petites icônes réussis, dont un TIFF de 24 Mio. Captures `test-results/explorer-view-*.png` et `panel-view-*.png`. Les groupes du panneau restent limités à 200 dossiers et 200 fichiers ; la page conserve sa virtualisation. Ces contrôles ne constituent pas une étude avec utilisateurs.

## Navigation responsive et filtres — complément du 6 octobre 2026

Complément après retour utilisateur sur les grandes largeurs : le sélecteur était encore plafonné à 420 px et les listes conservaient leur disposition étroite. Le dialogue suit désormais la largeur du panneau jusqu’à 960 px ; grilles de dossiers, fichiers et filtres occupent plusieurs colonnes quand la place le permet. Les noms du chemin utilisent aussi la largeur disponible. Recette Chrome réussie à 320/390/520/760/1024/1440 px puis retour à 390 px, avec largeur effective du dialogue, colonnes, absence de débordement et dossier courant visible vérifiés. Captures `companion-files-1024.png`, `companion-filters-1024.png` et `companion-folder-picker-1440.png` inspectées dans `test-results`.

Demande utilisateur : ajouter le retour et le chemin au choix du dossier, adapter l’interface à la largeur du panneau et proposer des filtres. Retour précédent et parent sont maintenant distincts, avec historique et Alt + gauche. Le chemin cliquable se répartit sur deux lignes défilantes et garde sa fin visible quand la largeur change ; le dossier courant ne déclenche aucune navigation. Filtres reste replié et propose type de fichier, tri nom/date/taille, fichiers cachés et réinitialisation ; les champs passent de deux colonnes à une selon la place.

Validation : 40 tests TypeScript ; parcours Chrome avec historique, raccourci clavier, chemin cliquable, filtre de nom conservé au clic sur le dossier courant, types combinés, document Office, tri par taille dans les deux sens, fichiers cachés et réinitialisation. Captures inspectées à 320/390/520 px sans débordement, dossier courant visible après redimensionnement et thème clair/sombre. Extension réelle et vrai glisser-déposer Windows réussis. Captures `test-results/companion-files-*.png`, `companion-folder-picker-*.png`, `companion-filters-*.png` et `explorer-light.png`. Les limites d’affichage et les recettes produit encore ouvertes restent décrites dans [PANNEAU_LATERAL.md](PANNEAU_LATERAL.md).

## Choix du dossier — complément du 6 octobre 2026

Constat utilisateur : choix du dossier trop dépendant d’un chemin saisi, dossiers et fichiers peu différenciés. Correction : sélecteur visuel avec emplacements courants, favoris/disques, recherche de sous-dossiers, navigation et confirmation. La saisie du chemin est repliée ; annulation et Échap gardent le dossier courant. La liste distingue des tuiles de dossiers et des lignes de fichiers avec format/taille ; les dossiers supplémentaires se déplient à la demande.

Validation : tests navigateur sur vrais fichiers, accès aux sous-dossiers, confirmation, annulation/focus, erreur de chemin, recherche et dossier vide ; largeurs 320/390/520 px sans débordement. Navigation du sélecteur dans l’extension réelle via Native Messaging ; vrai glisser-déposer Windows toujours réussi. Captures `test-results/companion-folder-picker-*.png` et `companion-files-*.png`. Ces contrôles ne constituent pas une étude avec utilisateurs.

## Révision du parcours du panneau — 6 octobre 2026

Constat utilisateur : des fonctions utiles, mais trop de blocs et de commandes simultanément. L’interface du 4 octobre empilait le contexte du site, le dossier, trois grosses commandes, des explications et une collecte dupliquée avant de laisser de la place aux fichiers.

Correction : **Fichiers / Page / Collecte**, fichiers par défaut, onglets persistants et défilement unique. Le dossier devient un sélecteur compact ; Page met en avant deux actions ; ses outils secondaires se replient. La collecte dispose de sa propre vue et l’insertion par champ reste explicite derrière un bloc à ouvrir. Noms à 14 px, informations secondaires à 12 px, couleurs et formes Material 3 existantes. Les captures en attente restent accessibles et les messages peuvent être fermés. **Agrandir** reste visible ; thème, réglages et commandes passent dans Options.

Voir [PANNEAU_LATERAL.md](PANNEAU_LATERAL.md) pour les parcours et les fonctions conservées. Vérification : 39 tests TypeScript réussis ; parcours navigateur aux largeurs 320/390/520 px, clavier, menu Options et Échap, retour en haut des vues, captures en clair/sombre sans débordement horizontal. Extension réelle : captures, PDF, téléchargements et insertion par champ ; vrai panneau Windows : texte, TIFF de 24 Mio, dépôts successifs et annulation. Les scores ci-dessous décrivent l’audit du 3 octobre ; aucun nouveau score ou résultat d’étude utilisateur n’est attribué à cette refonte.

## Périmètre et méthode

Audit de l'interface Chrome en page complète (1 440 × 960) et en panneau étroit (390 × 844) : connexion, navigation, liste et grille, double panneau, sélection, collecte et listes enregistrées, activité, prévisualisation, capture, dialogues, thèmes clair et sombre. Inspection des styles et composants, captures Playwright et parcours navigateur réels. Les notes ci-dessous sont une appréciation heuristique sur 10, pas une certification Material 3 ni un test utilisateur.

Les directives [Googlebook](https://developer.android.com/googlebook) visent les applications Android sur ordinateur. Pour cette extension Chrome, nous retenons les principes transférables des [fondations du bureau](https://developer.android.com/design/ui/desktop/guides/foundations/design-principles) : exploiter l'espace, garder une bonne densité, adapter la fenêtre et offrir une manipulation efficace. Les [critères de qualité pour ordinateur](https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/experiences/desktop) recommandent aussi les états de survol, le défilement, les menus contextuels, les panneaux réorganisables et une navigation clavier cohérente. Les interactions souris, pavé tactile et clavier sont détaillées dans les [directives d'entrée pour grands écrans](https://developer.android.com/develop/ui/compose/touch-input/input-compatibility-on-large-screens).

## Synthèse Material 3

| Domaine | Avant | Après | Constat et intervention |
| --- | ---: | ---: | --- |
| Couleurs | 7 | 8 | Palette déjà bleue ; rôles de surface, texte, accent, sélection et erreur clarifiés, icônes de type de fichier adaptées au thème clair. |
| Typographie | 4 | 7 | Nombreux libellés à 9–11 px ; corps porté à 14 px, titres et métadonnées mieux hiérarchisés, libellés importants à 12 px ou plus. |
| Formes | 6 | 8 | Rayon auparavant disparate ; échelle de 8, 12, 16, 28 px et forme pleine pour les commandes. |
| Élévation | 6 | 7 | Surface de travail et volets mieux distingués par tons ; superpositions conservées pour navigation et dialogues. |
| Composants | 6 | 8 | Boutons, champs, navigation, états sélectionnés et dialogues harmonisés ; pied des dialogues maintenu visible au défilement. |
| Mise en page | 5 | 8 | Panneau étroit encombré ; actions contextuelles et secondaires rangées, liste plus lisible, colonne secondaire masquée. |
| Navigation | 6 | 8 | Barre de sélection affichée uniquement lorsqu'utile ; dossier, recherche, activité et collecte gardent des accès repérables. |
| Mouvement | 5 | 6 | Transitions courtes de couleur et bordure ; préférence système de réduction d'animation respectée. |
| Accessibilité | 5 | 7 | Contrastes principaux élevés, focus visible, libellés agrandis et structure de dialogue corrigée ; petites cibles subsistent. |
| Thèmes | 7 | 8 | Clair et sombre conservés, avec surfaces et couleurs sémantiques cohérentes. |
| **Total indicatif** | **57/100** | **75/100** | **Progrès surtout sur la lisibilité et l'adaptation au panneau Chrome.** |

## Constats par parcours

| Surface / parcours | Avant | Résultat actuel |
| --- | --- | --- |
| Page complète, liste et grille | Métadonnées et commandes très petites ; hauteur de ligne 37 px. | Lignes de 40 px, noms à 14 px, métadonnées à 12 px, états de survol tonals. La grande surface reste dédiée aux fichiers. |
| Double panneau | Deux espaces fonctionnels mais densité fragile en largeur réduite. | Marqueur du panneau actif et défilement horizontal des deux panneaux à largeur compacte conservés. |
| Navigation, chemins et filtre | Hiérarchie modeste, commandes parfois petites. | Navigation latérale de 44 px, barre de dossier de 48 px et champ de recherche plus lisible ; clavier et palette de commandes restent disponibles. |
| Sélection et actions | Barre toujours présente, même sans sélection ; elle mangeait la hauteur du panneau. | Barre visible seulement avec une sélection ou un presse-papiers ; actions contextuelles utiles au premier niveau. |
| Collecte, listes et web | Beaucoup de commandes sur une seule ligne en panneau étroit. | Examiner reste visible ; les commandes secondaires passent sous « Plus d’actions » à 390 px. Les références restent accessibles et les dialogues gardent leurs boutons. |
| Activité, aperçus, captures et outils | Texte secondaire inégal et commandes ponctuellement serrées. | Libellés et contrôles harmonisés, volets auxiliaires superposés dans le panneau étroit. |
| Connexion et installation | Étapes longues avant l'action ; formulation « charger dist » trompeuse une fois l'extension ouverte. | État et bouton « Se connecter » d'abord ; aide d'installation ou de réparation ensuite. L'identifiant courant s'affiche dans l'extension. |
| Thèmes et états | Palette déjà cohérente, icônes parfois trop fades en clair. | Paires de rôles explicites et teintes sémantiques par type ; focus clavier visible, états sélectionnés tonals. |

## Vérification et limites

- Vérification automatique : tests TypeScript et composants, parcours navigateur Playwright avec fichiers réels, captures à 1 440 px et 390 px, absence de débordement horizontal à 390 px, ouverture et fermeture de « Plus d’actions », thème clair, double panneau et dialogues.
- Le contraste calculé des principales paires de texte/surface dépasse 8:1 pour le texte courant des deux thèmes. Cela ne remplace pas un audit exhaustif de chaque état et icône.
- L'interface reste d'abord un outil de bureau : les lignes de 40 px et plusieurs boutons de 32–40 px sont plus petits que les grandes cibles tactiles Material 3. La taille de certaines cibles et leur usage au toucher demandent une évaluation dédiée.
- La séparation du double panneau n'est pas redimensionnable. Les couleurs dynamiques tirées du fond d'écran Android ne s'appliquent pas à cette extension Chrome ; les thèmes disponibles sont fixes.
- Aucune étude avec utilisateurs, lecteur d'écran ou contrôle automatique exhaustif WCAG n'a été réalisé. Les captures couvrent deux largeurs représentatives, pas toutes les tailles et résolutions.

Le système visuel et les règles d'organisation maintenues par le projet sont décrits dans [DESIGN.md](DESIGN.md).
