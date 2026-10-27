# Refonte visuelle — aperçu local

Référence : [Windows File Explorer Redesign, Josh Corbett](https://dribbble.com/shots/15838107-Windows-File-Explorer-Redesign-Dark-Mode).
Adaptation à NextExplorer, sans réutiliser les images de la référence.

## Point de retour

L’état complet avant refonte est enregistré dans le commit `a65628b`, tag
**`visual-safe-1.0.3`**. Le travail visuel se fait sur **`design/fluent-preview`**.
La release 1.0.3 et le candidat envoyé au Store restent les versions distribuées.
Ces aperçus sont locaux jusqu’au choix du propriétaire.

Pour consulter l’ancien code sans toucher au travail courant :
`git worktree add ../NextExplorer-visual-safe visual-safe-1.0.3`.
Pour revenir entièrement à cet état dans le dossier courant, enregistrer d’abord
le travail en cours, puis `git switch --detach visual-safe-1.0.3`.

## Direction retenue

- Graphite `#252728`, navigation `#202223`, surfaces élevées `#303335`.
- Texte `#eceeef`, secondaire `#afb6ba`, accent bleu `#79b8e8`.
- Segoe UI / police système, titres 20 px, texte 14 px, informations 12 px.
- Coins 6–12 px, séparateurs discrets, bleu réservé à la sélection et aux actions
  importantes, icônes de dossiers ambrées. Pas d’image de fond derrière les fichiers.
- Même vocabulaire dans la vue complète, le panneau et tous les dialogues.
  Les thèmes clair/système et les préférences d’accent restent disponibles.
- Verre dépoli sur le volet droit, les dialogues et les menus : transparence
  modérée, flou de fond et reflet de bord. Fond opaque si le système demande
  une transparence réduite ou des couleurs forcées.

Disposition :

```text
Marque                  Recherche / commandes          Réglages
Navigation              Onglets de dossiers
  Accès rapide          Chemin et commandes             Aperçu
  Emplacements          Liste / icônes                  Métadonnées
  Tags                  Fichiers                       Console
  Outils
                        État / activité
```

La référence privilégie une interface calme. Les fonctions de NextExplorer
restent accessibles ; on réduit les fonds colorés, les gros arrondis et les
informations répétées. Les listes virtualisées gardent leurs dimensions de ligne.

## Ajustements du parcours

- Les tags rejoignent une section dédiée après les emplacements.
- L’épinglage de liens reste près du titre du dossier ; aucune ligne vide de liens.
- Le bouton Nouveau dossier devient explicite sur grand écran.
- Dans le panneau, les fichiers précèdent l’organisation du dossier.
- Les fenêtres gardent un titre, un contenu défilant et un pied d’actions visible.
- Les réglages d’apparence utilisent deux colonnes sur grand écran, une sur petit écran.

## Panneau latéral — retour natif en 1.0.6

L’API [sidePanel de Chrome](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
place le panneau à côté du site ; son fond ne peut pas laisser apparaître la page
comme si les deux occupaient la même surface.

Après le blocage signalé avec l’iframe 1.0.5, le clic sur l’icône rétablit le
panneau natif comme `Alt+E`. Sa hauteur suit la fenêtre, y compris sous 440 px.
La superposition et les ressources accessibles aux sites sont retirées ; les
surfaces verre restent dans l’interface. Le panneau ne floute donc pas le site.

## Aperçus et vérification

Galerie locale : `release/visual-preview/index.html`.
Trois vues principales sont produites depuis les composants réels et des fichiers
synthétiques : explorateur, panneau latéral et dialogue. Captures complémentaires
pour les réglages, le thème clair, les petites largeurs, le double panneau et le
concept flottant. Cette dernière capture reste une maquette ; la version 1.0.6
utilise le panneau natif.

Régénération : `node scripts/browser-test.mjs --visual-only`.
Les captures initiales sont dans `release/visual-preview/before/` ; ne pas utiliser
`--baseline` sur le nouveau code pour les remplacer. Pour les régénérer, lancer
le parcours sur un checkout de la version sauvegardée.

Le parcours vérifie le chargement réel des fichiers et métadonnées via le compagnon
de test, l’ouverture/fermeture des dialogues, l’accès à l’épinglage, l’absence de
ligne de liens vide, l’absence de débordement global et la position du bouton
Agrandir à 320 et 760 px. Captures explorateur à 390, 1024 et 1600 px,
panneau à 320, 420 et 760 px. Les captures restent locales et peuvent contenir
le chemin de l’espace de test et les capacités des disques.

Validation du 20 octobre 2026 :

- `npm run check` : typage et 240 tests réussis (40 fichiers).
- `npm run build` : compilation de production réussie ; avertissement existant
  de taille des bundles, sans ajout de dépendance.
- `node scripts/browser-test.mjs` : parcours complet réussi, notamment affichages,
  tris, clavier, aperçu, panneau, clic droit, copie/déplacement/annulation et
  regroupements ; aucune erreur JavaScript collectée.
- `node scripts/browser-test.mjs --visual-only` : 15 captures finales, contrôle
  responsive et dialogues réussi ; galerie générée.
- Relecture visuelle : explorateur sombre/clair, double panneau, panneau 320/420 px,
  sélecteur étroit, création de dossier, réglages et concept flottant.

Preuves dans `test-results/visual-{check,build,regression,preview}.log`.
La tentative de panneau flottant 1.0.5 est retirée en 1.0.6. La maquette de
galerie reste une capture ; le runtime revient au panneau natif.
