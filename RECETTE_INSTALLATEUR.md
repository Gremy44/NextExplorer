# J1.7 — recette de l'EXE sur Windows isolé

## Candidat courant — 1.0.3, 20 octobre 2026

Le kit `release/recette-windows` contient l’EXE public 1.0.3 exact, le contrôleur,
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

Utiliser une VM Windows 10/11 x64 jetable, avec un compte standard neuf et Chrome installé. Ne pas utiliser le compte personnel de développement. Prendre un instantané de VM. Aucune donnée personnelle réelle nécessaire. Ne pas contourner les protections de Windows pour accepter l'EXE non signé ; consigner tout blocage.

Le kit `release/recette-windows` contient l'EXE inchangé, son SHA256, cette procédure et le contrôleur PowerShell. Copier ce dossier dans la VM. Le contrôleur lit le vrai registre HKCU et les fichiers, écrit seulement les preuves dans `evidence`, et refuse un état initial déjà installé. Il ne lance pas l'installation et ne prouve pas une connexion navigateur.

Depuis PowerShell ouvert dans le kit :

```powershell
Set-Content -LiteralPath "$env:USERPROFILE\Documents\temoin-recette.txt" -Value 'A conserver pendant toute la recette'
.\check-setup-acceptance.ps1 -Stage Baseline -PersonalFile "$env:USERPROFILE\Documents\temoin-recette.txt"
```

Comparer le SHA256 de l'EXE avec `SHA256.txt` avant toute exécution. Conserver la version Windows, la version Chrome, les captures et les résultats avec le rapport. Les preuves contiennent les chemins du compte jetable : les examiner avant partage.

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

- Rejouer sur un compte avec accents et avec Edge ; le contrôleur fourni cible actuellement Chrome seul.
- Tester la protection d'un enregistrement appartenant à une autre installation : aperçu bloqué, valeur préservée.
- Tester un identifiant invalide puis corrigé, une source incomplète, une réparation ambiguë et un échec d'application ; aucune réussite affichée à tort.
- Tester une désinstallation dont le script de retrait est absent ou échoue : consigner précisément l'état restant.
- Après chaque échec, vérifier la conservation du témoin et la possibilité de réparer/réinstaller.

La clôture exige les preuves du vrai EXE, du vrai registre et du navigateur. La signature, la boutique et la mise à jour automatique restent des travaux distincts.
