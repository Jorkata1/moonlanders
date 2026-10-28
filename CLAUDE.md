# Starhop

A 3D browser game for CrazyGames: an astronaut crash-lands on the Moon, mines materials, builds machines and robots from them, and repairs the rocket's jump drive (in the style of Moon Pioneer). There is no money: every build, suit upgrade and robot stage costs planet materials. Only the Moon is playable; Mars and an ice moon show as "Coming soon".

**Economy:** carbon and moon clay are mined from the start; iron ore falls from the sky into its field once the smelter is built (smelter: ore → metal plates 1:1); Helium X lies beyond the ridge, which the mining drill bores open, and only the player mines it (refinery: 2 Helium X → 1 helium cell). The workbench orders one build at a time: a see-through hologram appears where it will stand, and the player or the cargo drone carries materials to it. Robots only mine and fill stockpiles (up to 100) by their docks and can be switched off; the drone (after the smelter and the iron robot) is the only worker that carries: stockpiles and plates to the order, iron ore to the smelter. Each robot and the drone has 3 paid stages. The backpack holds 15, then 25 and 35. The suit station sells mining, backpack, oxygen and speed upgrades. The jump drive (carbon, plates, clay, helium cells) finishes the planet.

The owner (Жоро) usually writes in Bulgarian, so reply in Bulgarian. In-game text stays in English, because most CrazyGames players read English.

## Commands

- `npm install`: install dependencies (three 0.160, esbuild, TypeScript).
- `npm run dev`: rebuild on every save and serve at http://localhost:5173. Reload the browser after changes.
- `npm run typecheck`: strict TypeScript check of `src/` and `test/`.
- `npm test`: headless tests. A bot plays the Moon to lift-off and must finish it; save/load (old saves start fresh), backpack/drop, orders, stockpiles, robot on/off, cargo-drone, robot-stage, drill and ore-fall checks run too. It prints a timeline that shows how long each stage takes.
- `npm run build`: production build to `dist/crazygames/index.html` (upload build with the CrazyGames SDK) and `dist/starhop.html` (body-only preview).
- `npm run package`: build and zip `dist/starhop-crazygames.zip` for the CrazyGames developer portal.
- `npm run check`: typecheck, then tests, then build. Run this before calling a change done.

## Architecture

The simulation is pure TypeScript with no Three.js and no DOM. Rendering, UI and audio only read state and react to events.

```
src/
  config.ts           every tunable number: items, player, robots, drone, stockpiles, robot stages, suit upgrades, drill, ore falls, storms
  planets/types.ts    PlanetDef: layout, deposits, machines, builds (workbench orders), suit station, rocket, objectives, hazards, scenery
  planets/index.ts    PLANETS (the Moon) and UPCOMING route cards
  planets/moon.ts     the Moon's layout, build costs and requirements, machine levels, mission list, intro captions
  sim/                pure game logic, unit-testable in Node
    state.ts          GameState, createState() (starts with the workbench order), availability and lookup helpers
    step.ts           step(state, input, dt) → SimEvent[]; runs every system in order, advances missions, launches
    orders.ts         the single active order: costs, site, progress, what is still needed, starting builds/suit upgrades/robot stages, delivering
    economy.ts        player mining with the 2 s laser warm-up, machine processing and levels, hand-overs at pads and order sites
    orefall.ts        ore fields: small meteorites drop new rocks inside each field (only fields whose zone is open, never in the ridge, off the map or on a building spot); mined-out rocks crumble
    inventory.ts      backpack counts, dropping items into piles, picking up piles and robot stockpiles
    robots.ts         robot AI: mine → stack the load on the stockpile beside the dock; on/off switch
    drones.ts         cargo drone, the only worker that carries: feeds a nearly empty machine first, then brings the order what it needs, then tops machines up
    drill.ts          the mining drill boring through the ridge, then opening the way north
    hazards.ts        oxygen and dust storms (calm → warning → raging)
    travel.ts         startNextPlanet(): fresh planet state that keeps suit upgrades (for when more planets ship)
    movement.ts       player movement, collisions (circles, ridge walls, map bounds) and routeToward() through the ridge gap
    save.ts           toSave/fromSave/restoreGame; validates untrusted JSON; SAVE_VERSION 3 (older saves start fresh)
    events.ts         SimEvent union, the only channel from sim to view/audio
  view/               Three.js rendering
    world.ts          builds the scene and syncs it from state every frame
    terrain.ts        heightAt(), the levelled ground under buildings, the boulder ridge with talus, edge boulders, stars, Earth
    rocks.ts          fractured, weathered rock shapes (crisp fracture edges, crack normal map, strata and dust colours) and scattered pebbles
    deposits.ts       carbon, clay, iron ore and Helium X rock models
    items.ts          carried/stacked item models and the item pool
    kit.ts            model-building helpers and finishes: lathe bodies, pipes, bolt rings, plating/hazard/fabric textures
    machineParts.ts   shared machine fittings: plinth, status lamp tower, fan, output hatch and chute, console, smoke
    feeders.ts        how raw material enters a machine: the smelter's skip hoist and the refinery's crystal crusher
    smelter.ts        arc-furnace smelter: riveted drum, glowing pour slit, roof electrodes, stamping press, stack
    refinery.ts       helium refinery: plasma reactor with a glass belt, distillation column, cell-filling carousel
    machineViews.ts   machine models, input/output pads and trays, items riding the belts in and the chute out
    orderSite.ts      the active order: hologram ghost of the build with a scan ring, delivery pad and materials board
    materialsBoard.ts canvas board listing each material and how much has arrived
    assemble.ts       the build-up animation when an order completes
    workerSites.ts    robot and drone docks with their stockpile stacks and labels
    suitStation.ts    the suit station: round bay, lit shell, spare suit, sweeping scanner ring, servo arms
    workbench.ts      the workbench: steel bench, pegboard, tool chest, lamp, hologram projector, jointed robot arm
    drillRig.ts       the mining drill: boom extends into the ridge while boring
    pads.ts           sci-fi hex pads: LED ring (progress on pay pads), hologram icon, price board
    holograms.ts      the spinning hologram icons above pads
    decor.ts          solar farm, sweeping satellite dish, lamps, crates, fuel tanks, crash debris and cables; each piece is its own root so the intro can unfold it
    droneModel.ts     the cargo drone: teardrop body, ducted fans, underglow ring, claw cradle
    drones.ts         cargo drone animation, stacks and dock
    rocket.ts         the crashed rocket: plated hull, porthole, fins, landing legs, engine bell, a jump-drive ring that lights up as materials arrive, scaffold, smoke
    storm.ts          dust-storm fog and blowing grains
    characters.ts     hand-held laser drill and the astronaut/robot model interfaces
    astronaut.ts      the astronaut: quilted suit, gold visor, helmet lamps, gloves, moon boots, life-support pack
    robot.ts          the mining rover: treaded wheels on bogies, two-eyed head, jointed drill arm, cargo bin
    beam.ts           the flexible laser: a lagging, rippling tube that goes thin and blue while warming up, thick and orange once locked
    actors.ts         per-frame player/robot animation (robot looks per stage), drill beams
    fx.ts             flying items, sparks, rock chips, dust, falling ore meteorites, floating text
    bake.ts           merges static meshes per material to cut draw calls
    render.ts         renderer, ACES tone mapping, ambient occlusion, bloom, colour grade and vignette, shadows, reflections
  game.ts             main loop: input → step → feedback → view sync → render; tutorial, launch
  gameIntro.ts        wires the crash-landing intro into the game (camera, landings, smoke, shake)
  intro.ts            the crash-landing cinematic: the burning rocket comes down beyond the ridge, the escape pod lands, the kit unfolds
  feedback.ts         maps SimEvents to effects, sounds and toasts
  hud.ts / page.html  DOM HUD: active order chip, backpack list with Drop, oxygen, missions, coach card, intro overlay
  hudPanel.ts         renders the workbench, suit-station and dock panels (cards with material cost chips, on/off toggle)
  panels.ts           which panel to show and its cards; ordering from a panel
  styles/*.css        the page's CSS, inlined by page.mjs at build time; compact.css holds the phone layout (bottom sheet)
  upgradeIcons.ts     line icons for panel cards
  audio.ts / music.ts synthesised sound effects and the procedural ambient soundtrack
  haptics.ts          phone vibration on big moments (switchable in the pause menu)
  settings.ts         player preferences (sound, music, vibration) and seen-intro/tutorial flags
  tutorial.ts         7-step first-play tutorial and one-off tips
  platform.ts         CrazyGames SDK wrapper (no-ops without the SDK): gameplay start/stop, midgame and rewarded ads, save storage
  main.ts             boot, menus, settings
  screens.ts          start-screen route row and end-screen text
test/
  bot.ts              autopilot that orders builds in a fixed plan and fetches materials like a player
  autoplay.ts         plays the Moon to the end and prints the timeline
  inventory.ts        drop, re-pickup, orders, stockpiles, drone, stages and drill checks
  harness.ts          renders the real scene after N bot-seconds, for visual review in a headless browser
  *-entry.ts          test builds that spawn the player somewhere specific (via test/build-entry.mjs)
  stepped-entry.ts    review build: fixed 1/30 s frames that a headless browser can hold for exact screenshots; `?spawn=x,z` picks where the player starts
  showcase-entry.ts   renders one model at a time (show(name, view)) for close-up review of models
```

## How to change things

- **Balance (costs, speeds):** edit `src/config.ts` (suit upgrades, robot stages, rates) and the `builds` and machine levels in `planets/moon.ts`. Then run `npm test`. The Moon should take the bot roughly 1,300–1,600 s (about 25–30 minutes for a person).
- **New item:** add it to `ITEM_IDS` and `ITEMS` in `config.ts`, give it a look in `view/items.ts`, and add a `.item-swatch--<shape>` style in `styles/hud.css` if it has a new shape.
- **New build:** add a `BuildDef` to the planet's `builds` (cost, `requires`, site). Machines also need a `MachineDef` and a model registered in `MODELS` in `view/machineViews.ts`; robots and the drone need a dock spot. The bot's `PLAN` in `test/bot.ts` decides when it orders it.
- **New planet:** create `planets/<name>.ts` with a `PlanetDef` and add it to `PLANETS` in `planets/index.ts`; remove its card from `UPCOMING`. Mirror an existing layout so `routeToward()` and the bot's ridge-gap waypoint still work, then run `npm test` and tune costs.
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
- Sounds and music are synthesised in `audio.ts` and `music.ts` with the Web Audio API. Audio is silenced while an ad plays.

## CrazyGames notes

- The SDK script is injected only into the upload build (`build.mjs`). Locally the SDK reports environment "local" and shows demo ads.
- `startGameplay()` and `stopGameplay()` must bracket real play; midgame ads only between sessions or levels; the rewarded ad powers Turbo.
- Upload `dist/crazygames/index.html` (or the zip) in the developer portal.
