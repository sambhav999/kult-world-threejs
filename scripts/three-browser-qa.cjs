'use strict';
// Team-run real-browser test. Requires Playwright + Chromium. This is not a mock-WebGL test.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

async function main(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kult-3d-browser-'));
  process.env.KULT_DATA_FILE=path.join(tmp,'world.json');process.env.NODE_ENV='development';process.env.KULT_SECURE_COOKIE='false';
  const {server}=require('../server');await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const out=path.resolve('qa-output/threejs');fs.mkdirSync(out,{recursive:true});
  let browser;
  try{
    browser=await chromium.launch({headless:process.env.QA_HEADFUL!=='1'});
    const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/preview.html');
    await page.getByText('3D ready · local preview',{exact:true}).waitFor();
    await page.locator('#previewFps').filter({hasText:'FPS'}).waitFor();
    await page.click('[data-preview-zone="observatory"]');assert.equal(await page.locator('#previewName').innerText(),'Observatory');
    await page.click('#previewWalk');await page.click('#previewFind');
    await page.selectOption('#previewTier','elite');assert.equal(await page.locator('#previewTierLabel').innerText(),'Elite');
    await page.click('#previewDay');await page.click('#previewReset');
    await page.screenshot({path:path.join(out,'01-preview.png'),fullPage:true});
    await page.goto(base);await page.waitForSelector('#bootStatus.hidden');await page.fill('#agentName','3D QA');await page.click('#adoptBtn');await page.click('[data-saved]');
    await page.waitForSelector('#world3dCanvas[data-ready="true"]');
    await page.locator('#world3dFps').filter({hasText:'FPS'}).waitFor();
    assert.equal(await page.locator('#worldMap').isVisible(),false);
    await page.click('[data-zone-select="commons"]');assert.equal(await page.locator('#districtDetailName').innerText(),'The Commons');
    await page.click('#enterDistrict3d');await page.click('[data-choice="trace"]');await page.click('[data-return]');
    await page.click('#mainNav [data-view="journal"]');await page.waitForSelector('.journalEntry');
    await page.click('#mainNav [data-view="permissions"]');await page.click('[data-toggle-pause]');await page.waitForSelector('#pausedBanner');
    await page.click('#mainNav [data-view="world"]');assert.equal(await page.locator('#world3dPolicy').innerText(),'World actions paused');
    const blocked=await page.request.post(base+'/api/live',{data:{steps:1}});assert.equal(blocked.status(),403);
    await page.click('#world2dMode');assert.equal(await page.locator('#worldMap').isVisible(),true);
    await page.click('#world3dMode');assert.equal(await page.locator('#world3dPanel').isVisible(),true);
    await page.click('#world3dMotion');assert.equal(await page.locator('#world3dMotion').getAttribute('aria-pressed'),'false');
    await page.click('#world3dReset');await page.screenshot({path:path.join(out,'02-connected-desktop.png'),fullPage:true});
    for(const width of [390,768]){
      await page.setViewportSize({width,height:1000});await page.click('#world3dReset');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}px`);
      await page.screenshot({path:path.join(out,`03-connected-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'PASS',scope:'Real browser WebGL and connected API',screenshots:out}));
  }finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exit(1);});
