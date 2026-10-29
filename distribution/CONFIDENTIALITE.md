# NextExplorer — confidentialité

Version du 29 octobre 2026, candidat pilote 1.0.7. Editeur du projet : **Gremy44**. Contact : https://github.com/Gremy44/NextExplorer-Downloads/issues. Cette politique concerne la preversion distribuee sur ce canal officiel.

## Fonctionnement local

NextExplorer associe une extension Chrome et un compagnon Windows local. Il ne nécessite pas de compte NextExplorer. La version décrite n’intègre ni publicité, ni outil d’analyse d’audience, ni modèle d’IA, ni envoi automatique des documents à un serveur de l’éditeur.

Selon les outils utilisés, NextExplorer traite les données suivantes :

| Données | Utilité et stockage |
|---|---|
| Chemins, noms, tailles, dates, métadonnées et contenu des fichiers choisis | Navigation, aperçu, recherche, comparaison et opérations locales. Les fichiers restent dans les dossiers choisis. |
| Tags, favoris, espaces de travail, règles et préférences | Stockage local du profil Chrome ; certains réglages utilisent le stockage local de la page. Pas de synchronisation via `chrome.storage.sync`. |
| Extraits de documents indexés | Index local IndexedDB du profil Chrome, créé sur demande et effaçable depuis la recherche locale. |
| Brouillons de l’éditeur texte | Texte de départ, texte modifié, chemin et empreinte conservés dans le stockage local du profil de l’extension, sans synchronisation ni chiffrement applicatif. Jusqu’à 20 brouillons / 3 Mio de chaînes stockées ; conservation jusqu’à l’enregistrement, l’abandon ou la suppression explicite. En cas de stockage refusé, l’interface avertit de garder la page ouverte ou de télécharger le texte. Ils ne sont pas inclus dans les exports de session et ne constituent pas une sauvegarde indépendante du profil. |
| URL et titre des onglets utilisés, liens, sélections et images collectés | Fonctions visibles de collecte, contexte de page et espaces de travail. Pas de lecture de l’historique général de navigation. |
| URL et nom des téléchargements concernés | Liste et règles de rangement après autorisation ; les règles automatiques sont activées explicitement. |
| Historique des insertions | Au plus 20 tentatives locales : date, origine du site, champ, noms et tailles des fichiers, résultat connu ou incertain. Effaçable depuis les insertions récentes. |
| Journaux d’opérations, tâches, sauvegardes et corbeille locale | Suivi des traitements, reprise et annulation sous conditions, dans les dossiers locaux du compagnon. Les tâches autorisées peuvent continuer quand le navigateur ferme. |
| Commandes et sortie PowerShell | Mémoire de la session de console ; NextExplorer n’enregistre pas cet historique. Les commandes et programmes lancés peuvent écrire leurs propres fichiers ou accéder au réseau. |

Les documents choisis peuvent eux-mêmes contenir des données personnelles ou sensibles. Les métadonnées consultées peuvent comprendre un auteur, des coordonnées ou la position GPS enregistrée dans une photo ; NextExplorer ne demande pas la géolocalisation du navigateur. Ces informations sont traitées localement, comme les chemins et l’historique des actions. L’utilisateur choisit les fichiers et opérations ; la console et le compagnon disposent des droits habituels de son compte Windows.

## Communications et destinataires

- La liaison extension–compagnon utilise Native Messaging sur le même ordinateur. La lecture de certains médias peut utiliser un serveur temporaire limité à l’interface locale `127.0.0.1`, avec URL d’accès temporaire.
- Une capture de page, une collecte d’image ou l’ouverture d’un lien peut contacter le site choisi ou charger ses ressources. Le site reçoit alors les informations habituelles d’une connexion réseau. Les sites et moteurs externes possèdent leurs propres politiques.
- Insérer ou déposer un fichier dans une page donne accès à ce fichier à cette page. **Le site peut le transmettre immédiatement**, selon son propre fonctionnement.
- L’installation des moteurs optionnels télécharge des logiciels auprès de leurs distributeurs. Chrome assure séparément la distribution et la mise à jour de l’extension.
- Aucun fichier n’est vendu à un tiers ou utilisé par NextExplorer pour de la publicité, du profilage commercial ou l’entraînement d’un modèle. Aucun accès humain de l’éditeur aux fichiers locaux n’est prévu. Un diagnostic ne lui parvient que si l’utilisateur choisit de le partager.

Les communications de l’utilisateur avec un site ou un programme qu’il choisit ne sont pas un envoi vers un serveur NextExplorer. Les permissions facultatives d’accès aux sites peuvent être retirées dans les réglages de Chrome.

## Conservation et suppression

Les réglages et références restent dans le profil local jusqu’à leur retrait, effacement ou suppression des données de l’extension. Les éléments collectés, espaces, tags et historiques se gèrent dans leurs outils respectifs. Les index se suppriment depuis la recherche locale ; les exports créés par l’utilisateur restent des fichiers ordinaires dans leur dossier.

Retirer l’extension ne supprime pas les documents, captures, exports ni journaux du compagnon. Le désinstalleur du compagnon conserve les versions, sauvegardes et données prévues pour permettre la récupération ; il ne constitue pas un effacement de tous les fichiers locaux. Désactiver les règles automatiques et arrêter les traitements avant retrait du compagnon.

Les fichiers conservés par un site après dépôt suivent les règles de ce site ; NextExplorer ne peut pas les effacer à distance. Les journaux Windows, historiques de programmes et paramètres de sauvegarde du poste dépendent aussi de l’environnement de l’utilisateur.

## Engagement d’usage limité

NextExplorer utilise les données accessibles par les API Chrome pour fournir les fonctions visibles décrites ici, conformément aux règles d’utilisation limitée des données utilisateur du Chrome Web Store. Il ne les réutilise pas pour la publicité ou des finalités étrangères à ces fonctions.

## Contact et évolutions

Pour une question sur le produit ou ses données : https://github.com/Gremy44/NextExplorer-Downloads/issues. Cette politique doit être actualisée avant toute nouvelle collecte, infrastructure d’hébergement ou fonctionnalité modifiant ces traitements.

## Hebergement de la documentation

Ce depot et ses fichiers de telechargement sont heberges par GitHub. Les connexions au site et leurs donnees techniques suivent aussi la politique de confidentialite de GitHub : https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement. NextExplorer ne recoit pas un historique nominatif de vos fichiers locaux par ce canal.

## Dossiers distants — fonction expérimentale du pilote 1.0.7

Cette fonction facultative est désactivée par défaut. Après activation, le compagnon contacte directement le serveur choisi pour SFTP/SSH ou FTP/FTPS. Le serveur reçoit l’adresse IP de connexion, l’utilisateur, l’authentification et les fichiers ou commandes nécessaires aux actions demandées. FTP sans TLS transmet ces données sans chiffrement et exige une acceptation explicite.

Les noms de serveurs, utilisateurs, ports, chemins de clés et empreintes approuvées sont conservés dans le carnet local du compagnon. Le mot de passe ou la phrase secrète peut être mémorisé sur demande avec DPAPI Windows, lié au compte de cet appareil ; ce secret ne figure ni dans le stockage Chrome, ni dans les exports de préférences, ni dans les tâches. Supprimer un profil depuis Connexions retire son secret de ce carnet. Les sauvegardes externes de Windows restent sous le contrôle de l’utilisateur.

Une console SSH est ouverte uniquement sur action explicite. NextExplorer garde sa sortie en mémoire pour la session ; les commandes peuvent être enregistrées par le serveur et les programmes exécutés. Les transferts terminés, chemins et résultats restent dans l’Activité locale. Aucun de ces éléments n’est transmis à un service NextExplorer.
