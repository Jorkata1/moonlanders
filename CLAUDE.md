# Starhop

A 3D browser game for CrazyGames: an astronaut mines resources, builds machines and robots, and loads a rocket to hop to the next planet (in the style of Moon Pioneer). Planet 1 (the Moon) is complete; Mars and an ice moon are planned.

The owner (Жоро) usually writes in Bulgarian, so reply in Bulgarian. In-game text stays in English, because most CrazyGames players read English.

## Commands

- `npm install`: install dependencies (three 0.160, esbuild, TypeScript).
- `npm run dev`: rebuild on every save and serve at http://localhost:5173. Reload the browser after changes.
- `npm run typecheck`: strict TypeScript check.
- `npm test`: headless tests. A bot plays the whole Moon to lift-off and must finish; save/load and backpack/drop/robot-upgrade checks run too. It prints a timeline that shows how long each stage takes.
- `npm run build`: production build to `dist/crazygames/index.html` (upload build with the CrazyGames SDK) and `dist/starhop.html` (body-only preview).
- `npm run package`: build and zip `dist/starhop-crazygames.zip` for the CrazyGames developer portal.
- `npm run check`: typecheck, then tests, then build. Run this before calling a change done.

## Architecture

The simulation is pure TypeScript with no Three.js and no DOM. Rendering, UI and audio only read state and react to events.

```
src/
  config.ts           every tunable number: items, prices, speeds, upgrade costs, robot upgrades, meteors
  planets/types.ts    PlanetDef: layout, deposits, machines, unlock pads, objectives
  planets/moon.ts     the Moon's layout, costs, rocket parts and mission list
  sim/                pure game logic, unit-testable in Node
    state.ts          GameState and createState()
    step.ts           step(state, input, dt) → SimEvent[]; runs every system in order
    economy.ts        mining, selling, machine input/output, pay pads, workshop upgrades
    inventory.ts      backpack counts, dropping items into piles, picking piles back up, robot upgrades
    robots.ts         robot AI: find deposit → mine → carry to the machine → unload
    hazards.ts        oxygen and meteors
    movement.ts       player movement and collisions (circles, ridge walls, map bounds)
    save.ts           toSave/fromSave; fromSave validates untrusted JSON
    events.ts         SimEvent union, the only channel from sim to view/audio
  view/               Three.js rendering
    world.ts          builds the scene and syncs it from state every frame
    terrain.ts        heightAt(), the levelled ground under buildings, ridge, rocks, stars
    machines.ts       smelter and purifier models with update() animations
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
  main.ts             boot, menus, settings (mute, intro seen, tutorial done, tips seen)
test/
  bot.ts              autopilot that follows the mission list like a player
  autoplay.ts         plays the Moon to the end and prints the timeline
  inventory.ts        drop, re-pickup and robot upgrade checks
  harness.ts          renders the real scene after N bot-seconds, for visual review in a headless browser
  *-entry.ts          test builds that spawn the player somewhere specific (via test/build-entry.mjs)
```

## How to change things

- **Balance (prices, speeds, costs):** edit `src/config.ts` and the costs and rocket parts in `src/planets/moon.ts`. Then run `npm test`. The Moon should take the bot roughly 1,300–1,500 s, which comes out at about 25–30 minutes for a person.
- **New item:** add it to `ITEM_IDS` and `ITEMS` in `config.ts`, give it a look in `view/items.ts`, and add it to `INGREDIENT`-style swatches in the CSS if needed.
- **New machine:** add a `MachineDef` and a `machine` unlock to the planet, then a model with `update()` in `view/machines.ts`, and pick it in `world.ts`.
- **New planet:** create `planets/mars.ts` with a `PlanetDef`. `main.ts` currently loads `MOON` only; travelling between planets (keeping upgrades, switching the PlanetDef) is the next feature to build.
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
