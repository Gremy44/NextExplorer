import { useEffect, useRef, useState } from "react";
import { Check, Download, Folder, LoaderCircle, RefreshCw } from "lucide-react";
import { CONNECTION_ATTEMPTS } from "./connection";

const release = `https://github.com/Gremy44/NextExplorer-Downloads/releases/download/v${import.meta.env.VITE_APP_VERSION}`;
const companionDownloadURL = `${release}/NextExplorer-${import.meta.env.VITE_APP_VERSION}-Setup.exe`;
const installationHelpURL =
  "https://github.com/Gremy44/NextExplorer-Downloads/blob/main/INSTALLATION.md";

export function ConnectionSetup({
  connected,
  connecting,
  attempt,
  error,
  onConnect,
  onChooseFolder,
  onUseHome,
}: {
  connected: boolean;
  connecting: boolean;
  attempt: number;
  error: string;
  onConnect: () => void;
  onChooseFolder: () => void;
  onUseHome: () => void;
}) {
  const [downloadOpened, setDownloadOpened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const connect = useRef(onConnect);
  const extensionId = globalThis.chrome?.runtime?.id;
  useEffect(() => {
    connect.current = onConnect;
  }, [onConnect]);
  useEffect(() => {
    if (connected) heading.current?.focus();
  }, [connected]);
  useEffect(() => {
    if (!downloadOpened || connected || connecting || !extensionId) return;
    let timer: ReturnType<typeof setTimeout>;
    const retry = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(() => connect.current(), 150);
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [downloadOpened, connected, connecting, extensionId]);

  return (
    <section className="connection-setup" aria-label="Première connexion">
      <h2 ref={heading} tabIndex={-1}>
        {connected
          ? "Choisissez votre premier dossier"
          : "Connectez vos fichiers"}
      </h2>
      {connected ? (
        <>
          <p role="status">
            <Check size={18} aria-hidden="true" /> Le compagnon est connecté.
          </p>
          <p>
            Choisissez le dossier que vous souhaitez retrouver dans
            NextExplorer. Vous pourrez en changer à tout moment.
          </p>
          <div className="connection-actions">
            <button className="primary" onClick={onChooseFolder}>
              <Folder size={18} /> Choisir un dossier
            </button>
            <button onClick={onUseHome}>Utiliser mon dossier personnel</button>
          </div>
        </>
      ) : (
        <>
          <p>
            Le compagnon Windows permet à NextExplorer d’ouvrir vos dossiers
            locaux.
          </p>
          <ol className="connection-steps">
            <li>
              <h3>Installez le compagnon</h3>
              <p>
                Téléchargez l’installateur, ouvrez-le puis suivez l’assistant.
              </p>
              <a
                className="connection-download"
                href={companionDownloadURL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDownloadOpened(true)}
              >
                <Download size={18} /> Télécharger le compagnon Windows
              </a>
              <p className="connection-requirements">
                Windows 11 x64 · installateur non signé
              </p>
            </li>
            <li>
              <h3>Revenez dans NextExplorer</h3>
              <p>
                {downloadOpened
                  ? "Terminez l’installation puis revenez ici : la connexion sera revérifiée au retour."
                  : "Si le compagnon est déjà installé, vérifiez directement la connexion."}
              </p>
              <button
                className="primary"
                disabled={connecting || !extensionId}
                onClick={onConnect}
              >
                {connecting ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <RefreshCw size={18} />
                )}
                {connecting ? "Vérification…" : "Vérifier la connexion"}
              </button>
            </li>
          </ol>
          <p className="connection-status" role="status" aria-live="polite">
            {!extensionId
              ? "Ouvrez NextExplorer depuis l’icône de l’extension dans Chrome pour vous connecter."
              : connecting
                ? `Recherche du compagnon — tentative ${attempt}/${CONNECTION_ATTEMPTS}.`
                : error.startsWith("Versions incompatibles")
                  ? "L’extension et le compagnon ont des versions incompatibles. Installez le compagnon de cette version."
                  : error
                    ? "La connexion n’est pas encore établie. Vérifiez que l’installation est terminée puis réessayez."
                    : "Après connexion, vous pourrez choisir votre premier dossier."}
          </p>
          <a
            href={installationHelpURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consulter le guide d’installation
          </a>
          <details className="connection-diagnostics">
            <summary>Aide et diagnostic</summary>
            <p>
              Après une mise à jour, désactivez puis réactivez l’extension dans
              la page de gestion des extensions de votre navigateur. Revenez
              ensuite vérifier la connexion.
            </p>
            <p>
              Si le problème persiste, relancez l’installateur pour réparer la
              liaison.
            </p>
            {extensionId && (
              <p>
                Identifiant de l’extension : <code>{extensionId}</code>
              </p>
            )}
            {error && <p className="connection-error">{error}</p>}
          </details>
        </>
      )}
    </section>
  );
}
