// Local receiver for a direct file drag test; no upload endpoint or file writes.
import { createServer } from "node:http";
const site = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Test du glisser-déposer NextExplorer</title>
<style>body{font:16px system-ui;background:#101419;color:#e1e5ed;margin:40px auto;padding:24px;max-width:760px}h1{font-size:26px}#zone{border:2px dashed #abc7ff;border-radius:24px;padding:64px 24px;text-align:center;margin:24px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#242b35;border-radius:16px;padding:20px}input{display:block;margin:16px 0}small{color:#c4c8d2}</style>
<h1>Test du glisser-déposer NextExplorer</h1><p>Ouvrez le panneau de l’extension puis <strong>Fichiers</strong>. Maintenez le nom d’un fichier et glissez-le ici, sans collecte ni case à cocher. Autorisez Chrome au premier geste si demandé, puis recommencez.</p>
<div id="zone">Déposez un ou plusieurs fichiers</div><label>Ou testez le dépôt sur un champ de fichiers :<input id="field" type="file" multiple></label>
<p id="status" role="status">En attente d’un dépôt.</p><pre id="result"></pre><small>Ce site local ne téléverse aucun fichier. Seuls les 256 premiers octets sont lus dans votre navigateur pour vérifier la réception.</small>
<script>
const zone=document.getElementById('zone'), field=document.getElementById('field');
async function report(files,trusted){
 document.getElementById('status').textContent=files.length+' fichier(s) reçu(s).';
 const results=await Promise.all([...files].map(async file=>({nom:file.name,taille:file.size,type:file.type,prefixeHex:[...new Uint8Array(await file.slice(0,256).arrayBuffer())].map(value=>value.toString(16).padStart(2,'0')).join(' ')})));
 document.getElementById('result').textContent=JSON.stringify({evenementNatif:trusted,fichiers:results},null,2);
}
zone.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';};
zone.ondrop=event=>{event.preventDefault();report(event.dataTransfer.files,event.isTrusted);};
field.onchange=event=>report(field.files,event.isTrusted);
</script></html>`);
});
site.listen(5188, "127.0.0.1", () => console.log("Test manuel : http://127.0.0.1:5188/ — Ctrl+C pour arrêter."));
