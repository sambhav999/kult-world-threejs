import * as THREE from 'three';

export const DISTRICTS = Object.freeze([
  { id: 'home', name: 'Agent Home', tag: 'A PLACE TO RETURN', color: '#ffd393', x: -5.6, z: 2.7, height: 2.6, copy: 'Small comforts. A growing collection of memories.', action: 'Open your home' },
  { id: 'commons', name: 'The Commons', tag: 'FOLLOW YOUR CURIOSITY', color: '#98efd1', x: 0, z: 4.8, height: 2.3, copy: 'A strange signal is repeating. What will your Agent notice?', action: 'Discover a mission' },
  { id: 'work', name: 'Work Hub', tag: 'MAKE YOURSELF USEFUL', color: '#8acaff', x: 5.4, z: 1.8, height: 3.0, copy: 'Test a new game. Find the flaw. Leave a useful trace.', action: 'Take a mission' },
  { id: 'forge', name: 'Creator Forge', tag: 'A LITTLE WEIRD IS GOOD', color: '#d7b1ff', x: -5.1, z: -3.2, height: 2.6, copy: 'One unexpected idea can change the whole experience.', action: 'Try a remix' },
  { id: 'arena', name: 'AI Arena', tag: 'THINK BEFORE YOU LEAP', color: '#ffad9d', x: 5.0, z: -4.0, height: 2.2, copy: 'A World strategy trial. Your decision becomes part of the record.', action: 'Enter the trial' },
  { id: 'observatory', name: 'Observatory', tag: 'BUILD SOMETHING TOGETHER', color: '#a6b8ff', x: 0, z: -6.5, height: 3.7, copy: 'Contribute an insight to the shared World event.', action: 'Explore the event' },
]);

export const TIERS = Object.freeze(['emerging', 'capable', 'skilled', 'elite']);
const clamp = THREE.MathUtils.clamp;

// All geometry is generated locally; no network models or textures are needed.
export function createWorldModel() {
  const root = new THREE.Group();
  const zones = new Map();
  const pickables = [];
  const moving = [];
  const materials = new Map();
  function material(color, glow = false, transparent = false) {
    const key = `${color}:${glow}:${transparent}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: glow ? .35 : .72, metalness: glow ? .25 : .08,
      emissive: glow ? color : '#000000', emissiveIntensity: glow ? .6 : 0,
      transparent, opacity: transparent ? .38 : 1,
    }));
    return materials.get(key);
  }
  function mesh(parent, geometry, color, pos = [0, 0, 0], glow = false) {
    const m = new THREE.Mesh(geometry, material(color, glow));
    m.position.set(...pos); m.castShadow = !glow; m.receiveShadow = true;
    parent.add(m); return m;
  }
  const box = (p, size, c, at, glow) => mesh(p, new THREE.BoxGeometry(...size), c, at, glow);
  const cylinder = (p, r, h, c, at, sides = 32, glow = false) => mesh(p, new THREE.CylinderGeometry(r, r, h, sides), c, at, glow);
  function ring(p, radius, tube, color, at = [0, 0, 0]) {
    const m = mesh(p, new THREE.TorusGeometry(radius, tube, 6, 64), color, at, true);
    m.rotation.x = Math.PI / 2; return m;
  }

  const island = mesh(root, new THREE.CylinderGeometry(10.3, 9.5, .85, 12), '#2b5356', [0, -.42, 0]);
  island.rotation.y = Math.PI / 12;
  mesh(root, new THREE.CylinderGeometry(9.5, 7.4, 1.65, 12), '#203a49', [0, -1.62, 0]);
  mesh(root, new THREE.CylinderGeometry(7.4, 2.7, 2.25, 9), '#182637', [0, -3.55, 0]);
  mesh(root, new THREE.ConeGeometry(3.1, 3.0, 7), '#121d32', [0, -5.8, 0]).rotation.z = Math.PI;
  ring(root, 9.65, .025, '#4d968f', [0, -.04, 0]);
  ring(root, 9.8, .022, '#6bd6ca', [0, -.65, 0]);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const shard = mesh(root, new THREE.OctahedronGeometry(.48, 0), i % 2 ? '#3d8b99' : '#4561a1', [Math.cos(angle)*7.5, -2.1-(i%3)*.65, Math.sin(angle)*7.5], true);
    shard.scale.y = 1.8; shard.rotation.z = angle;
  }

  // A radial path network and inlaid plaza make the six places read as one town.
  cylinder(root, 2.05, .10, '#3b6162', [0, .04, 0]);
  ring(root, 1.8, .035, '#8bd6c9', [0, .11, 0]);
  ring(root, .98, .04, '#688f96', [0, .13, 0]);
  for (const d of DISTRICTS) {
    const distance = Math.hypot(d.x, d.z);
    const path = box(root, [.78, .035, distance], '#577c79', [d.x / 2, .035, d.z / 2]);
    path.rotation.y = Math.atan2(d.x, d.z);
    for (let n=2;n<distance;n+=.95) {
      const mark=box(root,[.11,.012,.24],'#97b5a2',[d.x*n/distance,.06,d.z*n/distance]);
      mark.rotation.y=path.rotation.y;
    }
    const zone = new THREE.Group(); zone.name=d.id; zone.position.set(d.x,.08,d.z); zone.userData.district=d.id; root.add(zone);
    cylinder(zone, 1.82, .18, '#29484e', [0,.05,0]);
    const border=ring(zone,1.74,.035,d.color,[0,.17,0]);
    const selection=ring(zone,1.92,.055,d.color,[0,.2,0]);selection.visible=false;
    zones.set(d.id,{group:zone,border,selection,definition:d});
  }

  const home=zones.get('home').group;
  box(home,[2.1,1.25,1.65],'#d3c6ad',[0,.86,0]);
  const roof=mesh(home,new THREE.ConeGeometry(1.7,1.0,4),'#526c82',[0,1.98,0]);roof.rotation.y=Math.PI/4;roof.scale.z=.87;
  box(home,[.38,.73,.045],'#846e62',[.4,.57,.85]);
  box(home,[.55,.43,.055],'#ffe2a0',[-.47,.98,.85],true);
  box(home,[.055,.5,.6],'#ffd393',[1.07,1.04,.02],true);
  box(home,[2.5,.16,.65],'#6e8c84',[0,.22,1.1]);
  box(home,[.27,.85,.3],'#708691',[.6,2.1,-.3]);
  const homeBeacon=mesh(home,new THREE.OctahedronGeometry(.22),'#a8fbd0',[-.9,2.0,.2],true);homeBeacon.visible=false;
  const homeCrest=ring(home,.4,.04,'#ad95ff',[0,2.55,0]);homeCrest.visible=false;
  const homeCrown=mesh(home,new THREE.OctahedronGeometry(.23),'#ffdc8b',[0,3.08,0],true);homeCrown.visible=false;

  const commons=zones.get('commons').group;
  cylinder(commons,1.15,.35,'#42777d',[0,.32,0]);
  cylinder(commons,.96,.035,'#7edcdb',[0,.51,0],32,true);
  const heart=mesh(commons,new THREE.OctahedronGeometry(.48),'#a3f3d1',[0,1.27,0],true);heart.scale.y=1.45;moving.push({mesh:heart,spin:.4,bob:.09,base:1.27});
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const bench=box(commons,[.9,.15,.3],'#bbaf91',[Math.cos(a)*1.45,.34,Math.sin(a)*1.45]);bench.rotation.y=-a+Math.PI/2;}

  const work=zones.get('work').group;
  box(work,[1.55,2.2,1.3],'#74949e',[0,1.28,0]);
  box(work,[1.88,.2,1.65],'#243f56',[0,2.46,0]);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)box(work,[.27,.32,.04],'#8cdaed',[-.5+col*.5,.65+row*.59,.67],true);
  box(work,[.035,1.62,.88],'#355d77',[.79,1.36,0]);
  const workSignal=mesh(work,new THREE.OctahedronGeometry(.22),'#98d7ff',[0,2.98,0],true);moving.push({mesh:workSignal,spin:.6,bob:.08,base:2.98});
  ring(work,.55,.025,'#9ed9ff',[0,2.7,0]);

  const forge=zones.get('forge').group;
  box(forge,[2.4,.22,1.8],'#6e748e',[0,.32,0]);
  for(const x of [-.93,.93])for(const z of [-.6,.6])box(forge,[.15,1.7,.15],'#777e98',[x,1.2,z]);
  box(forge,[2.4,.16,1.8],'#aa95c2',[0,2.1,0]);
  const forgeCore=box(forge,[.75,.75,.75],'#cfabff',[0,1.35,0],true);forgeCore.rotation.z=Math.PI/4;moving.push({mesh:forgeCore,spin:.45,bob:.06,base:1.35});
  const hoop=ring(forge,.7,.05,'#d4beff',[0,1.35,0]);hoop.rotation.x=.5;

  const arena=zones.get('arena').group;
  cylinder(arena,1.55,.25,'#796371',[0,.3,0]);
  cylinder(arena,1.14,.05,'#263c53',[0,.46,0]);
  ring(arena,1.35,.12,'#bca39b',[0,.55,0]);
  ring(arena,1.35,.065,'#ffa99e',[0,1.65,0]);
  for(let i=0;i<10;i++){const a=i*Math.PI/5;if(i===0||i===1)continue;box(arena,[.17,1.15,.17],'#a197a0',[Math.cos(a)*1.35,1.07,Math.sin(a)*1.35]);}
  mesh(arena,new THREE.OctahedronGeometry(.35),'#ffb799',[0,1.0,0],true).rotation.z=.3;

  const obs=zones.get('observatory').group;
  cylinder(obs,1.05,1.8,'#8c9cbe',[0,1.1,0]);
  mesh(obs,new THREE.SphereGeometry(1.08,24,12,0,Math.PI*2,0,Math.PI/2),'#afb8db',[0,2.0,0]);
  ring(obs,1.12,.085,'#c5cffa',[0,1.95,0]);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const window=box(obs,[.31,.6,.055],'#bddbff',[Math.sin(a)*1.055,1.1,Math.cos(a)*1.055],true);window.rotation.y=a;}
  const telescope=cylinder(obs,.24,1.4,'#526b95',[.35,2.68,.1],16);telescope.rotation.z=-.85;
  const lens=mesh(obs,new THREE.SphereGeometry(.24,12,8),'#bedfff',[.86,3.14,.1],true);
  const eventOrbit=ring(obs,1.4,.025,'#9aa8ff',[0,2.8,0]);eventOrbit.rotation.x=.55;

  // Deterministic landscaping, outside the paths and building pads.
  for(let i=0;i<33;i++){
    const a=i*2.399963;const r=3.7+(i%7)*.78;const x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(DISTRICTS.some(d=>Math.hypot(x-d.x,z-d.z)<2.15)||Math.abs(x)<.75)continue;
    const h=.65+(i%4)*.15;
    cylinder(root,.07,h,'#797f71',[x,h/2+.05,z],6);
    const tree=mesh(root,new THREE.IcosahedronGeometry(h*.63,0),['#68a796','#86b59b','#729da2','#b6b09a'][i%4],[x,h+.22,z]);tree.scale.y=1.2;
  }
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;const r=8.3;
    cylinder(root,.04,.62,'#667b86',[Math.cos(a)*r,.34,Math.sin(a)*r],6);
    mesh(root,new THREE.SphereGeometry(.095,8,6),'#f9dba9',[Math.cos(a)*r,.69,Math.sin(a)*r],true);
  }

  const agent=new THREE.Group();agent.name='player-agent';root.add(agent);
  const agentMaterial=new THREE.MeshStandardMaterial({color:'#72f1b8',roughness:.4,metalness:.12});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.32,5,10),agentMaterial);body.position.y=.62;agent.add(body);body.castShadow=true;
  const head=box(agent,[.61,.48,.44],'#ace8d9',[0,1.04,0]);head.material=agentMaterial;
  box(agent,[.46,.22,.055],'#172837',[0,1.07,.24]);
  box(agent,[.065,.07,.028],'#c6ffe6',[-.13,1.08,.279],true);box(agent,[.065,.07,.028],'#c6ffe6',[.13,1.08,.279],true);
  const leftFoot=box(agent,[.18,.16,.28],'#567987',[-.17,.17,.045]);const rightFoot=box(agent,[.18,.16,.28],'#567987',[.17,.17,.045]);
  cylinder(agent,.027,.24,'#a7cfbd',[.1,1.37,0],6);mesh(agent,new THREE.SphereGeometry(.06,8,6),'#ebdfaa',[.1,1.51,0],true);
  const halo=ring(agent,.53,.025,'#98f7cf',[0,.06,0]);halo.visible=false;
  const orbit=ring(agent,.62,.025,'#c5b5ff',[0,.8,0]);orbit.rotation.x=.4;orbit.visible=false;
  const crown=new THREE.Group();agent.add(crown);crown.visible=false;
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(crown,new THREE.OctahedronGeometry(.075),'#ffe4a2',[Math.cos(a)*.34,1.63,Math.sin(a)*.34],true);}
  const selectionRing=ring(root,.52,.027,'#edfff1',[0,.13,0]);
  const destination=new THREE.Vector3(-5.6,.21,4.9);agent.position.copy(destination);
  let tier='emerging';let movingAgent=false;
  const homeCosmetics=new THREE.Group();home.add(homeCosmetics);let itemKey='';

  for(const zone of zones.values())zone.group.traverse(object=>{if(object.isMesh){object.userData.district=zone.definition.id;pickables.push(object);}});

  function setAgent(data){
    if(!data)return;
    if(/^#[0-9a-f]{6}$/i.test(data.color||''))agentMaterial.color.set(data.color);
    tier=TIERS.includes(data.evolution?.id)?data.evolution.id:'emerging';const rank=TIERS.indexOf(tier);
    halo.visible=rank>=1;orbit.visible=rank>=2;crown.visible=rank>=3;
    homeBeacon.visible=rank>=1;homeCrest.visible=rank>=2;homeCrown.visible=rank>=3;
    const keys=(data.home?.items||[]).map(x=>typeof x==='string'?x:x.key).sort();
    if(keys.join('|')!==itemKey){
      homeCosmetics.traverse(o=>{if(o.isMesh)o.geometry.dispose();});homeCosmetics.clear();itemKey=keys.join('|');
      keys.forEach((key,i)=>{const x=-1.2+(i%3)*.45,z=1.55+Math.floor(i/3)*.35;
        if(key==='glowPlant'){cylinder(homeCosmetics,.12,.2,'#b2a28e',[x,.3,z],8);mesh(homeCosmetics,new THREE.IcosahedronGeometry(.18),'#a5e5b4',[x,.6,z],true);}
        else box(homeCosmetics,[.27,.28+(i%2)*.14,.22],['#9bcfdf','#c9b8e4','#d8c5a1'][i%3],[x,.39,z]);
      });
    }
  }
  function moveTo(id,instant=false){const d=DISTRICTS.find(d=>d.id===id);if(!d)return false;destination.set(d.x,.21,d.z+2.05);if(instant)agent.position.copy(destination);return true;}
  function select(id){for(const [key,zone] of zones)zone.selection.visible=key===id;}
  function update(time,delta,animate=true){
    const distance=agent.position.distanceTo(destination);movingAgent=distance>.035;
    if(movingAgent){const v=destination.clone().sub(agent.position);agent.rotation.y=Math.atan2(v.x,v.z);agent.position.addScaledVector(v.normalize(),Math.min(distance,delta*4.5));}
    if(!animate){agent.position.copy(destination);movingAgent=false;}
    body.position.y=.62+(animate?Math.sin(time*(movingAgent?14:2.2))*(movingAgent?.045:.025):0);
    leftFoot.position.z=.045+(animate&&movingAgent?Math.sin(time*14)*.11:0);rightFoot.position.z=.045-(animate&&movingAgent?Math.sin(time*14)*.11:0);
    selectionRing.position.set(agent.position.x,.18,agent.position.z);
    for(const m of moving){m.mesh.rotation.y=animate?time*m.spin:0;m.mesh.position.y=m.base+(animate?Math.sin(time*1.4)*m.bob:0);}
    orbit.rotation.z=animate?time*.35:0;crown.rotation.y=animate?time*.22:0;
  }
  function setEventProgress(value){const ratio=clamp(Number(value)||0,0,10000)/10000;lens.scale.setScalar(1+ratio*.6);eventOrbit.scale.setScalar(1+ratio*.14);}
  function dispose(){const geometries=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});for(const g of geometries)g.dispose();for(const m of mats)m.dispose();root.clear();}
  return {root,zones,pickables,agent,select,setAgent,moveTo,update,setEventProgress,dispose,get tier(){return tier;}};
}
