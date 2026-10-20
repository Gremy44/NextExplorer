import { Folder, HardDrive, Tag, Star, Clock } from "lucide-react";
import { useOrganization } from "./OrganizationContext";
import type { Hello } from "./types";
import { DrivesView } from "./DrivesView";
import { FolderIcon } from "./Preview";
export function HomeDialog({
  hello,
  favorites,
  recent,
  onNavigate,
  onTag,
  onRefreshVolumes,
}: {
  hello: Hello | null;
  favorites: { name: string; path: string }[];
  recent: string[];
  onNavigate: (path: string) => void;
  onTag: (id: string) => void;
  onRefreshVolumes: () => void;
}) {
  const { preferences, tags } = useOrganization();
  return (
    <section className="organization-dialog">
      <h2>Votre espace local</h2>
      <p>
        Accès rapides et dossiers récents. Un lecteur débranché reste sans effet
        sur vos autres dossiers.
      </p>
      <button
        type="button"
        disabled={!hello}
        onClick={() => hello && onNavigate(hello.home)}
      >
        <Folder size={18} />
        Dossier personnel
      </button>
      {preferences.homeSections.includes("favorites") && (
        <section>
          <h3>Favoris</h3>
          {favorites.map((item) => (
            <button
              type="button"
              key={item.path}
              title={item.path}
              onClick={() => onNavigate(item.path)}
            >
              <FolderIcon path={item.path} size={18} />
              {item.name}
            </button>
          ))}
          {!favorites.length && (
            <p>Aucun favori. Épinglez un dossier avec l’étoile.</p>
          )}
        </section>
      )}
      {preferences.homeSections.includes("drives") && (
        <section>
          <DrivesView onNavigate={onNavigate} onRefresh={onRefreshVolumes} />
        </section>
      )}
      {preferences.homeSections.includes("recent") && (
        <section>
          <h3>Dossiers récents</h3>
          {recent.slice(0, 10).map((path) => (
            <button
              type="button"
              key={path}
              title={path}
              onClick={() => onNavigate(path)}
            >
              <Clock size={16} />
              <span className="truncate">{path}</span>
            </button>
          ))}
        </section>
      )}
      {preferences.homeSections.includes("tags") && (
        <section>
          <h3>Tags</h3>
          {tags.labels.map((tag) => (
            <button type="button" key={tag.id} onClick={() => onTag(tag.id)}>
              <Tag size={16} />
              {tag.name}
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
