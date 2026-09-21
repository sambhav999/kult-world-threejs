'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./engine');
const G = require('./growth');
const Chain = require('./chain');
const Season = require('./season');
const OG = require('./og');
const Policy = require('./policy');
const { JsonStore } = require('./store');
const { version: VERSION } = require('./package.json');

const PORT = Number(process.env.PORT || 8060);
const PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_FILE = process.env.KULT_DATA_FILE || path.join(__dirname, 'data', 'kult-world.json');
const STEP_MINUTES = Number(process.env.KULT_STEP_MINUTES || 60);
const MAX_CATCHUP = Math.min(24, Number(process.env.KULT_MAX_CATCHUP_STEPS || 12));
const STATIC = path.join(__dirname, 'static');
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SERVER_RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.testnet.chain.robinhood.com/rpc';
const BROWSER_RPC_URL = process.env.ROBINHOOD_BROWSER_RPC_URL || 'https://rpc.testnet.chain.robinhood.com/rpc';
const registryCandidate = String(process.env.KULT_REGISTRY_ADDRESS || '');
const REGISTRY_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(registryCandidate) && !/^0x0{40}$/i.test(registryCandidate) ? registryCandidate.toLowerCase() : null;
const ADMIN_TOKEN = String(process.env.KULT_ADMIN_TOKEN || '');
const SECURE_COOKIE = PRODUCTION || String(process.env.KULT_SECURE_COOKIE || '').toLowerCase() === 'true';
const COOKIE_NAME = SECURE_COOKIE ? '__Host-kw_session' : 'kw_session';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';
const requestedConfirmations = Number(process.env.KULT_MIN_CONFIRMATIONS || 1);
const MIN_CONFIRMATIONS = Number.isInteger(requestedConfirmations) && requestedConfirmations > 0 ? requestedConfirmations : 1;
const SEASON_PHASE = Season.PHASES.has(process.env.KULT_SEASON_PHASE) ? process.env.KULT_SEASON_PHASE : 'WORLD_OPEN';
const SEASON_COMMIT_TX = /^0x[a-fA-F0-9]{64}$/.test(String(process.env.KULT_SEASON_COMMIT_TX || '')) ? String(process.env.KULT_SEASON_COMMIT_TX).toLowerCase() : null;

if (PRODUCTION) {
  const missing = [];
  let validOrigin = false;
  try { const parsedOrigin = new URL(PUBLIC_ORIGIN); validOrigin = parsedOrigin.protocol === 'https:' && parsedOrigin.origin === PUBLIC_ORIGIN; } catch (_) {}
  if (!validOrigin) missing.push('PUBLIC_ORIGIN (exact https origin)');
  if (!process.env.ROBINHOOD_RPC_URL) missing.push('ROBINHOOD_RPC_URL');
  if (!REGISTRY_ADDRESS) missing.push('KULT_REGISTRY_ADDRESS');
  if (!SEASON_COMMIT_TX) missing.push('KULT_SEASON_COMMIT_TX (manifest commitment transaction)');
  if (ADMIN_TOKEN.length < 32) missing.push('KULT_ADMIN_TOKEN (32+ chars)');
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
}

const ROBINHOOD = {
  name: 'Robinhood Chain Testnet', chainId: Chain.CHAIN_ID, chainIdHex: Chain.CHAIN_ID_HEX,
  rpcUrl: BROWSER_RPC_URL, explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
  faucetUrl: 'https://faucet.testnet.chain.robinhood.com',
  currency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, registryAddress: REGISTRY_ADDRESS,
};
function seasonView() { return Season.publicSeason({ phase: SEASON_PHASE, commitTx: SEASON_COMMIT_TX, explorerUrl: ROBINHOOD.explorerUrl }); }
const store = new JsonStore(DATA_FILE);

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    try { out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch (_) {}
  }
  return out;
}
function newSessionToken() { return crypto.randomBytes(32).toString('base64url'); }
function validSessionToken(token) { return /^[A-Za-z0-9_-]{43}$/.test(String(token || '')); }
function ownerIdForToken(token) { return `ow_${crypto.createHash('sha256').update(token).digest('hex')}`; }
function setSessionCookie(res, token) { res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${SECURE_COOKIE ? '; Secure' : ''}`); }
function blankOwner() { const now = Date.now(); return { createdAt: now, updatedAt: now, lastSeenAt: now, agent: null, recoveryHash: null, analytics: {} }; }
function resolveSession(req, res) {
  const tokenFromCookie = parseCookies(req)[COOKIE_NAME];
  const token = validSessionToken(tokenFromCookie) ? tokenFromCookie : newSessionToken();
  if (token !== tokenFromCookie) setSessionCookie(res, token);
  const id = ownerIdForToken(token);
  return { id, token, owner: store.getOwner(id) || blankOwner() };
}

function cleanName(value) { return String(value || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16) || 'NORI'; }
function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }
function newRecoveryCode() { return crypto.randomBytes(18).toString('base64url'); }
function safeEqual(a, b) { const left = Buffer.from(String(a)); const right = Buffer.from(String(b)); return left.length === right.length && crypto.timingSafeEqual(left, right); }
function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ...(PRODUCTION ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}
function json(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...securityHeaders(), ...extra });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let source = '';
    req.on('data', chunk => { source += chunk; if (source.length > 32_768) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { if (!source) return resolve({}); try { resolve(JSON.parse(source)); } catch (_) { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
function mime(file) { return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

const rateBuckets = new Map();
let rateChecks = 0;
function requestIp(req) { return TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown' : req.socket.remoteAddress || 'unknown'; }
function consumeBucket(key, limit, windowMs = 60_000) {
  const now = Date.now(); let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) bucket = { start: now, count: 0 };
  bucket.count += 1; rateBuckets.set(key, bucket);
  if (++rateChecks % 500 === 0) for (const [bucketKey, value] of rateBuckets) if (now - value.start > windowMs * 2) rateBuckets.delete(bucketKey);
  return bucket.count > limit;
}
function limited(req, ownerId, sensitive = false) { const scope = sensitive ? 'sensitive' : 'ordinary'; if (consumeBucket(`ip:${scope}:${requestIp(req)}`, sensitive ? 12 : 150)) return true; return ownerId ? consumeBucket(`owner:${scope}:${ownerId}`, sensitive ? 20 : 100) : false; }
function allowedOrigin(req) { const origin = req.headers.origin; if (!origin) return !PRODUCTION; try { return new URL(origin).origin === new URL(PUBLIC_ORIGIN).origin; } catch (_) { return false; } }
function save(id, owner) { owner.updatedAt = Date.now(); owner.lastSeenAt = Date.now(); owner.analytics ||= {}; store.setOwner(id, owner); }
function catchup(owner) {
  if (!owner.agent) return [];
  const agent = owner.agent; Policy.ensure(agent);
  if (agent.worldPolicy.paused || !Policy.remaining(agent)) { agent.lastAutonomousAt = Date.now(); return []; }
  const events = E.catchUp(agent, { now: Date.now(), stepMinutes: STEP_MINUTES, maxSteps: Math.min(MAX_CATCHUP, Policy.remaining(agent)) });
  Policy.consume(agent, events.length); return events;
}
function requireAgent(owner, res) { if (owner.agent) return true; json(res, 400, { error: 'Adopt an Agent first.', code: 'agent_required' }); return false; }
function apiError(res, status, error, code) { return json(res, status, { error, ...(code ? { code } : {}) }); }
function decodeSegment(value) { try { return decodeURIComponent(value); } catch (_) { return null; } }
function proofFor(agent, proofId) { return (agent.proofs || []).find(proof => proof.id === proofId) || null; }
function publicProof(proof) {
  const issuerVerified = Boolean(proof.verifiedIssuer || proof.issuerType === 'verified-issuer');
  const anchored = Boolean(proof.anchored);
  return {
    id: proof.id, receiptId: proof.receiptId || null, evidenceHash: proof.evidenceHash || null,
    title: proof.title, cap: proof.cap, outcome: proof.outcome, difficulty: proof.difficulty,
    createdAt: proof.createdAt, anchored, issuerType: issuerVerified ? 'authorized-issuer' : anchored ? 'self-attested' : 'kult-recorded',
    issuerVerified, txHash: anchored ? proof.txHash : null, blockNumber: anchored ? proof.blockNumber : null,
    confirmations: anchored ? proof.confirmations : null, anchoredAt: anchored ? proof.anchoredAt : null,
    status: issuerVerified ? 'ISSUER_VERIFIED' : anchored ? 'ANCHORED' : 'RECORDED',
  };
}
function publicPassport(agent) {
  const view = E.publicAgent(agent);
  const proofs = (agent.proofs || []).slice(0, 30).map(publicProof);
  const anchoredProofs = proofs.filter(proof => proof.anchored);
  return {
    id: view.id, name: view.name, persona: view.persona, trait: view.trait, color: view.color, accent: view.accent,
    blurb: view.blurb, line: view.line, born: view.born, overall: view.overall, capabilities: view.capabilities,
    arenaRank: view.arenaRank, streak: view.streak, missionsCompleted: view.missionsCompleted, missionWins: view.missionWins, evolution: view.evolution,
    walletVerified: view.walletVerified, milestones: view.milestones,
    proofs, anchoredProofs, permissionCard: Policy.view(agent), census: agent.census || null,
    verification: {
      seasonId: Season.MANIFEST.seasonId, seasonManifestHash: Season.manifestHash,
      recorded: proofs.length, anchored: anchoredProofs.length,
      issuerVerified: proofs.filter(proof => proof.issuerVerified).length,
      walletBound: Boolean(view.walletVerified),
    },
  };
}
function findPublicAgent(agentId) { const agent = store.listAgents().find(candidate => candidate.id === agentId); return agent && agent.publicProfile ? agent : null; }
function townSquare() {
  const world = store.getWorld();
  const latestMoments = Object.values(world.shareCards || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6).map(G.publicCard);
  const challenges = Object.values(world.challenges || {}).filter(challenge => !challenge.expiresAt || challenge.expiresAt > Date.now()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6).map(G.publicChallenge);
  return { season: seasonView(), world: store.publicWorld(), latestMoments, challenges, creators: G.listCreators(store, 6) };
}

async function api(req, res, url) {
  const method = req.method || 'GET'; const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (method === 'OPTIONS') return json(res, 204, {});
  if (mutating && !allowedOrigin(req)) return apiError(res, 403, 'Request origin is not allowed.', 'origin_rejected');

  if (url.pathname === '/api/health' && method === 'GET') return json(res, 200, { ok: true, service: 'kult-world', version: VERSION, chainId: Chain.CHAIN_ID, seasonManifestHash: Season.manifestHash });
  const publicRead = method === 'GET' && ['/api/config', '/api/leaderboard', '/api/creators', '/api/season', '/api/town-square'].includes(url.pathname)
    || method === 'GET' && ['/api/challenge/', '/api/share/', '/api/passport/', '/api/verify/'].some(prefix => url.pathname.startsWith(prefix));
  if (publicRead && consumeBucket(`public:${requestIp(req)}`, 240)) return apiError(res, 429, 'Slow down for a moment.', 'rate_limited');
  if (url.pathname === '/api/config' && method === 'GET') return json(res, 200, { personas: E.PERSONAS, caps: E.CAPS, mandates: E.MANDATES, tierRules: E.TIER_RULES, evolutionStages: E.EVOLUTION_STAGES, districts: E.DISTRICTS, missions: E.MISSIONS, homeItems: E.HOME_ITEMS, npcs: E.NPCS, chain: ROBINHOOD, season: seasonView(), stepMinutes: STEP_MINUTES });
  if (url.pathname === '/api/season' && method === 'GET') return json(res, 200, { season: seasonView() });
  if (url.pathname === '/api/town-square' && method === 'GET') return json(res, 200, townSquare());
  if (url.pathname === '/api/leaderboard' && method === 'GET') { const cap = url.searchParams.get('cap'); return json(res, 200, G.leaderboard(store, store.listAgents(), { cap: E.CAPS.includes(cap) ? cap : null })); }
  if (url.pathname.startsWith('/api/challenge/') && method === 'GET') { const challenge = G.getChallenge(store, decodeSegment(url.pathname.slice('/api/challenge/'.length))); return challenge ? json(res, 200, { challenge: G.publicChallenge(challenge) }) : apiError(res, 404, 'Challenge not found.', 'not_found'); }
  if (url.pathname.startsWith('/api/share/') && method === 'GET') { const card = G.publicCard(store.getWorld().shareCards?.[decodeSegment(url.pathname.slice('/api/share/'.length))]); return card ? json(res, 200, { card }) : apiError(res, 404, 'Moment not found.', 'not_found'); }
  if (url.pathname === '/api/creators' && method === 'GET') return json(res, 200, { creators: G.listCreators(store) });
  if (url.pathname.startsWith('/api/passport/') && method === 'GET') { const agent = findPublicAgent(decodeSegment(url.pathname.slice('/api/passport/'.length))); return agent ? json(res, 200, { passport: publicPassport(agent) }) : apiError(res, 404, 'Public Passport not found.', 'not_found'); }
  if (url.pathname.startsWith('/api/verify/') && method === 'GET') { const agent = findPublicAgent(decodeSegment(url.pathname.slice('/api/verify/'.length))); return agent ? json(res, 200, { verification: publicPassport(agent) }) : apiError(res, 404, 'Public verification record not found.', 'not_found'); }
  if (url.pathname === '/api/admin/metrics' && method === 'GET') { if (limited(req, null, true)) return apiError(res, 429, 'Slow down for a moment.', 'rate_limited'); const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!ADMIN_TOKEN || !safeEqual(token, ADMIN_TOKEN)) return apiError(res, 401, 'Unauthorized.', 'unauthorized'); return json(res, 200, store.metrics()); }

  if (url.pathname === '/api/recover' && method === 'POST') {
    if (limited(req, null, true)) return apiError(res, 429, 'Too many recovery attempts. Try again shortly.', 'rate_limited');
    let body; try { body = await readBody(req); } catch (error) { return apiError(res, 400, error.message, 'invalid_request'); }
    const found = store.findOwnerByRecoveryHash(codeHash(body.code || ''));
    if (!found) return apiError(res, 404, 'Recovery key not found.', 'recovery_not_found');
    const [oldId, owner] = found; const nextToken = newSessionToken(); const nextId = ownerIdForToken(nextToken);
    owner.lastSeenAt = Date.now(); store.moveOwner(oldId, nextId, owner); setSessionCookie(res, nextToken);
    return json(res, 200, { ok: true, agent: E.publicAgent(owner.agent) });
  }

  const { id, owner } = resolveSession(req, res);
  if (limited(req, id)) return apiError(res, 429, 'Slow down for a moment.', 'rate_limited');
  let body = {}; if (mutating) try { body = await readBody(req); } catch (error) { return apiError(res, 400, error.message, 'invalid_request'); }

  if (url.pathname === '/api/permissions' && method === 'GET') {
    if (!requireAgent(owner, res)) return;
    return json(res, 200, { policy: Policy.view(owner.agent) });
  }
  if (url.pathname === '/api/permissions' && method === 'POST') {
    if (!requireAgent(owner, res)) return;
    try { const policy = Policy.update(owner.agent, body); save(id, owner); return json(res, 200, { policy }); }
    catch (error) { return apiError(res, 400, error.message, 'invalid_policy'); }
  }
  if (url.pathname === '/api/receipts' && method === 'GET') {
    if (!requireAgent(owner, res)) return;
    return json(res, 200, { agentId: owner.agent.id, receipts: (owner.agent.proofs || []).map(publicProof), totalAttempts: owner.agent.missionsCompleted, memory: owner.agent.memory || [] });
  }
  if (url.pathname === '/api/census' && ['GET','POST'].includes(method)) {
    if (!requireAgent(owner, res)) return;
    if (method === 'POST' && !owner.agent.census) {
      const world = store.getWorld();
      world.censusCounter = Number(world.censusCounter || 0) + 1;
      owner.agent.census = { number: world.censusCounter, registeredAt: Date.now(), seasonId: '01', agentId: owner.agent.id };
      // One atomic store write persists both the counter and the owner's registration.
      save(id, owner);
    }
    return json(res, 200, { census: owner.agent.census || null, registered: Number(store.getWorld().censusCounter || 0), participationOnly: true });
  }
  if (owner.agent && mutating && ['/api/live','/api/mission','/api/gift','/api/home/buy','/api/rest'].includes(url.pathname)) {
    const mission = E.MISSIONS[body.mission], item = E.HOME_ITEMS[body.item];
    const count = url.pathname === '/api/live' ? Math.min(Math.max(Number.parseInt(body.steps || 1, 10) || 1, 1),5) : 1;
    const error = Policy.check(owner.agent, { domain: url.pathname === '/api/mission' ? mission?.cap : undefined, count, spend: ['/api/gift','/api/home/buy'].includes(url.pathname) ? item?.cost : undefined });
    if (error) return apiError(res, 403, error, 'policy_denied');
  }

  if (url.pathname === '/api/state' && method === 'GET') {
    if (!owner.agent) return json(res, 200, { adopted: false, world: store.publicWorld() });
    E.normalizeAgent(owner.agent); const offlineEvents = catchup(owner); const reunion = E.ownerReturn(owner.agent); save(id, owner);
    return json(res, 200, { adopted: true, agent: E.publicAgent(owner.agent), world: store.publicWorld(), offlineEvents: offlineEvents.map(event => ({ type: event.type, text: event.text, place: event.place, district: event.district, cap: event.cap, verified: event.verified })), reunion });
  }
  if (url.pathname === '/api/adopt' && method === 'POST') {
    if (owner.agent) return apiError(res, 409, 'This home already has an Agent.', 'already_adopted');
    const persona = String(body.persona || 'NORI').toUpperCase(); if (!E.PERSONAS[persona]) return apiError(res, 400, 'Unknown persona.', 'invalid_persona');
    const name = cleanName(body.name || persona); owner.agent = E.newAgent(name, persona, String(body.mandate || 'explore').toLowerCase());
    owner.agent.id = `agent_${crypto.randomUUID()}`; Policy.ensure(owner.agent);
    const recoveryCode = newRecoveryCode(); owner.recoveryHash = codeHash(recoveryCode); owner.analytics = { adoptedAt: Date.now(), recapOpens: 0 }; save(id, owner);
    return json(res, 200, { adopted: true, agent: E.publicAgent(owner.agent), recoveryCode, welcome: `${name} moved into a small place of its own. ${name} is ${owner.agent.blurb}.` });
  }
  if (url.pathname === '/api/live' && method === 'POST') { if (!requireAgent(owner, res)) return; const steps = Math.min(Math.max(Number.parseInt(body.steps || 1, 10) || 1, 1), 5); Policy.ensure(owner.agent); const events = Array.from({ length: steps }, (_, index) => E.step(owner.agent, Date.now() + index)); Policy.consume(owner.agent, steps); save(id, owner); return json(res, 200, { events, agent: E.publicAgent(owner.agent) }); }
  if (url.pathname === '/api/rest' && method === 'POST') { if (!requireAgent(owner, res)) return; const event = E.rest(owner.agent); Policy.consume(owner.agent); save(id, owner); return json(res, 200, { agentState: E.publicAgent(owner.agent), event }); }
  if (url.pathname === '/api/mission' && method === 'POST') {
    if (!requireAgent(owner, res)) return;
    const mission = E.MISSIONS[body.mission];
    if (!mission || !mission.options.some(([choice]) => choice === body.choice)) return apiError(res, 400, 'Choose a valid mission option.', 'invalid_choice');
    const out = E.runMission(owner.agent, String(body.mission || ''), String(body.choice || '')); if (out.error) return apiError(res, 400, out.error, 'mission_rejected');
    Policy.consume(owner.agent);
    const raw = `${owner.agent.id}|${out.proof.id}|${out.proof.mission}|${out.proof.outcome}|${out.proof.difficulty}|${out.proof.createdAt}`;
    out.proof.receiptId = `0x${crypto.createHash('sha256').update(out.proof.id).digest('hex')}`; out.proof.agentId = `0x${crypto.createHash('sha256').update(owner.agent.id).digest('hex')}`; out.proof.evidenceHash = `0x${crypto.createHash('sha256').update(raw).digest('hex')}`; Object.assign(proofFor(owner.agent, out.proof.id), out.proof);
    if (out.success && out.world) { const world = store.getWorld(); world.observatory = Math.min(10_000, Number(world.observatory || 0) + out.world); world.contributorAgents ||= {}; world.contributorAgents[owner.agent.id] ||= Date.now(); world.contributors = Object.keys(world.contributorAgents).length; world.updatedAt = Date.now(); store.setWorld(world); }
    owner.analytics ||= {}; owner.analytics.firstMissionAt ||= Date.now(); out.agentState = E.publicAgent(owner.agent); out.worldState = store.publicWorld(); save(id, owner); return json(res, 200, out);
  }
  if (url.pathname === '/api/mandate' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = E.setMandate(owner.agent, String(body.mandate || '').toLowerCase()); if (out.error) return apiError(res, 400, out.error, 'invalid_mandate'); save(id, owner); return json(res, 200, out); }
  if (url.pathname === '/api/focus' && method === 'POST') { if (!requireAgent(owner, res)) return; const cap = String(body.cap || '').toLowerCase(); const out = cap === 'none' ? E.clearFocus(owner.agent) : E.setFocus(owner.agent, cap); if (out.error) return apiError(res, 400, out.error, 'invalid_capability'); save(id, owner); return json(res, 200, out); }
  if (url.pathname === '/api/encourage' && method === 'POST') { if (!requireAgent(owner, res)) return; const tone = ['checkin', 'proud', 'rest'].includes(body.tone) ? body.tone : 'checkin'; const out = E.encourage(owner.agent, tone); save(id, owner); return json(res, 200, out); }
if ((url.pathname === '/api/gift' || url.pathname === '/api/home/buy') && method === 'POST') { if (!requireAgent(owner, res)) return; const out = E.buyHomeItem(owner.agent, String(body.item || '')); if (out.error) return apiError(res, 400, out.error, 'purchase_rejected'); Policy.consume(owner.agent); owner.analytics ||= {}; owner.analytics.homeCustomizedAt ||= Date.now(); save(id, owner); return json(res, 200, out); }
  if (url.pathname === '/api/wallet' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = E.linkWallet(owner.agent, String(body.address || '')); if (out.error) return apiError(res, 400, out.error, 'invalid_wallet'); save(id, owner); return json(res, 200, out); }
  if (url.pathname === '/api/proof/calldata' && method === 'POST') {
    if (!requireAgent(owner, res)) return; if (!REGISTRY_ADDRESS) return apiError(res, 503, 'The experience registry is not configured yet.', 'registry_unavailable'); if (!owner.agent.walletAddress) return apiError(res, 400, 'Connect a wallet first.', 'wallet_required');
    const proof = proofFor(owner.agent, String(body.proofId || '')); if (!proof) return apiError(res, 404, 'Proof not found.', 'proof_not_found');
    try { return json(res, 200, { to: REGISTRY_ADDRESS, data: Chain.encodeAnchorCalldata(proof), value: '0x0', chain: ROBINHOOD, proofId: proof.id }); }
    catch (error) { if (error instanceof Chain.ChainVerificationError) return apiError(res, 400, error.message, error.code); throw error; }
  }
  if (url.pathname === '/api/proof/anchored' && method === 'POST') {
    if (!requireAgent(owner, res)) return; const proof = proofFor(owner.agent, String(body.proofId || '')); if (!proof) return apiError(res, 404, 'Proof not found.', 'proof_not_found'); const txHash = String(body.txHash || '');
    if (proof.anchored) { if (String(proof.txHash).toLowerCase() !== txHash.toLowerCase()) return apiError(res, 409, 'This proof is already anchored by another transaction.', 'already_anchored'); return json(res, 200, { ok: true, already: true, agentState: E.publicAgent(owner.agent) }); }
    try {
      const verified = await Chain.verifyAnchorTransaction({ rpcUrl: SERVER_RPC_URL, registryAddress: REGISTRY_ADDRESS, walletAddress: owner.agent.walletAddress, txHash, expectedData: Chain.encodeAnchorCalldata(proof), minConfirmations: MIN_CONFIRMATIONS });
      const out = E.markProofAnchored(owner.agent, proof.id, txHash, verified); save(id, owner); return json(res, 200, out);
    } catch (error) {
      if (error instanceof Chain.ChainVerificationError) return apiError(res, error.code === 'tx_pending' ? 409 : error.code === 'rpc_unavailable' ? 503 : 400, error.message, error.code);
      throw error;
    }
  }
  if (url.pathname === '/api/recovery/rotate' && method === 'POST') { if (!requireAgent(owner, res)) return; const recoveryCode = newRecoveryCode(); owner.recoveryHash = codeHash(recoveryCode); save(id, owner); return json(res, 200, { recoveryCode }); }
  if (url.pathname === '/api/restart' && method === 'POST') {
    if (!requireAgent(owner, res)) return; if (String(body.confirm || '').trim() !== owner.agent.name) return apiError(res, 400, 'Type the Agent name exactly to start over.', 'confirmation_failed');
    const oldAgentId = owner.agent.id; const world = store.getWorld(); delete world.creators?.[oldAgentId]; for (const creator of Object.values(world.creators || {})) if (creator.followerAgentIds?.[oldAgentId]) delete creator.followerAgentIds[oldAgentId]; world.updatedAt = Date.now(); store.setWorld(world);
    owner.agent = null; owner.recoveryHash = null; owner.analytics = {}; save(id, owner); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/moments' && method === 'GET') { if (!requireAgent(owner, res)) return; return json(res, 200, { moments: G.deriveMoments(owner.agent) }); }
  if (url.pathname === '/api/share' && method === 'POST') { if (!requireAgent(owner, res)) return; const moments = G.deriveMoments(owner.agent); const moment = moments.find(item => item.id === body.momentId) || moments.find(item => item.kind === body.kind) || moments[0]; if (!moment) return apiError(res, 400, 'Earn a real moment before sharing one.', 'moment_required'); const card = G.storeShareCard(store, G.buildShareCard(owner.agent, moment)); return json(res, 200, { card, shareUrl: `${PUBLIC_ORIGIN}/s/${card.slug}` }); }
  if (url.pathname === '/api/challenge' && method === 'POST') { if (!requireAgent(owner, res)) return; const cap = E.CAPS.includes(String(body.cap || '').toLowerCase()) ? String(body.cap).toLowerCase() : null; const challenge = G.createChallenge(store, owner.agent, cap); if (challenge.error) return apiError(res, 400, challenge.error, 'challenge_unavailable'); return json(res, 200, { challenge, challengeUrl: `${PUBLIC_ORIGIN}/c/${challenge.id}` }); }
  if (url.pathname === '/api/challenge/accept' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = G.acceptChallenge(store, String(body.challengeId || ''), owner.agent); if (out.error) return apiError(res, 400, out.error, 'challenge_rejected'); return json(res, 200, out); }
  if (url.pathname === '/api/challenge/resolve' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = G.resolveChallenge(store, String(body.challengeId || ''), owner.agent); if (out.error) return apiError(res, 400, out.error, 'challenge_rejected'); return json(res, 200, out); }
  if (url.pathname === '/api/creator/register' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = G.registerCreatorAgent(store, owner.agent, body.handle); if (out.error) return apiError(res, 400, out.error, 'creator_rejected'); save(id, owner); return json(res, 200, out); }
  if (url.pathname === '/api/creator/follow' && method === 'POST') { if (!requireAgent(owner, res)) return; const out = G.followCreator(store, String(body.agentId || ''), owner.agent); if (out.error) return apiError(res, 400, out.error, 'follow_rejected'); return json(res, 200, out); }
  if (url.pathname === '/api/passport/publish' && method === 'POST') { if (!requireAgent(owner, res)) return; E.setPublicProfile(owner.agent, body.public !== false); save(id, owner); return json(res, 200, { ok: true, public: owner.agent.publicProfile, passportUrl: `${PUBLIC_ORIGIN}/passport/${owner.agent.id}`, agentState: E.publicAgent(owner.agent) }); }
  if (url.pathname === '/api/recap/open' && method === 'POST') { if (!requireAgent(owner, res)) return; owner.analytics ||= {}; owner.analytics.recapOpens = (owner.analytics.recapOpens || 0) + 1; owner.analytics.lastRecapAt = Date.now(); save(id, owner); return json(res, 200, { ok: true }); }
  return apiError(res, 404, 'Not found.', 'not_found');
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function publicPage({ title, eyebrow, headline, detail, stats = [], cta = '/', ctaLabel = 'Enter KULT World', secondaryCta = null, secondaryLabel = null, canonicalPath = '/', ogImage = '/og/season.png', extra = '' }) {
  const safeTitle = escapeHtml(title); const description = escapeHtml(detail); const imageUrl = String(ogImage).startsWith('http') ? String(ogImage) : `${PUBLIC_ORIGIN}${ogImage}`;
  const statMarkup = stats.map(stat => `<div class="public-stat"><b>${escapeHtml(stat.value)}</b><span>${escapeHtml(stat.label)}</span></div>`).join('');
  const secondary = secondaryCta ? `<a class="public-secondary" href="${escapeHtml(secondaryCta)}">${escapeHtml(secondaryLabel || 'View details')} →</a>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${description}"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}"><link rel="canonical" href="${escapeHtml(`${PUBLIC_ORIGIN}${canonicalPath}`)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/public.css"></head><body><main class="public-shell"><a class="wordmark" href="/">KULT <span>WORLD</span></a><section class="public-card"><div class="public-orbit"></div><p class="public-eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(headline)}</h1><p class="public-detail">${description}</p>${statMarkup ? `<div class="public-stats">${statMarkup}</div>` : ''}<div class="public-actions"><a class="public-cta" href="${escapeHtml(cta)}">${escapeHtml(ctaLabel)} <span>→</span></a>${secondary}</div>${extra}<p class="public-proof">World simulation beta · Receipt anchoring optional · No financial authority</p></section></main></body></html>`;
}
function sendHtml(res, status, html) { const body = Buffer.from(html); res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...securityHeaders() }); res.end(body); }
function sendPng(res, status, body) { res.writeHead(status, { 'Content-Type': 'image/png', 'Content-Length': body.length, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400', ...securityHeaders() }); res.end(body); }
function ogPath(kind, id = '') { return `/og/${kind}${id ? `/${encodeURIComponent(id)}` : ''}.png`; }
function permissionMarkup(passport) {
  const p = passport.permissionCard;
  return `<section class="verify-panel"><h2>Agent Permission Card</h2><p class="verify-note">This card describes what the Agent is allowed to attempt in KULT World. It does not authorize trades, cards, or withdrawals.</p><div class="verify-head"><div><small>POLICY VERSION ${escapeHtml(p.version)} · ${p.paused ? 'PAUSED' : 'ACTIVE'}</small><code>${escapeHtml(p.policyHash)}</code></div></div><p>Permitted domains: ${escapeHtml(p.allowedDomains.join(', '))}</p><p>${escapeHtml(p.maxDailyActions)} World actions per UTC day · ${escapeHtml(p.maxPurchaseCredits)} World Credits per cosmetic purchase.</p><p>Human approval: mission choices, cosmetic purchases, publishing and wallet transactions. Access: this Agent’s World state only. Enforced by the KULT server.</p>${passport.census ? `<p>Founder Passport #${String(passport.census.number).padStart(4,'0')} · Participation only; no token rights.</p>` : ''}</section>`;
}
function proofMarkup(passport) {
  const rows = passport.proofs.map(proof => `<article class="verify-row"><div class="verify-status ${proof.status.toLowerCase()}">${escapeHtml(proof.status.replaceAll('_', ' '))}</div><div><b>${escapeHtml(proof.title)}</b><span>${escapeHtml(proof.cap)} · ${escapeHtml(proof.outcome)} · difficulty ${escapeHtml(proof.difficulty)}</span><code>${escapeHtml(proof.evidenceHash || 'Evidence hash pending')}</code></div>${proof.txHash ? `<a href="${escapeHtml(`${ROBINHOOD.explorerUrl}/tx/${proof.txHash}`)}" target="_blank" rel="noreferrer">TX ↗</a>` : '<em>LOCAL</em>'}</article>`).join('');
  return `<section class="verify-panel"><div class="verify-head"><div><small>SEASON RULES COMMITMENT</small><code>${escapeHtml(passport.verification.seasonManifestHash)}</code></div><a href="/season/01">View manifest →</a></div><div class="verify-list">${rows || '<div class="verify-empty">No public receipts have been created yet.</div>'}</div><p class="verify-note">Recorded means KULT stored the outcome. Anchored means its evidence hash was published by the Agent wallet. Issuer verified is reserved for an authorized external issuer.</p></section>`;
}
function serveOgRoute(res, url) {
  let data;
  const momentMatch = /^\/og\/moment\/([^/]+)\.png$/.exec(url.pathname);
  const passportMatch = /^\/og\/passport\/([^/]+)\.png$/.exec(url.pathname);
  const challengeMatch = /^\/og\/challenge\/([^/]+)\.png$/.exec(url.pathname);
  if (momentMatch) {
    const card = G.publicCard(store.getWorld().shareCards?.[decodeSegment(momentMatch[1])]); if (!card) return sendPng(res, 404, OG.renderCard({ eyebrow: 'LOST SIGNAL', title: 'MOMENT NOT FOUND' }));
    data = { eyebrow: card.anchored ? 'ONCHAIN AGENT MOMENT' : `${card.evolution?.label || 'EARNED'} AGENT MOMENT`, title: card.headline, detail: card.sub, accent: card.color, accent2: card.accent, stats: [{ value: card.score ?? '-', label: card.cap || 'score' }, { value: card.evidence ?? '-', label: 'outcomes' }, { value: card.anchored ? 'ANCHORED' : 'RECORDED', label: 'proof' }] };
  } else if (passportMatch) {
    const agent = findPublicAgent(decodeSegment(passportMatch[1])); if (!agent) return sendPng(res, 404, OG.renderCard({ eyebrow: 'PRIVATE PASSPORT', title: 'THIS AGENT IS PRIVATE' }));
    const passport = publicPassport(agent); const best = [...passport.capabilities].sort((a, b) => b.score - a.score)[0];
    data = { eyebrow: `${passport.persona} AGENT PASSPORT`, title: `${passport.name} IS ${passport.evolution.label}`, detail: passport.blurb, accent: passport.color, accent2: passport.accent, stats: [{ value: passport.missionsCompleted, label: 'attempts' }, { value: best?.score ?? '-', label: best?.cap || 'capability' }, { value: passport.verification.anchored, label: 'anchored proofs' }] };
  } else if (challengeMatch) {
    const challenge = G.getChallenge(store, decodeSegment(challengeMatch[1])); if (!challenge) return sendPng(res, 404, OG.renderCard({ eyebrow: 'CHALLENGE CLOSED', title: 'THE SIGNAL HAS FADED' }));
    const view = G.publicChallenge(challenge); data = { eyebrow: 'OPEN AGENT CHALLENGE', title: `CAN YOU BEAT ${view.challengerAgentName}`, detail: `${view.cap} benchmark backed by ${view.targetEvidence} outcomes`, accent: view.color, stats: [{ value: view.targetScore, label: `${view.cap} target` }, { value: view.accepted, label: 'accepted' }, { value: view.beaten, label: 'beat it' }] };
  } else if (url.pathname === '/og/season.png') {
    const town = townSquare(); data = { eyebrow: 'KULT WORLD SEASON 01', title: Season.MANIFEST.title, detail: Season.MANIFEST.promise, stats: [{ value: town.world.contributors, label: 'contributors' }, { value: town.world.creatorCount, label: 'creators' }, { value: town.season.commitment.status === 'ONCHAIN' ? 'ONCHAIN' : 'COMMIT', label: 'season rules' }] };
  } else return false;
  return sendPng(res, 200, OG.renderCard(data));
}
function servePublicRoute(res, url) {
  if (url.pathname.startsWith('/s/')) {
    const card = G.publicCard(store.getWorld().shareCards?.[decodeSegment(url.pathname.slice(3))]);
    if (!card) return sendHtml(res, 404, publicPage({ title: 'Moment not found · KULT World', eyebrow: 'LOST SIGNAL', headline: 'This moment is no longer here.', detail: 'Enter KULT World and create a new story.', ctaLabel: 'Enter the World' }));
    return sendHtml(res, 200, publicPage({ title: `${card.agentName} · KULT World`, eyebrow: card.anchored ? 'ON-CHAIN MOMENT' : `${card.evolution?.label || 'EARNED'} AGENT MOMENT`, headline: card.headline, detail: card.sub, stats: [{ value: card.score ?? '—', label: card.cap ? `${card.cap} score` : 'score' }, { value: card.evidence ?? '—', label: 'outcomes' }, { value: card.anchored ? 'ANCHORED' : 'RECORDED', label: 'proof' }], cta: '/', ctaLabel: 'Raise your own Agent', secondaryCta: `/passport/${encodeURIComponent(card.agentId)}`, secondaryLabel: 'View Agent Passport', canonicalPath: `/s/${encodeURIComponent(card.slug)}`, ogImage: ogPath('moment', card.slug) }));
  }
  if (url.pathname.startsWith('/c/')) {
    const challenge = G.getChallenge(store, decodeSegment(url.pathname.slice(3)));
    if (!challenge) return sendHtml(res, 404, publicPage({ title: 'Challenge not found · KULT World', eyebrow: 'CHALLENGE CLOSED', headline: 'That signal has faded.', detail: 'A new rival is waiting in KULT World.' }));
    const view = G.publicChallenge(challenge);
    return sendHtml(res, 200, publicPage({ title: `${view.challengerAgentName}'s challenge · KULT World`, eyebrow: view.expired ? 'CHALLENGE ENDED' : 'OPEN CHALLENGE', headline: `Can your Agent beat ${view.challengerAgentName}?`, detail: `Prove a ${view.cap} score above ${view.targetScore} with at least four recorded outcomes.`, stats: [{ value: view.targetScore, label: `${view.cap} target` }, { value: view.accepted, label: 'accepted' }, { value: view.beaten, label: 'beat it' }], cta: view.expired ? '/' : `/?challenge=${encodeURIComponent(view.id)}`, ctaLabel: view.expired ? 'Find a new challenge' : 'Accept the challenge', canonicalPath: `/c/${encodeURIComponent(view.id)}`, ogImage: ogPath('challenge', view.id) }));
  }
  if (url.pathname.startsWith('/passport/')) {
    const agent = findPublicAgent(decodeSegment(url.pathname.slice('/passport/'.length)));
    if (!agent) return sendHtml(res, 404, publicPage({ title: 'Private Passport · KULT World', eyebrow: 'PRIVATE PASSPORT', headline: 'This Agent has not published yet.', detail: 'Agent owners decide when their growth becomes public.' }));
    const passport = publicPassport(agent); const best = [...passport.capabilities].sort((a, b) => b.score - a.score)[0];
    return sendHtml(res, 200, publicPage({ title: `${passport.name}'s Agent Passport · KULT World`, eyebrow: `${passport.persona} · ${passport.evolution.label.toUpperCase()} AGENT`, headline: `${passport.name} is becoming ${passport.trait}.`, detail: passport.blurb, stats: [{ value: passport.missionsCompleted, label: 'attempts' }, { value: best?.score ?? '—', label: best ? best.cap : 'best capability' }, { value: passport.anchoredProofs.length, label: 'on-chain proofs' }], cta: '/', ctaLabel: 'Raise your own Agent', secondaryCta: `/verify/${encodeURIComponent(passport.id)}`, secondaryLabel: 'Verify evidence', canonicalPath: `/passport/${encodeURIComponent(passport.id)}`, ogImage: ogPath('passport', passport.id), extra: permissionMarkup(passport) }));
  }
  if (url.pathname.startsWith('/verify/')) {
    const agent = findPublicAgent(decodeSegment(url.pathname.slice('/verify/'.length)));
    if (!agent) return sendHtml(res, 404, publicPage({ title: 'Verification unavailable · KULT World', eyebrow: 'PRIVATE RECORD', headline: 'This evidence history is not public.', detail: 'Agent owners choose when to publish their Passport and proof history.' }));
    const passport = publicPassport(agent);
    return sendHtml(res, 200, publicPage({ title: `Verify ${passport.name} · KULT World`, eyebrow: 'PUBLIC PROVENANCE', headline: `${passport.name}'s history can be checked.`, detail: 'Every visible status has a precise meaning. Recorded evidence stays distinct from self-attested anchors and authorized issuer receipts.', stats: [{ value: passport.verification.recorded, label: 'recorded' }, { value: passport.verification.anchored, label: 'anchored' }, { value: passport.verification.issuerVerified, label: 'issuer verified' }], cta: `/passport/${encodeURIComponent(passport.id)}`, ctaLabel: 'View Passport', secondaryCta: '/season/01', secondaryLabel: 'Inspect season rules', canonicalPath: `/verify/${encodeURIComponent(passport.id)}`, ogImage: ogPath('passport', passport.id), extra: proofMarkup(passport) }));
  }
  if (url.pathname === '/season/01') {
    const town = townSquare(); const season = town.season;
    const extra = `<section class="season-manifest"><div><small>IMMUTABLE RULES HASH</small><code>${escapeHtml(season.manifestHash)}</code></div><div class="season-rules">${season.rules.map(rule => `<p>✓ ${escapeHtml(rule)}</p>`).join('')}</div>${season.commitment.explorerUrl ? `<a href="${escapeHtml(season.commitment.explorerUrl)}" target="_blank" rel="noreferrer">Inspect commitment transaction ↗</a>` : '<em>Commit this manifest before public launch.</em>'}</section>`;
    return sendHtml(res, 200, publicPage({ title: 'Season 01 · KULT World', eyebrow: `SEASON 01 · ${season.phase.replaceAll('_', ' ')}`, headline: season.title, detail: season.promise, stats: [{ value: town.world.contributors, label: 'contributors' }, { value: town.world.creatorCount, label: 'public creators' }, { value: season.commitment.status, label: 'rules commitment' }], cta: '/', ctaLabel: 'Enter KULT World', canonicalPath: '/season/01', ogImage: ogPath('season'), extra }));
  }
  return false;
}
function serveStatic(req, res, url) {
  let rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''); rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, ''); let file = path.join(STATIC, rel);
  if (!file.startsWith(STATIC)) return apiError(res, 403, 'Forbidden.', 'forbidden'); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(STATIC, 'index.html');
  const body = fs.readFileSync(file); const immutable = /\.[a-f0-9]{8,}\./.test(path.basename(file)); const cache = file.endsWith('.html') ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  res.writeHead(200, { 'Content-Type': mime(file), 'Content-Length': body.length, 'Cache-Control': PRODUCTION ? cache : 'no-cache', ...securityHeaders() }); res.end(body);
}
const server = http.createServer(async (req, res) => {
  try { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); if (url.pathname.startsWith('/api/')) return await api(req, res, url); if (['GET', 'HEAD'].includes(req.method || 'GET') && /^\/og\//.test(url.pathname)) { const sent = serveOgRoute(res, url); if (sent !== false) return sent; } if (['GET', 'HEAD'].includes(req.method || 'GET') && (/^\/s\//.test(url.pathname) || /^\/c\//.test(url.pathname) || /^\/passport\//.test(url.pathname) || /^\/verify\//.test(url.pathname) || url.pathname === '/season/01')) return servePublicRoute(res, url); return serveStatic(req, res, url); }
  catch (error) { console.error(error); if (!res.headersSent) apiError(res, 500, 'Internal server error.', 'internal_error'); else res.end(); }
});
if (require.main === module) server.listen(PORT, () => console.log(`KULT World ${VERSION} on http://localhost:${PORT}`));
module.exports = { server, store, ownerIdForToken, newSessionToken, publicPassport, publicProof, townSquare };
