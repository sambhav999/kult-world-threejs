# Three.js frontend handoff

## Architecture

`client/world-model.mjs` builds the island, six districts, landscaping, companion and cosmetic state with Three.js primitives. It has no browser or API dependency, which allows geometry, raycast and evolution tests to run in Node. The geometry uses a deterministic layout and needs no remote models or textures.

`client/world-renderer.mjs` owns WebGLRenderer, PerspectiveCamera, OrbitControls, picking, projected labels, animation and lifecycle. It pauses rendering when the World view is inactive, offscreen or the tab is hidden; caps pixel ratio at 1.5 and animation near 30 FPS. Low-power mode uses pixel ratio 1. Shared materials and geometry are disposed on teardown. Context loss returns to the 2D experience. Reduced motion disables ornamental motion and makes Agent moves immediate; camera controls remain available.

`client/world-app.mjs` connects the renderer to the existing app through `window.KultWorldBridge`. The bridge exposes a read-only-by-convention snapshot and guarded district opening; it is not an authorization layer. The backend remains authoritative and does not trust client state. The scene listens to `kult:ready`, `kult:render`, `kult:view`, `kult:location`, `kult:find` and `kult:policy` events. `static/experience.js` emits a minimal pause flag when it renders the policy.

`client/preview-entry.mjs` is an isolated presentation demo. It has no backend calls, saved state, fabricated community, or on-chain transactions. Preview tier selection is intentionally absent from the connected application.

`npm run build:3d` uses the pinned esbuild version and produces `static/world3d.js`, `static/preview3d.js`, `static/preview.html`, and the self-contained root preview file. Serve the external-script preview through HTTP; use the self-contained file for direct downloads. Production CSP is unchanged.

## User interaction

- Click a district building, its projected label or a district dock button to select it. Open the corresponding mission/home from the detail panel. Canvas drag does not trigger a click; multi-touch gestures suppress picking.
- Drag rotates; pinch/scroll zooms. Explicit orbit, zoom, reset and find buttons make camera changes available without gestures.
- The dock stays available on mobile and for keyboard users. Projected labels are hidden on small screens or when they collide. Color is paired with district names.
- Camera and district selection are local UI state. Agent movement mirrors World activity events and mission destination; it is not a new persisted navigation ledger.
- The actual server evolution tier controls the aura, orbit, crown and home signals. Earned evidence remains unchanged by every scene method.
- Daylight, motion and quality controls are session UI preferences. They do not affect energy, rewards or outcomes.

## Check on the team’s browsers

1. Open the standalone file; confirm a rendered island, readable labels and no console errors. The bottom help and status must remain visible at 390px, 768px and desktop widths.
2. Orbit, zoom, reset and follow the companion; test touch pinch without accidental district selection. Click actual building geometry and dock buttons.
3. Preview all six personas and four tiers. Only the appearance should change. Confirm the preview does not claim saved progress.
4. Start the connected app; adopt and save recovery. Select Commons → mission → choose → return. Verify Journal gained the actual server receipt and Agent position moved.
5. Pause in Permissions; returning to 3D must show the paused status and mission execution must be rejected by the backend. Resume and retest.
6. Switch repeatedly between 2D/3D and other app views. Check that rendering pauses outside World and camera controls still work when returning.
7. Verify mobile portrait/landscape, reduced-motion mode and context loss. If WebGL fails, 2D mission and Passport flows must remain usable.
8. Run `npm run test:3d-browser` on a browser with WebGL support, inspect its screenshots and record real device performance before release.

## Technical references

Implementation uses the official Three.js [OrbitControls documentation](https://threejs.org/docs/pages/OrbitControls.html) and [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html). Three.js 0.186.0 is bundled under its MIT license, included in `licenses/three-LICENSE.txt`. The renderer requires WebGL 2; it does not weaken browser settings to obtain access.

GPU/browser visual validation is outstanding because the available browser blocks local-file navigation and cannot access the local backend. Automated scene-graph and DOM/API tests are not substitutes for pixel-level/browser verification.
