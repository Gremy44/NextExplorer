# Glisser un fichier du panneau Chrome vers un site

## Utilisation sous Windows

Dans **Fichiers**, maintenir le nom du fichier et le glisser directement vers une zone de dépôt du site. Le même geste fonctionne sur le nom d’un fichier dans **Collecte**. Aucune collecte ni case à cocher n’est nécessaire.

Windows prend en charge le geste : image de glissement Shell, curseur de copie ou de refus, réception du fichier par la cible et annulation par Échap. La source reste conservée. Le site peut commencer son téléversement dès le dépôt ; vérifier sa réception et ses restrictions de format ou de taille.

Mettre à jour le compagnon avec le paquet actuel, puis désactiver/réactiver l’extension pour reconnecter le nouveau processus. Le compagnon annonce `features.nativeDragVersion: 2`. Si un ancien compagnon reste connecté, l’interface demande sa mise à jour et ne lance pas l’ancien transfert.

## Mécanisme retenu — 6 octobre 2026

Le nom du fichier déclenche `OS_DRAG_FILES` après un déplacement de souris de 6 pixels, bouton gauche maintenu. Le glissement HTML est désactivé. Le compagnon vérifie les fichiers ordinaires existants, résout les liens et crée un objet Shell `IDataObject` contenant `CF_HDROP`, une liste de chemins UTF-16.

Un thread Windows initialisé pour OLE crée une source native temporaire, hors de la barre des tâches, et conserve sa connexion à la file d’entrée de Chrome pendant toute l’opération (`AttachThreadInput`). Cette durée est essentielle : la détacher avant la boucle empêchait le compagnon de recevoir la suite du geste. La capture est transférée au thread source, puis `SHDoDragDrop` assure le transfert et le retour visuel Windows. Fenêtre source, capture et connexion des files sont libérées à la fin ; le focus de départ est restauré si la source native le possède encore.

Seule la copie est autorisée. Aucun octet de fichier n’est assemblé dans React, aucun script n’est injecté dans le site et aucune permission debugger n’est utilisée pour ce geste. L’insertion par champ et la capture PDF gardent leurs propres permissions. Il n’y a pas de dépôt CDP de repli.

Sources : [SHDoDragDrop](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shdodragdrop), [DoDragDrop](https://learn.microsoft.com/en-us/windows/win32/api/ole2/nf-ole2-dodragdrop), [AttachThreadInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput).

## Validation

`node scripts/test-file-drag.mjs` lance le **vrai panneau latéral Chrome**, le compagnon installé via Native Messaging et un site témoin HTTP local. Les gestes de souris et Échap passent par Windows, pas par les événements CDP. Le contexte de débogage du test sert uniquement à inspecter la surface source et à vérifier la réception ; la permission debugger de l’extension reste absente.

Tests réussis : texte complet reçu, TIFF de 24 Mio, trois dépôts successifs, événements fiables contenant Files, collecte vide, annulation par Échap et fichier texte original intact. La copie de test du manifeste change seulement le raccourci d’ouverture, car Chrome réserve Alt+E. Aucune iframe d’extension ni permission de débogage supplémentaire n’est ajoutée.

La suite native vérifie aussi CF_HDROP, les chemins UTF-16, la validation des sélections et l’annulation à la déconnexion. `node scripts/probe-native-file-drag.mjs` permet d’isoler le compagnon du panneau pour diagnostiquer la boucle Windows.

## Recette locale

1. Recharger l’extension depuis `release/NextExplorer/dist`, après mise à jour du compagnon.
2. Lancer `node scripts/drag-test-site.mjs` et ouvrir `http://127.0.0.1:5188/`.
3. Depuis le vrai panneau **Fichiers**, glisser un fichier texte puis un fichier volumineux. Tester aussi Échap et un relâchement rapide.
4. Vérifier le nom, la taille, le préfixe et `evenementNatif: true`.

Le site témoin ne téléverse rien et ne lit que les 256 premiers octets.

## Limites

Windows et souris uniquement pour ce parcours. L’interface démarre un fichier ordinaire par geste ; dossiers et liens symboliques ne proposent pas la poignée. La commande native accepte jusqu’à 100 chemins validés. Un site peut refuser un fichier ou ne pas proposer de zone de dépôt ; le comportement de tous les sites tiers n’est pas garanti.

La fermeture du lien natif et l’échéance de 60 secondes annulent lors des callbacks OLE. Cette échéance n’est pas un minuteur indépendant si Windows ne fournit plus de callbacks. La boucle Native Messaging continue de servir les autres demandes.
