import { createServer } from "node:http";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".tools/browsers");
const { chromium } = await import("playwright");
const root = await mkdtemp(path.resolve("test-results/chrome-drop-"));
const extension = path.join(root,"extension");
await cp("dist",extension,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(extension,"manifest.json"),"utf8"));
manifest.permissions.push("debugger");
await writeFile(path.join(extension,"manifest.json"),JSON.stringify(manifest));
const file=path.join(root,"preuve.txt");
await writeFile(file,"Réception réelle de fichier par Chrome");
const site=createServer((req,res)=>res.end(`<div id="zone" style="height:400px">Déposer</div><script>zone.ondragover=e=>e.preventDefault();zone.ondrop=async e=>{e.preventDefault();window.received={trusted:e.isTrusted,files:await Promise.all([...e.dataTransfer.files].map(async f=>({name:f.name,text:await f.text()})))};};</script>`));
await new Promise(resolve=>site.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${site.address().port}/`;
const context=await chromium.launchPersistentContext(path.join(root,"profile"),{channel:"chromium",headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker");
 const page=await context.newPage();await page.goto(url);
 await worker.evaluate(async ({file,url})=>{
  const tab=(await chrome.tabs.query({})).find(t=>t.url===url),target={tabId:tab.id};
  await chrome.debugger.attach(target,"1.3");
  try{for(const type of ["dragEnter","dragOver","drop"])await chrome.debugger.sendCommand(target,"Input.dispatchDragEvent",{type,x:100,y:100,data:{items:[],files:[file],dragOperationsMask:1}});}
  finally{await chrome.debugger.detach(target);}
 },{file,url});
 await page.waitForFunction(()=>window.received);
 console.log(JSON.stringify(await page.evaluate(()=>window.received)));
}finally{await context.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));}
