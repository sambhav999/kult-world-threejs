'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('3D districts have finite geometry and raycast targets matching the backend',async()=>{
  const {createWorldModel,DISTRICTS}=await import('../client/world-model.mjs');
  const THREE=await import('three');
  const engine=require('../engine');
  assert.deepEqual(DISTRICTS.map(d=>d.id).sort(),Object.keys(engine.DISTRICTS).sort());
  const model=createWorldModel();model.root.updateMatrixWorld(true);
  for(const d of DISTRICTS){
    const raycaster=new THREE.Raycaster(new THREE.Vector3(d.x,12,d.z),new THREE.Vector3(0,-1,0));
    const hits=raycaster.intersectObjects(model.pickables,false);
    assert.ok(hits.length,`${d.name} must be selectable through its geometry`);
    assert.equal(hits[0].object.userData.district,d.id);
  }
  let triangles=0;model.root.traverse(o=>{if(o.isMesh){for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  assert.ok(triangles<100000,`geometry budget exceeded: ${triangles}`);
  model.dispose();assert.equal(model.root.children.length,0);
});

test('3D appearance reads the engine tier and does not change evidence or credits',async()=>{
  const {createWorldModel,TIERS}=await import('../client/world-model.mjs');
  const E=require('../engine');const a=E.publicAgent(E.newAgent('NORI','NORI'));
  const model=createWorldModel();
  for(const id of TIERS){a.evolution.id=id;const before=JSON.stringify(a);model.setAgent(a);assert.equal(model.tier,id);assert.equal(JSON.stringify(a),before);}
  a.evolution.id='invented';model.setAgent(a);assert.equal(model.tier,'emerging');
  model.dispose();
});

test('3D movement is bounded and reduced motion reaches the same destination',async()=>{
  const {createWorldModel,DISTRICTS}=await import('../client/world-model.mjs');const model=createWorldModel();
  assert.equal(model.moveTo('unknown'),false);
  for(const d of DISTRICTS){assert.equal(model.moveTo(d.id),true);for(let n=0;n<300;n++)model.update(n/30,1/30,true);assert.ok(Math.abs(model.agent.position.x-d.x)<.04);assert.ok(Math.abs(model.agent.position.z-(d.z+2.05))<.04);}
  model.moveTo('home');model.update(0,0,false);assert.equal(model.agent.position.x,DISTRICTS[0].x);
  model.select('forge');assert.deepEqual([...model.zones].filter(([,z])=>z.selection.visible).map(([id])=>id),['forge']);
  model.dispose();
});
