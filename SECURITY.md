# Security policy

## Supported release

`3.1.0` is a Robinhood Chain **testnet** launch release for a controlled cohort. It is not approved for custody, deposits, withdrawable balances, financial promises or mainnet value.

## Report privately

Do not post exploitable details in a public issue. Send a minimal reproduction to the KULT Games security contact configured for the launch team. Include the affected route/contract function, impact, prerequisites and a proof that avoids accessing another person's data.

## Launch assumptions

- One Node process and one persistent disk.
- TLS terminates at a trusted reverse proxy with `TRUST_PROXY=true` only in that environment.
- `PUBLIC_ORIGIN` is the exact HTTPS origin.
- `ROBINHOOD_RPC_URL` is a trusted managed endpoint and is kept server-side.
- The registry address is reviewed against the deployed bytecode before launch.
- The Season manifest hash is committed on-chain and `KULT_SEASON_COMMIT_TX` points to that successful transaction.
- Recovery keys are bearer credentials and must be stored privately.

## Known boundary

The atomic JSON adapter is designed for a controlled cohort, not horizontal scaling. It has no multi-process lock or cross-region consistency. Scale requires a transactional database, account authentication, centralized rate limiting, structured audit logs and tested backup restoration.

The registry has local tests but this candidate does not claim an independent audit. Do not present a self-attested receipt as third-party verification; inspect `verifiedIssuer` and `issuer`.

## Pre-launch security checks

1. Run `npm test`, `npm run test:coverage`, `npm run check`, and `forge test -vvv`.
2. Confirm production fails to boot when secrets/address/origin are absent.
3. Confirm recovery rotates the session and the old cookie sees no Agent.
4. Submit a successful transaction with wrong calldata and confirm `wrong_evidence`.
5. Submit a correct receipt from the wrong wallet and confirm `wrong_sender`.
6. Review CSP, proxy configuration and persistent disk permissions in the deployed environment.
7. Back up and restore a staging data file before inviting the cohort.
8. Recompute the local Season manifest and compare it with the registry commitment.
