# KULT World v4 — developer handoff

## What we are building

Before an Agent manages value, people should be able to understand what it has done. KULT World makes that relationship engaging: the user shapes an Agent, sees it explore and evolve, and opens a Passport to understand the evidence behind its capabilities. World is an experience surface inside Arena; Passport is its public trust surface. Robinhood is an optional receipt rail.

The intended loop is adopt/import → mission → recorded outcome → visible evolution → return → share. There is no burn-to-level, APY, live trading, token issuance or withdrawal authority. World community progress unlocks cosmetics. This beta uses a server simulation to exercise that loop; it must not be marketed as verified LLM skill.

## What is actually wired

| UI | Backend |
|---|---|
| Adoption and returning session | `/api/adopt`, `/api/state`, `/api/recover`; HttpOnly session and recovery rotation |
| Missions, rest, offline activity | `/api/mission`, `/api/rest`, `/api/live`; engine outcomes persisted server-side |
| Home and direction | `/api/home/buy`, `/api/focus`, `/api/mandate` |
| Permissions | GET/POST `/api/permissions`; versioned SHA-256 policy hash and server enforcement |
| Journal | GET `/api/receipts`; retained mission receipts and owner-only memories |
| Census | GET/POST `/api/census`; stable per-Agent registration number |
| Public Passport | `/api/passport/publish`, `/api/passport/:id`, `/passport/:id` |
| Public verification | `/api/verify/:id`, `/verify/:id`; latest 30 public receipts |
| Chain receipts | `/api/proof/calldata`, `/api/proof/anchored`; RPC validation against configured registry |
| Town Square | Existing moments, challenges, creators and capability-specific leaderboard APIs |

All private writes use the session cookie. No browser-provided owner ID is trusted. All frontend API paths are same-origin. The server serves assets, public share HTML and 1200×630 PNG OG images. Deploy on a dedicated hostname at `/`; subpath deployment needs explicit URL rewrites. The current frame-denial policy prevents iframe embedding. Link or route into the World surface instead.

## Policy semantics

Allowed domains restrict mission and ambient activity. Pause blocks mission execution, live steps, purchases, rest and offline catchup. Owner controls remain available to resume, recover, change direction or unpublish. Human communication such as encouragement remains available; pause does not lock the account. The policy does not authorize external tools, funds or trades.

Action budget resets at UTC midnight. Each live step, offline step, mission, rest and successful cosmetic purchase consumes one action. Cosmetic limit is per purchase, in non-withdrawable World Credits. Offline catchup is evaluated when state is requested, not by a continuously running agent worker. Paused time is not queued for replay. Policy hashes identify the current policy; historical policies are not an append-only audit log in this version.

## Persistence and privacy

The JSON store uses atomic file writes. Census counter and owner registration share the same save operation. New Agents use UUID identifiers; old Agents retain their IDs. Newly recorded mission proofs are retained; historical receipts already pruned by v3.1 cannot be reconstructed. Public Passport returns at most 30 recent receipts; owner Journal returns retained history. Large histories require pagination/database migration before scale.

Unpublishing stops public Passport/verification access. Previously created share moments remain separate published objects, and third-party caches or on-chain transactions cannot be erased. Do not promise universal deletion. Recovery secrets, private memory and answers must never be included in public cards or logs.

## Arena integration still required

1. Replace standalone adoption/session ownership with the Arena authentication adapter. Validate issuer, audience, expiration and ownership on the server. Do not trust an Agent ID supplied by the client.
2. Add an explicit, unique mapping from canonical Arena Agent ID to World state. Import existing Agents without reminting or reassigning their identity. Session recovery must preserve this mapping.
3. Replace simulation mission evaluators with approved signed evidence adapters or actual Arena evaluation jobs. Preserve failed outcomes, difficulty, evidence hash, issuer and replay identity. External apps report facts, never arbitrary score deltas.
4. Integrate existing inference/memory services through a bounded worker. Check the policy before every tool action; implement cancellation and audit records. No arbitrary credentials or external financial tools are present here.
5. Move to transactional persistent storage and a distributed rate limiter before adding replicas. Add signed evidence deduplication, backups/restore drills and account-based recovery.
6. Deploy and independently review the registry; verify network configuration, commit the exact manifest, and run live RPC/wallet checks. Configuration presence alone does not prove a valid deployment or commitment.

Do not call local `arenaRank` an Arena service ranking. It is simulation state. This package does not implement an independent ERC-8004 identity indexer, external issuer adapter, universal Agent reputation, or production economic settlement.

## Deployment

For local QA use `npm start` or `compose.local.yml`. Node does not automatically load `.env.example`; export variables, use your process manager, or use `node --env-file=.env server.js` on a compatible Node release.

For the included production Docker Compose template, copy `.env.example` to `.env.production`, set NODE_ENV=production, configure an exact HTTPS PUBLIC_ORIGIN, a managed server RPC, deployed registry address, manifest commitment transaction and a 32+ character random admin secret. Terminate TLS at your trusted reverse proxy, enable TRUST_PROXY only there, and deny direct public access to the upstream port. Never place secret environment files in the container image.

Production currently requires chain configuration even though users may play without anchoring. Keep that gate unless deliberately implementing and validating a separate production mode without chain receipts. Container storage is forced to `/var/data/kult-world.json`; preserve the volume during upgrades. Back up before migration and restore to a fresh staging process before launch.

Contract deployment, mainnet rollout, hosted Arena integration, independent security review, load testing and browser/device visual sign-off are outstanding. See `QA_REPORT.md`. Do not label this archive production-certified.
