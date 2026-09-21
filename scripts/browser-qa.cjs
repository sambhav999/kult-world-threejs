'use strict';
// Run with Playwright installed in your development environment.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main(){
  const base=process.env.QA_ORIGIN||'http://localhost:8060';
  const out=path.resolve(process.env.QA_OUTPUT||'qa-output');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1536,height:1050},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('#personaGrid button');
  await page.waitForSelector('#bootStatus.hidden');
  await page.screenshot({path:path.join(out,'01-onboarding.png'),fullPage:true});
  await page.locator('#agentName').fill('NORI');await page.click('#adoptBtn');
  await page.waitForSelector('[data-saved]');
  // Never include recovery secrets in screenshots or logs.
  await page.click('[data-saved]');await page.waitForTimeout(400);
  await page.screenshot({path:path.join(out,'02-world.png'),fullPage:true});
  await page.click('#mainNav [data-view="missions"]');
  await page.click('[data-filter="strategy"]');
  assert.equal(await page.locator('.missionCard:visible').count(),1);
  await page.click('[data-filter="all"]');
  await page.screenshot({path:path.join(out,'03-missions.png'),fullPage:true});
  await page.click('#missionGrid [data-open-mission="signal_hunt"]');
  await page.screenshot({path:path.join(out,'04-mission-choice.png'),fullPage:true});
  await page.click('[data-choice="trace"]');await page.waitForSelector('[data-passport]');
  await page.screenshot({path:path.join(out,'05-mission-result.png'),fullPage:true});
  await page.click('[data-passport]');await page.waitForTimeout(350);
  assert.equal(await page.locator('.proofItem').count(),1);
  await page.screenshot({path:path.join(out,'06-passport.png'),fullPage:true});
  await page.click('#mainNav [data-view="journal"]');await page.waitForSelector('.journalEntry');
  await page.locator('#journalSearch').fill('nonexistent');assert.equal(await page.locator('.journalEntry').count(),0);
  await page.locator('#journalSearch').fill('');
  await page.click('#mainNav [data-view="permissions"]');await page.waitForSelector('[data-toggle-pause]');
  await page.click('[data-toggle-pause]');await page.waitForSelector('#pausedBanner');
  const denied=await page.evaluate(async()=>{const r=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mission:'signal_hunt',choice:'trace'})});return {status:r.status,...await r.json()};});
  assert.equal(denied.status,403);assert.equal(denied.code,'policy_denied');
  await page.reload();await page.waitForSelector('[data-toggle-pause]');assert.match(await page.locator('[data-toggle-pause]').innerText(),/Resume/);
  await page.click('[data-toggle-pause]');await page.waitForSelector('#pausedBanner',{state:'detached'});
  await page.click('[data-edit-policy]');await page.locator('#policySpend').fill('100');await page.click('[data-save-policy]');
  await page.waitForSelector('#modalBack.hidden');
  const deniedPurchase=await page.evaluate(async()=>{const r=await fetch('/api/home/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item:'holoMap'})});return r.status;});assert.equal(deniedPurchase,403);
  await page.screenshot({path:path.join(out,'07-permissions.png'),fullPage:true});
  await page.click('#mainNav [data-view="evolution"]');await page.screenshot({path:path.join(out,'08-evolution.png'),fullPage:true});
  await page.click('#mainNav [data-view="community"]');await page.waitForSelector('[data-register-census]');await page.click('[data-register-census]');await page.waitForSelector('[data-census-download]');
  const census=await page.evaluate(async()=>await(await fetch('/api/census')).json());assert.ok(census.census.number>0);
  await page.screenshot({path:path.join(out,'09-community.png'),fullPage:true});
  await page.reload();await page.waitForSelector('[data-census-download]');
  const censusAfter=await page.evaluate(async()=>await(await fetch('/api/census')).json());assert.equal(censusAfter.census.number,census.census.number);
  await page.click('#mainNav [data-view="world"]');await page.click('#homeBtn');await page.waitForSelector('.shopGrid');await page.click('.modalDismiss');
  await page.click('#mainNav [data-view="passport"]');await page.click('[data-publish]');await page.waitForSelector('[data-unpublish]');
  const agentId=await page.locator('#passportId').innerText();
  const passport=await page.request.get(base+'/api/passport/'+agentId);assert.equal(passport.status(),200);assert.ok((await passport.json()).passport.permissionCard.policyHash);
  await page.click('[data-unpublish]');await page.waitForSelector('[data-publish]');
  assert.equal((await page.request.get(base+'/api/passport/'+agentId)).status(),404);
  for(const width of [390,768]){
    await page.setViewportSize({width,height:844});
    for(const view of ['world','missions','passport','permissions','journal','evolution','community']){
      await page.click(`#mainNav [data-view="${view}"]`);await page.waitForTimeout(100);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`overflow ${width} ${view}`);
      if(width===390&&['world','missions','passport'].includes(view))await page.screenshot({path:path.join(out,`mobile-${view}.png`),fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  await browser.close();console.log(JSON.stringify({result:'PASS',browserErrors:errors.length,checks:['adopt','mission filtering','mission result','receipt persistence','journal search','pause enforcement','pause persistence','purchase limits','census persistence','public policy','unpublish','home modal','mobile and tablet navigation','overflow'],screenshots:out}));
}
main().catch(e=>{console.error(e);process.exit(1);});
