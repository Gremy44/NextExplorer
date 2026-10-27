# Confiance Windows et signature — 22 octobre 2026

Le candidat local 1.0.6 reste **non signé** : aucun certificat de signature de
code avec clé privée n’est disponible dans le magasin du compte de build.
Les informations d’éditeur de l’EXE ne constituent pas une signature.

## Alertes différentes

- **« Windows a protégé votre ordinateur » / éditeur inconnu** : SmartScreen
  évalue la réputation du fichier et de son éditeur. Un nouveau fichier signé
  peut aussi afficher une alerte. Un certificat autosigné ne crée pas cette
  confiance. [Documentation Microsoft](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).
- **Nom de menace et quarantaine Defender** : relever le nom exact, le fichier
  concerné et son SHA-256. Une détection présumée erronée peut être soumise par
  l’éditeur au [portail Microsoft](https://www.microsoft.com/en-us/wdsi/filesubmission).
  Aucun verdict de faux positif n’est acquis avant analyse.
- **Blocage du panneau dans Chrome** : distinct de l’EXE. La version 1.0.6
  revient au panneau natif et retire l’iframe injectée dans le site. Rechargez
  l’extension et l’onglet web ; réinstaller seulement le compagnon ne met pas
  à jour une extension installée depuis un autre dossier ou depuis le Store.

Il n’est pas demandé de désactiver les protections ni d’ajouter une exclusion.
Un scan local ne garantit pas l’absence d’alertes ailleurs, et SHA-256 vérifie
l’intégrité sans prouver l’identité de l’éditeur.

## Ce que produit le build

`npm run package` puis `npm run setup:build` construisent un EXE par utilisateur,
avec éditeur, version, liens officiels et licence. Le build génère à côté :

- `NextExplorer-<version>-Setup.exe.sha256` ;
- `NextExplorer-<version>-Setup.exe.security.json`, qui rapporte les empreintes
  et l’état Authenticode du Setup et du compagnon embarqué. Ce fichier n’est
  ni un certificat antivirus ni une attestation indépendante.

Les source maps de débogage ne sont pas livrées dans les assets de production.

Avec un certificat de signature de code reconnu déjà installé dans
`Cert:\CurrentUser\My` et utilisable avec sa clé privée :

```powershell
powershell -NoProfile -File scripts/build-setup.ps1 -SigningCertificateThumbprint <empreinte-du-certificat>
```

Le SDK Windows doit fournir SignTool. Le script refuse un certificat non
approuvé ou sans usage de signature de code. Il signe le compagnon du paquet,
puis Inno Setup signe le désinstalleur et l’installateur avec SHA-256 et un
horodatage RFC 3161. Il vérifie les signatures du compagnon et du Setup avant
de produire le rapport. Aucun certificat n’est créé ou acheté, aucune clé
privée n’est exportée. Reconstruire le paquet après signature remplace le
compagnon : relancer ce build signé avant toute diffusion.

Le parcours signé ne peut pas être validé de bout en bout sans certificat.
[Signature Inno Setup](https://jrsoftware.org/ishelp/topic_setup_signtool.htm).

## Piste gratuite compatible avec le projet

Microsoft indique que le nouvel onboarding développeur Store est sans frais
d’inscription ; une vérification d’identité reste requise.
[Compte développeur Microsoft](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account).

Pour un paquet **MSIX/AppX accepté par le Microsoft Store**, Microsoft signe
le paquet lors de sa publication. Cela demande d’adapter et de valider notre
installation du compagnon et sa déclaration Native Messaging : le présent
EXE Inno Setup n’est pas un MSIX. Soumettre directement cet EXE exige au
contraire notre propre signature reconnue.
[Règles MSIX et EXE](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/app-package-requirements?pivots=store-installer-msix).

SignPath Foundation fournit une signature gratuite aux projets répondant à
ses critères open source. Notre licence actuelle réservant les droits sur le
code n’y répond pas ; elle n’est pas changée pour obtenir ce service.
[Conditions SignPath](https://signpath.org/terms.html).

La suite sans achat consiste à qualifier le packaging MSIX, puis la liaison
Chrome depuis une installation Store. Aucune publication ni inscription de
compte n’a été effectuée dans ce lot.
