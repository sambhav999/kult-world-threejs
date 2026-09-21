import { WorldRenderer } from './world-renderer.mjs';
import { DISTRICTS, TIERS } from './world-model.mjs';

const $=id=>document.getElementById(id);
let world=null,location='home';
const colors={NORI:'#72f1b8',ATHENA:'#c9a7ff',AEGIS:'#70e1ff',PIXEL:'#ffd166',BERSERKER:'#ff7b72',MOSS:'#a7e06f'};
function currentAgent(){return {name:$('previewPersona').value,color:colors[$('previewPersona').value],evolution:{id:$('previewTier').value},home:{items:[{key:'glowPlant'}]}};}
function selection(id){const d=DISTRICTS.find(x=>x.id===id);location=id;$('previewName').textContent=d.name;$('previewTag').textContent=d.tag;$('previewCopy').textContent=d.copy;document.querySelectorAll('[data-preview-zone]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewZone===id)));}
function sync(){world?.updateState({agent:currentAgent(),location,view:'world',world:{observatory:0}});$('previewAgent').textContent=$('previewPersona').value;$('previewTierLabel').textContent=$('previewTier').selectedOptions[0].text;}
$('previewDock').innerHTML=DISTRICTS.map(d=>`<button data-preview-zone="${d.id}" aria-pressed="false"><span class="districtDot" style="--district-color:${d.color}"></span>${d.name}</button>`).join('');
$('previewDock').onclick=e=>{const b=e.target.closest('[data-preview-zone]');if(b)world?.select(b.dataset.previewZone);};
$('previewWalk').onclick=()=>sync();
$('previewFind').onclick=()=>world?.findAgent();$('previewReset').onclick=()=>world?.reset();
$('previewPlus').onclick=()=>world?.zoom(.84);$('previewMinus').onclick=()=>world?.zoom(1.19);
$('previewLeft').onclick=()=>world?.rotate(.25);$('previewRight').onclick=()=>world?.rotate(-.25);
$('previewDay').onclick=()=>{const day=$('previewDay').getAttribute('aria-pressed')!=='true';world?.setDay(day);$('previewDay').setAttribute('aria-pressed',String(day));$('previewDay').textContent=day?'Dusk':'Daylight';};
$('previewQuality').onchange=e=>world?.setQuality(e.target.value);
$('previewPersona').onchange=sync;$('previewTier').onchange=sync;
let motion=!(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false);
$('previewMotion').setAttribute('aria-pressed',String(motion));$('previewMotion').textContent=motion?'Motion on':'Motion off';
$('previewMotion').onclick=()=>{motion=!motion;world?.setMotion(motion);$('previewMotion').setAttribute('aria-pressed',String(motion));$('previewMotion').textContent=motion?'Motion on':'Motion off';};
function failure(message){$('previewError').hidden=false;$('previewError').textContent=message+' Open this file in a browser with WebGL 2 and hardware acceleration enabled.';$('previewState').textContent='3D unavailable';for(const button of document.querySelectorAll('.sceneCamera button,#previewWalk,#previewFind,#previewDay,#previewMotion,#previewDock button'))button.disabled=true;}
try{
  world=new WorldRenderer({mount:$('previewCanvas'),labels:$('previewLabels'),onSelect:selection,onFailure:failure,onStats:stats=>{$('previewFps').textContent=`${stats.fps} FPS · ${stats.drawCalls} draws`;}});
  world.setMotion(motion);world.select('home');sync();world.reset();$('previewState').textContent='3D ready · local preview';
}catch(error){failure(error.message);}
window.addEventListener('pagehide',()=>world?.dispose());
