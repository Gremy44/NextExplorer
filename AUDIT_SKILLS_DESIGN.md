# Premier essai des skills design gratuits

7 novembre 2026 · branche `design/impeccable-audit` · base `583726df3f80a54854792398d47e5473b259e495`.

## Installation vérifiée

- **Impeccable 4.8.0**, dépôt `pbakaus/impeccable`, commit `687bc381bc9091bf252c0a05303640561014a425`, licence Apache 2.0. Skill global : `~/.codex/skills/impeccable`.
- Moteur Windows **0.1.18** téléchargé par le lanceur ; SHA256 comparé au manifeste livré avec le skill : `8f61e96b0c97001546a824d79b44f46b423b560f3eb1a0cc44a8695a1b395d9f`.
- **Web Design Guidelines**, dépôt `vercel-labs/agent-skills`, skill global : `~/.codex/skills/web-design-guidelines`. Empreinte du SKILL.md installé : `f4647ca866a3accf763777f83e7682954f0187cd6bea7eea0399796652414e8f`.
- Installation avec le helper `skill-installer` sous Python 3.11. Pour Impeccable, transport Git utilisé après échec de validation TLS de Python ; aucune vérification TLS désactivée.

Les skills seront proposés automatiquement au prochain tour. Ils ont été lus et appliqués explicitement pour cet essai. Aucun hook automatique ni mode Live installé ; UI UX Pro Max n'est pas installé, le duo recommandé suffit à cet essai.

Sources : [Impeccable](https://github.com/pbakaus/impeccable), [skill Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), [règles utilisées](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Essais effectués

1. `impeccable context --target src/App.tsx` : contexte existant chargé. Le moteur constate l'absence de PRODUCT.md et reconnaît l'interface existante ; cela permet cet audit ciblé sans lancer une refonte ni un questionnaire.
2. Détecteur statique sur tout `src` : terminé en 477 ms par appel direct du moteur, code 2, **un avertissement**. Rapport : `test-results/impeccable-source-direct.json`. Passage ciblé réglages/CSS : code 0, aucune alerte mécanique.
3. `node scripts/browser-test.mjs --ui-consistency-only` : **réussi**, code 0. Actions contextuelles, renommage, sélection mixte, recherche des réglages, infobulles, clavier, palette déconnectée, thèmes, densités, texte 85/150 %, menus/réglages à 320/390/900/1440 px et réglages du panneau à 320×320/390×600/600×960. Journal : `test-results/impeccable-ui-test.log`.
4. Inspection des nouvelles captures : réglages sombres à 390 px compact/85 %, à 1440 px confortable/150 %, panneau à 320×320. Analyse du code des réglages, des styles et des gardes de brouillons avec les règles Vercel.

Le premier scan global via le lanceur `.cmd` et redirection PowerShell n'a pas rendu la main ; seul son processus Impeccable a été arrêté. L'appel direct du même moteur, borné à 30 secondes, a réussi. Sous ce shell, privilégier l'appel direct pour les scans JSON. Le chargement de contexte via `.cmd` avait réussi.

## Constats vérifiés

### P1 — Les réglages sont presque inutilisables à très faible hauteur

`src/ergonomics.css:204`, `:219`, `:378` — À **320×320**, l'en-tête, la recherche, les catégories et le pied de fenêtre laissent seulement une mince bande au contenu. Capture : `test-results/v1-ui-panel-browser-320x320.png`. Le bouton Enregistrer reste visible mais les réglages eux-mêmes ne le sont presque plus.

Le test existant vérifie le débordement horizontal et le bouton d'enregistrement ; il ne garantit pas une hauteur utile du contenu (`scripts/ui-consistency-journey.mjs:307`). Il passe donc malgré le défaut visuel.

Suite proposée : `$impeccable adapt` sur les réglages. Prévoir une disposition de faible hauteur, puis vérifier qu'un champ reste réellement consultable et modifiable, au clavier aussi. Ne pas seulement diminuer encore les textes.

### P2 — Le système de design décrit un ancien parcours

`DESIGN.md:1` et section « Système visuel » — Le document est centré sur Material 3 et décrit une confirmation des actions destructrices/ambiguës, alors que les styles de l'aperçu Fluent et le parcours corbeille sans confirmation ont évolué. La suppression locale récupérable et les protections des opérations distantes doivent être distinguées.

Suite proposée : `$impeccable document`, en s'appuyant sur les styles et parcours actuels. Conserver les choix de l'utilisateur : densité réglable, traits fins, navigation compacte, corbeille directe et outils secondaires discrets.

### P2 — Défilement des réglages sans confinement explicite

`src/ergonomics.css:252`, `:271` — Les zones des catégories et du contenu utilisent `overflow`, sans `overscroll-behavior: contain`. Vercel recommande de contenir le défilement des fenêtres superposées. Risque de chaînage à examiner avec une page arrière réellement défilable ; aucun défilement parasite n'est affirmé comme reproduit ici.

### Avertissement du détecteur écarté — Police « trop utilisée »

`src/style.css:5` — L'outil signale Roboto. C'est une recommandation esthétique, pas un défaut d'accessibilité. De plus, `src/desktop.css:3` remplace cette famille par Segoe UI Variable/Segoe UI dans le thème de bureau actuel. **Ne pas changer la police sur la seule base de cette alerte.**

## Ce qui tient déjà

- Réglages par sections, choix de densité et taille des textes, actions persistantes et recherche sans accents.
- Focus visible global et focus du filtre reporté sur son conteneur : `outline: none` y possède un remplacement ; ce n'est pas un défaut à corriger aveuglément.
- Couleurs sémantiques clair/sombre, listes de fichiers virtualisées, animations réduites selon la préférence système.
- Messages de réussite/erreur des réglages avec `role=status`/`role=alert`, garde de fermeture pour les brouillons.
- Les règles génériques de confirmation ne doivent pas réintroduire une validation avant la corbeille locale : récupération existante et demande explicite de l'utilisateur priment.

## Portée et prochaine passe

Il s'agit d'un **essai ciblé**, pas d'une certification WCAG ni d'un audit complet de tous les outils. Pas de score global sur 20 : contraste rendu, lecteur d'écran, performances sous charge et gestes tactiles n'ont pas été mesurés dans cette passe. Le détecteur statique ne valide pas ces dimensions.

Ordre conseillé : `adapt` sur la faible hauteur → `document` sur les règles réellement appliquées → `polish` sur le périmètre corrigé. Rejouer ensuite l'audit et la recette UI, avec un contrôle de la hauteur utile.

Ce lot ne modifie ni le visuel ni les fonctionnalités du pilote : seul ce rapport est ajouté sur la branche design. Aucun EXE reconstruit, aucune publication ou modification des fichiers 1.0.7. Les captures et journaux restent dans `test-results`, hors distribution publique.
