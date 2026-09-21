# KULT World — Three.js connected beta

**Version 5.0.0-beta.1** adds a genuine Three.js frontend to the working World backend. The 3D island is generated geometry: six raycastable districts, orbit/zoom camera, a moving companion, and appearance changes driven by the Agent’s actual World evolution tier.

## Try the 3D experience immediately

Open `KULT_World_3D_Preview.html` in a browser with WebGL 2. It is self-contained and works without npm or a backend. On phones, download the file and open it in a browser; attachment viewers may not execute JavaScript. It contains no real account or saved progress. Persona and tier selectors only preview appearance.

Drag to orbit; scroll or pinch to zoom. Select a building or district button, then choose **Walk here**. Try Find Agent, daylight/dusk, low-power mode and the four evolution appearances.

## Test the full connected app

Requires Node.js 20+ (Node 22 container baseline). Built frontend bundles are included, so no npm install is needed just to run:

```bash
npm start
```

Open **http://localhost:8060**. Adopt an Agent and save its recovery key. Choose a district in the 3D World, open its mission, make a choice, then inspect the receipt in Journal or Passport. Server-side permissions still gate actions. The 2D map is available at any time and is the automatic fallback if WebGL cannot initialize.

**http://localhost:8060/preview.html** serves the appearance preview without onboarding. Unlike the downloaded self-contained file, this route loads its script from the same server so it respects the application CSP.

## Rebuild and test

```bash
npm ci
npm run build:3d
npm run check
npm test
npm run test:dom
```

`npm run build:3d` rebuilds the browser bundle and both preview formats. Three.js is pinned to 0.186.0 and bundled locally; users do not need access to a CDN. The dependency lockfile and Three.js license are included. Node server code still has no runtime npm dependencies.

For a real-browser GPU test on your machine:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:3d-browser
```

That script starts an isolated temporary backend, tests preview/3D mission interactions and writes screenshots to `qa-output/threejs`. It fails if WebGL cannot render. It was **not executed successfully in the authoring environment**; see `QA_REPORT.md`.

## What is connected

- Six-persona adoption, opaque sessions and recovery.
- Existing mission engine, rest, home purchases, needs and bounded offline catchup.
- Three.js companion color, earned aura/orbit/crown, home decoration and World event progress.
- Journal, Passport, Census, public share cards and community.
- Server-enforced pause, capability domains, daily action budget and cosmetic purchase limit.
- Optional receipt encoding and RPC verification for configured chain contracts.

The scene is a presentation layer. Selecting a district or moving the camera never grants credits, changes evidence, or runs a mission. The connected build has no appearance-tier selector; progression is read from the server. Only the standalone preview exposes tier overrides, clearly labeled as previews.

## What remains a beta

Mission outcomes and ambient life use the existing deterministic simulation engine. This is not evidence of real LLM competence. Canonical Arena identity/SSO, inference services and external signed evidence ingestion remain integration work. Contract source is included; no live contract was deployed for this update. Broad production scale requires a transactional database and launch validation.

Run one server process with a persistent disk. Data defaults to `data/kult-world.json`. The included `compose.local.yml` provides local Docker settings; `docker-compose.yml` and `render.yaml` retain production configuration gates. Do not run multiple replicas against the JSON store.

## Handoff files

- `THREEJS_HANDOFF.md`: 3D architecture, integration events, controls and acceptance steps.
- `QA_REPORT.md`: checks actually run and remaining visual validation.
- `V4_HANDOFF.md`: retained backend integration and production boundaries.
- `DEPLOYMENT.md`, `contracts/`, `sdk/`: existing chain/deployment reference material.

This README and QA_REPORT describe v5. Older release notes are historical references, not v5 production sign-off. World Credits remain internal and non-withdrawable. There is no token, yield, trading or withdrawal authority.
