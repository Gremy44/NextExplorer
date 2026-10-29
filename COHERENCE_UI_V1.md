# Cohérence de l’interface — point 5 de la V1 gratuite

Passe du 29 octobre 2026 sur la direction visuelle existante : surfaces sombres/claires, traits fins, panneaux réglables, densité compacte et textes indépendants. Aucun changement de thème imposé, aucune nouvelle bibliothèque et aucun moteur ajouté.

## Corrections livrées

- [x] **Actions rapides contextuelles** : masquées dans le clic droit pour les sélections incompatibles, par exemple texte seul, dossier ou PDF + texte. Les outils adaptés restent proposés pour les images, vidéos et PDF compatibles.
- [x] **Conversion d’une sélection mixte** : l’accès de l’atelier suit celui de la barre de sélection ; il reste disponible si certains fichiers sont convertibles. Le convertisseur conserve ses exclusions explicites.
- [x] **Renommage** : « Renommer » ouvre le renommage simple pour une sélection ; « Renommer par lot » identifie le traitement de plusieurs éléments. Le renommage distant de la barre de sélection est proposé pour un seul élément SFTP ; FTP/FTPS ne le proposent pas.
- [x] **Réglages** : recherche sans accents, insensible à la casse, avec plusieurs mots dans un ordre libre. La section « Moteurs » et son titre « Moteurs facultatifs » distinguent ImageMagick/FFmpeg/etc. du compagnon Windows.
- [x] **Taille des textes** : les libellés, boutons, messages et réglages d’apparence de la console suivent la taille générale. La taille des caractères du terminal reste réglée séparément dans ses propres paramètres. Les petits textes du panneau distant suivent également la taille générale.
- [x] **Infobulles** : l’aide au clavier reste ouverte lorsque le focus fait défiler sa section ; faire défiler une aide longue ne la ferme plus. Échap ferme l’aide. Avec les infobulles désactivées, les boutons à icône gardent leur nom accessible, mis à jour lorsque leur action change. Les outils désactivés gardent une description accessible de leur prérequis.
- [x] **Palette hors ligne** : Entrée respecte les actions désactivées, comme le clic ; les réglages restent accessibles sans compagnon. Son champ de recherche a un libellé accessible explicite.

## Disposition et navigation vérifiées

- [x] Fenêtre principale : thèmes clair/sombre ; densités compacte/confortable ; textes à 85 % et 150 % ; largeurs 320, 390, 900 et 1 440 px. Réglages et menus sans débordement horizontal, enregistrement visible, dernière action de menu accessible au clavier.
- [x] Vue panneau latéral de l’extension : réglages à 320×320, 390×600 et 600×960 px ; bouton Enregistrer visible et fermeture accessible. Cette recette ouvre l’URL du panneau dans une page isolée ; le conteneur natif est couvert séparément par la recette de disposition existante.
- [x] Clic droit : icônes, groupes et séparateurs, sélection multiple conservée, copie, Shift+F10, flèches, Début/Fin, Échap et Tab ; dossier, fichier et tailles 320/390/1024 px.
- [x] Réglages et ergonomie existants : sections, tailles indépendantes et persistantes, aides activables, navigation redimensionnable et repliable, onglets glissés, activité redimensionnable, filtres repliés sans ligne vide, indicateurs de filtres et navigation entre panneaux.
- [x] Console réelle : thèmes dont Ubuntu/LCD, trois polices locales, taille/interligne sans redémarrer la session, préférences après rechargement, clavier, suivi du dossier, chemins Unicode/apostrophe, épinglage, Ctrl+C et relance.
- [x] Interface distante : activation facultative, sélection et console SSH explicite, affichage compact ; réseau simulé pour cette recette, sans nouvelle qualification d’un serveur externe.

## Qualification et reproduction

**292 tests unitaires dans 49 fichiers**, compilation et parcours dans l’extension compilée sous Native Messaging réussis. La recette de cohérence tourne aussi contre le serveur local avec le vrai compagnon ; la palette déconnectée est vérifiée dans un contexte navigateur séparé. Les captures et preuves restent dans `test-results`, hors du paquet distribué.

```powershell
npm run check
npm run build
node scripts/browser-test.mjs --ui-consistency-only
node scripts/console-extension-test.mjs --ui
node scripts/browser-test.mjs --context-menu-only
node scripts/browser-test.mjs --ergonomics-only
node scripts/browser-test.mjs --layout-only
node scripts/browser-test.mjs --console-only
node scripts/browser-test.mjs --remote-only
```

Les recettes de vraie extension utilisant l’enregistrement Native Messaging de Chromium se lancent successivement, comme pour le [point 4](PARCOURS_V1.md). Les fixtures restent isolées ; aucune commande saisie dans le terminal utilisateur et aucun processus utilisateur arrêté.

## Limites de cette clôture

Les essais couvrent les parcours et configurations ci-dessus, sans prétendre valider chaque combinaison de préférences, tous les lecteurs d’écran ou toutes les variantes de fichiers. Les cases de **recette utilisateur** de [la checklist d’ergonomie](AMELIORATIONS_ERGONOMIE.md) restent réservées à vos retours.

Le compagnon installé suffit et les sources Go n’ont pas changé dans ce lot. Le Setup n’a pas été reconstruit et aucune publication n’a été effectuée. Les cinq points de consolidation sont terminés ; restent la préparation de la distribution finale, la recette du nouveau paquet sur Windows neuf et le pilote utilisateur. Les limites des aperçus, brouillons, opérations distantes et sites web restent celles de leurs guides.
