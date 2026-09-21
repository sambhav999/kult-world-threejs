# Production deployment runbook

## Supported launch

This build supports a controlled Robinhood Chain Testnet launch on one application instance with one persistent volume. Render is preconfigured; any Docker host works with the same environment variables.

## 1. Verify locally

```bash
npm run check
npm test
npm run test:coverage
forge test -vvv
```

Foundry is required for the Solidity suite. Do not treat the registry as audited merely because local tests pass.

## 2. Deploy and verify the registry

```bash
export ROBINHOOD_RPC_URL=https://your-managed-robinhood-rpc
export DEPLOYER_PRIVATE_KEY=0x...

forge create contracts/KultWorldExperienceRegistry.sol:KultWorldExperienceRegistry \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

Verify the source and record the deployed address as `KULT_REGISTRY_ADDRESS`.

## 3. Commit the Season 01 rules

Get the exact hashes from a local build:

```bash
node -e "const s=require('./season'); console.log('seasonId',s.seasonIdHash); console.log('manifest',s.manifestHash)"
```

Commit them once:

```bash
cast send "$KULT_REGISTRY_ADDRESS" \
  "commitSeasonManifest(bytes32,bytes32)" \
  "<seasonIdHash>" "<manifestHash>" \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

Save the successful transaction hash as `KULT_SEASON_COMMIT_TX`. The contract refuses a second commitment for the same Season ID.

## 4. Configure production

Required variables:

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_ORIGIN` | Exact HTTPS origin, no trailing slash |
| `KULT_DATA_FILE` | Path on a persistent disk |
| `ROBINHOOD_RPC_URL` | Private managed server RPC |
| `ROBINHOOD_BROWSER_RPC_URL` | Browser-safe testnet RPC |
| `KULT_REGISTRY_ADDRESS` | Reviewed deployed registry |
| `KULT_SEASON_COMMIT_TX` | Successful Season manifest commitment transaction |
| `KULT_ADMIN_TOKEN` | Random secret, at least 32 characters |
| `TRUST_PROXY` | `true` only behind the trusted deployment proxy |
| `KULT_MIN_CONFIRMATIONS` | Start at `1`; increase if the chain/RPC warrants it |

The application refuses to boot in production if the origin, RPC, registry, Season commitment or admin secret is missing.

## 5. Deploy on Render

1. Create a Blueprint from this repository and `render.yaml`.
2. Fill the four `sync: false` values: origin, server RPC, registry and Season transaction.
3. Confirm the persistent disk is mounted at `/var/data`.
4. Deploy exactly one instance.
5. Confirm `/api/health` returns `ok: true`, version `3.1.0` and the expected manifest hash.

## Docker alternative

```bash
docker build -t kult-world:3.1.0 .
docker run --rm -p 8060:8060 \
  --env-file .env.production \
  -v kult-world-data:/var/data \
  kult-world:3.1.0
```

## 6. Mandatory staging acceptance

- Adopt an Agent without a wallet.
- Save and recover with a key; ensure the old browser loses access.
- Produce both a win and a miss; verify both remain visible.
- Reach a seeded Capable/Skilled tier and confirm form, home, Passport and OG card agree.
- Publish a Passport and inspect it in a logged-out browser.
- Open `/verify/:agentId`; inspect the manifest hash and trust labels.
- Anchor a receipt and verify chain, target, sender, calldata, status and confirmations.
- Inspect the transaction through the public explorer link.
- Open `/season/01` and verify the commitment transaction.
- Validate `/s/:slug`, `/c/:id`, `/passport/:agentId` and their dynamic PNG cards.
- Run a backup/restore rehearsal for the persistent data file.
- Test Chrome, Firefox and Safari desktop plus 390×844 and 412×915 mobile viewports.

## Stop conditions

Do not invite users if authentication isolation, receipt verification, data restoration, public privacy or Season commitment checks fail. Do not scale this JSON adapter to multiple application replicas.

