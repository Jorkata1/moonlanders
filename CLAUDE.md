# Starhop

A 3D browser game for CrazyGames: an astronaut mines resources, builds machines and robots, and loads a rocket to hop to the next planet (in the style of Moon Pioneer). The Moon and Mars are playable; an ice moon is planned. Travelling keeps suit upgrades and credits; everything else starts fresh on each planet.

The owner (Жоро) usually writes in Bulgarian, so reply in Bulgarian. In-game text stays in English, because most CrazyGames players read English.

## Commands

- `npm install`: install dependencies (three 0.160, esbuild, TypeScript).
- `npm run dev`: rebuild on every save and serve at http://localhost:5173. Reload the browser after changes.
- `npm run typecheck`: strict TypeScript check.
- `npm test`: headless tests. A bot plays every planet in order (Moon, then Mars) to lift-off and must finish each; save/load (including saves from 1.1), backpack/drop and robot-upgrade checks run too. It prints a timeline per planet that shows how long each stage takes.
- `npm run build`: production build to `dist/crazygames/index.html` (upload build with the CrazyGames SDK) and `dist/starhop.html` (body-only preview).
- `npm run package`: build and zip `dist/starhop-crazygames.zip` for the CrazyGames developer portal.
- `npm run check`: typecheck, then tests, then build. Run this before calling a change done.

## Architecture

The simulation is pure TypeScript with no Three.js and no DOM. Rendering, UI and audio only read state and react to events.

```
src/
  config.ts           every tunable number: items, prices, speeds, upgrade costs, robot upgrades, meteors, storms
  planets/types.ts    PlanetDef: layout, deposits, machines, unlock pads, objectives, hazards, scenery, route card
  planets/index.ts    PLANETS in travel order, UPCOMING route cards, nextPlanet()
  planets/moon.ts     the Moon's layout, costs, rocket parts and mission list
  planets/mars.ts     Mars: copper, dry ice, wire mill, fuel synthesizer, two-input engine works
  sim/                pure game logic, unit-testable in Node
    state.ts          GameState and createState()
    step.ts           step(state, input, dt) → SimEvent[]; runs every system in order
    economy.ts        mining, selling, machine input/output, pay pads, workshop upgrades
    inventory.ts      backpack counts, dropping items into piles, picking piles back up, robot upgrades
    robots.ts         robot AI: find deposit → mine → carry to the machine → unload
    hazards.ts        oxygen, meteors and dust storms (calm → warning → raging)
    travel.ts         startNextPlanet(): new planet state carrying credits and upgrades
    movement.ts       player movement and collisions (circles, ridge walls, map bounds)
    save.ts           toSave/fromSave/restoreGame; validates untrusted JSON, picks the planet from planetId
    events.ts         SimEvent union, the only channel from sim to view/audio
  view/               Three.js rendering
    world.ts          builds the scene and syncs it from state every frame
    terrain.ts        heightAt(), the levelled ground under buildings, ridge, rocks, stars
    machines.ts       shared machine parts plus the Moon's smelter and purifier models
    marsMachines.ts   wire mill, fuel synthesizer and engine works models
    machineViews.ts   machine models, input/output pads and trays, picked by MachineDef.model
    storm.ts          dust-storm fog and blowing grains
    merchant.ts       Zix the alien trader and his stall
    characters.ts     astronaut, robot rover, hand-held laser drill
    actors.ts         per-frame player/robot animation, drill beams
    fx.ts             flying items, sparks, rock chips, dust, meteors, floating text
    bake.ts           merges static meshes per material to cut draw calls
    render.ts         renderer, ACES tone mapping, bloom, shadows, reflections
  game.ts             main loop: input → step → feedback → view sync → render; intro, tutorial, launch
  feedback.ts         maps SimEvents to effects, sounds and toasts
  hud.ts / page.html  DOM HUD: credits, backpack list with Drop, oxygen, missions, upgrade panels, coach card, intro overlay
  intro.ts            first-launch cinematic (pod landing)
  tutorial.ts         7-step first-play tutorial and one-off tips
  panels.ts           which upgrade panel to show, and buying from it
  platform.ts         CrazyGames SDK wrapper (no-ops without the SDK): gameplay start/stop, midgame and rewarded ads, save storage
  main.ts             boot, menus, settings, travelling to the next planet (disposes the old game, builds the new one)
  screens.ts          start-screen route row and end-screen text
test/
  bot.ts              autopilot that follows the mission list like a player
  autoplay.ts         plays the Moon to the end and prints the timeline
  inventory.ts        drop, re-pickup and robot upgrade checks
  harness.ts          renders the real scene after N bot-seconds, for visual review in a headless browser
  *-entry.ts          test builds that spawn the player somewhere specific (via test/build-entry.mjs)
```

## How to change things

- **Balance (prices, speeds, costs):** edit `src/config.ts` and the costs and rocket parts in the planet files. Then run `npm test`. The Moon should take the bot roughly 1,300–1,500 s (about 25–30 minutes for a person) and Mars roughly 1,700–1,900 s (about 30–35 minutes).
- **New item:** add it to `ITEM_IDS` and `ITEMS` in `config.ts`, give it a look in `view/items.ts`, and add it to `INGREDIENT`-style swatches in the CSS if needed.
- **New machine:** add a `MachineDef` (with a `model` id, and `secondInput` if it takes two items) and a `machine` unlock to the planet, then a model with `update()` and register it in `MODELS` in `view/machineViews.ts`. Robots only feed a machine's first input.
- **New planet:** create `planets/<name>.ts` with a `PlanetDef` (layout, scenery, hazards, arrival captions, route card) and add it to `PLANETS` in `planets/index.ts`; remove its card from `UPCOMING`. Travel, saving and the start screen pick it up automatically. Mirror an existing layout so the bot's ridge-gap waypoint at x = 0 still works, then run `npm test` and tune costs until the new planet takes the bot about 1.2–1.3× as long as the previous one.
- **Missions:** the `objectives` array in the planet file drives the mission card and the green guide arrow.
- **Saves:** add new fields to `SaveData` in `sim/save.ts` and validate them in `fromSave`. Bump `SAVE_VERSION` when the meaning changes.

## Conventions

- TypeScript strict mode. No `any`. Keep files under about 300 lines and split when they grow.
- Name things precisely; use constants, not magic numbers. Use early returns.
- Never swallow errors: log them as structured JSON (`console.error(JSON.stringify({ scope, message }))`).
- Gameplay rules go in `sim/`, never in view code. The view only reads state and listens to events.
- Interactive HTML uses real `<button>` elements with focus-visible styles and aria labels, and respects `prefers-reduced-motion`.
- Performance: phones get the "low" tier from `quality.ts` (no bloom, one 1024 shadow map). Mark animated parts with `userData.dynamic = true` and call `bakeStatic()` on static groups.
- Every texture is drawn on a canvas at runtime, so the build is a single self-contained HTML file with no image or audio files.
- Sounds are synthesised in `audio.ts` with the Web Audio API.

## CrazyGames notes

- The SDK script is injected only into the upload build (`build.mjs`). Locally the SDK reports environment "local" and shows demo ads.
- `startGameplay()` and `stopGameplay()` must bracket real play; midgame ads only between sessions or levels; the rewarded ad powers Turbo.
- Upload `dist/crazygames/index.html` (or the zip) in the developer portal.
