// Visible Windows OLE proof with actual OS mouse state, confined to its own Chrome window.
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.tools/browsers');
const {chromium}=await import('playwright');
const root=await mkdtemp(path.resolve('test-results/native-drag-'));
const title='NextExplorer drag test '+path.basename(root);
const file=path.join(root,'preuve.txt');await writeFile(file,'Windows OLE real file');
const run=promisify(execFile);
const input=async actions=> (await run('py',['-3.11','scripts/windows-drag-input.py',title,JSON.stringify(actions),String(host.pid)],{windowsHide:true})).stdout;
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<title>${title}</title><button id="source" style="position:absolute;left:100px;top:100px;width:160px;height:100px">Source</button><div id="zone" style="position:absolute;left:450px;top:100px;width:400px;height:400px;background:#acf">Drop here</div><script>window.events=[];zone.ondragover=e=>{e.preventDefault();events.push(e.type)};zone.ondrop=async e=>{e.preventDefault();window.result={trusted:e.isTrusted,files:await Promise.all([...e.dataTransfer.files].map(async f=>({name:f.name,text:await f.text()})))}}</script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:false,viewport:null,args:['--window-size=1200,900']});
const id=(await readFile('extension-id.txt','utf8')).trim();
const host=spawn(path.resolve('native/native-host.exe'),[`chrome-extension://${id}/`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
let buffer=Buffer.alloc(0),resolveReply;
host.stdout.on('data',data=>{buffer=Buffer.concat([buffer,data]);while(buffer.length>=4 && buffer.length>=4+buffer.readUInt32LE(0)){const n=buffer.readUInt32LE(0);const message=JSON.parse(buffer.subarray(4,n+4));buffer=buffer.subarray(n+4);console.log('HOST',message);if(message.id==='drag')resolveReply?.(message);}});
host.stderr.on('data',data=>process.stderr.write(data));
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.bringToFront();
 const position=JSON.parse(await input([['focus'],['info']]));
 const height=await page.evaluate(()=>window.innerHeight);
 const x=position.x,y=position.y+position.height-height;
 await input([['move',x+140,y+140],['down']]);
 const response=new Promise((resolve,reject)=>{resolveReply=resolve;setTimeout(()=>reject(Error('Native drag timeout')),10000).unref();});response.catch(()=>{});
 const body=Buffer.from(JSON.stringify({id:'drag',action:'OS_DRAG_FILES',payload:{paths:[file]}})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);host.stdin.write(Buffer.concat([header,body]));
 console.log('Starting native gesture');
 console.log('INPUT',await input([['pause',.5],['move',x+200,y+150],['pause',.1],['move',x+500,y+220],['pause',.3],['up']]));
 const reply=await response;console.log('Page',await page.evaluate(()=>({events,result:window.result})));
 assert.equal(reply.data?.state,'dropped');await page.waitForFunction(()=>window.result);assert.equal((await page.evaluate(()=>window.result)).files[0].text,'Windows OLE real file');
 console.log('Windows OLE to Chrome with OS mouse input: OK');
}finally{await input([['up']]).catch(()=>{});host.stdin.end();host.kill();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
