import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Server,
  PlugZap,
  Unplug,
  Trash2,
  ShieldCheck,
  Save,
} from "lucide-react";
import { bridge } from "./bridge";
import {
  remoteLocation,
  type RemoteProfile,
  type RemoteServer,
} from "./remote";
import "./remote.css";

const blank = (): RemoteProfile => ({
  id: "",
  label: "",
  protocol: "sftp",
  host: "",
  port: 22,
  username: "",
  root: "/",
  keyFile: "",
});
export function RemoteConnections({
  available,
  initialID,
  onOpen,
  onChanged,
}: {
  available: boolean;
  initialID?: string;
  onOpen: (path: string) => void;
  onChanged: () => void;
}) {
  const [servers, setServers] = useState<RemoteServer[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [profile, setProfile] = useState(blank);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [plain, setPlain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trust, setTrust] = useState("");
  const [saved, setSaved] = useState(false);
  async function load() {
    const items = await bridge.request<RemoteServer[]>("REMOTE_PROFILES");
    setServers(items);
    onChanged();
    return items;
  }
  function select(server?: RemoteServer) {
    setProfile(server ? { ...server.profile } : blank());
    setRemember(!!server?.hasSecret);
    setPassword("");
    setError("");
    setTrust("");
    setPlain(false);
    setSaved(false);
  }
  useEffect(() => {
    if (!available) return;
    let live = true;
    bridge
      .request<RemoteServer[]>("REMOTE_PROFILES")
      .then((items) => {
        if (!live) return;
        setServers(items);
        select(items.find((item) => item.profile.id === initialID));
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [available, initialID]);
  const update = (value: Partial<RemoteProfile>) => {
    setProfile((old) => ({ ...old, ...value }));
    setTrust("");
    setSaved(false);
  };
  async function connect(fingerprint = "") {
    setBusy(true);
    setError("");
    try {
      let value = profile;
      if (!fingerprint) {
        value = await bridge.request<RemoteProfile>("REMOTE_PROFILE_SAVE", {
          profile,
          password,
          remember,
        });
        setProfile(value);
        setSaved(true);
        await load();
      }
      const result = await bridge.request<{
        connected?: boolean;
        needsTrust?: boolean;
        fingerprint?: string;
        path: string;
      }>(
        "REMOTE_CONNECT",
        {
          id: value.id,
          password,
          confirmFingerprint: fingerprint,
          allowPlainFTP: plain,
        },
        45000,
      );
      if (result.needsTrust) {
        setTrust(result.fingerprint || "");
        return;
      }
      setPassword("");
      setTrust("");
      await load();
      if (mounted.current)
        onOpen(result.path || remoteLocation(value.id, value.root));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const value = await bridge.request<RemoteProfile>("REMOTE_PROFILE_SAVE", {
        profile,
        password,
        remember,
      });
      setProfile(value);
      setPassword("");
      setSaved(true);
      setTrust("");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !confirm(
        `Supprimer la connexion « ${profile.label} » ? Les fichiers du serveur seront conservés.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await bridge.request("REMOTE_PROFILE_DELETE", { id: profile.id });
      await load();
      select();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="remote-manager">
      {!available ? (
        <p role="status">
          Mettez à jour le compagnon Windows pour utiliser les dossiers
          distants. Cette version de l’extension ne lance aucune connexion avec
          l’ancien compagnon.
        </p>
      ) : (
        <>
          <nav aria-label="Connexions enregistrées" className="remote-profiles">
            {servers.map((server) => (
              <button
                type="button"
                key={server.profile.id}
                aria-pressed={profile.id === server.profile.id}
                disabled={busy}
                onClick={() => select(server)}
                title={`${server.profile.protocol.toUpperCase()} · ${server.profile.host}`}
              >
                <Server size={17} />
                <span>{server.profile.label}</span>
                <span
                  className={server.connected ? "remote-connected" : "muted"}
                >
                  {server.connected
                    ? "Connecté"
                    : server.profile.protocol.toUpperCase()}
                </span>
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => select()}>
              <Plus size={16} /> Nouvelle connexion
            </button>
          </nav>
          <div className="remote-fields">
            <div className="form-grid">
              <label className="field">
                Nom
                <input
                  value={profile.label}
                  maxLength={80}
                  disabled={busy}
                  onChange={(e) => update({ label: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Protocole
                <select
                  aria-label="Protocole"
                  value={profile.protocol}
                  disabled={busy}
                  onChange={(e) =>
                    update({
                      protocol: e.target.value as RemoteProfile["protocol"],
                      port: e.target.value === "sftp" ? 22 : 21,
                      keyFile: "",
                    })
                  }
                >
                  <option value="sftp">SFTP / SSH</option>
                  <option value="ftps">FTP avec TLS explicite</option>
                  <option value="ftp">FTP non chiffré</option>
                </select>
              </label>
              <label className="field">
                Serveur
                <input
                  value={profile.host}
                  placeholder="serveur.exemple.fr"
                  maxLength={253}
                  disabled={busy}
                  onChange={(e) => update({ host: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={profile.port}
                  disabled={busy}
                  onChange={(e) => update({ port: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Utilisateur
                <input
                  value={profile.username}
                  maxLength={128}
                  disabled={busy}
                  onChange={(e) => update({ username: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Dossier initial
                <input
                  value={profile.root}
                  placeholder="/home/moi"
                  disabled={busy}
                  onChange={(e) => update({ root: e.target.value })}
                  autoComplete="off"
                />
              </label>
            </div>
            {profile.protocol === "sftp" && (
              <details>
                <summary>Authentification par clé SSH</summary>
                <label className="field">
                  Chemin local de la clé privée
                  <input
                    value={profile.keyFile || ""}
                    disabled={busy}
                    onChange={(e) => update({ keyFile: e.target.value })}
                    placeholder="C:\Users\moi\.ssh\id_ed25519"
                    autoComplete="off"
                  />
                </label>
              </details>
            )}
            <label className="field">
              {profile.keyFile ? "Phrase secrète de la clé" : "Mot de passe"}
              <input
                type="password"
                value={password}
                maxLength={8192}
                disabled={busy || !!trust}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={
                  servers.find((s) => s.profile.id === profile.id)?.hasSecret
                    ? "Secret déjà protégé sur cet appareil"
                    : ""
                }
              />
            </label>
            <label className="organization-check">
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(e) => setRemember(e.target.checked)}
              />{" "}
              Mémoriser avec la protection Windows de ce compte
            </label>
            {profile.protocol === "ftp" && (
              <label className="organization-check">
                <input
                  type="checkbox"
                  checked={plain}
                  disabled={busy}
                  onChange={(e) => setPlain(e.target.checked)}
                />{" "}
                J’accepte que FTP transmette mes identifiants et fichiers sans
                chiffrement.
              </label>
            )}
            {profile.fingerprint && !trust && (
              <p className="remote-fingerprint" title="Empreinte SSH approuvée">
                <ShieldCheck size={16} />
                {profile.fingerprint}
              </p>
            )}
            {trust && (
              <section className="remote-trust" role="alert">
                <strong>Vérifier la clé du serveur</strong>
                <p>
                  Comparez cette empreinte avec celle fournie par
                  l’administrateur avant d’envoyer vos identifiants.
                </p>
                <code>{trust}</code>
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTrust("");
                      setPassword("");
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => void connect(trust)}
                  >
                    <ShieldCheck size={16} /> Approuver et se connecter
                  </button>
                </div>
              </section>
            )}
            {saved && !trust && (
              <p role="status" className="muted">
                Connexion enregistrée sur cet appareil.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              {profile.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  title="Supprimer la connexion"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {servers.find((s) => s.profile.id === profile.id)?.connected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await bridge.request("REMOTE_DISCONNECT", {
                        id: profile.id,
                      });
                      await load();
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Unplug size={16} /> Déconnecter
                </button>
              )}
              <button
                type="button"
                disabled={busy || !!trust}
                onClick={() => void save()}
              >
                <Save size={16} /> Enregistrer
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  busy || !!trust || (profile.protocol === "ftp" && !plain)
                }
                onClick={() => void connect()}
              >
                <PlugZap size={16} />
                {busy ? "Connexion…" : "Se connecter"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
