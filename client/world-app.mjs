import { WorldRenderer } from './world-renderer.mjs';
import { DISTRICTS } from './world-model.mjs';

const el=id=>document.getElementById(id);
const bridge=window.KultWorldBridge;
let renderer=null,selected='home',mode='3d',loading=false,failed=false;
let daylight=false,motion=!(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false);
const status=el('world3dStatus');

function selection(id){
  selected=id;const d=DISTRICTS.find(d=>d.id===id);if(!d)return;
  el('districtDetailTag').textContent=d.tag;el('districtDetailName').textContent=d.name;el('districtDetailCopy').textContent=d.copy;el('enterDistrict3d').textContent=d.action+' →';
  document.querySelectorAll('[data-zone-select]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zoneSelect===id)));
}
function setMode(value){
  mode=value;
  const three=mode==='3d'&&Boolean(renderer)&&!renderer.disposed;
  el('world3dPanel').hidden=!three;el('worldMap').hidden=three;
  el('world3dMode').setAttribute('aria-pressed',String(three));el('world2dMode').setAttribute('aria-pressed',String(!three));
  if(renderer)renderer.setActive(three&&bridge.snapshot().view==='world');
  status.textContent=three?'3D WORLD · CONNECTED':failed?'3D unavailable · 2D map active':'2D MAP · CONNECTED';
}
function fail(message){
  failed=true;renderer?.dispose();renderer=null;loading=false;setMode('2d');
  el('world3dMessage').hidden=false;el('world3dMessage').textContent=message;
}
function init(){
  if(loading||renderer||!bridge?.snapshot().agent)return;
  loading=true;el('world3dPanel').hidden=false;status.textContent='Opening the 3D World…';
  try{
    renderer=new WorldRenderer({mount:el('world3dCanvas'),labels:el('world3dLabels'),onSelect:selection,onFailure:fail,onStats:stats=>{
      el('world3dFps').textContent=`${stats.fps} FPS`;
      el('world3dCanvas').dataset.drawCalls=stats.drawCalls;el('world3dCanvas').dataset.triangles=stats.triangles;
    }});
    failed=false;loading=false;el('world3dMessage').hidden=true;
    renderer.updateState(bridge.snapshot());renderer.setMotion(motion);renderer.setDay(daylight);renderer.setQuality(el('world3dQuality').value);renderer.select(selected);renderer.reset();setMode('3d');
    el('world3dCanvas').dataset.ready='true';
    document.dispatchEvent(new Event('kult:3d-ready'));
  }catch(error){fail(`${error.message} All missions remain available on the 2D map.`);}
}
el('districtDock3d').innerHTML=DISTRICTS.map(d=>`<button type="button" data-zone-select="${d.id}" aria-pressed="false"><span class="districtDot" style="--district-color:${d.color}"></span>${d.name}</button>`).join('');
el('districtDock3d').addEventListener('click',event=>{const b=event.target.closest('[data-zone-select]');if(b)renderer?.select(b.dataset.zoneSelect);});
el('enterDistrict3d').onclick=()=>{bridge.openDistrict(selected);};
el('world3dMode').onclick=()=>{if(renderer)setMode('3d');else init();};
el('world2dMode').onclick=()=>setMode('2d');
el('world3dReset').onclick=()=>renderer?.reset();
el('world3dFind').onclick=()=>renderer?.findAgent();
el('world3dZoomIn').onclick=()=>renderer?.zoom(.84);
el('world3dZoomOut').onclick=()=>renderer?.zoom(1.19);
el('world3dRotateLeft').onclick=()=>renderer?.rotate(.25);
el('world3dRotateRight').onclick=()=>renderer?.rotate(-.25);
el('world3dDay').onclick=()=>{daylight=!daylight;renderer?.setDay(daylight);el('world3dDay').textContent=daylight?'Dusk':'Daylight';el('world3dDay').setAttribute('aria-pressed',String(daylight));};
el('world3dMotion').setAttribute('aria-pressed',String(motion));
el('world3dMotion').textContent=motion?'Motion on':'Motion off';
el('world3dMotion').onclick=()=>{motion=!motion;renderer?.setMotion(motion);el('world3dMotion').setAttribute('aria-pressed',String(motion));el('world3dMotion').textContent=motion?'Motion on':'Motion off';};
el('world3dQuality').onchange=event=>renderer?.setQuality(event.target.value);
document.addEventListener('kult:ready',()=>{if(!failed)init();});
document.addEventListener('kult:render',()=>{
  const snapshot=bridge.snapshot();
  if(!renderer&&!failed)init();
  if(renderer){renderer.updateState(snapshot);if(mode==='2d')renderer.setActive(false);}
  el('world3dAgentName').textContent=snapshot.agent?.name||'Your Agent';
  el('world3dTier').textContent=snapshot.agent?.evolution?.label||'Emerging';
});
document.addEventListener('kult:view',()=>{if(renderer)renderer.setActive(mode==='3d'&&bridge.snapshot().view==='world');});
document.addEventListener('kult:location',()=>{if(renderer){renderer.updateState(bridge.snapshot());if(mode==='2d')renderer.setActive(false);}});
document.addEventListener('kult:find',()=>{if(mode==='3d'&&renderer){el('world3dPanel').scrollIntoView({behavior:motion?'smooth':'instant',block:'center'});renderer.findAgent();}});
document.addEventListener('kult:policy',event=>{el('world3dPolicy').textContent=event.detail.paused?'World actions paused':'World permissions active';});
window.addEventListener('pagehide',event=>{if(!event.persisted)renderer?.dispose();});
selection('home');
if(bridge?.snapshot().agent)init();
