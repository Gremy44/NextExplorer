# Protection du travail — V1 gratuite

## Brouillons de l’éditeur texte

Dans l’aperçu ou la fenêtre d’édition, chaque saisie non enregistrée conserve immédiatement un brouillon dans le stockage local de l’extension (`localStorage`). Aucun envoi réseau, synchronisation Chrome ou écriture dans le fichier original. Cette conservation remplace le brouillon qui ne vivait que dans la mémoire de la page.

Après fermeture d’un onglet ou rechargement, le bouton **Brouillons à récupérer** apparaît dans la barre supérieure. Il liste nom, chemin et date et permet de :

- **Reprendre** : ouvrir le texte avec son empreinte et ses métadonnées d’origine. Le fichier n’est pas relu pour remplacer le brouillon.
- **Télécharger** : récupérer le texte exact dans un fichier distinct, y compris lorsque le compagnon est absent ou le fichier source a disparu. Le navigateur choisit le dossier de téléchargement selon ses réglages.
- **Supprimer le brouillon** : abandon explicite confirmé ; le fichier original reste intact.

Revenir à un fichier puis **Reprendre le brouillon** fonctionne aussi dans l’aperçu. **Enregistrer / Ctrl+S** modifie le fichier seulement après les contrôles existants du compagnon. Un changement externe, même de taille et date identiques, refuse l’écriture grâce à l’empreinte du contenu. Le brouillon reste récupérable et téléchargeable. **Recharger depuis le disque** demande de confirmer l’abandon, puis ne retire le brouillon qu’après une lecture réussie.

Deux fenêtres qui modifient le même fichier conservent des variantes séparées. Enregistrer ou abandonner l’une ne supprime pas l’autre. Les copies durables ne sont jamais évincées automatiquement pour faire de la place.

### Limites et confidentialité

- Éditeur existant : fichiers texte UTF-8 de **128 Kio** maximum ; BOM UTF-8 et fins de ligne CRLF conservés à l’enregistrement. Une saisie trop volumineuse en octets est refusée par le compagnon sans modifier le fichier et reste téléchargeable.
- Récupération locale : **20 brouillons**, budget de **3 Mio** de chaînes JSON stockées, en comptant deux octets par caractère ; chaque brouillon contient le texte de départ, son empreinte et le texte modifié. Le quota réel du navigateur peut être atteint avant ce plafond.
- Échec de stockage : alerte visible **« uniquement dans cette page »**, saisie maintenue en mémoire, téléchargement disponible. Ne pas fermer la page dans ce cas. Une nouvelle modification retente la sauvegarde locale. Cette alerte reste visible après changement de sélection.
- Le texte local peut être sensible : il est conservé dans le profil du navigateur, sans chiffrement applicatif, jusqu’à l’enregistrement, l’abandon ou la suppression explicite. Aucun de ces brouillons n’est inclus dans les exports de session. Il ne s’agit pas d’une sauvegarde indépendante du profil : suppression de l’extension, effacement des données, autre navigateur/profil ou changement d’identité de l’extension ne garantissent pas sa récupération. Aucun engagement de récupération après panne électrique ou corruption du profil.
- Ce lot protège les brouillons **texte**. Les annotations de l’atelier et les dialogues de conversion ne deviennent pas des brouillons persistants.

## Versions et corbeille

Une modification texte conserve la version précédente avant de toucher au fichier. Si le stockage des versions est plein ou indisponible, l’enregistrement est refusé. Les limites existantes restent **20 versions par chemin, 16 Mio par version, 256 Mio au total**.

Dans **Versions**, **Restaurer une copie** crée un fichier voisin avec un nom disponible. Le fichier courant et les copies déjà présentes restent intacts. Le contrôle d’empreinte refuse une sauvegarde de version endommagée. Les versions restent retrouvables par chemin après redémarrage du compagnon, y compris si l’original a disparu.

La **Corbeille NextExplorer** restaure au chemin d’origine et refuse de remplacer un fichier déjà présent. L’échec laisse l’élément dans l’historique pour une nouvelle tentative après résolution du conflit. Pendant la restauration, les boutons sont désactivés ; la suppression du registre d’historique est sérialisée entre les vues avec le mécanisme existant de stockage.

## Qualification

- Tests unitaires : persistance exacte et texte vide, réouverture, empreinte, variantes de fenêtres, abandon d’une ancienne révision, quota/inaccessibilité, plafond sans éviction, budget et enregistrements corrompus.
- Parcours Chrome avec compagnon réel : fermeture/réouverture de page, téléchargement exact Unicode, conflit externe même taille/date, relecture explicite, BOM/CRLF, restauration de version sans écrasement, deux fenêtres, fichier source supprimé, simulation de quota et récupération à 320/390/1440 px.
- Régressions de l’éditeur/aperçu et de la corbeille : enregistrer, versions, conflit, sélection multiple, restauration après rechargement et collision.
- Suite Go : historique, empreinte malgré date/taille conservées, quotas, verrou exclusif, copie restaurée après réouverture du stockage, original supprimé, collisions et refus des versions corrompues.

Les preuves détaillées et captures restent dans `test-results`, hors du dépôt distribué. Les essais de fermeture sont des fermetures de pages ; ils ne simulent pas un arrêt électrique.

Validation finale : **288 tests unitaires / 48 fichiers**, suite Go complète, build de production, parcours de l’extension compilée sous Native Messaging et régressions éditeur/corbeille réussis. Paquet local actualisé ; compagnon du point 2 inchangé et suffisant, Setup non reconstruit.
