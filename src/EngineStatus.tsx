import { Archive, FileSearch, Film, Image, Tags } from "lucide-react";
import type { Hello } from "./types";

const groups = [
  {
    name: "Images et TIFF",
    icon: Image,
    engines: ["magick"],
    names: ["ImageMagick"],
    detail:
      "Conversions et aperçus avancés. Les images compatibles avec Chrome restent consultables sans ajout.",
  },
  {
    name: "Métadonnées",
    icon: Tags,
    engines: ["exiftool"],
    names: ["ExifTool"],
    detail:
      "Informations EXIF, IPTC et audio. La préparation des images pour le web demande aussi ImageMagick.",
  },
  {
    name: "Vidéo et audio",
    icon: Film,
    engines: ["ffmpeg", "ffprobe"],
    names: ["FFmpeg", "FFprobe"],
    detail: "Conversion, découpe et analyse des fichiers multimédias.",
  },
  {
    name: "Archives avancées",
    icon: Archive,
    engines: ["7z"],
    names: ["7-Zip"],
    detail:
      "Archives 7z/RAR et chiffrement. Les ZIP ordinaires fonctionnent sans ce moteur.",
  },
  {
    name: "Recherche dans les PDF",
    icon: FileSearch,
    engines: ["pdftotext"],
    names: ["pdftotext"],
    detail:
      "Extraction du texte pour la recherche locale. L’aperçu PDF reste disponible sans cet outil.",
  },
];

export function EngineStatus({
  tools,
  onRefresh,
}: {
  tools?: Hello["tools"];
  onRefresh: () => void;
}) {
  return (
    <section className="engine-status" aria-label="Fonctions supplémentaires">
      <h3>Fonctions supplémentaires</h3>
      <p>
        Avec le compagnon, navigation, copies, tags, aperçu des formats courants
        et console fonctionnent sans moteur supplémentaire. Ajoutez seulement
        les outils utiles à vos fichiers.
      </p>
      <ul className="engine-status-list">
        {groups.map(({ name, icon: Icon, engines, names, detail }) => {
          const missing = engines.flatMap((engine, index) =>
            tools?.[engine] ? [] : [names[index]],
          );
          const status = !tools
            ? "À vérifier"
            : missing.length
              ? "À ajouter"
              : "Prêt";
          return (
            <li key={name} aria-label={`${name} : ${status}`}>
              <Icon size={20} aria-hidden="true" />
              <div>
                <h4>{name}</h4>
                <p>{detail}</p>
                <small>
                  {!tools
                    ? "Connectez le compagnon pour vérifier ces fonctions."
                    : missing.length
                      ? `Manque : ${missing.join(" et ")}`
                      : names.join(" et ")}
                </small>
              </div>
              <span
                className={tools && !missing.length ? "available" : "muted"}
              >
                {status}
              </span>
            </li>
          );
        })}
      </ul>
      <p>
        <a
          href="https://github.com/Gremy44/NextExplorer-Downloads/blob/main/INSTALLATION.md#moteurs-et-limites"
          target="_blank"
          rel="noopener noreferrer"
        >
          Comment ajouter les moteurs
        </a>
      </p>
      <p className="muted">
        Dans cette préversion, leur installation reste un parcours avancé et
        facultatif. Aucun téléchargement ni installation ne démarre
        automatiquement.
      </p>
      <details>
        <summary>Installation avancée et diagnostic</summary>
        <p>
          Pour une installation portable : préparez les moteurs avec le script{" "}
          <code>scripts/setup-engines.ps1 -SkipMediaDownloader</code> du paquet,
          puis relancez l’installateur du compagnon. Terminez d’abord les
          traitements et fermez les consoles. Ne déplacez pas les fichiers de
          l’installation active à la main.
        </p>
        <div className="capabilities">
          {Object.entries(tools || {}).map(([tool, available]) => (
            <div key={tool}>
              <strong>{tool}</strong>
              <span className={available ? "available" : "muted"}>
                {available ? "Détecté" : "Non détecté"}
              </span>
            </div>
          ))}
        </div>
      </details>
      <button disabled={!tools} onClick={onRefresh}>
        Vérifier la connexion
      </button>
    </section>
  );
}
