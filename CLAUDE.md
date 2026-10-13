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
- **Flags:** 3.8 cm tall, sized 4:3 (5.1 × 3.8 cm) to match the flag artwork (Nathaniel).

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
- **Browser tests:** `npm run test:e2e` runs the Playwright tests in `e2e/` and starts the dev server itself. They check that the 3D view renders, and test add, overlap, undo, drag and reload. Headless Chromium uses SwiftShader for WebGL (the flags are in `playwright.config.js`). SwiftShader is slow (several seconds of shader compiling and CPU drawing per page load), so tests get 60 s each and the suite takes about 2 minutes. Canvases whose pixels are read back (`getImageData`) must be created with `willReadFrequently: true`, or each read stalls for a second or more under software WebGL.
- **Build:** `npm run build` writes `dist/`. Vercel detects Vite and runs this itself; there's no `vercel.json`.
- **Bar data:** `data/bars.xlsx` is the real copy, and Nathaniel edits it in Excel. A Vite plugin in `vite.config.js` (using `scripts/sheet.mjs`) lets code `import bars from '../data/bars.xlsx'`, which gives the included, non-skipped rows as `{ name, type, pageid, ...his extra columns }`. `npm run scrape` merges new wiki pages into the sheet in place, and only rewrites the wiki columns. `tests/bars-sheet.test.js` checks the sheet for mistakes. See `data/README.md`.
- **Internet:** only Google Fonts loads from a CDN. three.js and the flag SVGs (`flag-icons`, MIT) are bundled.

## Hosting

- **Vercel, from GitHub.** Pushing to `main` deploys.
- **Static only.** There's no backend yet. Plans save to `localStorage` only (Nathaniel removed Export/Import), so a plan lives in one browser.
- **Error pages.** `public/404.html` (self-contained, styled like the site) is what Vercel serves for unknown addresses. `index.html` has a start-up error screen (`#bootFail`) whose styles and script are inline, so it works when the app's files don't arrive: it shows if a script fails to download, the app throws before `main.js` sets `window.__gpaStarted`, start-up takes over 25 s, or the browser lacks modules (`nomodule`); `<noscript>` covers JavaScript being off. Its "Start over" moves the saved plan to `gpa-planner-v1-backup` first. A saved plan that `normalize` can't read is backed up to the same key (never silently overwritten) and the app starts fresh with a toast. After start-up, errors only toast once.
- **three.js is pinned to `0.185.1`.** Colour management is on (hex colours are sRGB, canvas textures set `colorSpace = SRGBColorSpace`), lights are physically based, and tone mapping is `NeutralToneMapping` (keeps patch colours true). Upgrading again needs a visual check of the 3D view. The camera controls are hand-written.

## Architecture

The code is plain ES modules in `src/`. Modules share `state`, `catMap`, `current` and `sel`, which are exported from `state.js`. Other modules can read them directly and always see the latest value, but must use `setState` / `setCurrent` / `setSel` to replace them. The UI modules import each other in a cycle; that's fine because nothing calls across modules while the files are first loading.

| File | Contents |
|---|---|
| `config.js` | Default measurements, `JACKET_COLOURS`, `BAR`, `PRESETS`, `FRONT` (pocket sizes), section names, constants |
| `flags.js` | `FLAG_DEFS` (every country's flag, from the `flag-icons` package, ids `flag-<code>`), `flagUrl(code)`. No DOM. |
| `catalog.js` | `BUILTINS` (presets, every sheet bar, every flag), picker `GROUPS` (official, experimental, academic, flags, not sorted, made by you) and `HIDDEN_GROUPS` (traditional, generic bars, patches: not in the picker), `groupOf`, `RENAMED_IDS`. No DOM. |
| `util.js` | Small helpers (`$`, `clamp`, colour functions) |
| `state.js` | State, `normalize`, `newJacket`, catalogue, section sizes, `noGoZones`. No DOM. |
| `surface.js` | Where each section folds and wears (`foldsFor`, `foldHeight`, `wearPotential`), seeded random. No DOM. |
| `model.js` | The 3D jacket as pure geometry from the measurements (`buildJacket`), and the `cutaways`. No DOM. |
| `zones.js` | No-go zones with exact outlines (`jacketZones`), built partly from the model; `topAt`. No DOM. |
| `layout.js` | `traditionalSpots` / `traditionalPlacements`: where the traditional pieces go. No DOM. |
| `shapes.js` | Shape geometry shared by drawing and fit: `arcGeom`, outlines, `outlinesClash`, `coverage`. No DOM. |
| `fit.js` | `boxesClash`, `footprint`, `conflicts`, `findSpot`. No DOM. |
| `leather.js` | Leather canvas layers, all cached: pebble grain tile, colour (mottling, rub-through, crackle, specks), surface (gloss/roughness), 3D height |
| `symbols.js` | The discipline patches' pictures (bolt, gears, flame, biohazard, rocks, psi, bridge, infinitum), redrawn as paths from the wiki photos, each rendered once into a cached canvas (`drawSymbol`). No state. |
| `draw.js` | `drawItem`, `drawPanel` (the single renderer), bar/scroll/chenille drawing, `arcText`, zones and seams |
| `editor2d.js` | Cutting-mat editor: layout, drawing, drag, keyboard |
| `jacket3d.js` | three.js scene from `model.js`, section textures, lights, camera, picking |
| `catalog-ui.js` | Item picker (search, category filter, grouped list), preview drawing, "make your own" form, `addChosen` |
| `panels.js` | Section tabs, the right-hand panel (`renderInspector`), Reset (with a confirm dialog), colour switch, wear slider, expand |
| `pipeline.js` | `commit` / `liveUpdate` / `liveUpdateAll` / redraw, undo stack, toast |
| `storage.js` | `localStorage` save and load (`readSaved`, `backUpSaved`; a failed save warns once) |
| `io.js` | Save picture (the flat section as a PNG) |
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
  - Front: the zipper strip (the jacket is worn open, so each front edge shows its half of the zipper, teeth and tape, down to the hem; the setting is `meas.zipper`), a lapel with the collar point on each side (sizes in `LAPEL` in `model.js`), two slanted welt pockets (`FRONT` in `config.js`, measured off Nathaniel's photo: 14 cm long, 16.5 cm from the front edge, starting 4.5 cm above the waistband, top leaning 9° toward the edge), the neckline cut-away, and the waistband (two pairs of snaps by the front edges).
  - Back: the collar lying on the top (5.5 cm down) and the waistband.
  - Front and back waistband: `sewable` (flags and bars go on it, per Nathaniel's photos), except the snaps by the zipper (`vent` zones).
  - Sleeves: the two sleeve-cap cut-aways, and the snapped cuff vent at each end of the cuff (`CUFF_VENT`; in 3D the vent hangs open). The cuff band itself is `sewable`: bars do get sewn on cuffs (Nathaniel's photo). Fit checks skip sewable zones; they're still drawn.
- **No rotation** (Nathaniel removed it): every placement is upright. The `rot` field is still in the state (always 0, and `normalize` sets it to 0 on load), and `dims(p)` still handles 90° should it ever come back.

### State model

`state` is saved as JSON. The schema version is `v: 4`. Migrations: v2 → v3 adds `jacket.wear` (default 0.3). On every load `pinTraditional()` (`state.js`) gives the plan exactly one of each traditional piece, in its spot, upright (adding missing ones, putting moved ones back, dropping copies); this covers v1 (none) and v3 (no year crest). Saved `meas` is ignored: measurements are always `DEFAULT_MEAS`. Shape:

```js
{
  v: 4,
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
  shape: 'arc'|'rect'|'round'|'circle'|'shield'|'hazard'|'diamond'|'text'|'scroll'|'qas'|'chenille',
  band?,             // arc only: the band's thickness in cm (h is the curved bounding box)
  bg, fg, border, note,
  backing?,          // chenille ('qas', 'chenille'): the felt backing colour; `border` is the stitched line
  edge?,             // 'text' shape: outline width as a fraction of font size
  symbol?, accent?,  // a picture on the patch in its text colour, plus a second colour (symbols.js)
  trad?: true,       // traditional piece: on every new jacket, not in the picker
  flag?: { type: 'svg', code } | { type: 'h'|'v'|'disc'|'canada', colors: [...] }, // svg: a flag-icons country code
  img?: dataURL }
```

- **Catalog:** `catMap` is `BUILTINS` (the `PRESETS`, every bar in `data/bars.xlsx`, and every country's flag) merged with `state.items`. It is rebuilt by `rebuildCatalog()`.
- **Sheet bar ids** are `wiki-<pageid>`, so renaming a bar in the sheet keeps it on saved jackets. Sheet bars carry `type` (the sheet's type column), which decides their picker group.
- **Custom ids** start with `c-`. Older plans may hold an override of a built-in (same id); it still loads, but the UI no longer offers editing or deleting items (Nathaniel removed the Edit item / Delete item buttons and the "Space used" panel).
- **Missing items:** if a placement's item is gone (e.g. a bar later set to `include = no`), `rebuildCatalog()` gives it a stand-in "Bar no longer in the list" def instead of deleting the placement.
- **Moved presets:** `RENAMED_IDS` maps old preset ids to their sheet id (`bar-wizard` → `wiki-2095`, `patch-engsoc` → `wiki-2064`); `normalize()` applies it.
- **Loading:** saved data always goes through `normalize()`. If you change the schema:
  - Bump `v`.
  - Add a migration in `normalize()`.
  - Never break plans people have already saved.

### Rendering

- `drawPanel(ctx, section, pxPerCm, opts)` is the **single renderer** for a section. It is used both by the 2D editor (with labels, guides and conflict highlights) and to paint the 3D textures (`renderTexture`, at `TEX_PX = 12` px/cm). Keep it that way, so 2D and 3D can never disagree.
- `drawItem` draws one patch. Shapes are vector paths with a felt texture, an optional flag fill, an optional photo (cover-fit and clipped), a satin-stitched border, and a faux stitch line. Text is auto-fitted and uses the `Graduate` font.
  - Flags: `flag.type 'svg'` draws the country's 4:3 SVG cover-fit into the 5.1 × 3.8 cm (4:3) patch (`FLAG` in `config.js`), then the felt texture and border go on top. Placements store the country code, never the file URL (Vite renames files per build).
  - `arc` (bars): a band curved ends up (a smile), ends cut toward the centre, gold Archivo text along the curve. Geometry from `arcGeom` in `shapes.js`.
  - `scroll` (mottos), from Nathaniel's photo of the university motto: a deep arched band with a thick red edge and a yellow line inside it, and at each end a ribbon tail that turns down and hooks back under (`tailLine`/`tailPath`, drawn behind the band, a shade darker, with the yellow line down its middle). Bold serif capitals (Georgia) fill the band end to end; long mottos get narrower letters first (`arcText`'s `minSqueeze`, down to 70%), then smaller. The text box takes up to 48 characters. `YEAR_MOTTOS` in `config.js` holds known year mottos by grad year ('29' so far).
  - `qas` and `chenille` (the back letters and the year number): chenille, rendered once per size into a cached canvas by `drawChenille`. A felt backing grown from each letter with its holes filled (so it shows as an edge and inside O and D; `innerBits` drops glyph pieces that sit inside a hole, like the block in Graduate's 0, so the felt fills the hole), an optional stitched line, then the chenille with a looped texture. Letters are spaced like separate felt pieces (`arcText` `track` mode with `squeeze`), QUEEN'S arched.
  - Dyeing: on the purple (dyed) jacket, chenille items (`qas`, `chenille`) take the dye too: `dyedChenille(color)` in `config.js` swaps them to deep blue on dark purple felt. Embroidered patches (mottos, bars) keep their colours. The undyed colours are what the presets hold.
  - `arcText` modes: `shrink` (keep letter shapes, shrink to fit), `track` (also spread letters to fill), `stretch`; `only: 'fill'|'stroke'`.
  - `opts.mask` draws the footprint in white, for the 3D bump and surface maps.
- `drawPanel` draws the cached leather layer (`leather.js`: colour, mottling, fold shading, wear), the grain at real size, the seams (grooves and topstitching along the side seams and the top edge, following the cut-away curve), then the zones and patches. In the editor (`opts.guides`) it clips to the real pattern shape.

### 3D model

`model.js` builds the jacket as pure geometry in cm; `jacket3d.js` turns it into meshes (scene units are metres, the model group is scaled by 0.01).

- **Body.** `bodyDims` scales everything from the chest and body length: a superellipse torso (boxier than an ellipse, fuller in front), shoulder and neck points, armpit depth. Worn on an invisible person with the arms relaxed.
- **Panels are grids** (`pos`, `normal`, `ao`). Column i maps to texture u across the section, row j to v down from the top edge, so a cm on the flat panel is a cm in 3D (tested within about 5%). Rows must line up across columns, or patches shear:
  - Torso: columns too short to reach the top edge (the neckline) squeeze their last few cm of flat panel into their last few cm of leather, rather than piling rows at the edge (piling made a stair-step edge). The strip is under the collar.
  - Torso: a column longer than its reference (toward the neck) keeps the reference's rows and takes its extra length in its top 4 cm (7 cm on the front), under the collar (stretching it the whole way made the upper back's rows sag 2.5 cm in the middle and flattened the QUEEN'S arch in 3D). The stretch eases in rather than starting at full strength, or a straight line across the band (the collar's front edge, which is straight from the shoulder seam to the point) bends there in 3D.
  - Torso: up to the armpit a row is a level ring (heights found by distance up a reference column: the middle of the back, the middle of each front half). Above it, each column shares out the remaining rows over its own length so all columns reach the top edge together; a column too short to reach it (the neckline) stops early and leaves a cut-away.
  - Sleeves: rows are rings square to the arm, placed by distance up the outer side from the cuff, so bars sit straight across the arm. Above where a column joins its cap it continues up the cap by its own length; columns that run out are the sleeve-cap cut-away.
  - **Torso:** each column runs up the side of the body, then curves in over the shoulder (a Hermite curve) to the top edge (shoulder seam and neckline), arriving level so front and back meet smoothly. The armhole edges bow forward and back to leave room for the sleeve (`armhole` in `bodyDims`, about 7 cm each way: an oval seen from the side, set by height between the armpit and each column's top, not by distance along the column; the columns run level at the top, so going by distance held the full depth right up under the seam and made the shoulders boxy. A narrower, pointed armhole made the arm look like a thin tube pushed under the shoulder). The torso near the armhole fills out to at least the armhole's depth (a soft max in `torsoMeridian`, fading out 14 to 28 cm from the side), measured from the line between the armpit and the shoulder seam's depth `zS` so front and back still meet there. Adding the bow as a bump that faded out made a trough beside the armhole seam; measuring from z = 0 opened a gap along the shoulder seam. The front is two halves, pulled apart at the front edges (`openFront`) because GPAs are worn open.
  - **Sleeves:** a tube round a curved arm axis (slightly out from the body, bent forward at the elbow), joined to the armhole by a rounded cap. Over the top the cap leaves the armhole carrying on down the shoulder's slope, and toward the underarm it heads down the arm (aiming it from the shoulder joint made a lip). The arm is shortened so the outer side's length, cap included, matches the sleeve length. More of the armhole goes to the underarm columns so the cap is flat on top.
  - **Folds** (`surface.js`) push the surface out along its normals: inside the elbows, a couple of soft creases above the cuffs and the waistband, drape by the front edges. The waistband and cuffs are NOT cinched or gathered (Nathaniel): they hang straight, the same width as the leather above. They fade out at seams so the panels still meet. The same folds shade the leather texture. Felt patches are stiff, so `flattenUnderPatches` in `jacket3d.js` reapplies the folds (`applyFolds`) with them flattened under each patch whenever a section's patches change. It follows the patches' real shapes (the texture's patch mask, blurred), and only damps the folds (`g.fold`), never the padding (`g.pad`): flattening the bounding box, padding included, pressed every patch into a visible rectangular dent.
  - **Shading:** per-vertex ambient occlusion (`ao`) darkens fold valleys, the body under the arms and the inside of the sleeves; the key light also casts real shadows.
- **Collar** (sizes in `LAPEL`/`collarSize`, from Nathaniel's measurements; laid out in each panel's flat coordinates and lifted onto the surface with `panelAt`, so it follows the jacket exactly): a flat shirt collar with a stand, a 5 cm fall and 7.5 cm points lying on the chest. There are no separate 3D lapel pieces any more (removed as leftovers); the `lapel` zone still marks the collar point and the small fold-back as no-go in 2D. Its outer edge is `collarOutline(d)` (cached): the shapes from `frontCollarEdge` and `backCollarEdge`, with each point moved along its line from the neck until it's `fall` cm from the neck measured on the 3D surface, widening smoothly to `point` cm at the front (Nathaniel: the same width all round). A fixed width in section cm came out narrow down the sides of the front, where the flat panel is squeezed near the neckline. `zones.js` uses the same outline for the `lapel` and `collar` zones, so 2D and 3D agree. The collar stands up (`LAPEL.stand` 2.2 cm, lower toward the front) and the fall is held off the leather, with only its edge coming down near the jacket (Nathaniel: not moulded onto it). Both cross the shoulder seam square on (meeting the seam edge-on from both sides folded the collar back on itself there). The stand's direction comes from the panel normals, blended round the neck so it doesn't jump at the shoulder seams. `thickRows` picks the collar's underside once for the whole surface (per point, the stand faces the neck and the underside poked through in shards).
- **Cuffs are worn unsnapped:** the vent at the underarm seam opens into a V (`VENT` in `model.js`: 9 cm long, 7 cm apart at the edge) and the cuff flares slightly; both vent edges get thickness.
- **Thickness:** the jacket is `THICK` (1 cm, leather plus lining and padding) thick. Each panel has a lining shell that far inside it, easing back to the leather over the top rows so the neckline and armhole edges are closed; the free edges (hems, cuffs, front edges, cuff vents) get a rounded edge strip; the collar is given an underside and rounded edges by `thickRows()` in `jacket3d.js`, and wraps down inside the neck to meet the lining.
- **Padding:** each panel bulges out by up to `PAD` (0.45 cm) between its seams in `foldPanel`, easing to zero at the seams so neighbouring panels still meet (pulling the seams in instead opened a gap at the armhole). The waistband and cuff joins dip in.
- **Normals:** `gridNormals` picks in/out once per panel by majority vote, never per point (on top of the shoulders a per-point inside test flips at random and shows as a jagged dark band).
- **Textures:** each section has three canvas maps, all from the same drawing code as the editor: colour (`drawPanel`), bump (`heightLayer`: grain and fine creases, plus raised flaps, welts and patches), and surface (R = clearcoat, glossy leather; G = roughness, matte felt). The collar, lapels and edges use the back's leather layer (`refreshSwatch`).
- **Look:** `LOOK` in `jacket3d.js` (bump, clearcoat, roughness, thickness). Lighting is a `RoomEnvironment` env map plus key (with shadows), fill and rim lights, with `NeutralToneMapping`.
- **Leather look** (from Nathaniel's close-ups): pebble grain (cellular, ~1.5 mm, bump map at 20 px/cm), cloudy mottling even when new, satin sheen, tan topstitching (`THREAD` in `draw.js`), grey-lavender lining. The colour layer is 12 px/cm; smooth fields are 6 px/cm and sampled bilinearly.
- **Wear** (`jacket.wear`, the slider on the 3D view) only changes textures (plus crackle in worn patches with the dye left in the cracks, matte where worn via `surfaceLayer`, and a few clustered pale specks when well worn): dye rubbed through at seams, edges, raised folds and elbows (to tan on purple, a darker patina on yellow), scuffs, and more fine creases. Dragging the slider uses `liveUpdateAll()`; letting go commits.
- **Phones (`LITE` in `config.js`: a touch-first screen or ≤ 4 GB memory):** a lighter 3D view (textures 7 px/cm, bump 9 px/cm, leather colour layer 8 px/cm instead of 12, pixel ratio ≤ 1.5, 1024 shadow map, no preserved drawing buffer); the leather caches keep 5 entries (computers: 24 colour layers, 8 of the rest); the wear slider redraws only on release. Phone browsers cap a page's canvas memory and past it hand back blank canvases (the jacket turned black and glossy) or kill the tab. So canvases dropped from the caches are shrunk to 0 × 0 (Safari frees canvas memory lazily), and the editor and preview canvases are only resized when their size changes (each resize reallocates). Measured on an emulated phone: about 28 MB of live canvases after use, from 75 MB. If the WebGL context is lost anyway, the viewer says so (`webglcontextlost`) and repaints when it's restored.
- **Rebuilding:** `build3D()` re-runs only when the measurements or colours change (`buildKeyFor()`); wear and patches only repaint textures.
- **Dev hook:** in `npm run dev`, `window.__V` is the viewer state, so screenshot scripts can set `yaw`/`pitch`/`zoom`, and `look` ([x, y] metres) to pan.
- **Clicking the model** (`pick3D`): it raycasts, converts the hit UV to section cm, then selects that section and patch. A click on the collar or a lapel selects nothing.
- **Focusing a section** animates the yaw. It respects `prefers-reduced-motion`. The expand button (or Esc to close) makes the 3D view fill the window.

### Fit logic (pure functions; good place for Nathaniel to contribute)

- `boxesClash(a, b, gap)` tests axis-aligned box overlap with a minimum gap. It's the cheap first check for every pair.
- `footprint(p)` is an item's outline polygon. Curved bars use their real outline (`localOutline`), so stacked bars nest about 3.5 cm apart instead of the 4.1 cm their boxes would need. Everything else is its box. `outlinesClash` measures real distances between outlines.
- `conflicts(section)` returns a `Map<uid, reason>` covering:
  - items off the edge
  - items on no-go zones
  - items overlapping or closer than `meas.gap`
- `settle(p)` runs after a patch is dragged, nudged or typed into place: if it ended on a no-go zone or off the panel (`zoneProblem`), it moves to the nearest free spot and a toast says why (`settleNote`). Overlapping another patch is allowed (it's only flagged), since people rearrange in steps.
- `findSpot(section, w, h, skipUid, local, near)` tries a 0.5 cm grid nearest-first from a per-section anchor (or from `near`) and returns the first free spot. `local` is the item's outline (`localOutline(def, rot)`). On sleeves, sideways moves cost 4× more, so items stack down the outer side.

Circles, shields, scrolls and letters still collide by their bounding box, which is conservative.

### UI flow

- **Traditional pieces are fixed** (`isFixed`, Nathaniel): they can be clicked to see them, but not dragged, nudged, rotated, duplicated or removed (the keys show a toast). Only the year number's, year motto's and discipline bar's text can change (`TEXT_EDITABLE`).
- **The list** (`#itemList`) is folders, one per picker group, closed at first; opening one closes the other. While searching, every folder with a match is open. Clicking an item chooses it (right panel); double-click or Enter adds it; Enter in the search box adds the first match. Nothing is chosen until the user picks something.
- **Header:** only Reset (asks first; keeps the user's own items; undoable).
- **Make your own** (in the right panel): kind (Bar, Crest or Flag), name (also the lettering, in capitals; flags get none), colours, and stripes. No shape, size, note or photo fields (Nathaniel); the kind sets both (`KIND_SHAPE` in `catalog-ui.js`: a standard curved bar, a 7 cm circle crest, a flag-sized rectangle). Older plans' items with other shapes or photos still draw them.
- **The list box has a fixed height** (set by the window height, not by what's open), so opening a folder or searching never moves the feedback box below it. Open folders show about 10 items and scroll inside; the count line under the list is always there (the total, or the matches while searching).

- **One panel on the right** (`renderInspector`, Nathaniel's design) for seeing, choosing and editing, with the preview at its top. It shows, in this order of priority: the "make your own" form (it lives in that panel); the patch selected on the jacket, with its controls; the item highlighted in the list, with **Add to …**; else a hint. Clicking a list item drops any patch selection; Add places the item and selects it. Enter in the search box or list, and double-click, add directly. The left column is only search, category and the list.

- **Mutations** follow one pattern: `pushHistory()` → change `state` → `commit()`.
  - `commit()` redraws everything, saves (debounced), and updates the Undo button.
- **Dragging** uses `liveUpdate()`. It redraws only the editor and the current section's texture each frame, then commits on pointer up.
- **Undo** is a JSON snapshot stack holding the last 80 states.
- **Saving** (`scheduleSave`): debounced write to `localStorage`.

## Design

The visual direction is a green self-healing cutting mat with a cm grid as the workspace, set against Queen's colours.

- **Jacket leather:** `JACKET_COLOURS` in `config.js`, yellow (undyed) `#BCA66A` and purple (dyed) `#553750`, each with the colour it wears to, matched to Nathaniel's photos. A two-swatch switch (no text, like a light/dark toggle; names in the tooltip and label) at the right of the section tabs picks one. Nathaniel chose yellow and purple only (no custom colour); older plans with another colour keep it until switched.
- **Footer:** "A Nathaniel Felsky-Deelstra production" plus the not-affiliated line.
- **Feedback box:** a small pane under the bar list asks for suggestions, missing bars or mistakes by email, with a `mailto:` link to nathanielfd5@gmail.com (in `index.html`).
- **Colours:**

| Name | Hex |
|---|---|
| Queen's blue | `#002452` |
| Queen's gold | `#EAAA00` |
| Queen's red | `#9D1939` |
| Mat green | `#2E5B48` |

- **Fonts:** Graduate (a varsity face) for the title and patch lettering; Archivo for the UI.
- **Theme:** colours are CSS tokens on `:root`, with dark mode handled through `prefers-color-scheme` and `data-theme`.
- **Fits the window** (Nathaniel: header and footer always in view): at 1181 px wide and 620 px tall or more, the page is exactly the window height; the mat fills the leftover height, the bar list shrinks first so Add stays visible, and the side columns scroll inside themselves. Under 800 px tall the preview shrinks. Narrower or shorter windows scroll as a normal page.
- **Phone order** (≤ 760 px, Nathaniel): flat view, bar list, the right-hand panel, 3D view, then the feedback box. `.left` and `.side` become `display:contents` so their boxes are placed one by one.
- **Accessibility:**
  - Keep it responsive down to about 375 px.
  - Keep keyboard support on the mat: arrows nudge, Shift+arrows nudge 2 cm, Delete removes, Esc deselects, Ctrl/Cmd+Z undoes.
  - Keep focus outlines visible.

## Known placeholders and limitations

- **The bar list comes from `data/bars.xlsx`.** Every bar is a standard curved bar (2.9 cm band, 12.1 × 4.1 cm box): blue felt, red border, gold text, matched to Nathaniel's sleeve photo. Per-bar colours come from the optional sheet columns `bar_colour`, `text_colour`, `border_colour` (a `FELT_COLOURS` name or a hex code; `sheetColour` in `catalog.js`); an optional `shape` column picks a look from `SHEET_SHAPES` in `config.js` (blank: the standard bar; the discipline patches `high voltage` (old name `hazard`), `gear`, `oxidizing`, `biohazard`, `falling rocks` on a yellow warning triangle (`hazard` shape), `psi` and `bridge` on a `diamond`, `infinitum` on an oval; plain `circle`, `shield`, `rectangle`). A cell can list several (`oxidizing / biohazard`): `sheetBarDefs` makes one entry each, the first keeping the row's id and the rest `wiki-<pageid>-<shape>`. Their sizes are guesses. Wiki photos may be looked at as a reference for drawing a design, never shipped. The sheet's table is an Excel query table, which ExcelJS can't write back without breaking it (it drops the query and turns the header row off), so add columns in Excel, not from code. Sheet rows that are really patches, such as EngSoc Crest, draw as bars for now.
  - Default text like "COMPUTER" is illustrative.
  - Get real data from Nathaniel. Don't make up more traditions.
- **Traditional pieces** (QUEEN'S/APPLIED/SCIENCE, the "QUIS·DOLOR·CUI·DOLIUM" motto, pass crest, discipline bar (a standard bar reading DISCIPLINE until the user types theirs), year motto, year number, year crest) start on every new jacket, positioned by `layout.js` (sleeve pieces sit just under the cap's curve). From Nathaniel's photos: chenille back letters on dark red-brown felt; the motto scroll blue with yellow text and a red edge. The year digits look the same as the back letters (Nathaniel). Still guesses: the year crest (a 13 × 15.6 cm placeholder shield labelled "YEAR CREST" on two lines (a `\n` in an item's text stacks it in lines), on the wearer's left chest, 12 cm from the centre line and 18 cm down, per Nathaniel "a big crest … around the heart"), the year number size (12 × 9 cm), the year motto's look, the stacking gaps, and the leather waistband and cuffs. The lower-back pieces (and the discipline patch) aren't pre-placed yet, and traditional pieces aren't in the picker (they're always on the jacket).
- **Crests are generic placeholder drawings.** Don't recreate the real Queen's or EngSoc logos (they're trademarked). (Uploading a photo of your own patch was removed from the UI; photos already in saved plans still draw.)
- **Default jacket measurements** are Nathaniel's own GPA, measured flat in inches and converted: chest 127 (25" armpit to armpit), length 66, sleeve 63.5, waistband 7.5, cuff 6.5. Shoulder width (56), neck width (25) and armhole depth (23) are scaled from the chest in `bodyDims`; the collar (5 cm fall, 7.5 cm points) is `LAPEL`/`collarSize`; the cuff slit is 7.6 cm with snaps 5 cm apart. `sleeveCirc` (38) is a guess that Nathaniel is happy with ("looks fine"); leave it unless he raises it. There's no way to change them any more: Nathaniel removed the Jacket size dialog ("the ratios are right and that's all that matters").
- **No rotation.** Collisions use outlines for bars and zones, boxes for other shapes.
- **Approximations in the 3D model:** the texture is true to size across the panels, but stretches near the sleeve cap and at the neckline where the piece is cut away. Folds are fixed (they don't react to patches). Seams are drawn and bumped, not modelled as geometry.
- **Zoom:** the 3D view zooms with the mouse wheel only; Nathaniel removed the +/− buttons and Snapshot. So on phones there's no 3D zoom (no pinch-zoom either), and you can't drag directly from the 3D view.
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
5. ~~Free rotation~~ (Nathaniel removed rotation altogether).
6. **Share or compare layouts,** for example a frosh group comparing jackets.
7. **More tests.** Add `normalize` migrations and auto-arrange as they're written.
