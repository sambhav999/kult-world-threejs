'use strict';
const crypto = require('node:crypto');
const DOMAINS = ['analysis', 'creativity', 'strategy', 'social'];
function ensure(agent) {
  if (!agent.worldPolicy) agent.worldPolicy = { version: 1, paused: false, allowedDomains: [...DOMAINS], maxDailyActions: 60, maxPurchaseCredits: 320, updatedAt: Date.now() };
  return agent.worldPolicy;
}
function view(agent) {
  const p = ensure(agent);
  const document = { schema: 'kult.world.policy.v1', agentId: agent.id, version: p.version, paused: p.paused, allowedDomains: p.allowedDomains, maxDailyActions: p.maxDailyActions, maxPurchaseCredits: p.maxPurchaseCredits, humanApproval: ['mission-choice','cosmetic-purchase','public-passport','wallet-transaction'], financialAuthority: false, updatedAt: p.updatedAt };
  return { ...document, policyHash: '0x' + crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex'), actionsToday: usage(agent).count, enforcement: 'kult-world-server', onchain: false };
}
function usage(agent, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0,10);
  if (agent.worldUsage?.day !== day) agent.worldUsage = { day, count: 0 };
  return agent.worldUsage;
}
function remaining(agent, now = Date.now()) { return Math.max(0, ensure(agent).maxDailyActions - usage(agent, now).count); }
function update(agent, input, now = Date.now()) {
  const previous = ensure(agent), next = { ...previous };
  const allowedKeys = ['paused','allowedDomains','maxDailyActions','maxPurchaseCredits'];
  if (!input || Object.keys(input).some(key => !allowedKeys.includes(key))) throw new Error('Unknown policy field.');
  if ('paused' in input) { if (typeof input.paused !== 'boolean') throw new Error('Paused must be true or false.'); next.paused = input.paused; }
  if ('allowedDomains' in input) {
    if (!Array.isArray(input.allowedDomains) || !input.allowedDomains.length || input.allowedDomains.some(d => !DOMAINS.includes(d))) throw new Error('Select at least one valid capability domain.');
    next.allowedDomains = DOMAINS.filter(d => input.allowedDomains.includes(d));
  }
  for (const [key,min,max] of [['maxDailyActions',1,100],['maxPurchaseCredits',0,1000]]) if (key in input) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`${key} must be an integer from ${min} to ${max}.`);
    next[key] = input[key];
  }
  next.version++; next.updatedAt = now; agent.worldPolicy = next;
  // Paused and restricted periods never accrue deferred activity.
  agent.lastAutonomousAt = now;
  return view(agent);
}
function check(agent, { domain, count = 1, spend } = {}) {
  const p = ensure(agent);
  if (p.paused) return 'World activity is paused. Resume it from Permissions.';
  if (domain && !p.allowedDomains.includes(domain)) return 'This capability is disabled in your World permissions.';
  if (spend !== undefined && spend > p.maxPurchaseCredits) return 'This purchase exceeds your World Credit limit.';
  if (count > remaining(agent)) return 'Your daily World action limit has been reached.';
  return null;
}
function consume(agent, count = 1) { usage(agent).count += count; }
module.exports = { ensure, view, update, remaining, check, consume, DOMAINS };
