# Validation de l’installation Windows

## Pilote public 1.0.7 — 29 octobre 2026

Le [candidat public exact](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.7-pilot.1) a été vérifié dans la VM dédiée Windows 11 Enterprise Evaluation, avec compte **standard**, Windows Defender temps réel actif, Chrome **156.0.8078.73** et Edge **156.0.4314.50**.

Installateur : `NextExplorer-1.0.7-Setup.exe`, 8 290 504 octets, SHA-256 **`8765e99cb3fe73e62a0c49c488906f37161a66c7e27f1fa8ddf81c2427023d72`**, non signé. L’extension et le compagnon annoncent 1.0.7, identité `afjflepinklhgicoppoobiichmjodgcp`.

| Parcours du candidat | Chrome | Edge |
| --- | --- | --- |
| Compagnon absent au départ, état de référence et fichier témoin | PASS | PASS |
| Annulation de l’assistant, fichiers/registre inchangés | PASS | PASS |
| Installation du véritable EXE et connexion Native Messaging | PASS | PASS |
| Liste du dossier et lecture exacte du témoin | PASS | PASS |
| Fermeture forcée puis relance du navigateur | PASS | Réouverture contrôlée après réparation |
| Réinstallation du même EXE, manifeste renommé puis réparation | PASS | PASS |
| Connexion et lecture après réparation | PASS | PASS |
| Annulation puis confirmation de désinstallation, témoin préservé | PASS | PASS |
| Entrée Windows 1.0.7, trois raccourcis et cibles existantes | PASS | Même mécanisme d’installation ; contrôles registre/fichiers |
| Enregistrement Chrome étranger et manifeste témoin préservés | Sans fixture étrangère dans ce parcours | PASS pendant toute la recette |

Preuves privées : `test-results/windows-pilot-1.0.7/chrome-evidence` et `edge-evidence`, avec rapports de cycles, états, journaux et captures. Les fichiers publiés ont ensuite été téléchargés **sans authentification** depuis la release GitHub et comparés aux empreintes locales. Les deux guides liés au tag sont accessibles publiquement.

La VM existante a été réutilisée : ancien état NextExplorer archivé et liaisons de test retirées avant la nouvelle référence, sans compagnon installé au départ. Windows lui-même n’a pas été réinstallé et le profil de recette avait déjà servi. La validation n’est pas une mesure de réputation SmartScreen ; le transfert de l’EXE dans la VM était local. Profils Windows accentués, autres configurations de sécurité, serveurs distants externes et pilote de 5 à 10 personnes restent à qualifier. Aucune protection n’a été désactivée pour ce parcours.

L’assistant pilote explique le chargement manuel dans Chrome/Edge et le chemin du dossier installé. Les anciens EXE restent conservés ; le nouvel EXE ne remplace pas silencieusement les fichiers déjà publiés d’une ancienne release.

## Recette historique — 1.0.6, 22 octobre 2026

**Parcours principal Windows 11 / Chrome et Edge réussi dans une VM isolée.** L’EXE
réel a été installé, réinstallé, réparé et désinstallé avec un compte standard.
Le vrai registre et les fichiers Windows ont été contrôlés, et Chrome a joint
le compagnon installé. Edge a ensuite passé le même parcours, décrit ci-dessous.
Aucun binaire n’a été reconstruit après ces essais.

## Candidat et environnement

- EXE : `release/NextExplorer-1.0.6-Setup.exe`.
- SHA-256 : `c5c6986b153b808ff901ea4c5cb2df8504d366a670ace44d79a772aa8b8f3560`.
- Windows 11 Enterprise Evaluation x64 neuf, build observé `10.0.26300.0`.
- Chrome officiel `156.0.8078.48`, extension chargée manuellement depuis le
  dossier installé ; identité `afjflepinklhgicoppoobiichmjodgcp`.
- Compte local `nxeqa`, retiré du groupe Administrateurs avant la recette.
  Ni Go ni Node présents ; aucun moteur média facultatif installé.
- Defender temps réel actif, signatures invitées `1.437.1.0` au démarrage.
  Le scan séparé sur l’hôte, avec signatures `1.461.145.0`, n’a relevé aucune
  menace dans ce même EXE et le compagnon : `test-results/defender-1.0.6.json`.
- VirtualBox 7.0.12, 8 Go de RAM, 4 CPU, EFI et TPM 2.0. HPET activé dans
  cette VM après une erreur de démarrage HAL. Disque virtuel déplacé sur le SSD
  C: ; configuration, ISO et préparation restent sous `.tools/windows-acceptance`.

L’[ISO Microsoft](https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise)
a été contrôlé avec son [empreinte officielle](https://support.microsoft.com/en-us/servicing/os/windows/docs/2026/09/verify-the-authenticity-of-a-windows-11-enterprise-evaluation-iso-file)
`BC3F24086EBADC94489066B5AD78089E2CF5C3491E90E790BB81A2B199C10E38`.
Les dossiers partagés de la VM n’étant pas disponibles dans l’invité, le kit
a été transféré directement avec Guest Control. L’installation de Chrome a
précédé le retrait des droits administrateur ; NextExplorer n’a pas été élevé.

## Résultats Chrome

| Contrôle réel | Résultat |
|---|---|
| État initial : aucun paquet NextExplorer ni enregistrement natif | PASS — `Baseline.json` |
| Annulation à l’écran Prêt à installer | PASS — fichiers/registre identiques, `Cancelled.json` |
| Installation par l’EXE sous compte standard | PASS — `Installed.json` |
| Entrée Windows 1.0.6 et trois raccourcis aux cibles existantes | PASS — `Installed-desktop.json` |
| Chrome : HELLO 1.0.6, dossier témoin listé et texte lu à l’octet attendu | PASS — `Installed-browser.json` et capture |
| Fermeture forcée puis relance de Chrome, reconnexion et fichier retrouvé | PASS — `Restarted-browser.json` |
| Réinstallation du même EXE | PASS — runtime sain inchangé, `Reinstalled.json` |
| Manifeste renommé, réparation par le raccourci de maintenance | PASS — `RepairPrepared.json`, `Repaired.json` |
| Connexion et lecture Chrome après réparation | PASS — `Repaired-browser.json` |
| Refus de la confirmation de désinstallation | PASS — état inchangé, `UninstallCancelled.json` |
| Désinstallation confirmée | PASS — paquet/maintenance/désinstalleur et liaisons navigateur retirés, `Uninstalled.json` |
| Suppression de l’entrée Windows et des raccourcis | PASS — `Uninstalled-desktop.json` |
| Conservation du témoin, des copies de runtime et sauvegardes prévues | PASS — contrôleur de recette |

Les enregistrements Edge et Chromium n’ont pas été modifiés. Les preuves sont
dans `test-results/windows-clean-1.0.6/evidence/`, avec l’archive `evidence.zip`.
Le manifeste global est `evidence/validation-summary.json`. Les anciennes
captures d’échec du pilote de test restent conservées : adaptation aux boutons
Windows anglais Yes/No, clics asynchrones pour les confirmations et sélection
du dossier d’extension. Le produit n’a pas été modifié pour faire passer la recette.

## Résultats Edge — 22 octobre 2026

Même EXE et même Windows isolé, avec **Microsoft Edge officiel 152.0.4191.66**
déjà présent dans l’image. Le compte reste standard et sans outils de développement.
L’installation Chrome précédente a été désinstallée ; ses copies de runtime
conservées ont été déplacées dans le dossier de recette avant la nouvelle Baseline.
Le dossier d’installation NextExplorer était absent au départ de cet essai.

Un enregistrement Chrome témoin, étranger et inerte, pointe vers un manifeste
séparé : aucune application ne lui est associée. Sa valeur et l’empreinte de ce
manifeste sont inchangées après tout le parcours Edge. Cela vérifie la conservation
d’un autre navigateur, sans prétendre tester une seconde installation active.

| Contrôle réel Edge | Résultat |
|---|---|
| Annulation avant installation | PASS — fichiers et registre inchangés |
| Installation, entrée Windows et trois raccourcis valides | PASS |
| HELLO 1.0.6, dossier listé et texte lu à l’octet attendu | PASS — `Installed-browser.json` |
| Fermeture forcée d’Edge, relance et reconnexion | PASS — `Restarted-browser.json` |
| Réinstallation du même EXE et réparation du manifeste renommé | PASS — `Reinstalled.json`, `Repaired.json` |
| Connexion et lecture après réparation | PASS — `Repaired-browser.json` |
| Ouverture du panneau latéral natif, contenu et hauteur disponible | PASS — `native-sidepanel.json` et capture |
| Annulation puis confirmation de désinstallation | PASS — `UninstallCancelled.json`, `Uninstalled.json` |
| Retrait de la liaison Edge, du paquet, de l’entrée Windows et des raccourcis | PASS |
| Témoin personnel, versions et sauvegardes conservés | PASS |
| Enregistrement Chrome étranger et son manifeste préservés | PASS — `foreign-chrome-preserved.json` |

Preuves séparées : `test-results/windows-edge-1.0.6/evidence/` et `evidence.zip` ;
capture `test-results/windows-edge-1.0.6/Edge-native-sidepanel.png`.
Extension chargée en mode développeur depuis le dossier installé, avec la même
identité officielle que Chrome. La première sélection du navigateur par le pilote
UI et la validation du sélecteur de dossier ont demandé des ajustements manuels ;
les journaux/captures sont conservés. Aucun correctif du produit n’a été nécessaire.
Le contrôleur de recette accepte désormais `-Browser Edge`, impose le même
navigateur à toutes les étapes et vérifie la conservation des autres enregistrements.
Ses tests de non-régression Chrome/Edge ont réussi sur l’hôte avec registre simulé.

## Mise à jour 1.0.3 → 1.0.6 et chemins accentués — 24 octobre 2026

Les deux EXE exacts ont été lancés dans la même VM, sous compte standard, depuis
`Dossier été – Rémy\Installateurs été`. La release 1.0.3 a d’abord été installée
et utilisée dans un nouveau profil Edge. Empreinte de cet ancien EXE :
`ee21c7328a262c00d512f6f3bf5fb319bb5afc996f9c724edf2e9d002939ae07`.
La 1.0.6 conserve l’empreinte du candidat indiqué en tête de rapport.

Le fichier `Été – données témoin.txt` contient `Données été : Rémy, café, Noël, €.`
suivi de CRLF, enregistré en UTF-8 sans BOM. Les lectures natives avant/après
ont rendu exactement ce texte. Le navigateur a affiché ce dossier et son fichier.
Les préférences thème clair/accent violet, enregistrées dans la 1.0.3, sont
conservées dans le même profil et effectivement appliquées après la mise à jour.

L’extension 1.0.3 a été remplacée par la 1.0.6 sans désinstallation préalable.
Le manifeste natif pointe vers un nouveau binaire ; toutes les empreintes des
fichiers de l’ancien runtime sont inchangées. HELLO et le manifeste de l’extension
annoncent 1.0.6 après relance. Le compagnon embarqué dans l’ancienne release
annonçait 1.0.0 dans HELLO ; sa version d’extension était bien 1.0.3.

La désinstallation après mise à jour est également réussie : paquet et liaison
Edge retirés, entrée Windows et raccourcis supprimés, témoin et copies des deux
runtimes/sauvegardes préservés. L’enregistrement Chrome étranger et son manifeste
sont intacts. Une seule entrée Windows et trois raccourcis valides étaient présents
après chaque installation.

Preuves : `test-results/windows-upgrade-1.0.3-to-1.0.6/evidence/` et `evidence.zip` ;
rapports `Legacy-installed.json`, `Upgrade-installed.json`, `Upgrade-state.json`,
`Legacy-browser.json`, `Upgraded-browser.json` et `validation-summary.json`.
La capture `Upgraded-Unicode-preferences.png` montre le dossier accentué et les
préférences appliquées. Les échecs initiaux du pilote restent visibles dans les
captures : lancement clavier trop précoce et attente incorrecte d’un HELLO 1.0.3
pour l’ancien paquet. Les nouvelles preuves utilisent sa version observée 1.0.0.

Cette recette couvre une mise à jour au repos, navigateur fermé, avec le même
identifiant et le même profil Edge. Le profil Windows reste `C:\Users\nxeqa` :
les accents sont présents dans la source d’installation et les fichiers ouverts.
Un compte/profil Windows accentué et les tâches actives/interrompues ne sont
pas qualifiés par cet essai. Aucun EXE n’a été reconstruit.

## Refus et récupération — 24 octobre 2026

Le même EXE 1.0.6 a été rejoué sous le compte standard dans la VM, avec un
nouveau dossier de preuves et un témoin personnel jetable. Trois défauts ont
été provoqués dans l’invité, avec le vrai registre et les vrais fichiers :

- **Enregistrement Edge étranger :** manifeste témoin séparé et inerte, installé
  dans le registre avant le lancement de l’assistant. L’aperçu est refusé avec
  un message explicite ; le bouton Installer n’est pas proposé. Après annulation,
  registre, manifeste étranger, fichiers et intégration Windows sont inchangés.
- **Script de retrait absent :** `package/scripts/install-host.ps1` déplacé hors
  du paquet avant de lancer le vrai désinstalleur et d’accepter sa confirmation.
  Le désinstalleur affiche un échec de retrait de la liaison et demande une
  réparation. Son état après ce refus est identique à celui juste avant le
  lancement : enregistrements, empreintes du paquet restant, entrée Windows,
  raccourcis et témoin sont conservés.
- **Script de retrait en erreur :** le script est temporairement remplacé par
  `exit 42`. Le même refus visible et la même conservation de l’état sont vérifiés.

Après chacun des deux défauts de retrait, le vrai Setup a été exécuté jusqu’à
la fin. Le script restauré possède exactement l’empreinte de l’original conservé
hors du paquet ; le contrôleur d’installation réussit avec la liaison Edge réelle.
Ces scénarios n’ont nécessité aucun correctif ni reconstruction de l’EXE.

Après les deux réparations, Edge **156.0.4314.42** a établi une connexion native
réelle : HELLO 1.0.6, dossier témoin listé et texte lu exactement. La désinstallation
normale finale a réussi : liaison Edge, paquet, maintenance, désinstalleur, entrée
Windows et raccourcis retirés ; témoin, versions et sauvegardes préservés.
L’enregistrement Chrome étranger et son manifeste sont également intacts.

Preuves séparées : `test-results/windows-failures-1.0.6/evidence/` et `evidence.zip`.
Les instantanés `Foreign-before/after.json`, `Missing-before/after.json` et
`Failing-before/after.json` comparent les états des refus. Les captures `foreign-blocked.png`,
`Missing-blocked.png`, `Failing-blocked.png`, les journaux de retrait et les messages
conservent les erreurs visibles. `Missing-repaired.json`, `Failing-repaired.json`,
`Repaired-browser.json`, `Uninstalled.json` et `validation-summary.json` documentent
la récupération et le retrait final. Les comparaisons et la lecture exacte ont
été revérifiées sur l’hôte après export.

Ces défauts ciblés ne couvrent pas un disque plein, un refus d’écriture du registre,
un échec d’ACL, un script ayant déjà retiré une partie des liaisons avant d’échouer,
une autre installation active ou une réparation ambiguë entre plusieurs copies
de moteurs. Les manifestes étrangers utilisés ici sont inertes.

## Portée et suite

### Vérification finale des sources, sans reconstruction — 24 octobre 2026

À la demande de l’utilisateur, aucun nouveau Setup ni compagnon n’est compilé.
Le Setup 1.0.6 existant conserve le SHA-256 indiqué en tête de rapport. Les sources
contiennent désormais un correctif qui **n’est pas incorporé dans cet EXE** :
`Set-HostRegistration` crée la clé seulement lorsqu’elle est absente, pour conserver
la clé existante et ses permissions. Le nouveau test `test-host-registration.ps1`
est exécuté par la recette d’installation existante.

Validation des sources corrigées dans la VM sous compte standard, sans doublure
du registre : ID invalide et paquet incomplet refusés ; refus d’écriture réel
dans le registre et sur le manifeste ; récupération ambiguë bloquée, puis
récupération explicite des réglages choisis ; retrait partiel provoqué par un refus
de suppression d’Edge, puis réparation des liaisons. Les ACL et les enregistrements
initiaux sont rétablis à la fin. Une erreur de permissions peut empêcher le retour
arrière complet : elle est signalée et la réparation réussit après rétablissement
des droits. Il ne faut pas présenter ce cas comme une désinstallation atomique.

Une autre recette utilise les binaires existants de la release 1.0.3 et du candidat
1.0.6 pendant une copie réelle de **200 fichiers**. Le worker ancien reste actif ;
le nouveau compagnon refuse explicitement ce worker incompatible. Les 200 copies
sont ensuite comparées octet par octet. Après interruption du worker, une tâche
en pause est retrouvée comme interrompue et récupérable par le nouveau worker :
aucun rejeu automatique, reprise explicite et une seule copie finale. Node est
utilisé comme pilote de test local à la VM, sans installation dans le PATH ni
dépendance ajoutée au produit. Le lot de 6 000 fichiers, trop lent dans cette VM,
n’est pas qualifié par cette recette ; les premiers pilotes de test restent
conservés séparément.

Tests complémentaires réussis : typage et **243 tests TypeScript**, recette
composite installation/diagnostic/réparation/aperçu avec registre simulé, nouveau
test de non-régression de l’enregistrement et recette existante du worker.
Preuves exportées et revérifiées : `test-results/windows-final-source-1.0.6/`,
notamment `backend/backend-results.json` (empreinte du script corrigé) et
`active-upgrade.json`. La validation du futur EXE contenant ce correctif sera
à rejouer lorsqu’une reconstruction sera demandée.

#### Compte Windows accentué : essai non qualifié

Une VM séparée `NextExplorer-Windows-Accent-1.0.6` a été préparée pour le compte
`RémyQA`, avec le même ISO Microsoft vérifié. Windows a échoué avant tout lancement
de NextExplorer : `HAL_INITIALIZATION_FAILED` au démarrage, puis « Windows could
not complete the installation » après passage à un seul processeur virtuel.
Cet essai ne valide donc pas un vrai profil accentué. Les essais de chemins
accentués précédents restent valides dans leur périmètre.

Preuves : `test-results/windows-final-source-1.0.6/accent-profile.json`,
`accent-boot-failure.txt` et `accent-windows-installation-failed.png`.
La suppression automatique de cette VM et de son disque a été rejetée par le
contrôle de sécurité (`blocked by policy`) ; elle est conservée éteinte, avec
environ 18 Go de disque sous `%LOCALAPPDATA%/NextExplorer-CleanWindows-Test/accent-1.0.6`.
La VM de recette initiale est également éteinte et conservée. Aucun réglage du
Windows hôte ni aucune VM Home Assistant n’a été modifié.

### Limites de distribution

Cette recette qualifie le parcours principal de ce candidat local sur ce
Windows et ces versions de Chrome/Edge. Le compte Windows accentué reste non
qualifié pour la raison ci-dessus. Les scénarios ciblés de mise à jour active,
refus d’écriture et réparation ambiguë ont désormais été exécutés dans la VM,
dans le périmètre décrit. La charge de 6 000 fichiers, les disques pleins, les autres
versions de Windows et la recette du futur EXE corrigé ne sont pas qualifiés.

L’EXE reste non signé. Le transfert local ne marque pas le fichier comme un
téléchargement public : il ne qualifie pas la réputation SmartScreen, le Chrome
Web Store ni l’installation depuis une release publique. Aucun blocage de
sécurité n’a été contourné pour exécuter NextExplorer. Les moteurs facultatifs
et les six parcours document/média de la 1.0.4 nécessitent leurs propres recettes.

La VM `NextExplorer-Windows-Clean-1.0.6` et l’instantané
`Clean-Windows-Chrome-before-NextExplorer` sont conservés localement pour rejouer
les essais. Cet instantané contient le déclenchement automatique de la première
recette ; l’adapter avant de l’utiliser pour un autre candidat. Les identifiants
jetables et les disques sont exclus de Git. Aucune publication n’a été effectuée.
