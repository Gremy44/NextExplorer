# J4 — organisation et recherche locales

Prototype validé localement, 17 octobre 2026 : compilation, 176 tests TypeScript, suite Go et recette J4 avec le compagnon réussis. Aucun modèle d’IA, compte ou service distant ajouté.

**Complément V1 gratuite — 28 octobre 2026 :** recherche élargie, résultats paginés, fragments de noms et contenus sans accents, filtrage et TF-IDF en worker, contrôles de fraîcheur natifs par lots. La recherche reste locale et n’indexe que le dossier choisi. Aucun Setup reconstruit.

## Retrouver un fichier par son contenu

1. Dans l’explorateur, ouvrez **Recherche locale**, ou la commande **Rechercher dans mes fichiers et espaces** (`Ctrl+Maj+F` par défaut).
2. Dans le panneau, utilisez la même commande depuis **Options → Rechercher dans mes fichiers…** ou la palette `Ctrl+K`.
3. Vérifiez **Dossier à indexer**, ou utilisez **Choisir un dossier**. **Contenu des documents** peut être décoché pour une recherche rapide des noms sans lecture du contenu ni des provenances. Les fichiers cachés sont exclus par défaut, avec inclusion explicite possible. Cliquez sur **Indexer ce dossier** ; les sous-dossiers sont inclus dans les limites ci-dessous. Aucun disque entier n’est indexé sans ce choix.
4. Saisissez des mots ou fragments du nom, du contenu ou de l’origine déclarée. Tous les fragments séparés par des espaces sont requis ; casse et accents sont ignorés. Extensions et noms composés sont recherchables, y compris un caractère seul. Les jokers et expressions régulières ne sont pas interprétés ; ce n’est pas une recherche par sens.
5. Affinez avec le format, un tag ou des mots-clés du contenu. **Règles de mots-clés enregistrées** permet de nommer et réutiliser ces derniers ; une règle filtre, sans déplacer de fichier.
6. **Vocabulaire proche** compare les textes par TF-IDF/cosinus. Le score exprime un vocabulaire commun, sans garantir un sujet identique, une copie ou une filiation.

Les fichiers locaux, liens/captures web et espaces sont présentés séparément. H10 recherche dans les liens collectés et les références des espaces enregistrés, sans parcourir l’historique de navigation ni visiter les pages. Les fichiers de captures TXT sont recherchables dans le dossier indexé. Les titres et sites des provenances voisines contrôlées complètent les noms/contenus pour 20 fichiers maximum.

### Formats et limites

| Périmètre | Limite actuelle |
| --- | --- |
| Index local | Un dossier conservé dans IndexedDB ; 50 000 entrées parcourues, 5 000 dossiers, profondeur 64 ; 32 Mio de métadonnées de références. Liens symboliques et fichiers `.source.json` voisins ignorés ; cachés au choix. |
| Texte | Formats texte reconnus par l’aperçu, ainsi que les liens `.weblink` ; 16 Kio lus, 1 000 lignes, 8 192 caractères conservés par fichier ; 16 777 216 caractères cumulés. Le budget atteint n’empêche pas la suite du parcours des noms. Les binaires renommés en texte sont refusés. |
| PDF | Connecteur natif `pdftotext` optionnel : PDF régulier avec signature valide, 8 Mio, 10 premières pages, 8 secondes et sortie bornée ; aucun rendu d’image. Moteur absent du paquet actuel : nom uniquement. Extraction PDF réelle non validée sur ce poste. |
| Origine web | Réutilise le contrôle C1 : 20 fichiers et JSON voisins réguliers de 64 Kio maximum ; nom/taille/stabilité contrôlés, URL épurée. Métadonnées déclaratives, sans authenticité prouvée. |
| Résultats | 100 fichiers par page, tous les résultats locaux accessibles par Précédent/Suivant. Recherche et TF-IDF dans un worker, réponses aux anciennes requêtes ignorées. 50 règles de mots-clés au maximum. |
| Images / scans | Nom, format et tags seulement. Aucun décodage TIFF, OCR, classement d’image ou recherche visuelle. |

La [documentation du moteur PDF](https://github.com/davidben/poppler/blob/master/utils/pdftotext.1) décrit ses options d’extraction. Aucun téléchargement de moteur n’est déclenché par cette interface.

### Actualisation et effacement

Pendant l’ouverture, les notifications du compagnon invalident les résultats puis relancent l’analyse. Un contrôle des métadonnées des dossiers/fichiers toutes les 15 secondes détecte aussi les changements hors des dossiers surveillés. Le compagnon fournit une date de modification précise pour détecter les écritures de même taille dans la même seconde ; cette date reste une métadonnée, sans preuve cryptographique du contenu.

À la réouverture dans le même dossier avec les options de contenu/cachés par défaut, l’index récent conservé est revalidé sans relire ses documents. Les anciens caches restent chargeables mais demandent une reconstruction. **Actualiser l’index** reconstruit le périmètre et répercute ajouts, modifications et suppressions ; les résultats périmés sont masqués. Les fichiers sont encore contrôlés avant ouverture, y compris leur date précise. Le nouveau compagnon regroupe les contrôles par lots de 100 références au maximum et les requêtes de l’interface restent sous 128 Kio environ ; l’ancien compagnon utilise les contrôles individuels.

Les listes de noms sont capturées avant les extractions lentes de documents, pour éviter de laisser expirer les instantanés de pagination pendant ces extractions. Le compagnon à jour accepte jusqu’à 50 000 entrées et 32 Mio de métadonnées par liste de recherche ; son parcours natif reste borné à 200 000 noms examinés par dossier. Les listes de navigation gardent leur limite distincte de 10 000 entrées / 8 Mio. Une ancienne version du compagnon garde également cette limite en recherche.

**Parcours terminé** désigne la couverture des noms fournis dans le périmètre. Le nombre d’extraits est affiché séparément ; un texte non extrait ou tronqué n’est pas intégralement couvert. **Parcours partiel** signale une limite d’entrées, de dossiers, de profondeur, de métadonnées ou de liste native, ainsi que les sous-dossiers inaccessibles. Les motifs et jusqu’à vingt chemins concernés sont consultables dans **Périmètre et limites**. Les éléments omis ne sont pas comptés comme absents : le contenu des sous-dossiers non explorés n’est pas dénombré.

**Arrêter l’indexation** bloque les lectures suivantes et ignore les réponses tardives. Une extraction PDF native déjà lancée peut finir pendant ses 8 secondes maximum. Fermer le dialogue arrête également l’analyse ; aucune tâche d’indexation autonome n’est créée. **Effacer l’index** supprime les extraits locaux ; les analyses déjà en cours dans les autres vues ne peuvent pas rétablir le cache supprimé, grâce au contrôle de révision à l’écriture.

## Tags

Sélectionnez un ou plusieurs éléments, puis **Tags** dans la barre de sélection, **Tags de la sélection** dans les filtres ou **Gérer les tags** dans la palette.

- Créez un nom et choisissez une couleur, puis **Ajouter à la sélection**. Plusieurs tags sont possibles sur le même chemin. **Retirer de la sélection** ne retire que cette association.
- Les tags apparaissent dans la navigation latérale, les fichiers et la recherche. Le filtre du dossier et le tri par tags utilisent les mêmes associations.
- **Supprimer le tag** enlève ses associations sans toucher aux fichiers.
- 32 tags, 2 000 chemins associés, jusqu’à 1 000 éléments par ajout/retrait. Les métadonnées de la sélection sont vérifiées avant attribution.
- Les notifications du compagnon font suivre les associations après les renommages, renommages par lots et déplacements réussis dans NextExplorer, y compris depuis son arrière-plan. Les copies n’héritent pas automatiquement des tags. Les changements externes, opérations au résultat incertain et anciens journaux ne sont pas réconciliés par déduction.

Les tags restent dans le profil ; ils ne sont pas écrits dans les fichiers et ne font pas partie des exports d’espaces. Les familles manuelles C1 ont leur propre stockage et conservent leurs limites antérieures.

## Affichage, navigation et accueil

Dans **Réglages et moteurs**, les préférences permettent de choisir :

- Thème système, clair ou sombre ; couleur principale bleue, verte ou violette.
- Extensions, miniatures, éléments cachés/système, clic simple, cases de sélection et sélection au survol après 600 ms.
- Dossiers en premier ou tri mélangé, unités binaires/décimales dans les listes, affichage par défaut et mémorisation du tri/affichage par dossier (200 dossiers).
- Colonnes Date, Taille, Type et Tags en mode Détails, avec largeurs Date/Taille réglables. Les colonnes secondaires se masquent dans les panneaux étroits.
- Démarrage avec reprise des onglets, accueil ou jusqu’à 10 dossiers choisis ; activation des nouveaux onglets.
- Sections de l’accueil : favoris, lecteurs, dossiers récents et tags. **Accueil** est disponible dans la navigation ou la palette ; un lecteur indisponible produit une erreur sans bloquer les autres emplacements.

L’affichage **Colonnes de dossiers** ajoute une navigation sur les trois derniers niveaux du chemin, avec 200 entrées maximum par colonne ; les fichiers restent dans la liste principale. Il complète les huit affichages précédents. La navigation et les préférences sont disponibles dans le panneau et l’explorateur.

**Actions des onglets** permet de dupliquer, déplacer à gauche/droite et rouvrir un onglet fermé. `Ctrl+Maj+T` rouvre l’un des dix derniers onglets fermés pendant cette session. Chemins, sélection (revalidée sur la nouvelle liste) et positions de défilement sont conservés lors de la reprise normale.

### Tailles et grands dossiers

Dans **Filtres et organisation → Calculer les tailles des dossiers**, le calcul natif existant remonte ses éléments traités dans l’activité et peut être annulé. Une fois terminé, les totaux disponibles alimentent les listes et leur tri par taille. Un résultat partiel affiche `≥` ; une taille inconnue reste `—`, après les tailles connues au tri. Les changements de fichiers invalident ces totaux. Le calcul ne lit pas le contenu des fichiers ; 500 totaux d’enfants maximum sont fournis par le moteur d’analyse actuel.

Les listes natives de navigation sont lues par lots de 256 noms : 10 000 résultats, environ 8 Mio de métadonnées ou 200 000 noms parcourus maximum. Un avertissement **Liste partielle** demande d’affiner le filtre par nom. Un résultat omis n’est pas assimilé à un fichier absent. L’interface reste virtualisée ; l’index possède son plafond distinct de 50 000 entrées et sa pagination de résultats.

## Raccourcis, menus et export

**Raccourcis clavier** permet de réattribuer les actions du registre commun et de rétablir les valeurs initiales. Appuyez dans un champ sur la combinaison voulue ; Retour arrière l’efface. Les collisions et combinaisons réservées au navigateur sont refusées. Les actions masquées dans les menus restent dans la palette ; les actions sans raccourci peuvent y être exécutées.

**Exporter / importer les préférences et tags** produit un JSON contenant réglages, tags, chemins associés, vues par dossier et règles de mots-clés. Il exclut les extraits de l’index, fichiers, familles C1, espaces et autorisations d’automatisation. Import de 1 Mio maximum, schémas/plafonds contrôlés puis remplacement explicite après aperçu. Les exports contiennent des chemins locaux : choisissez où les conserver.

## Validation et suite

Les preuves sont consignées dans [RECETTE_HYBRIDE.md](RECETTE_HYBRIDE.md#complément-j4--organisation-et-recherche). Les tests portent sur un corpus synthétique local, pas sur tous les formats ou dossiers personnels. J1.7 sur Windows propre reste ouvert. La suite du socle est **J5/C2**, puis la recette de distribution **J7** ; A0/A1 viennent après le socle gratuit.
