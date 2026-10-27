# Dossiers distants — sources du 26 octobre 2026

Priorité demandée : **serveur SFTP / SSH**. Cette intégration utilise le compagnon Go existant. Aucun code ni connecteur de l’autre projet NextExplorer n’est repris. Les fichiers et identifiants passent directement entre ce PC et le serveur choisi, sans service cloud NextExplorer.

## Inspirations vérifiées

| Outil | Usage retenu | Adaptation dans notre interface |
|---|---|---|
| [FileZilla](https://filezillapro.com/docs/v3/features-v3/filezilla-pro-features/) | Connexions enregistrées, FTP/FTPS/SFTP, transferts et comparaison | Carnet de serveurs compact, double panneau existant, Activité commune et gestion explicite des conflits. Les connexions cloud de FileZilla Pro ne sont pas reprises. |
| [GNOME Files](https://help.gnome.org/gnome-help/nautilus-connect.html) | Parcourir un serveur comme un emplacement et le retrouver dans la navigation | Catégorie Serveurs repliable, dossiers dans les onglets ordinaires, favoris existants réutilisables. |
| [Dolphin](https://docs.kde.org/stable_kf6/en/dolphin/dolphin/panels.html) | Emplacements, onglets et console proche du dossier actif | Même organisation locale et distante. Notre console SSH est une commande explicite : le manuel de Dolphin ne décrit le suivi du terminal que pour les emplacements locaux. |
| [Krusader](https://docs.kde.org/trunk_kf6/en/krusader/krusader/synchronizer.html) | Comparer et examiner les opérations avant synchronisation | Comparaison du niveau affiché, sélection des éléments puis préparation d’une copie. Aucun miroir destructif automatique. |

Ces références décrivent des parcours utiles ; elles ne constituent pas une mesure de popularité des logiciels Linux ni une promesse de parité fonctionnelle.

## Parcours disponible dans les sources

1. **Réglages → Connexions → Activer les connexions aux serveurs**, puis **Enregistrer**.
2. **Gérer les connexions**, ou **Serveurs → +** dans la navigation.
3. Renseigner le nom, le serveur, le port, l’utilisateur et le dossier initial absolu. SFTP utilise le port 22 par défaut ; FTP/FTPS explicite, le port 21.
4. Fournir le mot de passe ou le chemin local d’une clé privée SSH et sa phrase secrète. La mémorisation est facultative et protégée par Windows pour ce compte.
5. À la première connexion SSH, comparer l’empreinte avec celle communiquée par l’administrateur, puis l’approuver. Les identifiants ne sont pas envoyés avant cette vérification. Une clé différente de celle approuvée bloque la connexion.
6. Le serveur s’ouvre dans un nouvel onglet. La barre indique son nom, son protocole et son utilisateur. Le fil d’Ariane conserve les noms Unicode et la casse des chemins Linux.
7. Ouvrir le **double panneau**, choisir un dossier local dans l’autre moitié, puis glisser les fichiers d’un panneau à l’autre, ou utiliser **Copier / Coller**. La confirmation propose de conserver les deux noms ou d’ignorer un conflit. L’Activité permet la pause et l’arrêt.
8. **Comparer** prépare une sélection par nom, taille et date, dans le sens du panneau actif vers l’autre. Les contenus ne sont pas comparés ; même taille/date ne prouve pas leur égalité. Les filtres par nom doivent être retirés.
9. Clic droit sur un élément distant : aperçu, copie, renommage, permissions Unix en SFTP, ou suppression explicite. La suppression est définitive, sans corbeille distante, et refuse les dossiers non vides.
10. **Aperçu → Console → Ouvrir SSH** lance un terminal sur ce serveur. L’affichage est distinct de PowerShell. Aucun shell distant ne s’ouvre automatiquement lorsqu’on change de dossier ou d’onglet.

## Protections et limites de ce lot

- SFTP : navigation, lecture bornée, création de dossiers, renommage sans remplacement, permissions non récursives, suppression de fichiers/dossiers vides, copies de dossiers et fichiers dans les deux sens.
- FTP/FTPS : navigation et téléchargement vers un dossier local. Les envois et le renommage sont refusés dans ce lot : ils nécessitent une stratégie sûre de publication sans écrasement. FTP impose une acceptation explicite du transport non chiffré ; FTPS valide normalement le certificat, sans option « ignorer ».
- Copie uniquement aux frontières distantes. Aucun déplacement ou écrasement implicite. Les liens symboliques sont refusés pour les copies. Les noms incompatibles avec Windows sont refusés avant les écritures.
- Plan borné à 10 000 éléments, 8 Mio de métadonnées, 64 niveaux et 8 Tio par fichier. Les dossiers de plus de 10 000 entrées demandent une subdivision. Listes paginées sur un instantané, sans watcher distant.
- Chaque fichier est écrit dans un fichier temporaire exclusif, relu et vérifié avec SHA-256 avant publication. Les envois demandent donc aussi le droit de relire la copie distante. Les fichiers existants sont préservés, y compris lors d’un conflit apparu après la préparation. Les dates et permissions d’origine ne sont pas reproduites sur les copies.
- Une pause conserve la tâche en mémoire. Un arrêt peut fermer la connexion utilisée pour interrompre une lecture réseau, et ferme alors aussi sa console SSH. Après une coupure, un fichier `.nxe-….part` peut rester ; l’erreur indique le chemin à contrôler si son nettoyage échoue. Les copies déjà terminées et dossiers créés restent présents.
- La file et ses résultats sont conservés par le worker. **Aucune reprise automatique ou reprise à l’octet après arrêt du processus/PC** : vérifier les copies puis relancer explicitement avec conservation des deux noms ou ignorer les conflits.
- Les tâches sont liées à l’identité de la connexion enregistrée lors de leur mise en file. Changer de serveur ne redirige pas une copie déjà préparée ; modifier ou supprimer une connexion utilisée par le transfert actif demande d’abord de terminer ou arrêter cette tâche.
- La console nécessite un serveur SSH autorisant PTY, un shell POSIX `sh` et `base64`. Le suivi attend un prompt et n’insère pas un changement de dossier dans une commande en cours de saisie. Une connexion SFTP seule peut refuser le shell.
- Mots de passe et phrases secrètes : DPAPI Windows, hors stockage Chrome, exports des préférences et tâches. Les noms d’hôtes et chemins des profils sont des métadonnées locales. La désactivation masque les commandes et empêche la navigation distante ; les tâches déjà lancées restent à contrôler dans l’Activité.
- À compléter ensuite : agent SSH et authentification multifacteur, édition distante, recherche récursive, navigation liée, synchronisation récursive, reprise à l’octet, conservation des dates/permissions et qualification FTP/FTPS sur des serveurs externes.

## Validation et recette

- [x] Tests Go avec serveur SSH/SFTP réel en mémoire sur l’interface loopback : challenge avant authentification, validation du pin, clé différente refusée, mauvais mot de passe, dossiers et accents, lectures par morceaux, envoi/téléchargement récursifs et vérification du contenu, conflits sans écrasement, refus des outils locaux.
- [x] Protection Windows du secret, absence du secret dans les réponses publiques et tâches, suppression conditionnée par l’état du fichier, annulation et refus du rejeu après interruption.
- [x] Tests TypeScript : URI distantes, chemins, comparaison, activation désactivée par défaut et séparation des actions.
- [x] Recette navigateur dédiée : activation, profils, empreinte, navigation Unicode, dépôt en copie uniquement, comparaison, SSH explicite et fenêtre de connexion compacte (`npm run test:remote`, réseau simulé).
- [x] Refus d’un certificat FTPS non approuvé sur serveur TLS loopback ; PTY/commande SSH et isolation des propriétaires testés sur serveur SSH loopback avec shell simulé.
- [ ] Recette utilisateur sur ton serveur : clé/mot de passe, droits réels, réseau interrompu, gros fichiers, console POSIX, double panneau et copies dans les deux sens.
- [ ] Qualification FTP/FTPS complète sur des serveurs externes, avant de les présenter au même niveau que SFTP.

Le parcours navigateur automatisé utilise un réseau simulé ; le moteur SFTP est testé séparément avec le serveur Go loopback. Ce ne sont pas des essais sur ton serveur personnel.

Validation finale : **266 tests TypeScript**, suite Go complète et build web réussis. Recettes navigateur des connexions distantes, de la console PowerShell réelle et de l’ergonomie (390/800/1440 px) réussies. Captures locales non publiées : `test-results/remote-trust.png`, `remote-compare.png`, `remote-workspace.png`, `remote-compact.png`. Notices Go ajoutées aux ressources distribuables ; aucun moteur serveur externe n’est embarqué.

**Mise à jour du 27 octobre 2026 :** le compagnon 1.0.6 est recompilé avec ces fonctions et inclus dans la [préversion privée](https://github.com/Gremy44/NextExplorer/releases/tag/preview-2026-10-27), avec l’extension correspondante. Le Setup existant reste inchangé. Pour essayer cette archive, l’extraire entièrement, lancer `scripts/install-host.ps1` dans PowerShell puis charger ou recharger son dossier `dist` dans Chrome/Edge. Désactiver puis réactiver l’extension si elle garde une ancienne connexion. La compilation seule ne remplace pas le compagnon déjà installé sur ce PC.
