# Améliorations futures — formats pour infographistes

Noté le 14 septembre 2026, orientation actualisée le 9 octobre. Pistes conservées pour plus tard : aucun développement ni engagement de livraison. Priorité actuelle : un explorateur grand public centré sur les fichiers locaux et leur usage dans le navigateur. J6 et la couverture complète de Files sont retirés ; ces formats restent des extensions de traitement local, voir [la feuille de route hybride](FEUILLE_DE_ROUTE_HYBRIDE.md).

| Format | Utilité | Périmètre à envisager |
| --- | --- | --- |
| OpenEXR `.exr` | Rendus 3D, compositing, images HDR | Lecture et export flottant 16/32 bits ; choisir les canaux et passes. Le multipasse complet demande une prise en charge dédiée. |
| Radiance `.hdr` | Environnements et éclairages HDR | Conversion avec gestion explicite de la plage dynamique et de la transformation d'affichage. |
| TIFF `.tif`, `.tiff` | Retouche et échanges de qualité | Enrichir la conversion existante : profondeur, compression, profils ICC et compatibilité des logiciels destinataires. |
| Photoshop `.psd`, `.psb` | Aperçus et exports de maquettes | Commencer par la lecture de l'image composite lorsqu'elle existe. Ne pas promettre la conservation des calques, effets ou objets dynamiques. |
| Targa `.tga` | Textures et échanges avec certains outils 3D | Lecture/export avec alpha, en vérifiant les variantes acceptées. |
| DPX / Cineon `.dpx`, `.cin` | Cinéma et séquences d'images | À étudier avec un vrai besoin de séquences et de gestion des courbes logarithmiques. |
| JPEG XL `.jxl` | Images de qualité et compression | Vérifier les besoins d'échange et la compatibilité des outils utilisés par les clients. |
| RAW photo `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw` | Développement et export photo | Entrée vers TIFF/JPEG/autres images développées ; ne pas présenter l'export comme une recréation du RAW du capteur. |
| DDS `.dds` | Textures de jeux vidéo | Sélection de la compression, mipmaps et transparence ; compatibilité à définir avec le moteur cible. |
| KTX2 `.ktx2` | Textures pour moteurs et diffusion graphique | Compression/transcodage et mipmaps à traiter comme un parcours spécialisé. |

Ordre indicatif si la demande se confirme : EXR, HDR, TIFF avancé, PSD/PSB en lecture et TGA ; puis les formats spécialisés selon les clients. Un format ne devient prioritaire que si plusieurs utilisateurs décrivent un besoin récurrent et testent des fichiers représentatifs.

La qualité professionnelle dépend aussi des réglages : profondeur de couleur, profils ICC, transformations OpenColorIO/ACES lorsque pertinentes, alpha prémultiplié, sélection des passes et regroupement des séquences. Passer d'EXR à JPEG exige une transformation adaptée ; convertir un JPEG en EXR ne recrée pas les informations perdues.

Avant chaque ajout : distinguer lecture, aperçu et écriture ; vérifier les capacités du moteur réellement distribué ; tester couleur, alpha et réouverture dans le logiciel cible. Les formats affichés par une bibliothèque ne garantissent pas la conservation de toutes leurs fonctions.

Références techniques : [OpenEXR](https://openexr.com/en/latest/), [formats ImageMagick](https://imagemagick.org/formats/), [plugins OpenImageIO](https://openimageio.readthedocs.io/en/latest/builtinplugins.html), [OpenColorIO](https://opencolorio.org/), [KTX](https://www.khronos.org/ktx/).
