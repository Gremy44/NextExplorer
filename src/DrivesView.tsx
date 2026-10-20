import { HardDrive, RefreshCw } from "lucide-react";
import { useOrganization } from "./OrganizationContext";
import { displaySize } from "./preferences";
import { volumeUsage, type Volume } from "./disk-space";
export function DriveCapacity({ volume }: { volume: Volume }) {
  const { preferences } = useOrganization(),
    usage = volumeUsage(volume);
  if (!usage)
    return (
      <small className="muted">{volume.error || "Capacité indisponible"}</small>
    );
  return (
    <span
      className={"drive-capacity" + (usage.percent >= 90 ? " drive-low" : "")}
    >
      <meter
        min={0}
        max={usage.total}
        value={usage.used}
        low={usage.total * 0.75}
        high={usage.total * 0.9}
        optimum={0}
        aria-label={`Espace utilisé de ${volume.name}`}
      />
      <small>
        {displaySize(usage.available, preferences.units)} disponibles sur{" "}
        {displaySize(usage.total, preferences.units)}
      </small>
    </span>
  );
}
export function DrivesView({
  onNavigate,
  onRefresh,
  loading = false,
}: {
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const { volumes } = useOrganization();
  return (
    <section className="drives-view" aria-label="Lecteurs et périphériques">
      <header>
        <div>
          <h2>Ce PC</h2>
          <p className="muted">Lecteurs et espace disponible</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Actualiser les capacités"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {loading && <p role="status">Lecture des capacités…</p>}
      <div className="drive-grid">
        {volumes.map((volume) => (
          <button
            type="button"
            className="drive-card"
            key={volume.path}
            onClick={() => onNavigate(volume.path)}
            title={volume.path}
          >
            <HardDrive size={36} aria-hidden="true" />
            <span>
              <strong>
                {volume.name} ({volume.path})
              </strong>
              <DriveCapacity volume={volume} />
            </span>
          </button>
        ))}
      </div>
      {!loading && !volumes.length && (
        <p role="status">
          Aucun lecteur disponible. Reconnectez le compagnon pour actualiser la
          liste.
        </p>
      )}
    </section>
  );
}
