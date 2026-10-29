# Parcours principaux — recette V1 gratuite

Objectif du point 4 : vérifier les opérations courantes sur des fichiers temporaires réels, depuis l’interface actuelle, avant la dernière passe de cohérence visuelle. Les fixtures et les captures restent dans `test-results`, hors du dépôt distribué. Les connexions distantes restent dans leur qualification distincte.

## Déplacer et dupliquer

Dans le double panneau, déposer un fichier sur l’autre panneau ou sur un sous-dossier, puis choisir **Déplacer** ou **Dupliquer** au curseur. Le choix lance une seule opération. Échap, Tab ou un clic ailleurs annulent sans toucher aux fichiers. Les sélections multiples sont conservées et les collisions créent un nom numéroté, sans remplacer le fichier existant.

Recette `runDropTransferJourney` : déplacements et copies réels, contenu exact, disparition de la source seulement pour le déplacement, destination imbriquée, collisions, clavier et bords à 320/390/1440 px. Un type MIME fabriqué à l’extérieur de l’application ne permet pas de contourner le dialogue des transferts externes.

## Corbeille et restauration

**Supprimer** au clic droit ou **Suppr** met directement les fichiers dans la corbeille NextExplorer. La restauration se fait depuis **Corbeille** et refuse d’écraser un fichier recréé au même endroit. Le conflit conserve l’entrée dans l’historique. La répétition de Suppr ne produit pas de mise à la corbeille supplémentaire.

Recette `runTrashJourney` : clic droit, sélection multiple, répétition de touche, absence de confirmation intermédiaire, fichier de destination occupé conservé, nouvelle tentative après résolution du conflit et restauration exacte depuis l’historique après rechargement.

## Conversion et atelier

Le convertisseur accepte les images matricielles et les vidéos. Il sépare les deux lots et exclut les documents et fichiers audio seuls. Réglages et préréglages suivent le type : qualité pour les images avec perte, codecs compatibles pour le format vidéo, mode de changement de conteneur. Les exports sont des copies ; les originaux restent intacts.

Recettes `runQuickActionJourney` et `runConverterJourney` : rotation réelle et dimensions contrôlées, annotation conservée entre outils, création de PDF dans l’ordre du glisser-déposer, extrait média, WebP et WebM réels, codecs et dimensions contrôlés avec FFprobe, absence d’agrandissement, exclusions, thèmes et petits écrans. La recette de conversion suit l’identifiant de la nouvelle tâche pour éviter de confondre son résultat avec une conversion antérieure déjà présente dans l’Activité.

## Organisation locale

La recette J4 existante vérifie recherche locale, règles par mots-clés, suivi des fichiers ajoutés/modifiés/supprimés, tags après renommage/déplacement, préférences partagées entre vues, export/import, colonnes et accueil. Le contenu du gros TIFF témoin reste intact et n’est pas lu pour l’index textuel.

Le corpus synthétique de ce lot contient **1 003 fichiers, tous indexés**. Le compteur de réactivité reste actif pendant le traitement. Cette mesure locale n’est pas une promesse de performance sur tous les disques.

Le rangement manuel et automatique des téléchargements est vérifié séparément avec de vrais téléchargements Chrome. L’automatisme reste activé explicitement par règle, sans traiter les anciens téléchargements ; il fonctionne quand les vues de l’explorateur sont fermées. Pause, collisions, provenance et destination absente font partie de cette recette.

## Dépôt vers une page web

Depuis le vrai panneau latéral, glisser le nom d’un fichier vers une zone de dépôt. Le parcours utilise le Shell Windows et fournit un véritable fichier à Chrome : aucun passage par la collecte et aucune case à cocher.

`node scripts/test-file-drag.mjs` ouvre une fenêtre Chromium isolée avec la copie de l’extension compilée et le compagnon installé. Les gestes viennent de Windows, le site témoin est local, l’événement reçu est fiable (`isTrusted`) et contient `Files`. Annulation par Échap, texte exact, fichier témoin de 24 Mio nommé TIFF, trois dépôts successifs, sources conservées, collecte vide et absence de permission `debugger` sont contrôlés. Le TIFF de ce test est un volume de données pour le transfert ; la qualification du décodage TIFF est dans [APERCUS_V1.md](APERCUS_V1.md).

Les sites tiers gardent leurs propres contraintes d’acceptation et de téléversement. Cette recette ne garantit pas leur comportement. Ce geste reste Windows/souris, fichiers ordinaires ; dossiers, liens et glissement natif vers le web d’une sélection multiple ne sont pas proposés par cette interface.

## Relancer les contrôles

Depuis le dépôt avec les moteurs de test déjà présents :

```powershell
npm run check
npm run native:test
node scripts/browser-test.mjs --organization-only
node scripts/console-extension-test.mjs --workflows
node scripts/console-extension-test.mjs --filing
node scripts/test-file-drag.mjs
```

Lancer les recettes de vraie extension **successivement** : elles modifient temporairement l’enregistrement Native Messaging de Chromium et le rétablissent à la fin. L’enregistrement Chrome de l’utilisateur n’est pas modifié. La recette de glissement pilote une fenêtre temporaire visible et utilise le compagnon déjà installé.

Pour `--filing`, seule la copie isolée du manifeste reçoit la permission `downloads`, afin de simuler une acceptation de la permission facultative. Le manifeste distribué reste inchangé. Cette recette teste le rangement avec la permission accordée ; elle ne valide pas le clic dans l’invite native d’autorisation du navigateur.

## Résultat du 29 octobre 2026

**288 tests unitaires dans 48 fichiers**, suite Go complète et les recettes ciblées ci-dessus réussis. Le parcours d’organisation a indexé 1 003 fichiers, avec 257 événements UI durant 4 248 ms. Cette recette n’a pas nécessité de changement fonctionnel dans l’application : les corrections portent sur l’isolation des essais et le suivi de la bonne tâche de conversion. Paquet local actualisé, compagnon existant suffisant, aucun Setup reconstruit et aucune publication.
