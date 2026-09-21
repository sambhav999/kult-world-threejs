'use strict';
// Functional DOM/API test, not a visual browser test. Requires jsdom as a dev tool.
const {JSDOM,CookieJar,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict');
async function main(){
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kult-dom-qa-'));
  process.env.KULT_DATA_FILE=path.join(temp,'world.json');
  const {server}=require('../server');await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`,jar=new CookieJar(),errors=[],consoleCapture=new VirtualConsole();
  let requests=0,lastNetwork=Date.now();
  consoleCapture.on('jsdomError',e=>{if(e.type!=='css-parsing'&&e.type!=='not-implemented')errors.push(e.message);});
  const dom=await JSDOM.fromURL(base,{cookieJar:jar,resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:consoleCapture,beforeParse(w){
    // Explicitly exercise the supported no-WebGL fallback in jsdom.
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.AbortController=global.AbortController;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.navigator.clipboard={writeText:async()=>{}};
    w.fetch=async(url,options={})=>{requests++;try{const uri=new URL(url,base).href;const r=await fetch(uri,{...options,headers:{...options.headers,cookie:jar.getCookieStringSync(uri)}});for(const c of r.headers.getSetCookie())jar.setCookieSync(c,uri);await r.clone().arrayBuffer();return r;}finally{requests--;lastNetwork=Date.now();}};
  }});
  const w=dom.window,d=w.document;
  async function until(fn,label){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Timed out: '+label+'; '+d.querySelector('#toast')?.textContent);}
  async function click(selector){await until(()=>d.querySelector(selector)&&!d.querySelector(selector).disabled,selector);d.querySelector(selector).click();}
  async function view(name){await click(`#mainNav [data-view="${name}"]`);await until(()=>d.querySelector(`#${name}View`).classList.contains('active'),name);}
  await until(()=>d.querySelector('#bootStatus').classList.contains('hidden'),'boot');
  assert.equal(d.querySelectorAll('.personaCard').length,6);
  d.querySelector('#agentName').value='DOM TEST';await click('#adoptBtn');await click('[data-saved]');
  await until(()=>d.querySelector('[data-toggle-pause]'),'policy load');
  await until(()=>!d.querySelector('#world3dMessage').hidden,'WebGL fallback');
  assert.equal(d.querySelector('#worldMap').hidden,false);
  assert.equal(d.querySelector('#world3dPanel').hidden,true);
  assert.equal(d.querySelectorAll('[data-zone-select]').length,6);
  await click('#world3dMode');assert.equal(d.querySelector('#worldMap').hidden,false);
  await view('missions');await click('[data-filter="strategy"]');assert.equal([...d.querySelectorAll('.missionCard')].filter(x=>!x.hidden).length,1);await click('[data-filter="all"]');
  await click('#missionGrid [data-open-mission="signal_hunt"]');await click('[data-choice="trace"]');await click('[data-passport]');
  await until(()=>d.querySelectorAll('.proofItem').length===1,'receipt');
  await view('journal');await until(()=>d.querySelectorAll('.journalEntry').length===1,'journal');
  const search=d.querySelector('#journalSearch');search.value='not-a-mission';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.journalEntry').length,0);search.value='';search.dispatchEvent(new w.Event('input'));
  await view('permissions');await click('[data-toggle-pause]');await until(()=>d.querySelector('#pausedBanner'),'pause');
  const blocked=await w.fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"steps":1}'});assert.equal(blocked.status,403);
  await click('[data-toggle-pause]');await until(()=>!d.querySelector('#pausedBanner'),'resume');
  await click('[data-edit-policy]');d.querySelector('#policySpend').value='100';await click('[data-save-policy]');await until(()=>d.querySelector('#modalBack').classList.contains('hidden'),'save policy');
  await view('evolution');assert.equal(d.querySelectorAll('.evolutionStage').length,4);
  await view('community');await click('[data-register-census]');await until(()=>d.querySelector('[data-census-download]'),'census');
  await view('world');await click('#homeBtn');assert.equal(d.querySelectorAll('[data-buy]').length,6);await click('.modalDismiss');
  await view('passport');await click('[data-publish]');await until(()=>d.querySelector('[data-unpublish]'),'publish');await click('[data-unpublish]');await until(()=>d.querySelector('[data-publish]'),'unpublish');
  await until(()=>requests===0&&Date.now()-lastNetwork>250,'background reads settled');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',scope:'DOM and live local API (not visual)',checks:19,scriptErrors:0,webgl:"unavailable fallback verified"}));dom.window.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});
}
main().catch(e=>{console.error(e);process.exit(1);});
