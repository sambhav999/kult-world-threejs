'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('World controls enforce pause, domains, budgets and stable Census identity',async t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kult-controls-'));
  process.env.KULT_DATA_FILE=path.join(tmp,'world.json');process.env.KULT_SECURE_COOKIE='false';
  const {server,store}=require('../server');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  async function call(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});cookie=String(r.headers.get('set-cookie')||cookie).split(';')[0];return{status:r.status,data:await r.json()};}
  const adopted=await call('/api/adopt',{name:'QA',persona:'NORI'});const id=adopted.data.agent.id;
  const first=await call('/api/permissions');assert.equal(first.data.policy.financialAuthority,false);
  const paused=await call('/api/permissions',{paused:true});assert.notEqual(paused.data.policy.policyHash,first.data.policy.policyHash);
  for(const [route,body] of [['/api/live',{steps:1}],['/api/mission',{mission:'signal_hunt',choice:'trace'}],['/api/home/buy',{item:'holoMap'}],['/api/rest',{}]])assert.equal((await call(route,body)).status,403);
  const owner=store.listOwners()[0][1];owner.agent.lastAutonomousAt=Date.now()-86400000;const before=owner.agent.tick;assert.equal((await call('/api/state')).data.agent.tick,before);
  await call('/api/permissions',{paused:false,allowedDomains:['social'],maxDailyActions:2,maxPurchaseCredits:100});
  assert.equal((await call('/api/mission',{mission:'signal_hunt',choice:'trace'})).status,403);
  assert.equal((await call('/api/home/buy',{item:'holoMap'})).status,403);
  const live=await call('/api/live',{steps:1});assert.equal(live.status,200);assert.equal(live.data.events[0].verified.cap,'social');
  assert.equal((await call('/api/mission',{mission:'welcome_shift',choice:'invalid'})).status,400);
  assert.equal((await call('/api/mission',{mission:'welcome_shift',choice:'listen'})).status,200);
  assert.equal((await call('/api/live',{steps:1})).status,403);
  const receipts=await call('/api/receipts');assert.equal(receipts.data.receipts.length,1);assert.match(receipts.data.receipts[0].evidenceHash,/^0x[a-f0-9]{64}$/);
  const census=await call('/api/census',{});assert.equal(census.data.census.number,1);assert.equal((await call('/api/census',{})).data.census.number,1);
  const recovered=await call('/api/recover',{code:adopted.data.recoveryCode});assert.equal(recovered.data.agent.id,id);assert.equal((await call('/api/census')).data.census.number,1);
  await call('/api/passport/publish',{public:true});const publicView=await call('/api/passport/'+id);assert.ok(publicView.data.passport.permissionCard.policyHash);assert.equal(publicView.data.passport.census.number,1);
  const stored=JSON.parse(fs.readFileSync(process.env.KULT_DATA_FILE,'utf8'));assert.equal(Object.values(stored.owners)[0].agent.worldPolicy.allowedDomains[0],'social');
  await call('/api/passport/publish',{public:false});assert.equal((await call('/api/passport/'+id)).status,404);
});
