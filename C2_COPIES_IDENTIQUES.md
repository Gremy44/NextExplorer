# C2 — retrouver les copies identiques

Premier lot C2 de J5, 17 octobre 2026. Détection locale par empreintes BLAKE3, sans IA ni moteur supplémentaire. Le mode distinct **Images similaires** est désormais décrit dans le [guide J5](J5_MEDIAS_TACHES.md) ; il exige ImageMagick et ne prouve pas un contenu identique.

## Utiliser le nouveau mode

1. Ouvrez **Regrouper les fichiers** depuis Outils, Options du panneau ou la palette `Ctrl+K`.
2. Choisissez **Copies identiques**, puis la sélection, le dossier courant ou les références de l’espace suivi.
3. Cliquez sur **Regrouper**. La comparaison ne démarre pas au simple changement de mode.
4. Dépliez les groupes pour voir les noms, chemins, tailles et empreintes. Le bouton de dossier revient à l’emplacement du fichier.

Un compagnon à jour est requis ; le choix est désactivé si sa capacité de lecture vérifiée manque. Réinstallez le paquet puis désactivez/réactivez l’extension pour renouveler sa connexion.

## Comprendre les résultats

- **Copies identiques** : fichiers de même taille dont l’empreinte BLAKE3 complète est identique. Noms et extensions peuvent être différents. Les fichiers vides sont inclus.
- **Sans copie identique trouvée** : tailles distinctes dans les références contrôlées, ou empreintes différentes. Cela ne dit rien sur les fichiers non comparés ou extérieurs au périmètre.
- **Non comparés** : référence absente/modifiée, limite atteinte ou échec de lecture. Un motif apparaît sous chaque fichier ; absence de résultat ne signifie pas absence de copie.

Le mode ne propose aucune suppression ni transfert. Les liens manuels et brouillons de règles existants restent des actions distinctes, choisies et confirmées. Une empreinte commune ne prouve ni l’auteur, ni la provenance, ni une relation source/export. Le résultat décrit l’instant de l’analyse, sans verrouiller les fichiers pour une action future.

## Limites et fichiers volumineux

| Contrôle | Périmètre |
| --- | --- |
| Source | Sans sous-dossiers, 1 000 premières entrées au maximum ; omissions annoncées. Dossier : filtre par nom ignoré, choix des cachés conservé. |
| Références | Jusqu’à 200 fichiers distincts contrôlés, quatre demandes de métadonnées simultanées ; dossiers, liens, adresses web et `.source.json` exclus. |
| Empreintes | Jusqu’à 100 candidats de tailles communes, un à la fois ; taille maximale 64 Mio par fichier et somme des tailles autorisées en nouvelle lecture limitée à 256 Mio. |
| Lecture native | Blocs de 32 Kio, empreinte sur tout le fichier, jamais sur un extrait ; contrôle de taille/date précise et de l’identité du fichier ouvert avant/après la lecture. Échéance native de 8 s, sans ouverture ou décodage d’image. |
| Cache | 100 empreintes au maximum, en mémoire dans le dialogue ; aucune image ou donnée de contenu conservée. Réutilisation après contrôle des métadonnées précises, pas de cache sur disque. |

Un TIFF admissible peut être comparé par ses octets sans être décodé. Deux images visuellement identiques réencodées peuvent avoir des empreintes différentes ; cette première livraison ne les rapproche pas. Les fichiers de tailles distinctes ne sont pas lus pour le calcul d’empreinte.

## Actualisation et arrêt

Les références sont contrôlées au début puis à la fin du lot. Les notifications du compagnon concernant le périmètre effacent le cache et les résultats concernés, avec invitation à relancer. Avant chaque réutilisation, taille, date et horodatage précis sont revérifiés ; une écriture de même taille dans la même seconde invalide l’empreinte si cet horodatage change.

Les résultats restent des instantanés. Sans notification d’un dossier externe, relancez pour constater ses changements. Une conservation volontaire des métadonnées ou une modification après le contrôle n’est pas détectée par déduction ; le cache n’est pas une preuve cryptographique de l’état présent du disque.

**Arrêter** ou fermer le dialogue bloque les demandes suivantes et ignore les réponses tardives. La lecture native déjà lancée peut encore finir pendant son échéance ; elle n’est pas réintroduite dans les résultats ni dans le cache après annulation. Fermer le dialogue écarte son cache. Aucune tâche durable, reprise automatique ou indexation autonome n’est créée par ce mode.

## Validation et suite

Les preuves sont consignées dans le [complément C2 de la recette](RECETTE_HYBRIDE.md#complément-j5--c2--copies-identiques). Les corpus sont synthétiques et isolés ; ils ne qualifient pas tous les dossiers personnels ou systèmes de fichiers.

Le complément J5 implémente le rapprochement visuel borné, les médias, les préréglages et les tâches durables. La prochaine étape est la qualification J7 du socle gratuit, avec la recette d’installation Windows propre J1.7 toujours ouverte avant bêta. L’IA locale vient ensuite.
