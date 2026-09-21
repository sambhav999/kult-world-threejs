# Release notes — 3.1.0

## Season 01 finalization

- Added one canonical progression model shared by simulation, Passport, leaderboard, share cards and UI.
- Added four earned visual forms with capability-specific evidence requirements.
- Added an immutable on-chain Season manifest commitment and a public rules page.
- Added public `/verify/:agentId` provenance timelines with explicit Recorded, Anchored and Issuer Verified trust classes.
- Added a real-data Town Square for Season status, contributors, creators and open challenges.
- Added dependency-free dynamic 1200×630 PNG generation for Season, Passport, moment and challenge cards.
- Added fail-closed production validation for the Season commitment transaction.
- Added `PRODUCT_CONCEPT.md` and `DEPLOYMENT.md` as the product/build contract and release runbook.

## Launch assessment

The previous growth beta had a strong visual core but was not safe to share as a launch backend: shared records exposed bearer owner identifiers, transaction hashes were accepted without chain verification, growth counters could be replayed, public share/challenge pages were not real pages, and the registry scaffold lacked wallet-bound Agent identity and tests.

This candidate closes those blockers and turns the growth concepts into a coherent player experience.

## Security and backend

- Replaced public owner IDs with 256-bit opaque session tokens and server-side derived keys.
- Recovery now rotates/revokes sessions instead of reusing an exposed owner identifier.
- Added explicit public projections for world, Passport, creators, moments and challenges.
- Added production origin enforcement, bounded request bodies, IP/session rate limits, hardened cookies, HSTS and CSP.
- Replaced silent corrupt-store resets with fail-closed startup plus diagnostic backup.
- Made JSON persistence atomic with fsync + rename.
- Added protected aggregate launch metrics.
- Removed replayable counter increments in favor of Agent-ID sets.

## Robinhood Chain

- Added exact calldata generation for a structured 129-byte receipt.
- Server now verifies chain ID, receipt success, confirmations, registry target, wallet sender and byte-for-byte evidence.
- Removed the old self-transaction fallback from the product flow.
- Registry now uses wallet-bound Agent keys, scoped replay protection and two-step ownership with issuer rotation.
- Added a dependency-free SDK and Foundry test suite.

## Product and frontend

- Added a complete Community view with earned moment sharing, challenge creation/acceptance/resolution, creator discovery/follows and evidence leaderboards.
- Added public `/s/:slug`, `/c/:id` and `/passport/:agentId` pages with social metadata.
- Added publish/copy controls for public Passports and verified-vs-claimed wallet language.
- Added truthful empty states and removed manufactured world/creator counters.
- Added responsive Community layouts, favicon, install manifest and 1200×630 social artwork.
- Added a safe local demo seeder and a timed seven-minute Robinhood demo script.

## Verification in this package

- `npm run check`: passed.
- `npm test`: 22/22 passed.
- `npm run test:coverage`: 90.08% line coverage.
- Live HTTP smoke across app assets, health/config, leaderboard, creators, share page and challenge page: passed.
- Production missing-config failure and configured health boot: passed.
- Demo dataset generation: passed.

## Required before invitation links go out

- Run `forge test -vvv` in a Foundry environment; the current build environment did not include a Solidity compiler.
- Independently review and deploy the registry, then configure its real testnet address.
- Complete desktop/mobile human QA and one real end-to-end wallet anchor on staging.
- Configure HTTPS, managed server RPC, admin secret, persistent disk and backups.
