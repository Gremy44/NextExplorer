# Direction visuelle — Material 3 pour ordinateur

NextExplorer applique les rôles de couleur, les formes et la typographie de Material 3 à un explorateur de fichiers dans Chrome. Les recommandations Googlebook concernent les applications Android sur ordinateur ; nous en reprenons les principes utiles pour une extension : densité de travail, adaptation à la largeur disponible, navigation au clavier et précision à la souris.

## Contrôle de la collecte — 9 octobre 2026

Le contrôle reste dans le dialogue **Examiner la collecte**, accessible par **Gérer** dans le panneau. Bouton avec icône, progression annoncée et action d’arrêt ; seules les anomalies ajoutent des détails après le contrôle. Les couleurs et listes existantes sont réutilisées ; noms et chemins longs passent à la ligne. Aucun bouton permanent supplémentaire dans le panneau, aucun changement de thème ou dépendance.

Build final vérifié avec le compagnon réel à 320/390/1024 px ; capture `test-results/collection-check.png` inspectée. Les messages destinés à l’utilisateur restent en français, sans exposer les noms d’opérations internes de Windows.

## Export/import des espaces — 9 octobre 2026

L’action **Actualiser…** ouvre un aperçu dans ce même dialogue et masque le formulaire de création pendant cette étape. Le nom modifiable, les nombres de références avant/après et les chemins précèdent **Confirmer l’actualisation**. Le remplacement des pages web est une case décochée par défaut ; annulation et erreurs de concurrence restent explicites. Bouton, icône et formulaire réutilisent les composants et rôles de couleur existants.

Formulaire d’actualisation vérifié dans l’extension réelle à 320/390/1024 px ; capture `test-results/space-update.png` inspectée.

Les actions restent dans le dialogue des espaces, avec les boutons et icônes existants. Le sélecteur de fichier est natif ; l’aperçu reprend les champs, surfaces et couleurs sémantiques de l’interface. Le nom modifiable, les dossiers et le nombre de références précèdent l’action principale d’enregistrement. Annulation, erreurs et reprise restent explicites ; les chemins longs passent à la ligne. Aucune nouvelle dépendance ni barre d’outils permanente.

Dialogue vérifié dans l’extension réelle à 320/390/1024 px ; capture `test-results/space-import.png` inspectée.

## Compléments J3 — 7 octobre 2026

Règles de rangement repliées dans le dialogue des téléchargements, éditeur et sélecteur de dossiers réutilisé. Espaces accessibles par Espace local, palette et Options du panneau ; enregistrement et reprise distincts, ouverture web facultative. Préparation d’images avec champs simples, copies et contraintes vérifiées, ajout à la collecte choisi par l’utilisateur. Surfaces et couleurs sémantiques existantes, boutons avec icônes, formulaires adaptés au panneau et chemins longs répartis sur plusieurs lignes. Dialogues vérifiés à 320/390/1024 px ; aucune bibliothèque ajoutée.

## Système visuel

La séparation du volet d’aperçu possède une poignée Material 3, commune visuellement à celle des deux panneaux : survol et focus visibles, réglage à la souris et au clavier, largeur mémorisée (260–640 px, limitée par l’espace disponible). Le double-clic rétablit 330 px. La poignée est masquée dans la disposition verticale sur petit écran.

Le volet **Aperçu et détails** accompagne la liste dans la vue complète : surface tonale à droite, aperçu en haut, informations et métadonnées en dessous. Le bouton **Aperçu** indique son état et le volet possède une fermeture dédiée. Il suit la sélection du panneau actif ; une sélection multiple donne un résumé. À 700 px et moins, le volet passe sous la liste avec son propre défilement. L’aperçu intégré est une région, sans fenêtre modale ni déplacement automatique du focus.

- Palette bleu ardoise avec surfaces tonales. Les couleurs ont des rôles sémantiques (surface, surface surélevée, texte, texte secondaire, primaire, sélection, erreur), définis dans src/style.css pour les thèmes sombre et clair.
- Roboto si elle est disponible, puis Segoe UI ou la police système. Les chemins et tailles restent en monospace. Aucune police distante ni bibliothèque de composants supplémentaire.
- Échelle typographique : titres de page 24 px, titres intermédiaires 16 px, corps 14 px, libellés 12 px. Les métadonnées secondaires sont lisibles dans le panneau latéral.
- Angles Material 3 : 8 px pour les champs, 12 px pour les petites surfaces, 16 px pour les panneaux, 28 px pour les dialogues et forme pleine pour les boutons et destinations de navigation.
- Les surfaces et la sélection se distinguent par des tons cohérents ; les filets structurent les tableaux et les zones de travail. L'élévation est réservée aux éléments superposés.

## Organisation

- Affichage et tri : deux menus communs au panneau et à l’explorateur, ouverts par leur icône ou leur libellé ; huit modes d’affichage et six tris nom/date/taille. Chaque choix possède une icône et le choix actif une coche. Boutons avec libellés accessibles et état ouvert, menus de choix exclusif au clavier, focus restitué après confirmation ou Échap. La [Popover API du navigateur](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using) gère la superposition, le clic extérieur et Échap ; le placement reste dans la fenêtre. Surfaces tonales, angles de 12 px et lignes de 44 px réutilisent les rôles Material 3. Les choix sont mémorisés par onglet et volet, sans réinitialiser sélection ou filtre. Les modes ont des tailles distinctes d’icônes, grilles compactes, liste, colonnes de détails, mosaïques et contenu. Les miniatures se chargent dans la zone visible et se libèrent hors écran ; l’explorateur garde sa virtualisation. Les noms accessibles correspondent au fichier et ne reprennent pas le texte de sa miniature.
- Sur grand écran : rail de navigation à gauche, onglets de dossiers au-dessus du plan de travail, dossier actif au centre, activité à droite lorsqu'elle est ouverte, collecte en bas. Chaque onglet peut montrer deux dossiers indépendants.
- En double panneau sur une fenêtre assez large, un séparateur tonal avec poignée visible ajuste la largeur de 30 à 70 %. Son rôle accessible permet les flèches gauche/droite, Début/Fin et le focus clavier ; un double-clic rétablit 50 %. Chaque onglet mémorise sa proportion. En fenêtre étroite, les panneaux restent de largeur égale et défilent horizontalement si nécessaire.
- Les lignes du mode Détails font 40 px ; les autres modes adaptent leur hauteur à la taille d’icône et aux informations choisies. Les noms s'alignent à gauche dans les listes ; les tailles et dates s'alignent dans leurs colonnes.
- Le panneau Chrome a une interface dédiée : vues « Fichiers / Page / Collecte » avec Fichiers ouverte par défaut, dossier compact avec sélecteur visuel et collecte commune. Le sélecteur utilise un dialogue HTML natif pour le focus, l’isolation des contrôles et Échap ; les emplacements courants sont des boutons. La liste sépare les sous-dossiers en tuiles tonales et les fichiers en lignes avec format/taille. Quatre tuiles restent visibles au départ pour préserver la place des fichiers. Une seule zone défile sous les onglets persistants. Les actions secondaires passent sous « Plus d’actions », l’insertion sous « Insérer dans un formulaire » et les options globales sous un menu. Les noms de fichiers font 14 px et les informations secondaires 12 px ; les couleurs, les formes et les états de focus suivent les tokens Material 3. Il conserve le contexte du projet pendant la navigation web ; l'ouverture en pleine page transmet le dossier et ferme le panneau. Les commandes de fichiers avancées restent dans la vue complète.
- Dans le panneau et son sélecteur, retour précédent et parent ont des boutons distincts ; le fil d’Ariane permet de rejoindre un ancêtre et garde le dossier courant sans action. Le chemin se replie sur deux lignes défilantes et conserve sa fin visible lors du redimensionnement ; les noms profitent de toute la largeur disponible. Les filtres restent dans un bloc replié avec compteur : type, tri, fichiers cachés, réinitialisation. Filtres, dossiers et fichiers passent sur plusieurs colonnes quand la place le permet. Le sélecteur s’élargit avec le panneau jusqu’à 960 px et répartit aussi ses accès rapides et sous-dossiers en colonnes. La grille CSS revient à la disposition compacte lorsque la largeur diminue ; les surfaces, contrôles et états actifs suivent les rôles Material 3 existants.
- Les actions destructrices ou ambiguës passent par un dialogue de confirmation. Son en-tête et ses boutons restent visibles quand le contenu défile. L'écran de connexion mène d'abord à l'action utile, puis aux étapes de réparation.

## Interaction

- Le suivi des insertions est un bloc natif replié dans Collecte et Examiner, sans nouveau volet. Résumé au clavier et focus visible ; articles avec site/date, champ, état lisible et noms/tailles à la ligne. Le retrait par icône garde une cible de 44 px et un nom accessible avec date/site ; effacement global nommé explicitement. Couleurs et contrôles Material 3 existants, texte explicite pour les résultats incertains. Aucun bouton de réinsertion automatique ni indication de réception confirmée.

- L’espace suivi utilise une barre tonale secondaire de 56 px dans le contenu, commune au panneau et à la page. Nom de projet abrégé sur une ligne, compteur distinct et nom accessible complet ; le compteur sert de description accessible. Un clic ouvre les tâches de cet espace, déplie leur bloc et y place le focus. Le choix ne déduit aucune association à partir du site ou du dossier courant. Choisir un autre suivi et arrêter passent par le dialogue existant. Aucune animation ni nouveau volet ; couleurs sémantiques clair/sombre et focus existants. Les résumés natifs font partie du parcours de focus piégé du dialogue.

- Les tâches restent sous un bloc natif « Tâches (cochées/total) », replié dans chaque espace enregistré. Cases avec libellés, compteur, champ et action d’ajout ; retrait par icône avec nom accessible. Les lignes et le bouton de retrait gardent une cible d’au moins 44 px ; libellés longs à la ligne, focus visible sur le résumé et contrôles natifs. Les couleurs, formes et états reprennent les rôles Material 3 existants. Aucun nouveau volet ni animation ; les cases indiquent un suivi personnel sans confirmer un dépôt web.

- **Préparer les images pour ce champ…** apparaît dans le bloc d’insertion existant lorsqu’il y a des images cochées et un champ choisi. Action secondaire tonale, désactivée avec une explication si aucun format de sortie n’est accepté. Le dialogue montre le site/champ ; formats compatibles dans la liste native, choix exclusif d’une image pour un champ simple. L’action principale **Insérer les copies dans ce champ** se situe après les résultats avec sa destination, le nombre de copies et l’effet de remplacement. Aucun nouvel écran ni style : surfaces, champs, boutons, focus et messages Material 3 existants.

- Le suivi des copies reste sous « Préparations récentes » dans le dialogue existant, replié au départ. Chaque entrée montre date, format, nombre et dossier avec les styles Material 3 existants ; deux actions explicites permettent de revérifier ou de retirer le suivi. Les états distinguent chemins retrouvés, résultat à vérifier et lancement non confirmé. Aucun résultat n’est collecté automatiquement ; une copie non compatible garde une explication et un bouton désactivé.

- L'insertion reste repliée dans Collecte. Une incompatibilité s'explique sous le champ choisi et désactive le bouton principal ; aucun fichier n'est décoché automatiquement. Le message utilise les styles et rôles de couleur existants, annonce ses changements sans voler le focus et reste dans le panneau à 320/390/1024 px. Les contrôles sur la collecte sont indicatifs ; présence et poids actuels sont revérifiés au clic avant de charger les contenus.

- Le rangement automatique reste dans l’éditeur de chaque règle, avec une case native décochée par défaut, un texte qui décrit le déplacement et un statut lisible « Confirmation manuelle / Automatique activé / En pause ». Modifier une règle demande de confirmer à nouveau l’option ; le suivi replié montre les blocages sans fenêtre surgissante.

- Survol discret, état sélectionné tonal et contour de focus visible. Clavier, souris, sélection Ctrl/Maj, menus contextuels, glisser-déposer et palette de commandes restent des parcours de premier ordre.
- Les transitions courtes utilisent la courbe standard Material ; elles se désactivent si le système demande moins d'animation.
- La collecte ne masque pas le dossier de travail et permet de réunir des références de plusieurs dossiers ou pages web. Aucun contenu fictif n'occupe l'espace utile.

Voir [AUDIT_UI_UX.md](AUDIT_UI_UX.md) pour les constats, les limites et les sources officielles.
