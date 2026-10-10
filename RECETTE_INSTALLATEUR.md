# J1.7 — recette de l'EXE sur Windows isolé

État au 18 septembre 2026 : kit préparé, **recette réelle non exécutée**. Le poste de développement est sous Windows 11 Famille, sans Windows Sandbox détecté. Les tests à registre simulé de J1.3–J1.6 ne remplacent pas cette recette.

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
