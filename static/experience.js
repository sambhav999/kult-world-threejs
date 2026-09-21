/* Progressive experience layer. All Agent/evidence/policy state comes from the API. */
(() => {
  const ui = { policy:null, census:null, receipts:[], memory:[], loadedAgent:null, loading:false, filter:'all' };
  const navNames={world:'Your World',missions:'Mission board',journal:'Experience journal',evolution:'Evolution',passport:'Agent Passport',community:'Town Square',permissions:'Permissions'};
  const fmt = n => Number(n||0).toLocaleString();
  const date = n => new Date(n).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  function empty(title,copy){return `<div class="emptyState"><i>◇</i><b>${esc(title)}</b><span>${esc(copy)}</span><button class="primaryBtn" data-go="missions">Find your first mission →</button></div>`;}
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  async function loadMeta(){
    if(!state.agent||ui.loading)return;
    ui.loading=true;
    try {
      const [p,c,r]=await Promise.all([api('/api/permissions'),api('/api/census'),api('/api/receipts')]);
      ui.policy=p.policy;ui.census=c.census;ui.receipts=r.receipts;ui.memory=r.memory;ui.loadedAgent=state.agent.id;
      renderExtra();
    } catch(e){ $('#permissionCard').innerHTML=`<div class="infoPanel"><p>${esc(e.message)}</p><button class="softBtn" data-retry-meta>Retry connection</button></div>`; }
    finally{ui.loading=false;}
  }
  function renderExtra(){
    if(!state.agent)return;
    const a=state.agent,steps=[['world','Meet your Agent',true],['missions','Earn your first proof',a.missionsCompleted>0],['passport','Share your Passport',a.publicProfile]];
    const current=steps.findIndex(s=>!s[2]);
    $('#journeyStrip').innerHTML=steps.map(([view,label,done],i)=>`<button data-go="${view}" class="${done?'done':''} ${i===current?'current':''}"><b>${done?'✓':i+1}</b><span>${label}</span></button>`).join('');
    $('#outcomeCount').textContent=fmt(a.missionsCompleted);
    $('#outcomeCount').previousElementSibling.textContent='RECORDED MISSIONS';
    $('#passportChainStatus').textContent=a.walletVerified?'ANCHORED HISTORY':a.walletAddress?'WALLET CONNECTED':'RECORDED LOCALLY';
    $('#passportPrivacy').innerHTML=`<div><b>${a.publicProfile?'Your Passport is public':'Your Passport is private'}</b><p>${a.publicProfile?'Your evidence is visible. Private memories remain private. Existing on-chain receipts cannot be unpublished.':'Publish only when you are ready. Your private memories never appear on the public Passport.'}</p></div>${a.publicProfile?'<button class="softBtn" data-unpublish>Make private</button>':'<button class="softBtn" data-publish>Publish Passport ↗</button>'}`;
    renderEvolutionPage(); renderJournal(); renderPermissions(); renderCensus();
    if(!ui.loadedAgent&&!ui.loading)loadMeta();
  }
  function renderEvolutionPage(){
    const a=state.agent,e=a.evolution;
    $('#evolutionHero').innerHTML=`<div class="profileOrb" data-evolution="${esc(e.id)}">${esc(a.name[0])}</div><div><span class="eyebrow">${esc(a.name)} · ${esc(e.cap||'NEW BEGINNINGS')}</span><h2>${esc(e.label)}</h2><p>${esc(e.summary)}</p>${e.next?`<p style="margin-top:12px;color:var(--mint)">${e.next.evidenceNeeded} more outcomes in ${esc(e.cap||'one domain')}; a domain score of ${e.next.minScore} is also required.</p>`:'<p>Keep proving your capability. Every new outcome counts.</p>'}</div>`;
    $('#evolutionStages').innerHTML=state.config.evolutionStages.map((s,i)=>{
      const rule=state.config.tierRules[s.id],earned=e.rank>=i;
      const progress=rule?Math.min(100,Math.max(...a.capabilities.map(c=>Math.min(c.n/rule.minEvidence,c.score/rule.minScore)*100))):100;
      return `<article class="evolutionStage ${earned?'achieved':''}"><span>FORM 0${i+1}<b>${e.rank===i?'CURRENT':earned?'REACHED':'TO EARN'}</b></span><i>${s.glyph}</i><h3>${esc(s.label)}</h3><p>${esc(s.unlock)}</p><div class="meter"><i style="width:${progress}%"></i></div><small>${rule?`${rule.minEvidence} outcomes + ${rule.minScore} domain score`:'Your starting identity. Every Agent begins here.'}</small></article>`;
    }).join('');
  }
  function renderJournal(){
    const a=state.agent,proofs=ui.receipts,search=$('#journalSearch').value.trim().toLowerCase();
    $('#journalStats').innerHTML=`<div><b>${fmt(a.missionsCompleted)}</b><span>Total missions</span></div><div><b>${fmt(a.missionWins)}</b><span>Successful attempts</span></div><div><b>${fmt(a.missionsCompleted-a.missionWins)}</b><span>Misses retained</span></div>`;
    const filtered=proofs.filter(p=>`${p.title} ${p.cap} ${p.outcome}`.toLowerCase().includes(search));
    $('#journalList').innerHTML=filtered.length?filtered.map(p=>`<article class="journalEntry ${esc(p.outcome)}"><i>${p.outcome==='success'?'✓':'↻'}</i><div><h3>${esc(p.title)}</h3><p>${esc(p.cap)} · difficulty ${p.difficulty} · ${esc(p.status.toLowerCase().replaceAll('_',' '))}</p><small>${date(p.createdAt)}</small><code>${esc(p.evidenceHash||'Historical receipt: hash unavailable')}</code>${p.evidenceHash?`<button class="softBtn" data-copy-proof="${esc(p.id)}">Copy evidence hash</button>`:''}</div><span>${p.outcome==='success'?'SUCCESS':'MISS'}</span></article>`).join(''):search?'<div class="emptyState"><b>No matching experiences</b><span>Try a mission name or another capability.</span></div>':empty('A story waiting to be written','Complete a mission to record your first experience. A miss is part of the story, too.');
    $('#exportHistoryBtn').disabled=!proofs.length;
  }
  function renderPermissions(){
    const p=ui.policy;if(!p){$('#permissionCard').innerHTML='<div class="infoPanel">Loading your server policy…</div>';return;}
    document.dispatchEvent(new CustomEvent('kult:policy',{detail:{paused:p.paused}}));
    $('.permissionNotice').innerHTML='<b>No financial authority.</b> This server-enforced policy only governs KULT World activity. It does not authorize trades, transfers, cards, or withdrawals.';
    $('#permissionCard').innerHTML=`<div class="permissionRow"><b>World activity</b><button class="softBtn ${p.paused?'resumeBtn':'pauseBtn'}" data-toggle-pause>${p.paused?'Resume World activity':'Pause World activity'}</button></div><div class="permissionRow"><b>Permitted capabilities</b><span>${p.allowedDomains.map(esc).join(', ')}</span></div><div class="permissionRow"><b>Action limit · UTC day</b><span>${p.actionsToday} / ${p.maxDailyActions} used</span></div><div class="permissionRow"><b>Cosmetic purchase limit</b><span>${p.maxPurchaseCredits} World Credits per purchase</span></div><div class="permissionRow"><b>Human approval</b><span>Mission choices, purchases, publishing & wallet transactions</span></div><div class="permissionRow"><b>Trading / withdrawals</b><span class="denied">Never permitted</span></div><div class="permissionRow"><b>Data access</b><span>Own World history · public Passports</span></div><div class="permissionRow"><b>Current policy · v${p.version}</b><span><code>${esc(p.policyHash)}</code></span></div><div class="permissionRow"><b>Enforced by KULT World server</b><button class="softBtn" data-edit-policy>Edit boundaries</button></div><div class="permissionRow"><span style="max-width:100%;text-align:left">Updated ${date(p.updatedAt)}. Policy hash is off-chain. Pausing blocks future missions, exploration, rest, purchases and catch-up; completed actions are retained.</span></div>`;
    let banner=$('#pausedBanner');
    if(p.paused&&!banner){banner=document.createElement('div');banner.id='pausedBanner';banner.className='pausedBanner';banner.textContent='World activity is paused. Your Agent and history are safe. Resume from Permissions.';$('.centerStage').prepend(banner);}
    if(!p.paused)banner?.remove();
    $('#liveBtn').disabled=p.paused||state.busy;
  }
  function renderCensus(){
    let box=$('#censusCard');if(!box){box=document.createElement('article');box.id='censusCard';box.className='censusCard';$('#townSquare').after(box);}
    box.innerHTML=ui.census?`<div><span class="eyebrow">AGENT CENSUS · SEASON 01</span><h3>You're part of the first chapter.</h3><p>Founder Passport <b>#${String(ui.census.number).padStart(4,'0')}</b><br/>A participation number. No scarcity, token, or capability boost.</p></div><button class="softBtn" data-census-download>Save registration ↓</button>`:'<div><span class="eyebrow">AGENT CENSUS · SEASON 01</span><h3>Be part of the first chapter.</h3><p>Register your Agent for a numbered Founder Passport.<br/>Participation only. No mint or wallet required.</p></div><button class="primaryBtn" data-register-census>Register my Agent →</button>';
  }
  async function refreshAgent(){const d=await api('/api/state');state.agent=d.agent;state.world=d.world;render();await loadMeta();}
  function policyEditor(){const p=ui.policy;modal(`<div class="modalKicker">WORLD BOUNDARIES</div><h2>Define their room to explore.</h2><p>These limits are enforced by the World server and can be changed at any time.</p><fieldset class="policyDomains"><legend>Allowed capabilities</legend>${state.config.caps.map(cap=>`<label><input type="checkbox" name="domain" value="${cap}" ${p.allowedDomains.includes(cap)?'checked':''}/> ${cap}</label>`).join('')}</fieldset><label class="formRow policyInput">Actions per UTC day (1–100)<input id="policyActions" class="modalInput" type="number" min="1" max="100" value="${p.maxDailyActions}"/></label><label class="formRow policyInput">World Credits per purchase (0–1,000)<input id="policySpend" class="modalInput" type="number" min="0" max="1000" value="${p.maxPurchaseCredits}"/></label><div class="modalActions"><button class="softBtn" data-close>Cancel</button><button class="primaryBtn" data-save-policy>Save boundaries</button></div>`);$('[data-close]').onclick=closeModal;$('[data-save-policy]').onclick=async()=>{const b=$('[data-save-policy]');b.disabled=true;try{const data=await api('/api/permissions',{method:'POST',body:{allowedDomains:$$('input[name="domain"]:checked').map(n=>n.value),maxDailyActions:Number($('#policyActions').value),maxPurchaseCredits:Number($('#policySpend').value)}});ui.policy=data.policy;closeModal();renderExtra();toast('World boundaries saved.','good');}catch(e){toast(e.message,'bad');b.disabled=false;}};}
  document.addEventListener('kult:ready',()=>{loadMeta();const view=location.hash.slice(1);if(navNames[view]&&state.agent)switchView(view);});
  document.addEventListener('kult:render',()=>{renderExtra();if(ui.loadedAgent)loadMeta();});
  document.addEventListener('kult:view',e=>{const view=e.detail;document.title=`${navNames[view]} · KULT World`;if(location.hash!==`#${view}`)history.pushState(null,'',`#${view}`);$$('[data-view]').forEach(b=>{b.setAttribute('aria-current',b.dataset.view===view?'page':'false');b.setAttribute('aria-label',navNames[b.dataset.view]||b.dataset.view);});renderExtra();if(['permissions','journal','community'].includes(view))loadMeta();window.scrollTo({top:0,behavior:'instant'});});
  window.addEventListener('popstate',()=>{const v=location.hash.slice(1)||'world';if(navNames[v])switchView(v);});
  $('#journalSearch').addEventListener('input',renderJournal);
  $('#exportHistoryBtn').onclick=()=>download(`${state.agent.name.replace(/[^a-z0-9_-]/gi,'_')}-receipts.json`,{agentId:state.agent.id,exportedAt:new Date().toISOString(),retainedReceipts:ui.receipts.length,totalMissionAttempts:state.agent.missionsCompleted,receipts:ui.receipts});
  $('#missionFilters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;ui.filter=b.dataset.filter;$$('[data-filter]').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',String(n===b));});$$('.missionCard').forEach(n=>n.hidden=ui.filter!=='all'&&n.dataset.cap!==ui.filter);};
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.go){switchView(b.dataset.go);return;}
    if(b.hasAttribute('data-edit-policy')){policyEditor();return;}
    if(b.hasAttribute('data-retry-meta')){loadMeta();return;}
    if(b.hasAttribute('data-census-download')){download('kult-founder-passport.json',{...ui.census,name:state.agent.name,participationOnly:true});return;}
    if(b.dataset.copyProof){try{await navigator.clipboard.writeText(ui.receipts.find(p=>p.id===b.dataset.copyProof).evidenceHash);toast('Evidence hash copied.');}catch{toast('Clipboard unavailable. Select the hash to copy it.','bad');}return;}
    const action=b.hasAttribute('data-toggle-pause')?'pause':b.hasAttribute('data-register-census')?'census':b.hasAttribute('data-unpublish')?'unpublish':b.hasAttribute('data-publish')?'publish':null;
    if(!action)return;b.disabled=true;
    try{
      if(action==='pause'){const d=await api('/api/permissions',{method:'POST',body:{paused:!ui.policy.paused}});ui.policy=d.policy;renderExtra();toast(d.policy.paused?'World activity paused on the server.':'World activity resumed.','good');}
      if(action==='census'){const d=await api('/api/census',{method:'POST',body:{}});ui.census=d.census;renderCensus();toast('Your Founder Passport is registered.','good');}
      if(action==='unpublish'){await api('/api/passport/publish',{method:'POST',body:{public:false}});await refreshAgent();toast('Your Passport is now private.','good');}
      if(action==='publish')await publishPassport();
    }catch(error){toast(error.message,'bad');}finally{if(b.isConnected)b.disabled=false;}
  });
  document.addEventListener('keydown',e=>{if(e.key!=='Tab'||$('#modalBack').classList.contains('hidden'))return;const items=$$('#modal button:not(:disabled),#modal input:not(:disabled),#modal a[href]');const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}});
  // Rest is a real engine action, separate from an encouragement message.
  const restButton=$('[data-tone="rest"]');restButton.textContent='Rest & recharge';restButton.removeAttribute('data-tone');
  restButton.addEventListener('click',async()=>{if(state.busy)return;state.busy=true;restButton.disabled=true;try{const d=await api('/api/rest',{method:'POST',body:{}});state.agent=d.agentState;render();toast('A little rest. Energy restored.','good');}catch(e){toast(e.message,'bad');}finally{state.busy=false;restButton.disabled=false;}});
})();
