'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}
function close(server) { return new Promise(resolve => server.close(resolve)); }
function cookieFrom(response) { return String(response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(base, route, { method = 'GET', body, cookie, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, data, cookie: cookieFrom(response) || cookie };
}

test('launch API isolates sessions, rotates recovery, and verifies Robinhood receipts', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kult-world-api-'));
  const registry = `0x${'a'.repeat(40)}`;
  const walletAddress = `0x${'1'.repeat(40)}`;
  const txHash = `0x${'2'.repeat(64)}`;
  let transactionInput = `0x${'0'.repeat(258)}`;

  const rpcServer = http.createServer((req, res) => {
    let source = '';
    req.on('data', chunk => { source += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(source);
      const results = {
        eth_chainId: '0xb626',
        eth_getTransactionByHash: { hash: txHash, from: walletAddress, to: registry, input: transactionInput },
        eth_getTransactionReceipt: { transactionHash: txHash, status: '0x1', blockNumber: '0x10' },
        eth_blockNumber: '0x12',
      };
      const body = JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: results[payload.method] });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    });
  });
  await listen(rpcServer);

  process.env.KULT_DATA_FILE = path.join(tempDir, 'world.json');
  process.env.KULT_SECURE_COOKIE = 'false';
  process.env.KULT_REGISTRY_ADDRESS = registry;
  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${rpcServer.address().port}`;
  const { server, store, ownerIdForToken } = require('../server');
  await listen(server);
  t.after(async () => { await close(server); await close(rpcServer); fs.rmSync(tempDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await request(base, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.data.ok, true);
  assert.match(health.data.seasonManifestHash, /^0x[a-f0-9]{64}$/);
  assert.equal(store.listOwners().length, 0, 'health checks must not allocate owners');

  const season = await request(base, '/api/season');
  assert.equal(season.response.status, 200);
  assert.equal(season.data.season.title, 'The World Is Waking');
  const town = await request(base, '/api/town-square');
  assert.equal(town.response.status, 200);
  assert.ok(Array.isArray(town.data.latestMoments));
  const seasonPage = await request(base, '/season/01');
  assert.equal(seasonPage.response.status, 200);
  assert.match(seasonPage.data, /IMMUTABLE RULES HASH/);
  const seasonOg = await fetch(`${base}/og/season.png`);
  assert.equal(seasonOg.status, 200);
  assert.equal(seasonOg.headers.get('content-type'), 'image/png');
  assert.ok((await seasonOg.arrayBuffer()).byteLength > 10_000);

  let session = await request(base, '/api/state');
  assert.equal(session.data.adopted, false);
  assert.match(session.cookie, /^kw_session=/);
  assert.equal(store.listOwners().length, 0, 'anonymous state reads stay ephemeral');
  const rawToken = session.cookie.slice('kw_session='.length);

  session = await request(base, '/api/adopt', { method: 'POST', cookie: session.cookie, body: { persona: 'NORI', name: 'Nori', mandate: 'explore' } });
  assert.equal(session.response.status, 200);
  assert.equal(session.data.agent.name, 'Nori');
  const recoveryCode = session.data.recoveryCode;
  const oldCookie = session.cookie;
  const storedOwnerId = store.listOwners()[0][0];
  assert.equal(storedOwnerId, ownerIdForToken(rawToken));
  assert.ok(!JSON.stringify(store.getWorld()).includes(rawToken), 'session bearer must never leak into shared world state');

  const evilOrigin = await request(base, '/api/focus', { method: 'POST', cookie: oldCookie, origin: 'https://evil.example', body: { cap: 'analysis' } });
  assert.equal(evilOrigin.response.status, 403);

  const mission = await request(base, '/api/mission', { method: 'POST', cookie: oldCookie, body: { mission: 'game_qa', choice: 'loop' } });
  assert.equal(mission.response.status, 200);
  assert.match(mission.data.proof.evidenceHash, /^0x[a-f0-9]{64}$/);
  const proofId = mission.data.proof.id;

  const wallet = await request(base, '/api/wallet', { method: 'POST', cookie: oldCookie, body: { address: walletAddress } });
  assert.equal(wallet.data.agentState.walletVerified, false, 'claiming a wallet is not verification');
  const calldata = await request(base, '/api/proof/calldata', { method: 'POST', cookie: oldCookie, body: { proofId } });
  assert.equal(calldata.response.status, 200);
  assert.equal(calldata.data.to, registry);
  assert.equal((calldata.data.data.length - 2) / 2, 129);

  const rejected = await request(base, '/api/proof/anchored', { method: 'POST', cookie: oldCookie, body: { proofId, txHash } });
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.data.code, 'wrong_evidence', 'an arbitrary successful transaction cannot claim a receipt');

  transactionInput = calldata.data.data;
  const anchored = await request(base, '/api/proof/anchored', { method: 'POST', cookie: oldCookie, body: { proofId, txHash } });
  assert.equal(anchored.response.status, 200);
  assert.equal(anchored.data.agentState.walletVerified, true);
  assert.equal(anchored.data.agentState.proofs[0].confirmations, 3);

  const publish = await request(base, '/api/passport/publish', { method: 'POST', cookie: oldCookie, body: { public: true } });
  assert.equal(publish.data.public, true);
  const publicPassport = await request(base, `/api/passport/${encodeURIComponent(session.data.agent.id)}`);
  assert.equal(publicPassport.response.status, 200);
  assert.equal(publicPassport.data.passport.anchoredProofs.length, 1);
  assert.equal(publicPassport.data.passport.verification.anchored, 1);
  assert.equal(publicPassport.data.passport.evolution.id, 'emerging');
  assert.equal(publicPassport.data.passport.walletAddress, undefined, 'public Passport is explicitly whitelisted');
  const passportPage = await request(base, `/passport/${encodeURIComponent(session.data.agent.id)}`);
  assert.equal(passportPage.response.status, 200);
  assert.match(passportPage.data, /Nori&#39;s Agent Passport/);
  assert.match(passportPage.data, /\/og\/passport\//);
  const verificationApi = await request(base, `/api/verify/${encodeURIComponent(session.data.agent.id)}`);
  assert.equal(verificationApi.response.status, 200);
  assert.equal(verificationApi.data.verification.proofs[0].status, 'ANCHORED');
  const verificationPage = await request(base, `/verify/${encodeURIComponent(session.data.agent.id)}`);
  assert.equal(verificationPage.response.status, 200);
  assert.match(verificationPage.data, /PUBLIC PROVENANCE/);

  const ownerCount = store.listOwners().length;
  const recovered = await request(base, '/api/recover', { method: 'POST', body: { code: recoveryCode } });
  assert.equal(recovered.response.status, 200);
  assert.match(recovered.cookie, /^kw_session=/);
  assert.notEqual(recovered.cookie, oldCookie, 'recovery must rotate the bearer session');
  assert.equal(store.listOwners().length, ownerCount);

  const oldState = await request(base, '/api/state', { cookie: oldCookie });
  assert.equal(oldState.data.adopted, false, 'old session is revoked after recovery');
  const recoveredState = await request(base, '/api/state', { cookie: recovered.cookie });
  assert.equal(recoveredState.data.agent.id, session.data.agent.id);

  const publicState = await request(base, '/api/state');
  assert.deepEqual(Object.keys(publicState.data.world).sort(), ['activeChallenges', 'contributors', 'creatorCount', 'observatory', 'updatedAt'].sort());
});
