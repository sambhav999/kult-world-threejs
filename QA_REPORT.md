# KULT World Three.js v5 beta — validation

## Passed in this update

- `npm run build:3d`: connected bundle and standalone/served previews generated successfully.
- `npm run check`: JavaScript syntax validation for backend, frontend, SDK and Three.js sources.
- `npm test`: **30 passed, 0 failed**. Includes the 27 backend/game/security regression tests plus three Three.js model tests.
- Three.js tests use the actual installed library to raycast every district, validate geometry values and a triangle budget, verify all earned tiers leave evidence/credits unchanged, and test movement/reduced-motion destinations.
- `npm run test:dom`: **19 checks passed, 0 script errors**, with a live isolated local API and an explicit unavailable-WebGL stub. Checks the four fallback assertions and the 15 connected UI workflows retained from v4. Teardown waits for background reads to settle.

- HTTP smoke check: app, 3D bundle, 3D stylesheet, served preview and preview bundle all return 200 with expected content types. Served preview uses an external script compatible with the current CSP.

## Not verified here

- Real GPU rendering, shaders, touch gestures, responsive visual appearance and measured device FPS. The available browser security policy blocks local-file navigation. No alternate browser surface or security bypass was used. No screenshot of the running 3D scene is claimed.
- `npm run test:3d-browser` is provided for the team but has not passed here. It requires Playwright/Chromium and actual WebGL. The preview file also enables immediate manual testing without Node.
- Live Arena identity/inference integration, real chain deployment/signing, Foundry checks, independent contract review, production hosting, Docker runtime and load/abuse tests remain outside this executed validation.

The connected app remains a simulation beta. A successful geometry test confirms the model and picking data, not the final rendered appearance. The local preview’s tier selector is cosmetic and never writes capability evidence.
