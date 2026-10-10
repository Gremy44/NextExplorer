# Guide d’installation et d’utilisation — NextExplorer

L'interface a fait l'objet d'un [audit UI/UX Material 3 et Googlebook](AUDIT_UI_UX.md). La [direction visuelle](DESIGN.md) décrit les choix actuels pour la page complète et le panneau Chrome.

Explorateur local pour Chrome : extension Manifest V3, panneau latéral et compagnon natif Go. Interface française, thèmes sombre et clair, aucun serveur HTTP nécessaire au fonctionnement de l’extension.

## Démarrer sous Windows

**Retrouver une insertion (J3 / H05) :** dans le panneau, ouvrez **Collecte → Insertions récentes** ; dans la vue complète, **Examiner la collecte → Insertions récentes**. Les 20 dernières tentatives arrivées à l’étape d’insertion indiquent date, site, champ et noms/tailles des pièces. Le suivi est local, partagé entre les vues et conservé au rechargement. **Insérée dans le champ** confirme le remplissage du champ seulement ; **Non insérée** signale un refus ou un arrêt connu avant remplissage ; **Résultat à vérifier sur le site** conserve une tentative non confirmée, sans relance automatique. Aucun contenu, chemin local ou adresse complète de page conservé : seulement l’origine du site. Les plus anciennes tentatives sortent du suivi après 20 entrées. Retrait individuel et effacement du suivi ne modifient ni les fichiers, ni la collecte, ni le formulaire et n’annulent pas un envoi déjà lancé. Le glisser-déposer n’est pas suivi. Un suivi illisible ou indisponible bloque avant insertion ; son effacement est explicite. Le site peut commencer un envoi dès l’insertion ; vérifiez sa réception vous-même.

**Garder son projet à portée de clic (J3 / H03–H09 / S03) :** enregistrer ou rouvrir un espace le choisit comme **Espace suivi**. Pour retrouver seulement ses tâches, choisissez **Suivre cet espace** dans **Espace local**, ou **Options → Espaces hybrides…** dans le panneau. La barre affiche le nom et l’avancement ; un clic ouvre directement ses tâches. Le panneau et la vue complète mémorisent des choix indépendants. **Arrêter le suivi dans cette vue** masque la barre et conserve l’espace. Le nom et les coches se synchronisent ; supprimer l’espace retire son suivi. Les changements de dossiers, collecte et pages ne sont pas enregistrés automatiquement : utilisez **Actualiser…**. L’import seul ne choisit pas l’espace.

**Suivre les tâches d’un espace (J3 / S03) :** ouvrez **Espace local** dans l’explorateur, ou **Options → Espaces hybrides…** dans le panneau. Dépliez **Tâches** sous l’espace enregistré, ajoutez un libellé puis cochez votre avancement. Le compteur indique les tâches cochées ; le suivi est conservé dans ce profil et synchronisé entre les vues. 20 tâches distinctes par espace, 160 caractères par libellé. Retirer une tâche ne modifie aucun fichier ni la collecte. L’export/import conserve la liste et ses cases ; actualiser les dossiers/pages de l’espace conserve aussi les tâches. Une modification concurrente empêche une actualisation périmée. Les anciens espaces sans tâches restent utilisables. Ce suivi est manuel : une case cochée ne prouve aucun envoi ou réception par un site. Le texte des tâches figure dans les exports ; aucun contenu de document n’y est ajouté.

**Préparer pour un champ de formulaire (J3 / H12) :** dans **Collecte → Insérer dans un formulaire**, cochez vos fichiers, repérez les champs et choisissez la destination. **Préparer les images pour ce champ…** reprend uniquement les images cochées et propose les formats JPEG (`.jpg`), PNG ou WebP acceptés par la déclaration HTML du champ. Un champ simple propose de choisir une seule image. Saisissez les dimensions et le poids demandés par le site, puis créez les copies dans le dossier choisi. **Insérer les copies dans ce champ** revérifie leur format réel, dimensions et poids, puis la page, le champ, la taille et la date des fichiers avant insertion. Cette action remplace les pièces déjà présentes dans ce champ ; le site peut commencer un envoi à ce moment. Vous gardez la validation finale du formulaire. Créer ou retrouver les copies ne les envoie pas et ne les ajoute pas à la collecte. Un refus conserve les pièces du champ et les originaux. Limite d’insertion : 20 fichiers et 20 Mo au total. Le contexte du formulaire reste en mémoire dans ce dialogue ; après fermeture, repérez à nouveau les champs puis retrouvez les copies dans **Préparations récentes**. Aucune lecture automatique des consignes de dimensions/poids ni garantie d’acceptation par le site.

**Reprendre une préparation d’images (J3 / H06 / S07) :** rouvrez **Préparer des images pour le web**, dépliez **Préparations récentes** puis cliquez sur **Vérifier les copies**. Dans la vue complète, la palette ouvre ce dialogue même sans sélection. Le suivi local conserve la destination, les contraintes et, lorsqu’ils ont été retrouvés, les chemins des copies. Le contrôle relit format, dimensions et poids ; seules les copies compatibles peuvent être collectées, sur votre clic. Les contraintes d’origine sont affichées et restent distinctes du formulaire de nouvelle préparation. Aucune conversion n’est relancée. 20 préparations maximum, 20 images chacune. **Retirer du suivi** ne supprime aucun fichier et n’arrête aucune tâche. Si le compagnon a redémarré avant que les chemins du résultat aient été retrouvés, vérifiez le dossier indiqué ; un résultat incertain n’est pas reconstruit automatiquement. Les chemins déjà conservés restent vérifiables après redémarrage. Ce suivi ne sauvegarde pas le contenu des fichiers.

**Choisir l’affichage :** cliquez sur l’icône ou le nom du mode près de la recherche pour ouvrir les huit choix : **Très grandes icônes**, **Grandes icônes**, **Icônes moyennes**, **Petites icônes**, **Liste**, **Détails**, **Mosaïques** et **Contenu**. Chaque choix a son icône ; une coche indique le mode actif. Le menu est commun au panneau Fichiers et à l’explorateur complet. Le mode est mémorisé par onglet et par volet ; il conserve votre dossier, votre sélection, le tri et la recherche. Détails affiche nom/date/taille ; Contenu ajoute une miniature et les informations sous le nom. Les colonnes s’adaptent à la largeur.

**Trier les fichiers :** le second menu près de la recherche propose **Nom A–Z**, **Nom Z–A**, **Plus récents**, **Plus anciens**, **Plus volumineux** et **Plus petits**, avec une icône par choix. Il fonctionne dans tous les affichages du panneau et de l’explorateur, conserve les dossiers en premier et mémorise le choix. Les colonnes de Détails permettent aussi de changer le tri ; leur flèche indique le sens. Au clavier : flèches pour parcourir, Début/Fin, Entrée ou Espace pour choisir, Échap pour fermer.

**Choisir son dossier :** cliquez sur **Changer**, puis utilisez Documents, Bureau, Téléchargements, vos favoris ou les disques. Ouvrez les sous-dossiers au clic et confirmez avec **Choisir ce dossier**. Échap ou **Annuler** conserve le dossier courant. Le chemin reste facultatif sous **Saisir un chemin**. Dans Fichiers, les dossiers sont regroupés en tuiles et les fichiers en lignes avec format et taille ; **Voir les autres dossiers** déplie la liste.

**Navigation et filtres du panneau :** la flèche gauche revient au dossier précédent ; la flèche vers le haut remonte au parent. Cliquez sur une partie du chemin pour rejoindre un dossier supérieur. Cette barre est aussi présente dans le sélecteur et s’adapte à la largeur disponible. **Filtres** propose le type de fichier, les fichiers cachés et une réinitialisation ; le tri possède son menu près de la recherche. Les sous-dossiers restent accessibles lorsque vous filtrez par type.

**Panneau simplifié :** **Fichiers** s’ouvre directement sur votre dossier, **Page** garde une page ou une sélection, **Collecte** retrouve les éléments conservés entre les sites. Le PDF, les notes et les téléchargements se trouvent sous **Page → Plus d’actions** ; l’insertion par champ sous **Collecte → Insérer dans un formulaire**. **Agrandir** ouvre l’explorateur complet. Voir [les parcours du panneau](PANNEAU_LATERAL.md).

**Vérifier les pièces jointes (J3 / H05) :** dans **Collecte → Insérer dans un formulaire**, choisissez les fichiers, repérez les champs puis choisissez la destination. Le panneau explique les incompatibilités de format, de nombre ou de poids avant insertion. Limite : **20 fichiers ordinaires et 20 Mo au total**. Le compagnon vérifie les tailles actuelles avant de lire les contenus ; fichier absent, lien symbolique, source modifiée ou champ changé empêchent l'insertion. Extensions et type MIME sont déduits du nom, sans analyse du contenu ni garantie d'acceptation par le site. Un refus conserve les pièces déjà présentes dans le champ. La commande d'insertion de la vue complète utilise les mêmes contrôles ; vous gardez la validation finale du formulaire.

**Glisser-déposer Windows :** dans **Fichiers**, glissez directement le nom du fichier vers une zone de dépôt du site. Windows fournit le retour visuel et le transfert natif ; aucune collecte, case à cocher ou permission debugger n’est requise. Vrai panneau Chrome, texte complet, TIFF de 24 Mio, dépôts successifs et Échap testés. Le compagnon doit être à jour ; désactivez/réactivez l’extension après mise à jour. Voir [la recette et les limites](GLISSER_DEPOSER_WEB.md).

**Redimensionner l’aperçu :** glissez la poignée située entre les fichiers et le volet **Aperçu et détails**. Sa largeur est mémorisée. La poignée accepte aussi les flèches gauche/droite au clavier ; un double-clic rétablit la largeur par défaut. Sur petit écran, le volet reste placé sous les fichiers.

**Volet d’aperçu :** dans la vue complète, activez **Aperçu** à côté de **Double panneau**, puis sélectionnez un fichier. Son aperçu et ses informations (taille, modification, emplacement) apparaissent à droite ; les métadonnées disponibles via ExifTool sont affichées dessous. Le volet suit le panneau actif et résume les sélections multiples. Son ouverture est mémorisée ; sur petit écran, il se place sous les fichiers. Texte limité à 64 Ko / 1 000 lignes, médias à 16 Mo ; TIFF et formats non pris en charge restent ouvrables dans leur application.

**Ranger un téléchargement Chrome (H07) :** dans **Page → Plus d’actions**, choisissez **Ranger les téléchargements…**, puis autorisez l’accès aux téléchargements. La liste affiche les 20 derniers éléments du profil. **Créer une règle…** préremplit le site d’origine et l’extension ; **Règles de rangement** permet de modifier, activer ou supprimer les règles. Choisissez le dossier avec **Parcourir les dossiers**. Une règle site + extension prime sur une règle avec un seul critère ; deux destinations contradictoires demandent un choix explicite. **Ranger…** propose la destination et ouvre le transfert confirmé, avec déplacement présélectionné et gestion des collisions. **Mémoriser cette destination** conserve les 20 derniers dossiers utilisés ; 50 règles maximum. **Ranger automatiquement les nouveaux téléchargements** est une option désactivée par défaut, à cocher puis enregistrer pour chaque règle. Elle déplace les fichiers commencés après activation et terminés, même panneau fermé tant que Chrome et le compagnon sont disponibles. Les anciens téléchargements restent en place ; réactiver ou modifier une règle fixe un nouveau point de départ. Une modification demande de recocher l’option. L’automatisme conserve les deux fichiers en cas de collision, sans écrasement. Une règle manuelle plus précise, ou de même priorité, empêche l’automatisme ; des destinations contradictoires sont signalées sans déplacement. Fichiers partiels, interrompus, absents, dangereux et navigation privée exclus ; état Chrome et fichier réel revérifiés à la confirmation. **Suivi des rangements** distingue les opérations automatiques et conserve les tentatives, sans rejeu après interruption ; consultez aussi l’activité native. Un dossier absent ou une règle modifiée avant lancement conserve le fichier et permet un rangement manuel explicite. Une opération déjà lancée ou incertaine exige de vérifier l’activité.

**Origine des téléchargements (H08) :** après un rangement terminé, le nom final du fichier est associé à une provenance voisine `.source.json`, y compris après une collision avec nom numéroté. **Voir la provenance** dans l’aperçu ouvre le titre d’origine, la date et la source web sans paramètres ni fragment. Une erreur de provenance laisse le fichier rangé et apparaît dans le suivi. Il s’agit d’une source déclarée, pas d’une preuve d’intégrité ; garder les deux fichiers voisins et leurs noms pour conserver l’association.

**Espaces hybrides (H03/H09) :** **Espace local**, **Options du panneau → Espaces hybrides…** ou la palette permettent d’enregistrer dossiers, affichages, double panneau, collecte et liens épinglés. L’inclusion des onglets web et de leurs groupes est facultative ; leurs URL complètes sont conservées localement dans ce profil. À la reprise, les ressources absentes sont signalées, les dossiers s’ajoutent aux onglets existants et la collecte est fusionnée. Les pages web ne s’ouvrent que si vous cochez leur réouverture. Supprimer un espace ne supprime aucun fichier. Limites : 30 espaces, 30 onglets locaux, 200 éléments collectés et 100 pages web par espace.

**Actualiser un espace enregistré :** cliquez sur **Actualiser…** près de son nom. Vérifiez les dossiers proposés et les nombres de références avant/après ; modifiez éventuellement le nom, puis **Confirmer l’actualisation**. Les dossiers, affichages, collecte et liens sont remplacés par l’instantané préparé de la vue utilisée. Les pages/groupes enregistrés restent conservés par défaut ; **Remplacer aussi les pages web par celles de cette fenêtre** prépare leurs remplaçants, avec les URL complètes. Décocher cette option rétablit les pages enregistrées dans l’aperçu. Aucune page n’est ouverte ou fermée, aucun document n’est modifié. **Annuler l’actualisation** ne conserve rien. Un nom déjà utilisé, une suppression ou une modification de cet espace dans une autre vue empêchent la confirmation : annulez et recommencez avec sa version à jour. L’identité de l’espace reste la même et l’actualisation fonctionne même lorsque les 30 emplacements sont occupés. Exportez d’abord sa version précédente si vous souhaitez la conserver ; l’actualisation ne crée pas d’historique et reste manuelle.

**Exporter ou importer un espace :** dans ce même dialogue, **Exporter** télécharge un fichier `NextExplorer-<nom>.space.json`. **Importer un espace…** permet de choisir ce fichier, de vérifier les dossiers et le nombre de références, puis de modifier le nom si nécessaire avant **Enregistrer l’espace importé**. Un nom déjà utilisé est refusé ; aucun espace existant n’est remplacé. **Annuler l’import** ne conserve rien. L’import n’ouvre aucun dossier ni site : utilisez ensuite **Rouvrir…** pour reprendre cet espace. Limite : 2 Mio par fichier, format et références validés. Export/import fonctionnent aussi sans compagnon connecté. L’export contient les chemins locaux et les adresses web incluses, sans les documents : il ne constitue pas une sauvegarde de vos fichiers. Gardez-le dans un endroit choisi ; les chemins doivent exister sur l’appareil utilisé pour la reprise.

**Préparer des images pour le web (H05/H06/H12, premier lot manuel) :** depuis **Page → Plus d’actions**, utilisez les images de la collecte ; dans l’explorateur, sélectionnez les images et lancez la commande depuis la palette. Saisissez format JPEG/PNG/WebP, largeur, qualité et poids maximal, puis choisissez le dossier des copies. ImageMagick crée les copies, ExifTool vérifie le format réel et les dimensions, et le compagnon contrôle le poids. Une copie trop lourde reste visible et ne peut pas être collectée comme compatible : ajustez les paramètres puis recommencez. Les originaux sont conservés, les métadonnées des copies sont retirées par défaut. L’ajout à la collecte est explicite et revérifie le fichier ; utilisez ensuite le glisser-déposer ou l’insertion par champ. Aucun envoi ni validation de formulaire automatiques. 20 images maximum ; fermer le dialogue laisse la conversion dans l’activité. Préparations récentes conserve son suivi et permet de retrouver puis revérifier les copies sans les recréer. Les contraintes de chaque résultat restent celles de sa préparation. Aucun modèle IA nécessaire.

**Retrouver la source d’une capture (J3 / H08) :** ouvrez l'aperçu d'une image ou d'un PDF, puis **Voir la provenance**. Le titre, la date, l'adresse de la page et, pour une image, l'adresse de la ressource sont affichés. **Ouvrir la page source** ouvre un nouvel onglet uniquement sur votre clic. La lecture du fichier voisin `.source.json` est limitée à 64 Ko ; adresse invalide, métadonnées endommagées ou association à un autre nom de fichier sont refusées. L'absence de provenance est signalée sans bloquer l'aperçu. Une taille différente de celle enregistrée est signalée ; ces métadonnées ne prouvent pas l'intégrité du contenu. Le fichier capturé et sa provenance doivent rester ensemble sous leurs noms d'origine : les opérations de fichiers ne les associent pas automatiquement dans ce lot.

**Capturer la page en PDF (J3.2) :** dans **Page → Plus d’actions**, choisissez **Enregistrer la page en PDF…**. Vérifiez le titre, le site et le dossier de destination, puis confirmez. L'action PDF de la vue complète utilise le même dialogue pour la page HTTP(S) active de la fenêtre. Chrome demande la permission optionnelle de débogage et peut afficher une bannière pendant l'impression ; le débogueur est ensuite détaché. Le fichier `Page-<identifiant>.pdf` est accompagné d'un `.source.json` avec titre, date et source sans paramètres ni fragment. Aucun fichier n'est créé en annulant le dialogue. La page doit rester active et ne pas se recharger pendant la capture. Limite : 32 Mo et délais bornés. Le PDF suit le rendu d'impression du site ; les contenus chargés seulement au défilement peuvent manquer. Le dialogue PDF n'est pas un brouillon persistant.

**Capturer une image (J3.2) :** sur une image HTTP(S), cliquez droit sur **Capturer cette image dans NextExplorer**. Confirmez le dossier puis **Enregistrer l’image**. Le téléchargement commence après confirmation et autorisation d'accès au site. L'image est enregistrée avec un fichier `.source.json` contenant titre, date et provenance sans paramètres ni fragment. **Plus tard** conserve le brouillon ; **Écarter la capture** l'abandonne. Limite : 16 Mo, PNG/JPEG/GIF/WebP/BMP/AVIF/TIFF, sans connexion au compte du site ni redirection. Un fichier existant n'est pas écrasé. Les images `blob:`, `data:` et SVG ne sont pas prises en charge dans ce parcours.

**Collecte :** sélectionnez des fichiers puis utilisez **Collecter**. **Examiner** affiche leurs chemins d'origine et permet de les retirer sans les supprimer. **Copier vers ce dossier** ouvre le récapitulatif de transfert vers le dossier actif ; vous pouvez vérifier la destination avant confirmation. Le panier conserve des références locales, pas une sauvegarde : déplacer ou supprimer les originaux peut rendre ces références indisponibles.

**Vérifier les fichiers collectés :** dans **Collecte → Gérer** (panneau) ou **Examiner** (vue complète), cliquez sur **Vérifier les fichiers**. Le contrôle affiche la progression, l’heure et les références présentes, celles dont le type/la taille/la date ont changé, et celles qui ne peuvent pas être vérifiées. Les problèmes montrent le chemin et les informations utiles. **Arrêter la vérification** arrête les nouvelles demandes ; les réponses encore attendues sont ignorées et les contrôles déjà terminés restent affichés. Aucune référence n’est retirée ou actualisée automatiquement. Les résultats s’effacent si la collecte change, si le compagnon se déconnecte ou si vous fermez le dialogue ; relancez le contrôle pour une nouvelle vérification. Limite : les 200 premières références locales par contrôle, avec les omissions indiquées. Les liens web ne sont pas visités, aucun contenu n’est lu et aucun document n’est modifié. Pour les dossiers, seule la présence est vérifiée ; les cibles des liens symboliques restent non vérifiées. Le résultat ne garantit pas le contenu ou l’accès lors d’une opération ultérieure.

Dans **Examiner**, ajoutez aussi une adresse HTTP(S) et un titre facultatif. Les liens restent dans le panier après rechargement. **Enregistrer le lien…** crée un fichier `.weblink` contenant le titre, l'adresse complète et la date de collecte, dans la destination confirmée ; la page n'est pas téléchargée. Les boutons de copie, déplacement, ZIP, conversion et insertion traitent uniquement les références locales.

Depuis une page HTTP(S), le clic droit propose **Collecter cette page dans NextExplorer** ; sur un lien HTTP(S), **Collecter ce lien dans NextExplorer**. L'entrée est ajoutée au même panier, visible immédiatement dans les vues ouvertes. Le titre de la page est repris quand Chrome le fournit ; sinon le nom du site sert de titre. La page d'origine est conservée sans sa recherche ni son fragment dans les métadonnées du panier et du `.weblink`. La collecte n'ouvre pas le site, ne télécharge rien et ne demande pas d'accès à son contenu. L'icône de l'extension indique l'ajout (`✓`), un doublon dans son infobulle ou un échec (`!`).

**Capturer une sélection (J3.2) :** sélectionnez du texte sur une page HTTP(S), puis cliquez droit sur **Capturer la sélection dans NextExplorer**. Le panneau s'ouvre avec un aperçu ; indiquez le dossier de destination et confirmez **Enregistrer l’extrait**. Un fichier `Extrait-<identifiant>.txt` contient le texte exact, le titre, la date et l'adresse de la page sans paramètres ni fragment. **Plus tard** conserve le brouillon et **Extrait en attente** le rouvre ; **Écarter la capture** le supprime sans créer de fichier. Une seule capture peut attendre à la fois (262 144 caractères maximum). Le compagnon doit être connecté pour enregistrer ; un fichier existant n'est jamais écrasé.

**Listes enregistrées :** donnez un nom au panier dans **Examiner**, puis choisissez **Enregistrer cette liste**. Vous conservez ainsi un instantané des références locales et web. **Ajouter** fusionne une liste avec le panier courant, sans doublons exacts ; supprimer une liste ne retire rien du panier et ne supprime aucun fichier. Les noms doivent être distincts. Panier et listes se mettent à jour entre les vues ouvertes de la même extension et du même profil Chrome, sans synchronisation cloud. Les ajouts et retraits utilisent un verrou navigateur pour éviter les écrasements entre vues ; une erreur de stockage est affichée.

L'interface suit une adaptation de Material 3 pour un explorateur compact : palette bleu ardoise, surfaces tonales, navigation en pilules, boutons arrondis et dialogues lisibles en clair/sombre. Les couleurs sont définies par rôles dans `src/style.css`. Roboto est utilisé si disponible, sinon Segoe UI ou la police système ; aucune police distante ni bibliothèque de composants ajoutée.

La prochaine évolution est définie dans [la feuille de route hybride](FEUILLE_DE_ROUTE_HYBRIDE.md), [la matrice des usages locaux + web](MATRICE_FILES_ET_HYBRIDE.md), [les usages du panneau latéral](PANNEAU_LATERAL.md), [le plan d'installation des compagnons](INSTALLATION_COMPAGNONS.md) et [le plan de rentabilisation](PLAN_RENTABILISATION.md). Ligne directrice du 9 octobre : fichiers locaux et navigateur ; J6 est retiré. Priorité : terminer J3 et les fondations restantes, puis J4/J5 et la recette du socle gratuit J7. Les lots C détaillent le classement classique dans J4/J5 ; IA locale « Beast » et thème Incandescence viennent ensuite, en conception. Ces documents décrivent la cible ; les instructions et fonctionnalités ci-dessous correspondent au prototype actuel.

Depuis un clone du dépôt, exécuter `npm ci` puis `npm run package` pour générer `dist/`, `native/native-host.exe` et le paquet. Les moteurs portables sont optionnels et s’installent séparément dans `native/tools/` ; ces fichiers générés ne sont pas versionnés.

### Assistant Windows

Recette développeur sur Windows isolé : `npm run setup:acceptance` prépare le kit avec l'EXE existant et son SHA256. Voir [la procédure J1.7](RECETTE_INSTALLATEUR.md). Ce kit ne signifie pas que la recette complète a été exécutée.

Lancer **`release/NextExplorer-Setup.exe`** : assistant français, sans console ni droits administrateur. Cet EXE de développement n’est pas signé.

Choisir le navigateur, vérifier l’identifiant prérempli et les corrections prévues, puis cliquer sur **Installer**. Charger ensuite l’extension en mode développeur depuis `%LOCALAPPDATA%\Programs\NextExplorer\package\dist`. L’assistant ne l’ajoute pas silencieusement au navigateur. Si elle est déjà chargée ailleurs, la recharger depuis ce dossier stable, puis la désactiver et la réactiver.

Le menu Démarrer propose **NextExplorer → Installer ou réparer**. L’assistant conserve un compagnon déjà cohérent : il ne force pas sa mise à jour. Aucun moteur n’est téléchargé. Il préserve les enregistrements vers d’autres installations et bloque si le navigateur choisi pointe ailleurs. En cas de récupération ambiguë de moteurs, renseigner l’identifiant de la copie indiqué par l’aperçu.

La désinstallation depuis les applications Windows retire le paquet, ses raccourcis et les enregistrements appartenant à l’installation. Les dossiers `versions`, les sauvegardes, les réglages et les documents personnels restent conservés. Retirer aussi l’extension du navigateur. L’installation et la désinstallation complètes de l’EXE restent à valider sur une machine propre ; les tests locaux couvrent les opérations sous-jacentes et les écrans jusqu’à l’aperçu.

### Installation par script (développement)

**Extraire une archive :** sélectionnez un ZIP, 7z ou RAR, clic droit → **Extraire une archive…**, puis choisissez le dossier parent et le nom du nouveau sous-dossier. En cas de nom existant : conserver les deux, ignorer ou arrêter. Le contenu est préparé temporairement puis publié après vérification ; aucun fichier existant n'est remplacé. Limites : 3 000 entrées, 256 Mio par entrée, 1 Gio décompressé. Chiffrement, multivolumes, liens et chemins dangereux refusés. Compagnon Windows à jour requis ; 7z/RAR nécessitent aussi le moteur 7-Zip dans `tools` près du compagnon ou dans PATH. Celui-ci n'est pas téléchargé par l'assistant. Tests réels ZIP, 7z, RAR4 et RAR5 (stocké, compressé et solide) réussis avec 7-Zip 26.03.

Pour extraire dans un dossier déjà rempli, cochez **Extraire directement dans le dossier de destination et fusionner**. Le champ du nom de sous-dossier disparaît : la destination saisie reçoit le contenu de l'archive. Choisissez conserver les deux, ignorer ou remplacer (l'ancien fichier est gardé dans la corbeille locale). L'archive est vérifiée entièrement avant la fusion ; un conflit fichier/dossier connu est refusé avant toute copie. Une interruption pendant la fusion peut laisser des fichiers déjà copiés : **pas de retour arrière global**. L'archive source est protégée ; les éléments ignorés restent dans l'archive. Le résultat indique les fichiers copiés et éléments ignorés, sans prétendre que toute l'archive a été appliquée. Compagnon annonçant cette nouvelle capacité requis.

Pour 7z/RAR, la phase moteur est limitée à cinq minutes, l'archive source à 1 Gio et l'inventaire à 1 Mio. Le traitement par fichier peut être lent sur les archives solides et utiliser jusqu'à environ 3 Gio temporaires (hors destination finale et corbeille lors d'une fusion). L'activité permet d'arrêter l'extraction et de consulter sa destination finale. Après un arrêt brutal, des dossiers `.nextexplorer-extract-*` ou `.nextexplorer-engine-*` peuvent rester ; aucune reprise automatique. 7-Zip 26.03 ou supérieur est requis. Le script `scripts/setup-engines.ps1` prépare la version 26.03 avec vérification SHA256 (ou `scripts/setup-7zip.ps1` pour actualiser uniquement un moteur portable existant). Réinstallez ensuite le compagnon pour lui transmettre le moteur mis à jour : aucune modification automatique du compagnon déjà enregistré. Les moteurs restent distribués séparément du paquet léger.

**Activité — journal des transferts :** les 20 derniers résumés sont conservés dans `%APPDATA%\NextExplorer\journal` et relus à la connexion. Chaque compte rendu distingue fichiers copiés/déplacés, éléments ignorés et copies dont la source n'a pas pu être supprimée ; seuls les 10 premiers détails du résumé sont conservés et les chemins longs sont abrégés. Une erreur d'enregistrement du résumé est signalée sans bloquer le transfert. Les résumés invalides sont ignorés à la lecture.

**Registre transactionnel :** les copies et déplacements disposent également d'un registre détaillé dans `journal\transactions`, séparé des résumés. Il conserve les chemins complets, empreintes BLAKE3, références de corbeille et créations/suppressions de dossiers. Chaque modification finale est précédée d'une intention écrite et synchronisée sur disque, puis suivie de son résultat ; début et fin du transfert sont enregistrés. Un échec d'écriture bloque la suite du transfert. Une intention sans résultat complet reste incertaine et exige une vérification des fichiers. Les métadonnées, fichiers temporaires et extractions restent hors de ce premier périmètre. Une panne matérielle n'est pas couverte par une garantie de transaction atomique.

**Annuler une copie terminée :** dans Activité, choisissez **Vérifier l’annulation**, puis **Annuler cette copie** après lecture du récapitulatif. Les copies de fichiers ordinaires et de dossiers sont prises en charge, y compris les remplacements de fichiers avec sauvegarde valide en corbeille. Les contenus des originaux et des copies doivent correspondre aux empreintes enregistrées ; les liens, fichiers absents/modifiés et registres incomplets sont refusés. Pour un dossier créé par la copie, chaque fichier et sous-dossier doit correspondre au registre : tout élément ajouté ou manquant, même un dossier vide, bloque l'annulation. Le dossier est mis entier dans la corbeille et peut être restauré entier. Lors d'une fusion, les dossiers déjà présents et les fichiers ignorés sont conservés ; seuls les nouveaux éléments sont retirés. Le récapitulatif compte les fichiers et dossiers retirés à leur niveau racine, sans compter séparément les descendants d'un dossier retiré entier. La vérification est répétée avant exécution et après déplacement en corbeille ; si un changement concurrent est détecté, une restauration est tentée et l'annulation est arrêtée. Les originaux restent en place. Fonctionne également après reconnexion ou redémarrage du compagnon, tant que le transfert figure dans l'activité et que son registre est présent. Limites de lecture : 10 000 modifications et 16 Mio de registre.

**Annuler un déplacement terminé :** dans Activité, choisissez **Vérifier l’annulation**, puis **Annuler ce déplacement**. Le récapitulatif indique les chemins actuels et leurs emplacements d'origine. Ce lot Windows remet les fichiers et dossiers entiers à leur emplacement d'origine sur le même volume ou entre volumes, y compris après fusion. Le registre doit confirmer la publication et la suppression de chaque source. Le contenu doit être inchangé, les emplacements d'origine libres et leurs dossiers parents présents, accessibles et sans liens. Le retour utilise un déplacement natif sans écrasement lorsque les volumes le permettent. Un contrôle après déplacement tente le retour à l'emplacement précédent si un changement concurrent est détecté. Entre volumes, le retour suit la procédure de copie vérifiée décrite ci-dessous.

**Déplacements avec fusion :** l'annulation remet uniquement les éléments déplacés à leur source ; les dossiers préexistants de la destination et les fichiers ignorés restent en place. Les dossiers sources supprimés par la fusion sont recréés, des parents vers les enfants, uniquement si le journal confirme leur suppression et si leurs chemins sont toujours libres. Un dossier source recréé entre-temps bloque l'annulation. Les parents absents sans preuve de suppression ne sont pas recréés. Le récapitulatif compte aussi les dossiers à recréer. Chaque création est journalisée ; une interruption peut laisser des dossiers vides et un retour partiel. Les autorisations héritent du parent ; anciennes autorisations et dates des dossiers recréés ne sont pas restaurées.

**Fichiers remplacés :** le récapitulatif indique combien d'anciennes versions seront restaurées. Le fichier actuel et sa sauvegarde doivent correspondre à leurs empreintes ; le registre de corbeille doit correspondre aux chemins du journal. La nouvelle version est préservée en corbeille pour une copie, ou remise à sa source pour un déplacement pris en charge. L'ancienne version est ensuite restaurée à la destination, uniquement si elle est libre. Chaque étape est enregistrée avant/après exécution. Une sauvegarde absente, modifiée, déjà restaurée ou incohérente bloque l'annulation lors de la vérification. Une panne tardive peut nécessiter une restauration manuelle : les deux versions sont conservées, mais peuvent se trouver à des emplacements différents. Les remplacements pendant une extraction restent hors de ce périmètre.

**Retour entre volumes :** si Windows refuse le déplacement natif parce que les volumes diffèrent, le moteur de transfert recopie les données vers la source, sans écrasement, avec vérification BLAKE3 et journal de chaque modification. Les arbres complets sont contrôlés avant de placer la version déplacée dans la corbeille de son volume. Cette copie de sécurité reste restaurable et n'est pas purgée automatiquement. Prévoyez l'espace pour la copie de retour ; les données en corbeille continuent d'occuper leur volume. Le journal de la copie de retour se trouve sous `undo/transactions/job-return-<étape>` dans le registre de l'opération. Si la copie échoue, la version déplacée est conservée ; une copie partielle peut rester à la source. Fusion et remplacement suivent les mêmes contrôles. La fenêtre peut attendre jusqu'à trente minutes ; cette attente ne constitue pas un délai d'arrêt du compagnon et aucun bouton de pause/reprise n'est proposé pour l'annulation.

Les étapes d'annulation sont elles-mêmes enregistrées. Après une interruption, **Vérifier l’annulation** peut proposer **Reprendre l’annulation** : les étapes terminées et leurs fichiers sont vérifiés, puis seules les étapes restantes sont exécutées après confirmation. Si seul le journal doit être complété, **Terminer l’annulation** le fait sans rejouer les opérations. Un résultat manquant peut être confirmé lorsque les contenus, les emplacements et les preuves de corbeille établissent l'état final attendu d'une copie annulée, d'un déplacement retourné ou d'un ancien fichier restauré. Le nombre de résultats manquants est affiché ; la confirmation ajoute des entrées `reconciled` distinctes, sans modifier les intentions ni inventer le résultat original. L'aperçu n'écrit rien dans le journal et les données sont revérifiées à la confirmation.

Un verrou Windows empêche deux compagnons d'annuler simultanément la même opération et se libère à la fermeture du processus. Si les preuves restent insuffisantes (création de dossier non confirmée, état antérieur encore présent, restauration ou copie de retour partielle), ou en cas d'erreur enregistrée, de corruption ou de données modifiées, la récupération reste bloquée : vérifiez les emplacements et la corbeille manuellement. Aucune reprise automatique ni garantie atomique face aux modifications simultanées depuis d'autres applications. Ces refus constituent la limite de sécurité de J2.5 ; la reprise durable des transferts initiaux relève de J5.

Les journaux contiennent des chemins et empreintes, pas le contenu des documents. Les registres détaillés sont conservés sans purge automatique et peuvent donc grossir. Supprimer `journal`, navigateur et compagnon arrêtés, efface aussi les informations nécessaires à une future annulation ; cela ne restaure aucun fichier.

Un état **Issue inconnue** signifie que le résumé final n'a pas été enregistré : vérifier les fichiers avant de réessayer. Le registre détaillé est distinct du résumé affiché. **Arrêter** interrompt une tâche en cours et ne restaure pas les fichiers déjà déplacés. Les entrées historiques proposent la vérification d'annulation si le compagnon annonce cette fonctionnalité ; aucune reprise d'une ancienne tâche. Un compagnon à jour est requis.

Copie/déplacement : cochez **Fusionner les dossiers de même nom** pour réunir leur contenu. Le choix conserver les deux / ignorer / remplacer s'applique aux fichiers en conflit. Les éléments ignorés restent à la source lors d'un déplacement. L'option est désactivée si le compagnon installé ne l'annonce pas ; mettez à jour le compagnon avec le script ci-dessous. Un lot interrompu peut être partiellement effectué : pas encore d'annulation globale.

Pour un premier essai de l'assistant sur le poste de développement : ouvrir `release/NextExplorer-Setup.exe`, choisir Chrome, conserver l'identifiant prérempli et consulter l'aperçu, puis annuler. Si une liaison vers une autre installation est signalée, conserver cette liaison et arrêter l'essai ; ne pas supprimer manuellement sa clé de registre. Le cycle complet installation/désinstallation se teste sur un Windows isolé selon RECETTE_INSTALLATEUR.md. Un compagnon déjà cohérent n'est pas mis à niveau par cet assistant : utiliser le parcours de développement ci-dessous pour essayer une nouvelle compilation native.

1. Dans PowerShell, depuis ce dossier :

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-host.ps1
   ```

2. Ouvrir `chrome://extensions`, activer **Mode développeur**, cliquer sur **Charger l’extension non empaquetée** et sélectionner le dossier **dist**.
3. Épingler NextExplorer puis cliquer sur son icône. **Alt+E** ouvre le panneau ; **Alt+Maj+E** ouvre un onglet complet. Le bouton en haut à droite du panneau ouvre aussi l’onglet.

Le script copie le compagnon, sa politique de sécurité et les moteurs portables présents vers `%LOCALAPPDATA%\Programs\NextExplorer`, puis enregistre le manifeste stable dans le registre de l’utilisateur courant pour Chrome, Edge et Chromium, sans administrateur. La clé publique présente dans le manifeste stabilise l’ID : `hefjoeegkokdcfpgffaelaanegakhlde`. Si votre navigateur lui attribue un autre ID, relancer l’installateur avec `-ExtensionId ID_AFFICHE`.

Le compagnon installé reste utilisable si son paquet source est déplacé. Le dossier **dist** chargé dans Chrome doit rester à son emplacement ; s’il est déplacé, charger l’extension depuis son nouvel emplacement. Après reconstruction de l’extension, cliquer sur **Actualiser** dans `chrome://extensions`. Après reconstruction du compagnon ou ajout de moteurs dans `native/tools`, relancer `scripts/install-host.ps1`, puis désactiver et réactiver l’extension.

Chaque installation prépare une nouvelle copie dans le sous-dossier `versions` avant de changer le manifeste actif. Les anciennes copies sont conservées, notamment pour les processus encore ouverts ; elles peuvent occuper beaucoup d’espace avec les moteurs. Une réinstallation depuis le paquet léger conserve les moteurs de l’installation précédente. Si l’enregistrement échoue, le script tente de rétablir le manifeste et les enregistrements précédents. Le nettoyage des copies et les mises à jour automatiques restent à réaliser.

La connexion vérifie la compatibilité du protocole avant d’ouvrir les dossiers. Si le compagnon est ancien ou incompatible, un message indique la mise à jour requise : utilisez l’extension et le compagnon du même paquet, puis désactivez et réactivez l’extension. L’absence de moteurs multimédias optionnels ne bloque pas la connexion.

À l’accueil, l’extension recherche automatiquement le compagnon jusqu’à quatre fois : réponse attendue pendant 5 secondes au maximum, puis pause de 2 secondes avant la tentative suivante. Après installation du compagnon, la connexion peut ainsi aboutir sans intervention. Si les tentatives sont épuisées, cliquez sur **Se connecter** pour relancer la recherche. Une incompatibilité arrête la recherche et affiche les instructions de mise à jour. Les opérations de fichiers ne sont jamais rejouées par cette recherche.

Le paquet `release/NextExplorer` contient également l’extension et le compagnon. Pour une installation depuis ce paquet, utiliser son propre script `scripts/install-host.ps1`. Le paquet léger utilise les moteurs présents dans PATH ; les moteurs portables se téléchargent avec son script `setup-engines.ps1`.

## Diagnostic de l’installation Windows

Depuis le dossier source ou le paquet, lancer :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\diagnose-host.ps1
```

Le diagnostic contrôle Chrome par défaut. Ajouter `-Browser Edge`, `-Browser Chromium` ou `-Browser All` pour changer le périmètre, et `-ExtensionId ID_AFFICHE` si l’extension utilise un autre identifiant. Il vérifie le manifeste stable, l’emplacement et la présence du compagnon, la cohérence du manifeste adjacent, la présence de la politique de sécurité et l’enregistrement du navigateur. Les moteurs optionnels sont seulement détectés sur disque ou dans PATH ; leur absence ne bloque pas le diagnostic.

Chaque problème comporte une action proposée. Le diagnostic ne modifie rien et ne lance aucun programme. Un résultat cohérent ne certifie ni le contenu des exécutables ou de la politique, ni la connexion réelle : le protocole reste vérifié dans l’extension. Le code de sortie est **0** pour une structure cohérente, **1** en cas de problème.

Ajouter `-Json` pour afficher un rapport structuré sans chemins personnels, contenu des fichiers ni exceptions brutes. Le rapport reste local et aucun envoi au support n’est automatique. L’identification des navigateurs installés n’est pas effectuée : avec `-Browser All`, un enregistrement absent est signalé même si ce navigateur n’est pas installé.

### Réparer l’installation

Depuis un paquet contenant le compagnon et sa politique de sécurité, afficher les corrections prévues :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-host.ps1
```

Puis appliquer les corrections avec sauvegarde :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-host.ps1 -Apply
```

Chrome est sélectionné par défaut ; `-Browser Edge`, `-Browser Chromium`, `-Browser All` et `-ExtensionId` fonctionnent comme pour le diagnostic. Sans `-Apply`, aucun fichier ni enregistrement n’est modifié. Une installation déjà cohérente n’est pas recopiée.

La réparation sauvegarde le manifeste, même endommagé, et les enregistrements sélectionnés dans `%LOCALAPPDATA%\Programs\NextExplorer\backups`, puis prépare une nouvelle copie du compagnon. Elle conserve les anciennes copies et récupère les moteurs de la copie identifiée, complétés par ceux du paquet. Si plusieurs copies sont possibles et que le manifeste ne permet pas de choisir, l’aperçu liste leurs identifiants : ajouter `-RecoveryVersion IDENTIFIANT` à l’aperçu puis à la commande avec `-Apply`. Aucun choix de copie n’est fait au hasard.

Les enregistrements vers d’autres installations sont conservés. Si le seul navigateur choisi pointe ailleurs, la réparation s’arrête : vérifier quelle installation utiliser. Après un échec d’enregistrement, le script tente de restaurer le manifeste original et les enregistrements modifiés ; un retour arrière incomplet est signalé. Les sauvegardes restent locales et peuvent contenir des chemins personnels : elles ne font pas partie du rapport JSON du diagnostic.

Après réparation, désactiver et réactiver l’extension pour vérifier la connexion et le protocole. Aucun téléchargement, suppression des anciennes copies ou lancement du compagnon n’est effectué par le script. L’assistant Windows réutilise ce parcours de réparation.

## Utilisation

- **Compagnon du navigateur** : le panneau propose **Fichiers**, **Page** et **Collecte**, avec les fichiers visibles dès l’ouverture. Le dossier choisi et la collecte restent disponibles pendant la navigation. **Collecte → Insérer dans un formulaire** permet de choisir les fichiers et le champ de téléversement ; un changement de page impose une nouvelle analyse. **Ouvrir en pleine page** ouvre le dossier en cours puis ferme le panneau. Voir [les usages et limites du panneau](PANNEAU_LATERAL.md).
- **Onglets de dossiers (vue complète)** : le bouton **+** ouvre un onglet sur le dossier actif. Clic molette ou clic droit sur un dossier → **Ouvrir dans un nouvel onglet**. Chaque onglet conserve ses deux dossiers, son historique et son mode double panneau ; **×** ferme un onglet. Les onglets sont restaurés au rechargement.
- Double-clic : ouvrir un dossier ou l’aperçu d’un fichier. **Espace** : QuickLook. **Échap** : fermer.
- **Ctrl+K** : commandes et chemins. Alias `~`, `~dl`, `~desk`, `~docs`, `~c`. Double-clic sur le chemin ou bouton `…` : saisir un chemin avec suggestions.
- **/** : filtrer. **Ctrl+A**, **Ctrl+C/X/V**, **F2**, **Suppr**, **Alt+↑**, **F5** : sélection, fichiers, navigation.
- **Ctrl+clic** et **Maj+clic** : sélection multiple. Le menu contextuel propose les opérations sur les fichiers sélectionnés.
- **Double panneau** : naviguer dans deux dossiers. Sur une fenêtre assez large, glisser la poignée centrale pour ajuster la largeur de chaque panneau (30 à 70 %) ; utiliser les flèches gauche/droite au clavier ou double-cliquer pour revenir à 50 %. Le réglage est conservé par onglet. Glisser une sélection entre les panneaux prépare un déplacement ; maintenir Ctrl prépare une copie. Le dialogue permet de choisir la politique de conflit.
- **Collecte** : réunir des fichiers provenant de plusieurs dossiers, puis déplacer, archiver ou convertir l’ensemble. Le bouton d’envoi insère les fichiers dans un champ de téléversement de la dernière page web utilisée ; il ne soumet pas le formulaire.
- Déposer du texte crée une note Markdown. Déposer une URL ou une image ouvre les options de capture. Les captures demandent l’autorisation d’accès au site concerné.
- Les liens épinglés sont propres à chaque dossier. Clic droit sur un lien épinglé ou un favori : retirer l’épingle.
- Les sessions `.session.json` enregistrent les onglets et leurs groupes. Double-cliquer pour préparer leur réouverture.
- La corbeille est spécifique à NextExplorer : dossiers cachés `.nextexplorer-trash`, sur le même volume que les fichiers. L’écran **Corbeille** permet de restaurer les suppressions effectuées dans cette installation. Aucun effacement définitif automatique.

## Développement

Node.js 22+ et Go 1.24+ sont nécessaires uniquement pour reconstruire. Le compagnon produit est autonome. Le choix Go est prévu par l’architecture générale du cahier des charges, même si son tableau de phases cite Rust.

```powershell
npm install
npm run build
npm run native:build
npm test
npm run native:test
npm run test:browser
npm run test:installer
npm run test:diagnostic
npm run test:repair
npm run test:setup
npm run package
```

Si Go est absent : `powershell -ExecutionPolicy Bypass -File scripts/setup-go.ps1`. Le compilateur officiel, vérifié par SHA-256, reste dans `.tools/`.

Pour compiler l’assistant : préparer une fois Inno Setup avec `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-inno.ps1`, puis lancer `npm run package` et `npm run setup:build`. Inno Setup 6.7.3 est téléchargé depuis sa distribution officielle, sa signature Authenticode et l’éditeur Pyrsys B.V. sont vérifiés, puis il est préparé en mode portable dans `.tools/inno`. Résultat : `release/NextExplorer-Setup.exe`. Conditions de l’outil : [THIRD_PARTY.md](THIRD_PARTY.md).

`npm run test:setup` vérifie l’aperçu et son application avec fichiers réels, registre simulé et HELLO natif. `scripts/test-setup-ui.ps1 -Isolated` compile un paquet de test bloquant les écritures au registre et l’installation, ouvre les écrans jusqu’à l’aperçu et sauvegarde les captures dans `test-results/setup-*.png`. Il ne clique jamais sur Installer.

`npm run dev` sert uniquement l’interface de développement sur 127.0.0.1. Une page web ordinaire affiche l’aide de connexion ; elle n’a pas accès au disque. `npm run test:browser` utilise Chrome sans fenêtre, un espace de fichiers temporaire et le véritable exécutable natif, avec un adaptateur remplaçant seulement le transport de l’API d’extension. Il ne modifie pas votre profil Chrome personnel ni le registre.

Les tests Go couvrent le protocole binaire, l’origine appelante, les chemins, les conflits, les copies vérifiées, l’annulation, la restauration, les lots, les empreintes et les archives. Si les moteurs sont présents, ils testent aussi WebP, MP3, remux MKV et métadonnées photo / tags MP3. Les captures d’interface sont dans `test-results/`.

`npm run test:extension` charge réellement le paquet dans un profil Chromium temporaire. Le navigateur de test doit être installé dans `.tools/browsers` avec Playwright. Après installation du compagnon, définir `NEXTEXPLORER_REQUIRE_NATIVE=1` exige aussi une liaison native fonctionnelle et vérifie des opérations de fichiers via l’extension. Ce test doit tourner sous le même utilisateur Windows que l’installateur ; un bac à sable utilisant un autre registre utilisateur ne voit pas le compagnon.

## Moteurs multimédias

Pour les télécharger de nouveau, sans installation système :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-engines.ps1
```

| Moteur | Usage |
| --- | --- |
| FFmpeg / FFprobe | Conversions audio et vidéo, remux, normalisation, estimation du débit cible |
| ImageMagick | Images, redimensionnement et compression |
| ExifTool | Lecture / modification EXIF et tags audio, variables du renommage |
| 7-Zip 26.03 minimum | Inventaire et extraction 7z/RAR |
| yt-dlp | Téléchargement de médias web |
| Git / VS Code | Outils développeurs, si installés sur le système |

Les moteurs sont recherchés dans `native/tools`, puis dans PATH. Ils ont leurs propres licences et ajoutent plusieurs centaines de Mo ; la contrainte de moins de 15 Mo concerne le compagnon seul. Pour vérifier leur présence, ouvrir **Réglages et moteurs**.

## Sécurité et limites pratiques

- L’extension communique avec le compagnon via stdin/stdout. Aucun port réseau n’est ouvert par le compagnon. Les téléchargements et captures font naturellement des requêtes sortantes lorsqu’on les demande.
- Chrome vérifie `allowed_origins` ; le compagnon vérifie aussi l’origine passée en argument. Cela ne protège pas contre un autre programme local déjà exécuté avec les droits de votre utilisateur.
- Le compagnon garde les droits de l’utilisateur ; il ne contourne pas les ACL ni l’UAC. Les chemins absolus locaux et UNC sont acceptés, les chemins de périphériques et flux NTFS alternatifs sont refusés.
- Les transferts récursifs refusent les liens symboliques et les destinations à l’intérieur des sources. Les remplacements de fichiers conservent une copie dans `.nextexplorer-trash` ; les dossiers existants ne sont pas fusionnés.
- Les tâches vivent tant que le processus du compagnon reste actif. Une fermeture de Chrome ne permet pas de reprendre leur exécution après redémarrage. Les chemins de copies d’images déjà retrouvées sont conservés dans Préparations récentes et peuvent être revérifiés sans recréer les copies. Les transferts terminés restent acquis ; une annulation ne rétablit pas les fichiers déjà déplacés.
- QuickLook affiche un préfixe du texte limité à 64 Ko et 1 000 lignes, avec coloration/Markdown dans un worker interrompu après 3 secondes si nécessaire. Les données binaires ne sont pas colorées. Les TIFF affichent immédiatement une proposition d'ouverture dans l'application locale ou de création d'une copie PNG avec ImageMagick, sans lire le TIFF dans Chrome. Les médias / PDF restent assemblés en mémoire jusqu'à 128 Mo ; les codecs dépendent de Chrome. La waveform audio est réservée aux fichiers de 8 Mo maximum. Pour les gros médias, utiliser l'ouverture dans l'application système.
- Les sauvegardes `_original` d’ExifTool sont conservées. La disponibilité des RAW, AVIF, codecs GPU et autres formats dépend des délégués inclus dans les moteurs et du matériel. La taille cible vidéo est une estimation, pas une garantie stricte.

La matrice détaillée et les écarts au document initial figurent dans [FEATURES.md](FEATURES.md). Les dépendances sont recensées dans [THIRD_PARTY.md](THIRD_PARTY.md).

## Désinstaller

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-host.ps1 -Uninstall
```

Retirer ensuite l’extension dans Chrome. Les fichiers et corbeilles sont conservés.
Le script retire seulement les enregistrements qui pointent vers cette installation ou vers le compagnon du dossier source courant. Les copies sous `%LOCALAPPDATA%\Programs\NextExplorer`, les réglages et les fichiers personnels sont conservés ; leur suppression automatique n’est pas encore fournie.

## Linux et macOS

Le code du compagnon contient les adaptations pour ces systèmes. Compiler sur le système cible avec Go, construire l’extension, puis lancer `node scripts/install-host.mjs`. Installer les moteurs dans PATH. Ces plateformes n’ont pas été exécutées dans cet environnement Windows ; la validation réelle décrite ci-dessus concerne Windows et Chrome.

## Références techniques

- [Chrome : Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome : Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [FFmpeg : options de conversion](https://ffmpeg.org/ffmpeg.html)
- [ImageMagick : distributions portables](https://imagemagick.org/download/)
