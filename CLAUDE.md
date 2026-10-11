# GPA Planner

A web app for planning the layout of bars, patches and flags on a Queen's University Engineering jacket (the "GPA"). Users place items on a flat 2D view of each jacket section and see the result on a rotatable 3D jacket.

It is a plain-JavaScript Vite project (no framework), deployed to Vercel from GitHub. `gpa-planner.html` is the original single-file version, kept for reference only. Don't edit it.

## Context you need first

**Domain.** At Queen's, engineering students sew small rectangular patches called **bars** onto their jacket (the GPA). Bars are earned by completing challenges or by being involved in things. For example, the "Wizard" bar is earned by building a staff out of beer cans as tall as you are. Other jacket items include:

- **Pass crest**: goes on the right sleeve after first year.
- **Year number**: the graduating year, on the left sleeve.
- **Patches**: these are commonly for design teams, but can be for other things also. 
- **Flags**: national.

Jacket space is limited. The whole point of the app is deciding what fits and where it goes.

**Bar types** (from Nathaniel):

- **Shenanigans:** silly stuff and challenges. These split into:
  - **Official:** widely recognised.
  - **Experimental:** not enough people have done it yet. It may be upgraded to official later.
- **Academic/extracurricular:** design team patches, the discipline bar, and so on.

**Traditional layout** (confirmed by Nathaniel). The app should require or strongly suggest these spots. Apart from them, any bar can go roughly anywhere.

| Where | What, top to bottom |
|---|---|
| Right sleeve | University motto, then pass crest, then discipline bar |
| Left sleeve | Year motto, then grad year (last 2 digits) |
| Front, upper left (wearer's left) | Year crest |
| Upper back | "QUEEN'S" (slight arch), "APPLIED", "SCIENCE". The whole block fits in 38.6 cm wide × 30.5 cm tall. |
| Lower back | Frosh group bar at bottom left, FREC group bar at bottom right, flags between them, discipline *patch* above the flags. The patch is separate from the sleeve bar, and its details are still to come. |

**Real sizes** (Nathaniel's measurements):

- **Standard bar:** about 12.1 × 2.9 cm (4¾ × 1⅛ in). It curves with the ends up, like a smile (Nathaniel corrected an earlier "ends down"); the curve adds about 1.2 cm, so the bounding box is about 12.1 × 4.1 cm. Most bars are royal blue with a red border and gold lettering.
- **University and year mottos:** about 11.4 × 3.8 cm. Scroll shape with ribbon ends.
- **Pass crest:** about 6.6 × 9.5 cm. Shield shape.
- **Flags:** about 6.4 × 3.8 cm.

**Content rules:**

- Show each bar's name and category only, never how it's earned. Many requirements involve heavy drinking, and the audience is mostly first- and second-years.
- The site must say it isn't affiliated with Queen's University.
- The wiki owner allowed us to use its data without credit. Don't use wiki photos.

**The user.** Nathaniel is a second-year Computer Engineering student and is also a Frec (orientation leader). He knows programming fundamentals but very little web dev, and isn't especially interested in learning as he specializes in other areas of programming.

- Explain the reasoning behind design and technical decisions, not just the result.
- Be direct and practical.
- Expect him to push back when something doesn't fit how the jacket actually works. He is the authority on jacket traditions and real patch details.
- Good areas for him to contribute directly:
  - Bar data: names, real sizes, colours, how each is earned, photos.
  - Placement rules.
  - The pure-logic functions: fit checking and auto-arranging. These are isolated and need no DOM knowledge.

**Origin.** The app was first built in claude.ai as a single-file artifact. Nathaniel moved it to Vercel and GitHub, so the claude.ai constraints (single file, approved CDNs only, `window.claude` services) no longer apply.

## Running and testing

- **Setup:** `npm install` once. For the browser tests, also run `npx playwright install chromium`.
- **Run:** `npm run dev`, then open the printed URL. Run it in the browser before calling a change done.
- **Unit tests:** `npm test` runs Vitest on `tests/`. Fit logic is covered in `tests/fit.test.js`.
- **Browser tests:** `npm run test:e2e` runs the Playwright tests in `e2e/` and starts the dev server itself. They check that the 3D view renders, and test add, overlap, undo, drag and reload. Headless Chromium uses SwiftShader for WebGL (the flags are in `playwright.config.js`).
- **Build:** `npm run build` writes `dist/`. Vercel detects Vite and runs this itself; there's no `vercel.json`.
- **Bar data:** `data/bars.xlsx` is the real copy, and Nathaniel edits it in Excel. A Vite plugin in `vite.config.js` (using `scripts/sheet.mjs`) lets code `import bars from '../data/bars.xlsx'`, which gives the included, non-skipped rows as `{ name, type, pageid, ...his extra columns }`. `npm run scrape` merges new wiki pages into the sheet in place, and only rewrites the wiki columns. `tests/bars-sheet.test.js` checks the sheet for mistakes. See `data/README.md`.
- **Internet:** only Google Fonts loads from a CDN. three.js is bundled.

## Hosting

- **Vercel, from GitHub.** Pushing to `main` deploys.
- **Static only.** There's no backend yet. Plans save to `localStorage`, and Export/Import moves them between devices.
- **three.js is pinned to `0.185.1`.** Colour management is on (hex colours are sRGB, canvas textures set `colorSpace = SRGBColorSpace`), lights are physically based, and tone mapping is `NeutralToneMapping` (keeps patch colours true). Upgrading again needs a visual check of the 3D view. The camera controls are hand-written.

## Architecture

The code is plain ES modules in `src/`. Modules share `state`, `catMap`, `current` and `sel`, which are exported from `state.js`. Other modules can read them directly and always see the latest value, but must use `setState` / `setCurrent` / `setSel` to replace them. The UI modules import each other in a cycle; that's fine because nothing calls across modules while the files are first loading.

| File | Contents |
|---|---|
| `config.js` | Default measurements, `JACKET_COLOURS`, `BAR`, `PRESETS`, `FRONT` (pocket sizes), section names, constants |
| `catalog.js` | `BUILTINS` (presets plus every sheet bar), picker `GROUPS`, `groupOf`, `RENAMED_IDS`. No DOM. |
| `util.js` | Small helpers (`$`, `clamp`, colour functions) |
| `state.js` | State, `normalize`, `newJacket`, catalogue, section sizes, `noGoZones`. No DOM. |
| `surface.js` | Where each section folds and wears (`foldsFor`, `foldHeight`, `wearPotential`), seeded random. No DOM. |
| `model.js` | The 3D jacket as pure geometry from the measurements (`buildJacket`), and the `cutaways`. No DOM. |
| `zones.js` | No-go zones with exact outlines (`jacketZones`), built partly from the model; `topAt`. No DOM. |
| `layout.js` | `traditionalSpots` / `traditionalPlacements`: where the traditional pieces go. No DOM. |
| `shapes.js` | Shape geometry shared by drawing and fit: `arcGeom`, outlines, `outlinesClash`, `coverage`. No DOM. |
| `fit.js` | `boxesClash`, `footprint`, `conflicts`, `findSpot`. No DOM. |
| `leather.js` | Leather canvas layers (grain, colour with wear, 3D height), all cached |
| `draw.js` | `drawItem`, `drawPanel` (the single renderer), bar/scroll/chenille drawing, `arcText`, zones and seams |
| `editor2d.js` | Cutting-mat editor: layout, drawing, drag, keyboard |
| `jacket3d.js` | three.js scene from `model.js`, section textures, lights, camera, picking |
| `catalog-ui.js` | Item picker (search, category filter, grouped list), preview, "make your own" form, Add |
| `panels.js` | Section tabs, inspector, space meters, jacket-size dialog, colour switch, wear slider, expand |
| `pipeline.js` | `commit` / `liveUpdate` / `liveUpdateAll` / redraw, undo stack, toast |
| `storage.js` | `localStorage` save and load |
| `io.js` | Export, import, save picture, 3D snapshot |
| `main.js` | Start-up |

### Units and coordinates

- All geometry is in **centimetres**.
- Each jacket section is treated as a flat rectangle ("unrolled"). Positions are measured from the section's **top-left corner**: x to the right, y downward.

| Section | Width | Height | Notes |
|---|---|---|---|
| `front` | chest / 2 | body length | Viewer's left is the wearer's right. |
| `back` | chest / 2 | body length | Viewer's left is the wearer's left. |
| `leftSleeve`, `rightSleeve` | sleeve circumference | sleeve length | The horizontal centre line is the outer side of the arm. Both edges are the underarm seam. |

- **The flat rectangle is bigger than the real pattern piece** in two places, and those parts aren't on the jacket ("cut-aways"): the neckline at the top of the front, and the sleeve cap's curve near the underarm (about 23 cm deep at the underarm seam, flat across the outer side). `cutaways(meas)` in `model.js` measures them from the 3D model. The editor draws each panel in its real shape, and anything placed there is flagged "Off the jacket".
- **No-go zones** come from `noGoZones(section)` (`zones.js`). Most have an exact `outline` polygon, which fit checks use instead of the bounding box:
  - Front: the front-opening strip (GPAs lose their zippers and are worn open; the setting is still `meas.zipper`), a lapel with the collar point on each side (sizes in `LAPEL` in `model.js`), two slanted welt pockets (`FRONT` in `config.js`), the neckline cut-away, and the waistband.
  - Back: the collar lying on the top (5.5 cm down) and the waistband.
  - Sleeves: the two sleeve-cap cut-aways and the cuff.
- **Rotation** is only 0° or 90°. `dims(p)` returns the rotated bounding box.

### State model

`state` is saved as JSON. The schema version is `v: 3`. Migrations: v1 → v2 adds any missing traditional pieces; v2 → v3 adds `jacket.wear` (default 0.3). Shape:

```js
{
  v: 3,
  updatedAt: <ms>,
  meas:   { chest, length, sleeve, sleeveCirc, waistband, cuff, zipper, gap }, // cm
  jacket: { color, lining, wear },                                           // hex, hex, 0 new .. 1 worn
  items:  [ItemDef],   // custom items, plus overrides of presets (same id as the preset)
  placed: [{ uid, item, section, x, y, rot, text }] // text: per-placement override, or null
}
```

`ItemDef` fields:

```js
{ id, cat: 'bar'|'patch'|'flag', name, text, w, h,
  shape: 'arc'|'rect'|'round'|'circle'|'shield'|'text'|'scroll'|'qas'|'chenille',
  band?,             // arc only: the band's thickness in cm (h is the curved bounding box)
  bg, fg, border, note,
  backing?,          // chenille ('qas', 'chenille'): the felt backing colour; `border` is the stitched line
  edge?,             // 'text' shape: outline width as a fraction of font size
  trad?: true,       // traditional piece: listed first, Add sends it to its spot
  flag?: { type: 'h'|'v'|'disc'|'canada', colors: [...] },
  img?: dataURL }
```

- **Catalog:** `catMap` is `BUILTINS` (the `PRESETS` plus every bar in `data/bars.xlsx`) merged with `state.items`. It is rebuilt by `rebuildCatalog()`.
- **Sheet bar ids** are `wiki-<pageid>`, so renaming a bar in the sheet keeps it on saved jackets. Sheet bars carry `type` (the sheet's type column), which decides their picker group.
- **Custom ids** start with `c-`. Editing a built-in stores an override that has the built-in's id.
- **Missing items:** if a placement's item is gone (e.g. a bar later set to `include = no`), `rebuildCatalog()` gives it a stand-in "Bar no longer in the list" def instead of deleting the placement.
- **Moved presets:** `RENAMED_IDS` maps old preset ids to their sheet id (`bar-wizard` → `wiki-2095`, `patch-engsoc` → `wiki-2064`); `normalize()` applies it.
- **Loading:** saved data always goes through `normalize()`. If you change the schema:
  - Bump `v`.
  - Add a migration in `normalize()`.
  - Never break plans people have already saved.

### Rendering

- `drawPanel(ctx, section, pxPerCm, opts)` is the **single renderer** for a section. It is used both by the 2D editor (with labels, guides and conflict highlights) and to paint the 3D textures (`renderTexture`, at `TEX_PX = 12` px/cm). Keep it that way, so 2D and 3D can never disagree.
- `drawItem` draws one patch. Shapes are vector paths with a felt texture, an optional flag fill, an optional photo (cover-fit and clipped), a satin-stitched border, and a faux stitch line. Text is auto-fitted and uses the `Graduate` font.
  - `arc` (bars): a band curved ends up (a smile), ends cut toward the centre, gold Archivo text along the curve. Geometry from `arcGeom` in `shapes.js`.
  - `scroll` (mottos): an arched ribbon with forked tails; text follows the arch via `arcText`.
  - `qas` and `chenille` (the back letters and the year number): chenille, rendered once per size into a cached canvas by `drawChenille`. A felt backing grown from each letter with its holes filled (so it shows as an edge and inside O and D), an optional stitched line, then the chenille with a looped texture. Letters are spaced like separate felt pieces (`arcText` `track` mode with `squeeze`), QUEEN'S arched.
  - `arcText` modes: `shrink` (keep letter shapes, shrink to fit), `track` (also spread letters to fill), `stretch`; `only: 'fill'|'stroke'`.
  - `opts.mask` draws the footprint in white, for the 3D bump and surface maps.
- `drawPanel` draws the cached leather layer (`leather.js`: colour, mottling, fold shading, wear), the grain at real size, the seams (grooves and topstitching along the side seams and the top edge, following the cut-away curve), then the zones and patches. In the editor (`opts.guides`) it clips to the real pattern shape.

### 3D model

`model.js` builds the jacket as pure geometry in cm; `jacket3d.js` turns it into meshes (scene units are metres, the model group is scaled by 0.01).

- **Body.** `bodyDims` scales everything from the chest and body length: a superellipse torso (boxier than an ellipse, fuller in front), shoulder and neck points, armpit depth. Worn on an invisible person with the arms relaxed.
- **Panels are grids** (`pos`, `normal`, `ao`). Column i maps to texture u across the section, row j to v down from the top edge. Rows are placed by true distance along the surface, measured up from the hem or cuff, so a cm on the flat panel is a cm in 3D (tested within about 5%). Where the real piece is shorter than the rectangle, the top rows pile up at the edge: that's a cut-away.
  - **Torso:** each column runs up the side of the body, then curves in over the shoulder (a Hermite curve) to the top edge (shoulder seam and neckline), arriving level so front and back meet smoothly. The armhole edges bow forward and back to leave room for the sleeve. The front is two halves, pulled apart at the front edges (`openFront`) because GPAs are worn open.
  - **Sleeves:** a tube round a curved arm axis (slightly out from the body, bent forward at the elbow), joined to the armhole by a rounded cap. The arm is shortened so the outer side's length, cap included, matches the sleeve length. More of the armhole goes to the underarm columns so the cap is flat on top.
  - **Folds** (`surface.js`) push the surface out along its normals: bunching above the cuffs, inside the elbows, blousing over the waistband, drape by the front edges. They fade out at seams so the panels still meet. The same folds shade the leather texture.
  - **Shading:** per-vertex ambient occlusion (`ao`) darkens fold valleys, the body under the arms and the inside of the sleeves; the key light also casts real shadows.
- **Collar and lapels** are built on the panels (`panelAt`): a folded shirt collar round the neck with its points on the chest, and lapels folded back from the front edges. Their outlines are the `lapel` and `collar` zones, so 2D and 3D agree.
- **Thickness:** each panel has a lining shell 0.45 cm inside it, and the free edges (hems, cuffs, front edges) get a rounded edge strip.
- **Textures:** each section has three canvas maps, all from the same drawing code as the editor: colour (`drawPanel`), bump (`heightLayer`: grain and fine creases, plus raised flaps, welts and patches), and surface (R = clearcoat, glossy leather; G = roughness, matte felt). The collar, lapels and edges use the back's leather layer (`refreshSwatch`).
- **Look:** `LOOK` in `jacket3d.js` (bump, clearcoat, roughness, thickness). Lighting is a `RoomEnvironment` env map plus key (with shadows), fill and rim lights, with `NeutralToneMapping`.
- **Wear** (`jacket.wear`, the slider on the 3D view) only changes textures: dye rubbed through at seams, edges, raised folds and elbows (to tan on purple, a darker patina on yellow), scuffs, and more fine creases. Dragging the slider uses `liveUpdateAll()`; letting go commits.
- **Rebuilding:** `build3D()` re-runs only when the measurements or colours change (`buildKeyFor()`); wear and patches only repaint textures.
- **Dev hook:** in `npm run dev`, `window.__V` is the viewer state, so screenshot scripts can set `yaw`/`pitch`.
- **Clicking the model** (`pick3D`): it raycasts, converts the hit UV to section cm, then selects that section and patch. A click on the collar or a lapel selects nothing.
- **Focusing a section** animates the yaw. It respects `prefers-reduced-motion`. The expand button (or Esc to close) makes the 3D view fill the window.

### Fit logic (pure functions; good place for Nathaniel to contribute)

- `boxesClash(a, b, gap)` tests axis-aligned box overlap with a minimum gap. It's the cheap first check for every pair.
- `footprint(p)` is an item's outline polygon. Curved bars use their real outline (`localOutline`), so stacked bars nest about 3.5 cm apart instead of the 4.1 cm their boxes would need. Everything else is its box. `outlinesClash` measures real distances between outlines.
- `conflicts(section)` returns a `Map<uid, reason>` covering:
  - items off the edge
  - items on no-go zones
  - items overlapping or closer than `meas.gap`
- `findSpot(section, w, h, skipUid, local)` tries a 0.5 cm grid nearest-first from a per-section anchor and returns the first free spot. `local` is the item's outline (`localOutline(def, rot)`). On sleeves, sideways moves cost 4× more, so items stack down the outer side. "Add" tries the item rotated if the upright version doesn't fit.

Circles, shields, scrolls and letters still collide by their bounding box, which is conservative.

### UI flow

- **Mutations** follow one pattern: `pushHistory()` → change `state` → `commit()`.
  - `commit()` redraws everything, saves (debounced), and updates the Undo button.
- **Dragging** uses `liveUpdate()`. It redraws only the editor and the current section's texture each frame, then commits on pointer up.
- **Undo** is a JSON snapshot stack holding the last 80 states.
- **Saving** (`scheduleSave`): debounced write to `localStorage`. Photos are downscaled to 240 px to keep plans small.

## Design

The visual direction is a green self-healing cutting mat with a cm grid as the workspace, set against Queen's colours.

- **Jacket leather:** `JACKET_COLOURS` in `config.js`, yellow (undyed) `#BCA66A` and purple (dyed) `#553750`, each with the colour it wears to, matched to Nathaniel's photos. A switch on the 3D view picks one. Nathaniel chose yellow and purple only (no custom colour); older plans with another colour keep it until switched.
- **Footer:** "A Nathaniel Felsky-Deelstra production" plus the not-affiliated line.
- **Colours:**

| Name | Hex |
|---|---|
| Queen's blue | `#002452` |
| Queen's gold | `#EAAA00` |
| Queen's red | `#9D1939` |
| Mat green | `#2E5B48` |

- **Fonts:** Graduate (a varsity face) for the title and patch lettering; Archivo for the UI.
- **Theme:** colours are CSS tokens on `:root`, with dark mode handled through `prefers-color-scheme` and `data-theme`.
- **Accessibility:**
  - Keep it responsive down to about 375 px.
  - Keep keyboard support on the mat: arrows nudge, Shift+arrows nudge 2 cm, R rotates, Delete removes, Esc deselects, Ctrl/Cmd+Z undoes.
  - Keep focus outlines visible.

## Known placeholders and limitations

- **The bar list comes from `data/bars.xlsx`.** Every bar is a standard curved bar (2.9 cm band, 12.1 × 4.1 cm box): blue felt, red border, gold text, matched to Nathaniel's sleeve photo. Per-bar sizes or colours would need new sheet columns. Sheet rows that are really patches, such as EngSoc Crest, draw as bars for now.
  - Default text like "COMPUTER" is illustrative.
  - Get real data from Nathaniel. Don't make up more traditions.
- **Traditional pieces** (QUEEN'S/APPLIED/SCIENCE, the "QUIS·DOLOR·CUI·DOLIUM" motto, pass crest, year motto, year number) start on every new jacket, positioned by `layout.js` (sleeve pieces sit just under the cap's curve). From Nathaniel's photos: chenille back letters on dark red-brown felt; year digits in blue chenille with a red line on yellow felt; the motto scroll blue with yellow text and a red edge. Still guesses: the year number size (12 × 9 cm), the year motto's look, the stacking gaps, and the leather waistband and cuffs. The year crest, discipline bar and lower-back pieces aren't pre-placed yet.
- **Crests are generic placeholder drawings.** Don't recreate the real Queen's or EngSoc logos (they're trademarked). Users can upload a photo of their own patch instead.
- **Default jacket measurements** are a generic size L. The user is meant to enter their own.
- **Rotation is 0°/90° only.** Collisions use outlines for bars and zones, boxes for other shapes.
- **Approximations in the 3D model:** the texture is true to size across the panels, but stretches near the sleeve cap and at the neckline where the piece is cut away. Folds are fixed (they don't react to patches). Seams are drawn and bumped, not modelled as geometry.
- **Mobile:** no pinch-zoom in 3D (there are +/− buttons instead), and you can't drag directly from the 3D view.
- **Auto-placement anchors are simple.** The front anchors at 75% of the width, so patches can land toward the side of the torso.

## Suggested backlog

Confirm priorities with Nathaniel first.

1. **Real bar catalogue and layout.** `data/bars.xlsx` exists and loads at build time, and Nathaniel is classifying it. Next steps:
   - Done: the picker uses it (search plus category filter), bars are the real flat size, and the not-affiliated disclaimer is in the footer.
   - Done: curved bars, the traditional pieces in their spots, the realistic 3D jacket.
   - Real shapes and sizes for flags and the remaining traditional pieces.
2. **Status per item.** Earned, working on it, or wishlist. Summaries like "what fits if I earn everything on my wishlist".
3. **Custom no-go zones.** Let the user draw pockets or areas to keep clear.
4. **Smarter auto-arrange.** A packing or optimisation pass that fits a chosen set of items into a section, respecting traditional placements and preferred groupings. This is a self-contained algorithms problem that suits Nathaniel.
5. **Free rotation,** with shape-accurate collision. Use separating-axis tests, and circle tests for round patches.
6. **Share or compare layouts,** for example a frosh group comparing jackets.
7. **More tests.** Add `normalize` migrations and auto-arrange as they're written.
