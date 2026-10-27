# J1.7 — recette de l'EXE sur Windows isolé

## Sources corrigées sans nouveau binaire — 24 octobre 2026

L’enregistrement préserve désormais une clé existante et ses permissions. Le test
`scripts/test-host-registration.ps1` est appelé par la recette d’installation.
Contrôles des sources corrigées réalisés dans la VM : véritables refus d’écriture
du registre/manifeste, réparation ambiguë et choix explicite, récupération après
retrait partiel. Mise à jour pendant une copie de 200 fichiers et reprise explicite
d’une tâche interrompue vérifiées avec les binaires existants.

**Ne pas reconstruire le Setup pour cette session.** L’EXE 1.0.6 ci-dessous est
inchangé et ne contient pas le correctif des sources. Lorsqu’une reconstruction
sera demandée, vérifier le nouvel EXE et rejouer la recette du paquet correspondant.
[Preuves et distinctions entre sources/EXE](VALIDATION_WINDOWS_NEUF.md).
Le profil Windows accentué reste non qualifié : l’installation de Windows dans
la VM dédiée a échoué avant lancement de NextExplorer. Ne pas confondre cette
limite avec les chemins accentués et les autres recettes déjà réussies.

## Recette principale réussie — candidat local 1.0.6, 22 octobre 2026

VirtualBox 7.0.12 est disponible sur le poste, hors du PATH. Une VM dédiée
`NextExplorer-Windows-Clean-1.0.6` a été créée sous `.tools/windows-acceptance`,
sans modifier les VM Home Assistant existantes. Windows 11 Enterprise Evaluation
26H2 x64 anglais, build 26300.9457 détecté dans l’ISO, a été installé sur un disque
virtuel neuf (8 Go de RAM, 4 CPU, EFI et TPM 2.0). Le démarrage a nécessité
l’activation du minuteur HPET dans cette VM après une erreur HAL ; aucun réglage
de sécurité ou d’hyperviseur du Windows hôte n’a été modifié.

ISO officiel vérifié :
`BC3F24086EBADC94489066B5AD78089E2CF5C3491E90E790BB81A2B199C10E38`.
[Image Microsoft](https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise),
[empreinte de référence](https://support.microsoft.com/en-us/servicing/os/windows/docs/2026/09/verify-the-authenticity-of-a-windows-11-enterprise-evaluation-iso-file).

Installateur à vérifier : `release/NextExplorer-1.0.6-Setup.exe`, SHA-256
`c5c6986b153b808ff901ea4c5cb2df8504d366a670ace44d79a772aa8b8f3560`.
Le kit `release/recette-windows` contient cette copie ; préparation par
`npm run setup:acceptance`. Preuves Chrome dans `test-results/windows-clean-1.0.6`,
preuves Edge dans `test-results/windows-edge-1.0.6`.
Le kit a été transféré directement dans l’invité, les dossiers partagés étant
indisponibles. Le parcours principal est réussi : annulation, installation,
connexion et fichier témoin dans Chrome et Edge, reconnexion après fermeture, réinstallation
saine, réparation du manifeste, annulation de désinstallation et désinstallation.
Entrée Windows/raccourcis vérifiés ; témoin, versions et sauvegardes conservés.
Edge 152.0.4191.66 : panneau latéral natif ouvert, enregistrement Chrome étranger
et manifeste témoin préservés pendant toute la recette et après désinstallation.
[Rapport, preuves et limites](VALIDATION_WINDOWS_NEUF.md). Le transfert local ne
qualifie pas SmartScreen sur un téléchargement public. Les cas complémentaires
de J1.7 restent ouverts. Le disque virtuel est désormais sur le SSD C:.

**Complément réussi le 24 octobre :** mise à jour au repos 1.0.3 → 1.0.6, dans
le même profil Edge, avec installateurs et fichier témoin dans des chemins
accentués. Ancien runtime, préférences et témoin préservés ; désinstallation finale
réussie. Preuves : `test-results/windows-upgrade-1.0.3-to-1.0.6`.
Le profil Windows accentué et les tâches actives pendant la mise à jour restent
à qualifier.

**Cas d’échec ciblés réussis le 24 octobre :** aperçu refusé et état inchangé pour
un enregistrement Edge étranger. Désinstallation refusée si le script de retrait
est absent ou se termine par `exit 42` ; paquet restant, registre, entrée Windows,
raccourcis et témoin conservés. Le même Setup restaure le script original après
chaque défaut ; connexion et lecture réelles vérifiées ensuite dans Edge 156.
Les défauts d’écriture, de disque et d’ACL ainsi que la réparation ambiguë restent
à tester. [Rapport détaillé](VALIDATION_WINDOWS_NEUF.md).

## Candidat public précédent — 1.0.3, 20 octobre 2026

Le kit préparé à cette date contenait l’EXE public 1.0.3 exact, le contrôleur,
la procédure et son SHA256. Préparation explicite :
`npm run setup:acceptance -- -SetupPath release/distribution/1.0.3/NextExplorer-1.0.3-Setup.exe`.
Empreinte : `ee21c7328a262c00d512f6f3bf5fb319bb5afc996f9c724edf2e9d002939ae07`.

Identité officielle Store `afjflepinklhgicoppoobiichmjodgcp` vérifiée avec
Native Messaging réel. Compilation, 240 tests, connexion guidée, moteurs/console,
backend et contrôleur de maintenance, interface de l’assistant réussis sur le
poste de développement. Le backend et le contrôleur utilisent un registre simulé ;
le test UI n’appuie jamais sur Installer. **La recette Windows propre reste ouverte.**
Le poste est sous Windows 11 Famille ; aucun outil de VM disponible détecté.

## Historique des préparations

**Évolution de l’assistant en développement, 19 octobre :** le parcours normal
utilise l’identité du paquet et saute les champs techniques. La case
**Afficher les réglages avancés** les conserve pour la réparation/développement.
Tester également le retour au parcours normal après modification de ces champs :
identité rétablie, récupération effacée, nouvel aperçu calculé. La recette UI
isolée couvre ces parcours sans installation. La release publique 1.0.1 conserve
l’ancien assistant ; aucune de ces vérifications ne clôture la recette Windows
propre ci-dessous.

**Première connexion guidée en développement :** après l’écran de fin, revenir
dans NextExplorer, vérifier la connexion et choisir le premier dossier.
Contrôler le lien vers l’EXE de la même version, le retour automatique après
téléchargement et le bouton de vérification, l’annulation du sélecteur, le
dossier personnel et la reprise sans nouvel accueil. Les détails techniques
doivent rester repliés ; une mise à jour rappelle de désactiver/réactiver
l’extension. La recette `npm run test:connection:extension` utilise Chromium
et Native Messaging réels avec profil/dossiers/enregistrement Chromium isolés ;
elle simule la disponibilité du compagnon et intercepte le lien de téléchargement,
sans installer ni exécuter d’EXE téléchargé. Elle ne remplace pas le contrôle
de l’installation réelle ci-dessous et ne modifie pas l’enregistrement Chrome.

Résultat local du 19 octobre : parcours de connexion et console réels réussis,
234 tests TypeScript, compilation et parcours navigateur complet réussis.
Preuves : `test-results/connection-{extension,check,build,browser}.log` et
captures `connection-*.png`. L’EXE compilé a été parcouru jusqu’à l’aperçu en
fixture isolée (`connection-installer-ui.log`), sans installation effective.

**Correctif de mise à jour du 19 octobre 2026 :** l’EXE compare les empreintes du compagnon actif et de sa politique avec le paquet. Une liaison valide avec un ancien binaire doit déclencher une nouvelle copie et une sauvegarde, avec conservation des moteurs ; un paquet identique reste sans réinstallation du compagnon. Vérifier ce scénario depuis une installation précédente fonctionnelle, puis désactiver/réactiver l’extension et ouvrir **Aperçu → Console**. Contrôler l’égalité SHA256 entre `package/native/native-host.exe` et l’exécutable désigné par le manifeste actif. La recette automatisée du backend couvre la différence de binaire/politique, le retour arrière après échec d’enregistrement et le refus d’un paquet changé après l’aperçu ; elle ne remplace pas la recette de l’EXE sur Windows propre.

**Paquet du 18 octobre 2026 :** organisation et actions rapides décrites dans [le guide dédié](AMELIORATIONS_FINDER.md). Les ressources PDF.js (worker, CMaps, polices) et licences sont incluses dans le paquet/EXE ; elles ne doivent pas être téléchargées à l’ouverture de l’outil. Ajouter à la recette navigateur un PDF annoté hors connexion et la vue **Ce PC**. Le kit préparé ne vaut pas validation de cette recette sur Windows propre.

État au 18 septembre 2026 : kit préparé, **recette réelle non exécutée**. Le poste de développement est sous Windows 11 Famille, sans Windows Sandbox détecté. Les tests à registre simulé de J1.3–J1.6 ne remplacent pas cette recette.

**Paquet J5 du 17 octobre :** guide médias/tâches durables inclus. La reconstruction du kit ne clôture pas J1.7. Ajouter au contrôle de mise à jour : terminer les anciennes tâches, fermer l’extension une minute si l’ancien worker reste actif, installer le nouveau compagnon puis vérifier la navigation et la récupération explicite des états. Aucune tâche interrompue ne doit être rejouée automatiquement.

## Environnement

Utiliser une VM Windows 10/11 x64 jetable, avec un compte standard neuf et Chrome ou Edge installé. Ne pas utiliser le compte personnel de développement. Prendre un instantané de VM. Aucune donnée personnelle réelle nécessaire. Ne pas contourner les protections de Windows pour accepter l'EXE non signé ; consigner tout blocage.

Le kit `release/recette-windows` contient l'EXE inchangé, son SHA256, cette procédure et le contrôleur PowerShell. Copier ce dossier dans la VM. Le contrôleur lit le vrai registre HKCU et les fichiers, écrit seulement les preuves dans `evidence`, et refuse un état initial déjà installé. Il ne lance pas l'installation et ne prouve pas une connexion navigateur.

Depuis PowerShell ouvert dans le kit :

```powershell
Set-Content -LiteralPath "$env:USERPROFILE\Documents\temoin-recette.txt" -Value 'A conserver pendant toute la recette'
.\check-setup-acceptance.ps1 -Stage Baseline -PersonalFile "$env:USERPROFILE\Documents\temoin-recette.txt"
```

Comparer le SHA256 de l'EXE avec `SHA256.txt` avant toute exécution. Conserver la version Windows, la version Chrome, les captures et les résultats avec le rapport. Les preuves contiennent les chemins du compte jetable : les examiner avant partage.

Pour Edge, choisir **Edge** dans l’assistant et ajouter `-Browser Edge` à **toutes**
les commandes du contrôleur, dès Baseline. Utiliser `edge://extensions` et un
nouveau dossier de preuves. Le navigateur doit rester le même pendant la recette.
Le contrôleur refuse un enregistrement initial du navigateur choisi ; les valeurs
des autres navigateurs sont conservées et comparées à chaque étape, y compris
après désinstallation. Chrome reste le choix par défaut des commandes ci-dessous.

## Parcours à exécuter dans l'ordre

1. **Annulation avant installation.** Ouvrir l'EXE, choisir Chrome, garder l'identifiant prérempli, atteindre l'aperçu puis annuler et confirmer la fermeture. Exécuter `-Stage Cancelled` : aucun fichier d'installation ni enregistrement navigateur ne doit avoir été ajouté.
2. **Installation.** Relancer, atteindre l'aperçu, installer, attendre la fermeture. Exécuter `-Stage Installed`. Vérifier également les raccourcis du menu Démarrer et l'entrée de désinstallation Windows.
3. **Connexion réelle.** Dans `chrome://extensions`, charger `%LOCALAPPDATA%\Programs\NextExplorer\package\dist`. Vérifier l'identifiant, « Compagnon connecté », puis ouvrir le fichier témoin dans l'explorateur. Fermer/réouvrir Chrome et recommencer. Capturer ces résultats ; un diagnostic structurel ne suffit pas.
4. **Réinstallation saine.** Relancer le même EXE, installer à nouveau puis exécuter `-Stage Reinstalled`. Les versions du compagnon sain doivent rester identiques. Vérifier encore la connexion Chrome.
5. **Réparation.** Fermer Chrome. Dans le compte jetable uniquement, renommer `%LOCALAPPDATA%\Programs\NextExplorer\com.local.file_explorer.json` en `com.local.file_explorer.json.recipe-backup` (ne pas toucher aux copies sous `versions`). Exécuter `-Stage RepairPrepared`. Ouvrir le raccourci de maintenance, vérifier les corrections annoncées, appliquer puis exécuter `-Stage Repaired`. Refaire la preuve de connexion Chrome et fermer Chrome.
6. **Annulation de désinstallation.** Ouvrir `unins000.exe` dans le dossier d'installation, refuser la confirmation. Exécuter `-Stage UninstallCancelled`. La liaison doit encore fonctionner.
7. **Désinstallation.** Fermer Chrome, relancer le désinstalleur et confirmer. Attendre sa fermeture puis exécuter `-Stage Uninstalled`. Vérifier aussi la disparition des raccourcis et de l'entrée Windows. Les versions, sauvegardes et le fichier témoin doivent être conservés. L'extension chargée manuellement se retire séparément de Chrome.

Chaque commande utilise `powershell -NoProfile -ExecutionPolicy Bypass -File .\check-setup-acceptance.ps1 -Stage NOM` si la politique de scripts du compte de test l'exige. Arrêter au premier échec, conserver captures/messages et revenir à l'instantané pour une nouvelle tentative. Ne pas écraser Baseline pour faire disparaître un écart.

## Cas complémentaires avant clôture J1.7

### Mise à jour entre versions et chemins accentués

Dans le compte jetable, partir de la release 1.0.3 exacte, choisir Edge et vérifier
la connexion avant de mettre à jour. Placer les deux EXE dans un dossier tel que
`Dossier été – Rémy\Installateurs été`, puis lire un fichier `Été – données témoin.txt`
contenant du texte UTF-8 accentué. Choisir des préférences reconnaissables, par
exemple le thème clair et l’accent violet, et conserver les empreintes du témoin
et des fichiers sous `versions`.

Terminer les tâches, fermer Edge, puis lancer la 1.0.6 **sans désinstaller la 1.0.3**.
Choisir le même navigateur et la même identité. Vérifier que le nouveau manifeste
pointe vers un nouveau binaire, que l’ancien runtime reste intact et que les
raccourcis ne sont pas dupliqués. Relancer le même profil Edge, vérifier HELLO
1.0.6, la version de l’extension, le texte exact du témoin et les préférences
effectivement appliquées. Désinstaller ensuite et vérifier le retrait de la
liaison/entrée Windows/raccourcis et la conservation du témoin, des versions et
des sauvegardes. Garder les preuves avant/après dans des fichiers distincts.

Ce parcours au repos ne couvre ni les tâches actives/interrompues pendant une
mise à jour, ni un profil Windows dont le chemin contient lui-même des accents.

### Autres cas

Pour les échecs de désinstallation, utiliser uniquement le compte jetable :
déplacer `package\scripts\install-host.ps1` dans le dossier de recette, puis
lancer le vrai `unins000.exe`. Conserver le message affiché et comparer registre,
empreintes du paquet, entrée Windows, raccourcis et témoin avant/après. Une
désinstallation refusée doit laisser l’état contrôlé intact. Relancer ensuite
le même Setup pour restaurer le paquet et vérifier de nouveau la connexion.
Rejouer avec une copie temporaire du script contenant seulement `exit 42` pour
tester un retrait qui échoue. Conserver les originaux hors du dossier installé,
ainsi que les preuves distinctes de chaque défaut et de chaque réparation.

- Rejouer sur un compte avec accents ; le contrôleur permet désormais Chrome, Edge ou Chromium (`-Browser`).
- Enregistrement étranger : refus d’aperçu et conservation validés dans la VM avec un manifeste témoin inerte ; une autre installation active reste un cas distinct.
- Tester un identifiant invalide puis corrigé, une source incomplète, une réparation ambiguë et un échec d'application ; aucune réussite affichée à tort.
- Retrait absent ou en erreur immédiate (`exit 42`) : refus et conservation validés dans la VM ; retrait partiel avant erreur et défauts d’écriture restent à tester.
- Après chaque échec, vérifier la conservation du témoin et la possibilité de réparer/réinstaller.

La clôture exige les preuves du vrai EXE, du vrai registre et du navigateur. La signature, la boutique et la mise à jour automatique restent des travaux distincts.
